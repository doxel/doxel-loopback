module.exports = function(app) {
  var PassportConfigurator = require('loopback-component-passport').PassportConfigurator;
  var passportConfigurator = new PassportConfigurator(app);
  var config = require('../providers.json');

  var flash=require('express-flash');
  app.use(flash());

  passportConfigurator.init();

  passportConfigurator.setupModels({
    userModel: app.models.user,
    userIdentityModel: app.models.userIdentity,
    userCredentialModel: app.models.userCredential
  });

  for (var strategy in config) {
    var cfg=config[strategy];
    cfg.session=(cfg.session!==false);
    passportConfigurator.configureProvider(strategy,cfg);
  }

}


