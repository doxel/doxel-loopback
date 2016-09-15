/*
 * routes.js
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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

 module.exports = function(app) {
  var loopback=require('loopback');
  var Q=require('q');
  var User=app.models.user;
  var UserCredential=app.models.userCredential;
  var AccessToken=app.models.AccessToken;
  var php=require('node-php');
  var path=require('path');
  var proxy=require('map-tiles-proxy')({
    middleware: true,
    urlFromQueryString: false,
    routes: {
      osm: {
        url: [
          'a.tile.openstreetmap.org',
          'b.tile.openstreetmap.org',
          'c.tile.openstreetmap.org'
        ]
      },
      "blue-marble": {
        url: ['doxel.org/doxel-viewer/upload/blue-marble']
      },
      stamen: {
        url: [
           'a.tile.stamen.com',
           'b.tile.stamen.com',
           'c.tile.stamen.com'
        ]
      }
    }
  });

//  var production=app.get('production');
 // var prefix=production?'':'#/';
  var prefix='#/';
 // var path=require('path');

  console.dump=require('object-to-paths').dump;
  var config={
    documentRoot: app.get('documentRoot'),
    host: app.get('host')
  }

  app.get("/link/callback", function(req,res,next) {
      res.redirect(config.documentRoot+prefix+'profile');
  });

  app.get("/auth/callback", function(req,res,next) {
    var q=Q.defer();

    // first get userIdentity for passport userId
    User.findById(req.signedCookies.userId,{
      include: 'identities'

    }, function(err,user){
      if (err) {
        console.trace(err);
        q.reject(err);
        return;
      }

      if (!user) {
        q.reject(new Error('no user matching '+req.signedCookies.userId));
        return;
      }

      // check for userCredential from linked account matching userIdentity
      var userIdentity=user.identities()[0];
      UserCredential.findOne({
        where: {
          provider: userIdentity.profile.provider+'-link',
          externalId: userIdentity.externalId
        },
        include: 'user'

      }, function(err, userCredential) {
        if (err) {
          q.reject(err);
          return;
        }

        if (!userCredential) {
          // no parent account, go on with thirdparty login
          q.resolve({
            accessToken: req.signedCookies.access_token,
            userId: req.signedCookies.userId
          });
          return;
        }

        // create access token for parent user
        var user=userCredential.user();
        console.log(user);

        AccessToken.create({
          created: new Date(),
          ttl: Math.min(user.constructor.settings.ttl, user.constructor.settings.maxTTL),
          userId: user.id

        }, function(err, accessToken) {
          if (err) {
            q.reject(err);
            return;
          }
          console.log('accessToken.create',accessToken);

          // switch to parent user
          q.resolve({
            accessToken: accessToken.id,
            userId: accessToken.userId
          });

        });

      });

    });

    q.promise.then(function(args){
      res.cookie('pp-access_token', args.accessToken, {path: '/'});
      res.cookie('pp-userId', args.userId.toString(), {path: '/'});
      res.redirect(config.documentRoot+prefix+'login');
    })
    .fail(function(err){
      console.log(err.message,err.stack);
      res.redirect(config.documentRoot+prefix+'login');
    })
    .done();

  });

  app.get("/failure", function(req,res,next) {
    console.dump({failure: {req: req, res: res}});
    res.redirect(config.documentRoot+prefix+'profile');
  });

  app.get("/earth", function(req,res,next) {
    res.redirect('//'+config.host+'/earth/');
  });

  app.get("/upload", function(req,res,next) {
    res.redirect('//'+config.host+'/upload/');
  });

  app.get('/osm/*', proxy.middleware.get);
  app.get('/stamen/*', proxy.middleware.get);
  app.get('/blue-marble/*', proxy.middleware.get);


//  if (!production) {
    app.get("/login", function(req,res,next) {
      res.redirect(config.documentRoot+prefix+'login');

    });

    app.get("/profile", function(req,res,next) {
      console.dump({profile: {res: res}});
      res.redirect(config.documentRoot+prefix+'profile');

    });

    app.get("/logout", function(req,res,next) {
      res.redirect(config.documentRoot+prefix+'logout');

    });
//  }
/*
// https://github.com/angular-ui/ui-router/wiki/Frequently-Asked-Questions#how-to-configure-your-server-to-work-with-html5mode
app.all('/*', function(req, res, next) {
  // Just send the index.html for other files to support HTML5Mode
  res.sendFile('index.html', { root: path.resolve(__dirname, '..', '..', 'client', 'dist') });
});
*/


}
