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
var compression = require('compression');
var helmet = require('helmet');


if (process.env.TRACE) console.log=console.trace;

//var php=require('node-php');

var app = module.exports = loopback();

app.use(helmet({
  noCache: false
}));

// convert request access token to cookie
require(path.join(__dirname,'access-token_cookie.js'))(app);

//app.use('/doxel/home',function xrobot(req,res,next){
app.use('/app/',function xrobot(req,res,next){
  res.setHeader('X-Robots-Tag', 'nofollow');
  return next();
});

if (app.get('html5Mode')) {
  app.get('/',function(req,res,next){
    res.redirect('/doxel/home');
  });
} else {
  [
    '/doxel*',
    '/login*',
    '/logout*',
    '/upload*'
  ].forEach(function(route){
    app.get(route,function(req,res,next){
      res.redirect('/#!'+req.originalUrl);
    });
  });
}

// allow API explorer for admin only
app.use('/explorer', function(req,res,next) {
    req.access_token=req.signedCookies.access_token;
    app.models.User.authenticate(req)
		.then(function(){
			if (req.accessToken.user().username=='admin') {
				next();

			} else {
				res.status(401).end('Access to API explorer denied');
			}

		}).fail(function(err){
				res.status(401).end('Access to API explorer denied');
		});

});

if (false)
app.use('/routes',function(req,res,next){
  app._router.stack.forEach(function(r){
      if (r.route && r.route.path){
            console.log(r.route.path)
      }
  });
});

var plupload=require(path.join(__dirname,'plupload.js'))(app);


// Make sure to also put this in `server/server.js`
app.PassportConfigurator=require('loopback-component-passport').PassportConfigurator;

app.use(function(req,res,next){
  var _send = res.send;
  res.__sent = false;

  res.send = function(data){
    if(res.__sent) {
       console.log('warning: response was already sent');
       return;
    }
    _send.bind(res)(data);
    res.__sent = true;
  };
  next();
});

app.use(function setCurrentUser(req, res, next) {
  if (!req.accessToken) {
    return next();
  }

  app.models.user.findById(req.accessToken.userId, function(err, user) {
    if (!err) {
      req.user=user; // workaround for linking third-party accounts after user.login() see https://github.com/strongloop/loopback-component-passport/issues/134
    }
    next(err);
  });

});

app.use(compression());


app.enable('trust proxy', '127.0.0.1');

app.start = function(enableSSL) {

  if (enableSSL === undefined) {
    enableSSL = process.env.enableSSL;
  }

  var server=null;

  if(!enableSSL) {
    server = http.createServer(app);

  } else {

    // redirect http requests to https
    var redirect_server = http.createServer(function(req,res,next){
      console.log(req);
      res.writeHead(302,{
        'Location': 'https://'+req.headers.host+req.url
      });
      res.end();
    });
    redirect_server.listen(80);

    // setup https certificates
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
  if (require.main === module) {
    if (!app.get('enableSocketio')) {
      app.start(app.get('enableSSL'));
      return;
    }
    // https://docs.strongloop.com/display/MSG/Building+a+real-time+app+using+socket.io+and+AngularJS
    app.io = require('socket.io')(app.start(app.get('enableSSL')));
    require('socketio-auth')(app.io, {
      authenticate: function (socket, value, callback) {       
        var AccessToken = app.models.AccessToken;

        // validate accessToken
        var token = AccessToken.findById(value.id, function(err, accessToken){
          if (!accessToken) {
            callback(null,false);

          } else {
            accessToken.validate(function(err,isValid){
              if (err) {
                console.log(err);
                callback(null,false);
              } else {
                callback(null,isValid);
              }
            });

          }
        }); //find function..    
      } //authenticate function..
    });

    app.io.on('connection', function(socket){
      console.log('a user connected',arguments);
      socket.on('disconnect', function(){
          console.log('user disconnected',arguments);
      });
    });
  }

});

app.use(loopback.token({
  model: app.models.accessToken
}));
