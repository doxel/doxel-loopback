module.exports = function(User) {

    var crypto=require('crypto');

    User.getToken=function getToken(options) {
        crypto.randomBytes(options.bytes||16, function(ex, buf) {
            options.callback(buf.toString(options.type||'hex'));
        });
    }

    User._signup = function _user_signup(options) {

        var token;

        console.log('_signup');

        // generate unique email, and password
        User.getToken({
            bytes: 32,
            callback: function getToken_callback(_token) {
                var token=options.token || _token.substr(0,32);
                var email=options.email || token+'@doxel.org';
                var password=options.password || _token.substr(32);

                var user_options={
                    username: options.username||'',
                    email: email,
                    password: password,
                    token: token,
                    ip: options.ip,
                    forwarded_for: options.forwarded_for,
                    fingerprint: options.fingerprint,
                    newInstance: true
                };

                console.log('find or create user',email,token);
                // email must be unique
                User.findOrCreate({
                 where: {
                    or: [{
                      email: email
                    },{
                      token: token
                    }]
                 }
                },
                user_options,
                function(err, user) {
                  console.log('here');

                    if (err) {
                        console.trace('signup failed',user_options,err);
                        options.callback(err);
                        return;
                    }

                    if (options.migrate) {
                        if (user) {
                            throw "migrate: unexpected token collision";

                        } else {
                            options.callback();
                            return;
                        }
                    }

                    if (user) {

                        console.log('user',token,user.token);

                        if (!user.newInstance) {
                          if (email==user.email) {
                              // given email exists for another instance, abort
                              options.callback(null,{error: 'email address already registered'});
                              return;
                          }

                          if (token==user.token) {
                            // generated token already exists, retry
                            _user_signup(options);
                            return;
                          }

                        } else {
                          user.unsetAttribute('newInstance');
                          user.save(function(err){
                            if (err) {
                              console.trace(err);
                              options.callback(err);

                            } else {
                              User.login({
                                email: email,
                                password: password

                              }, function(err, session) {
                                if (err) {
                                  console.trace(err);
                                  options.callback(err);
                                }
                                options.callback(null,{
                                  email: email,
                                  password: password,
                                  session: session
                                });
                              })
                            }

                          });
                        }

                    } else {
                      console.trace('unexpected error');
                      options.callback(null,{
                        error: 'unexpected error'
                      });

                    }
                });
            }
        });
    }

    User.signup = function user_signup(options, req, callback) {
      console.log('signup');
      console.log(arguments);
        User._signup({
            username: options.username,
            email: options.email,
            password: options.password,
            fingerprint: options.fingerprint,
            ip: req.ip,
            forwarded_for: req.ips,
            callback: callback
        });
    }

    User.remoteMethod(
      'signup',
      {
          accepts: [
            {arg: 'options', type: 'object', 'http': {source: 'body'}},
            {arg: 'req', type: 'object', 'http': {source: 'req'}},
          ],
          returns: {arg: 'result', type: 'object'}
      }
    );

};
