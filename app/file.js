
var fs = require('fs')
var url = require('url')
var inspect = require('util').inspect
var extname = require('path').extname
var flatten = require('normalize-walker').flatten
var debug = require('debug')('normalize-proxy:app:file')

var route = require('./route')
var cacheControl = require('../config').cacheControl

// should be able to combine this somehow...
var match = route(route.project + '/:version/:file*')

module.exports = function* (next) {
  var path = this.request.path
  var params = match(path)
  if (!params) return yield* next

  debug('path %s got params %s', path, inspect(params))

  var source
  var minified
  var search = this.request.search
  switch (search) {
  case '?source':
    source = search
    break
  case '?minified':
    minified = search
    break
  case '':
    break
  default:
    this.throw(404, 'invalid query string. only ?search and ?minified allowed.')
  }

  var uri = this.uri.remote(
    this.remotes(params.remote),
    params.user,
    params.project,
    params.version,
    (params.file || '') || 'index.html'
  )

  debug('resolved to uri %s', uri)

  var tree = yield* this.walker().add(uri).tree()
  var file = tree[uri].file
  if (file.exists === false) this.throw(404)

  uri = this.uri.localToRemote(source ? file.source : file.uri)
  var uripath = url.parse(uri).pathname

  // spdy push all the shit before actually sending the response
  // main reason is the `yield this.push()` for redirects
  var pushes = []
  if (this.spdy) {
    pushes = flatten(tree).filter(function (x) {
      return file !== x
    }).map(function (file) {
      return this.push(file, search)
    }, this)
  }

  if (uripath !== path) {
    // push this file with highest priority
    if (this.spdy) yield pushes.concat(this.push(file, search, 0))
    
    this.response.redirect(uripath + search)
    this.response.set('Cache-Control', cacheControl.semver)
  } else {
    yield pushes

    this.response.set('Cache-Control', cacheControl.file)
    this.response.etag = file.hash
    this.response.lastModified = file.mtime
    if (this.request.fresh) return this.response.status = 304

    if (source) {
      this.response.type = extname(file.source)
      if (this.request.method === 'HEAD') return this.response.status = 200
      this.response.body = fs.createReadStream(file.source)
    } else if (minified && file.is('js', 'css')) {
      this.response.type = file.type
      this.response.body = file.minified
    } else {
      this.response.type = file.type
      if ('string' in file) {
        this.response.body = file.string
      } else {
        if (this.request.method === 'HEAD') this.response.status = 200
        else this.response.body = fs.createReadStream(file.uri)
      }
    }
  }
}
