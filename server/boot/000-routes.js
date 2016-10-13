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


// TODO: get rid of workaround below for Error: Hostname/IP doesn't match certificate's altnames: "Host: a.tile.stamen.com. is not in the cert's altnames: DNS:a.ssl.fastly.net, DNS:*.a.ssl.fastly.net, DNS:fast.wistia.com, DNS:purge.fastly.net, DNS:mirrors.fastly.net, DNS:*.parsecdn.com, DNS:*.fastssl.net, DNS:voxer.com, DNS:www.voxer.com, DNS:*.firebase.com, DNS:sites.yammer.com, DNS:sites.staging.yammer.com, DNS:*.skimlinks.com, DNS:*.skimresources.com, DNS:cdn.thinglink.me, DNS:*.fitbit.com, DNS:*.hosts.fastly.net, DNS:control.fastly.net, DNS:*.wikia-inc.com, DNS:*.perfectaudience.com, DNS:*.wikia.com, DNS:f.cloud.github.com, DNS:*.digitalscirocco.net, DNS:*.etsy.com, DNS:*.etsystatic.com, DNS:*.addthis.com, DNS:*.addthiscdn.com, DNS:fast.wistia.net, DNS:raw.github.com, DNS:www.userfox.com, DNS:*.assets-yammer.com, DNS:*.staging.assets-yammer.com, DNS:assets.huggies-cdn.net, DNS:orbit.shazamid.com, DNS:about.jstor.org, DNS:*.global.ssl.fastly.net, DNS:web.voxer.com, DNS:pypi.python.org, DNS:*.12wbt.com, DNS:www.holderdeord.no, DNS:secured.indn.infolinks.com, DNS:play.vidyard.com, DNS:play-staging.vidyard.com, DNS:secure.img.wfrcdn.com, DNS:secure.img.josscdn.com, DNS:*.gocardless.com, DNS:widgets.pinterest.com, DNS:*.7digital.com, DNS:*.7static.com, DNS:p.datadoghq.com, DNS:new.mulberry.com, DNS:www.safariflow.com, DNS:cdn.contentful.com, DNS:tools.fastly.net, DNS:*.huevosbuenos.com, DNS:*.goodeggs.com, DNS:*.fastly.picmonkey.com, DNS:*.cdn.whipplehill.net, DNS:*.whipplehill.net, DNS:cdn.media34.whipplehill.net, DNS:cdn.media56.whipplehill.net, DNS:cdn.media78.whipplehill.net, DNS:cdn.media910.whipplehill.net, DNS:*.modcloth.com, DNS:*.disquscdn.com, DNS:*.jstor.org, DNS:*.dreamhost.com, DNS:www.flinto.com, DNS:*.chartbeat.com, DNS:*.hipmunk.com, DNS:content.beaverbrooks.co.uk, DNS:secure.common.csnstores.com, DNS:www.joinos.com, DNS:staging-mobile-collector.newrelic.com, DNS:*.modcloth.net, DNS:*.foursquare.com, DNS:*.shazam.com, DNS:*.4sqi.net, DNS:*.metacpan.org, DNS:*.fastly.com, DNS:wikia.com, DNS:fastly.com, DNS:*.gadventures.com, DNS:www.gadventures.com.au, DNS:www.gadventures.co.uk, DNS:kredo.com, DNS:cdn-tags.brainient.com, DNS:my.billspringapp.com, DNS:rvm.io"
process.env.NODE_TLS_REJECT_UNAUTHORIZED="0";

 module.exports = function(app) {
  var loopback=require('loopback');
  var Q=require('q');
  var User=app.models.user;
  var UserCredential=app.models.userCredential;
  var AccessToken=app.models.AccessToken;
  var php=require('node-php');
  var path=require('path');
  var url=require('url');
  var proxy=require('map-tiles-proxy')(app.get('tileProxyConfig'));

  var prefix=app.get('html5Mode')?'':'#/';

  console.dump=require('object-to-paths').dump;
  var config={
    documentRoot: app.get('documentRoot'),
    host: app.get('host')
  }

  if (app.get('maintenanceMode')) {
    app.get('/*', function(req,res,next){
      res.status(503).end('The site is down for maintenance. Please try again later. Sorry for the inconvenience.');
    });
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

  function html5Mode_support() {
    var _documentRoot={ root: path.resolve(__dirname, '..', '..', 'client', app.get('production')?'dist':'app') };
    [
      'bower_components',
      'scripts',
      'styles',
      'views',
      'favicon.ico',
      'fonts',
      'images',
      'robots.txt',
      '404.html',
      'index.html'
    ].forEach(function(folder){
      app.all('/'+folder+'/*', function(req,res,next){

        /* TODO: get rid workaround below for leaflet.markercluster or angularjs bug where, with html5mode
        enabled and you click on a cluster, inline image is catenated to image
        directory url and merker icons are not displayed. eg: a="https://ww3.doxel.org/bower_components/leaflet/dist/images/data:image/png;base64,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"
"https://ww3.doxel.org/bower_components/leaflet/dist/images/data:image/png;b…du5HG6MdHjNcNYGqfDm5YRzLBBCCDl/2bk8a8gdbqcfwECu62Fg/HrggAAAABJRU5ErkJggg==" */
        req.url=req.url.replace(/data:image.*/,'marker-icon.png');

        res.sendFile(url.parse(req.url).pathname, _documentRoot);
      });
    });

    app.all('/*', function(req, res, next) {

      if (req.url.substr(0,5)=='/api/') {
        return next();
      }

      res.sendFile('index.html', _documentRoot);
    });
  }

  if (app.get('html5Mode')) {
    html5Mode_support();
  }

}
