module.exports = function(Picture) {
  var Q=require('q');

  Picture.isHashUnique=function(options, req, res, callback) {
/*    var q=Q.defer();

    // authenticate user using cookie
    // and fetch user info
    var User=app.models.User;
    User.relations.accessTokens.modelTo.findById(
      req.signedCookies.access_token,/* {
        include: {
          relation: 'user'
        }

      },*/ /* function(err, accessToken) {
        if (err) {
          // user could not be authenticated
          res.status(401).end('Unauthorized');
          q.reject();

        } else {
          req.accessToken=accessToken;
          q.resolve();
        }
      }
    );

    q.promise.then(function(){
*/
      Picture.findOne({
        where: {
          sha256: new Buffer(options.sha256, 'hex')
        }
      }, function(err, picture){
        if (err) {
          console.log(err.message,err.stack);
          callback(err); //,{error: {code: 500, message: 'Internal server error', originalError: {message: err.message, stack: err.stack}}});
        } else {
          callback(null,{unique: !picture});
        }
      });
/*
    }).fail(function(err){
      callback(err);

    });
*/
  }

  Picture.remoteMethod(
    'isHashUnique',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

};
