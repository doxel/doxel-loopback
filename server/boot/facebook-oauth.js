module.exports = function(app) {
  // Make sure to also put this in `server/server.js`
  var PassportConfigurator =
    require('loopback-component-passport').PassportConfigurator;

  // Include this in your 'facebook-oauth.js' boot script in `server/boot`.
  var passportConfigurator = new PassportConfigurator(app);
 
  passportConfigurator.init();
  passportConfigurator.setupModels({
    userModel: app.models.User,
    userIdentityModel: app.models.UserIdentity,
    userCredentialModel: app.models.UserCredential
  });
  passportConfigurator.configureProvider('facebook-login',
    require('../providers.json')['facebook-login']);
}


