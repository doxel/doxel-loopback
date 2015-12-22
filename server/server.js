var loopback = require('loopback');
var boot = require('loopback-boot');
var https = require('https');
var path = require('path');
var sslConfig = require(path.join(__dirname,'ssl_config.js'));

var app = module.exports = loopback();

// Make sure to also put this in `server/server.js`
// var PassportConfigurator =
require('loopback-component-passport').PassportConfigurator;

app.use(loopback.session({
    secret: 'secret session',
    resave: true,
    saveUninitialized: true
}));

app.use(loopback.compress());

app.start = function(httpOnly) {

  if (httpOnly === undefined) {
    httpOnly = process.env.HTTP;
  }

  var server=null;

  if(httpOnly) {
    server = http.createServer(app);

  } else {
    var options = {
      key: sslConfig.privateKey,
      cert: sslConfig.certificate
    };
    server = https.createServer(options, app);
  }


  // start the web server
  server.listen(app.get('port'),function() {
    var baseUrl = (httpOnly? 'http://' : 'https://') + app.get('host') + ':' + app.get('port');
    app.emit('started', baseUrl);
    console.log('Web server listening at: %s/', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });

  return server;

};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
