/* Access token sliding expiration */
module.exports=function(app) {
  app.use(function accessTokenProlongation(req, res, next) {
    if (!req.accessToken) {
  //    console.log('no accessToken')
      return next();
    }
    var created=req.accessToken.created.getTime();
    var now=Date.now();
    var left=created + req.accessToken.ttl*1000 - now;
    if (left<0 || left>1123200000 /* 13 days */) {
//      console.log('token does not need update');
      return next();
    }
  //  console.log('accessToken updated');
    req.accessToken.updateAttribute('ttl', Math.floor((now + 1209600000 /*14 days*/ - created) / 1000), next);
  });
}
