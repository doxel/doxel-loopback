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
  var path=require('path');
  var url=require('url');
  var proxy=require('map-tiles-proxy')(app.get('tileProxyConfig'));
  var geoip=require('geoip-middleware')();
  var fs=require('fs');

  var prefix=app.get('html5Mode')?'':'#/';

  console.dump=require('object-to-paths').dump;
  var config={
    documentRoot: app.get('documentRoot'),
    host: app.get('host')
  }

  /*
  if (app.get('maintenanceMode')) {
    app.get('/*', function(req,res,next){
      res.status(503).end('The site is down for maintenance. Please try again later. Sorry for the inconvenience.');
    });
  }
  */

  //var _documentRoot={ root: path.resolve(__dirname, '..', '..', 'client', app.get('production')?'dist':'app') };

  app.get('/cgi-bin*',function(req,res,next){
    // ban offender
    console.log(req.headers['x-real-ip']);
    fs.appendFile(path.resolve(__dirname, '..','rogue_robots_ip.txt'),req.headers['x-real-ip']+'\n');
    res.status(500).end('The site is down for maintenance. Please try again later. Sorry for the inconvenience.');
  });

  app.get("/app/*", function(req,res,next){
    var _documentRoot={ root: path.resolve(__dirname, '..', '..', 'client', (app.get('production')&&!req.cookies.debug)?'dist':'app') };
    res.sendFile('index.html', _documentRoot);
  });

  app.get("/", function(req,res,next){
    var _documentRoot={ root: path.resolve(__dirname, '..', '..', 'client', (app.get('production')&&!req.cookies.debug)?'dist':'app') };
    res.sendFile('hello.html', _documentRoot);
  });

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

  app.all('/osm/*', proxy.middleware.get);
  app.all('/stamen/*', proxy.middleware.get);
  app.all('/blue-marble/*', proxy.middleware.get);

  app.all('/geoip', geoip.middleware.get);

  app.get('/processing', function(req,res,next) {
        res.cookie('debug', 1, {path: '/'});
        res.redirect('/app/#!/processing');
  });

  app.use(function(req,res,next){
    var staticServe=loopback.static(
      path.resolve(
        __dirname,
       '..',
       '..',
       'client',
       (app.get('production')&&!req.cookies.debug)?'dist':'app'
     )
    );
    return staticServe(req,res,next);
  });

}
