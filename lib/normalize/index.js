
var fs = require('mz/fs')
var debug = require('debug')('normalize-proxy:normalize')

module.exports = normalize

var component = require('./component')
var package = require('./package')

function* normalize(path) {
  if (path.slice(-1) !== '/') path += '/'
  var has = yield {
    component: fs.exists(path + 'component.json'),
    package: fs.exists(path + 'package.json'),
    bower: fs.exists(path + 'bower.json'),
    composer: fs.exists(path + 'composer.json'),
  }

  // normalize JS
  if (has.component) {
    yield* component(path)
  } else if (has.package) {
    yield* package(path)
  } else if (has.bower) {
    /* jshint noempty:false */
  } else if (has.composer) {
    /* jshint noempty:false */
  }

  // normalize metadata

  debug('normalized: %s', path)
}
