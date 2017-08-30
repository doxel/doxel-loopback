var path = require('path');
var appRoot = require('app-root-path');

module.exports = function (Model, options) {
  var configFile = options.config;
  if (!configFile) {
    // Works for 99% of cases. For others, set explicit path via options.
    configFile = path.join('common','models',slugify(Model.modelName) + '.json');
  }

  var config = appRoot.require(configFile);
  if (!config || !config.acls) {
    console.error('ClearBaseAcls: Failed to load model config from',configFile);
    return;
  }

  Array.prototype.splice.apply(Model.settings.acls,[0,Model.settings.acls.length].concat(config.acls));

};

function slugify(name) {
  name = name.replace(/^[A-Z]+/, function (s) { return s.toLowerCase(); });
  return name.replace(/[A-Z]/g, function (s) { return '-' + s.toLowerCase(); });
}
