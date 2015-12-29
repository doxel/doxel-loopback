module.exports = function(app) {
  var loopback=require('loopback');
//  var dump=require('object-to-paths').dump;
  app.get("/auth/callback", function(req,res,next) {
//    dump(req);
//
    res.cookie('pp-access_token', req.signedCookies.access_token);
    res.cookie('pp-userId', req.signedCookies.userId);
    res.redirect((process.env.NODE_ENV=="production"?'':'/app')+'/#/login');

  });

}

