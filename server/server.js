/*
 * server.js
 *
 * Copyright (c) 2015-2016 ALSENET SA - http://doxel.org
 * Please read <http://doxel.org/license> for more information.
 *
 * Author(s):
 *
 *      Luc Deschenaux <luc.deschenaux@freesurf.ch>
 *
 * This file is part of the DOXEL project <http://doxel.org>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Additional Terms:
 *
 *      You are required to preserve legal notices and author attributions in
 *      that material or in the Appropriate Legal Notices displayed by works
 *      containing it.
 *
 *      You are required to attribute the work as explained in the "Usage and
 *      Attribution" section of <http://doxel.org/license>.
 */

var loopback = require('loopback');
var boot = require('loopback-boot');
var https = require('https');
var http = require('http');
var path = require('path');
var sslConfig = require(path.join(__dirname,'ssl-config.js'));

var php=require('node-php');

var app = module.exports = loopback();

app.use(loopback.context());
app.use(loopback.token());
app.use(function setCurrentUser(req, res, next) {
  if (!req.accessToken) {
    return next();
  }

  app.models.user.findById(req.accessToken.userId, function(err, user) {
    if (!err) {
      var loopbackContext = loopback.getCurrentContext();
      if (loopbackContext) {
        loopbackContext.set('currentUser', user);
      }
    }
    next(err);
  });

});
 

// Make sure to also put this in `server/server.js`
var PassportConfigurator=require('loopback-component-passport').PassportConfigurator;

app.use(loopback.compress());

app.enable('trust proxy', '127.0.0.1');


app.start = function(enableSSL) {

  // TODO: avoid using php for this
  app.use('/upload', php.cgi(app.get('uploaderPath')));
  app.use('/viewer/', php.cgi(app.get('viewerPath')));


  if (enableSSL === undefined) {
    enableSSL = process.env.enableSSL;
  }

  var server=null;

  if(!enableSSL) {
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
    var baseUrl = (enableSSL? 'https://' : 'http://') + app.get('host') + ':' + app.get('port');
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
    app.start(app.get('enableSSL'));

});
