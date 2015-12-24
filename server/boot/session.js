// https://github.com/strongloop/loopback/issues/1032
module.exports = function(app) {
  var session = require('express-session');
//  var RedisStore = require('connect-redis')(session);
//  var store = new RedisStore({ host: '127.0.0.1' });
  app.middleware('session', session({
//    "store": store,
    "saveUninitialized": true,
    "resave": true,
    "secret": "keyboard cat"
  }));
}

