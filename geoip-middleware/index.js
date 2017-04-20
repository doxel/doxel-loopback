module.exports=function(config){
  var request=require('request');
  return {
    middleware: {
      get: function(req,res,next){
        var ip=(req.headers && req.headers['x-real-ip']) || req.connection.remoteAddress;
        request({
          url: 'http://ip-api.com/json/'+ip,
          json: true
        }, function(err, response, body) {
          if (!err && response.statusCode === 200) {
            res.status(200).end(JSON.stringify(body));
          } else {
            console.log('geoip error: '+ip,err,response);
            res.status(500).end();
          }
        });
      }
    }
  };
}

