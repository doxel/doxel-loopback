module.exports = function(Member) {

    var crypto=require('crypto');

    Member.getToken=function getToken(options) {
        crypto.randomBytes(options.bytes||16, function(ex, buf) {
            options.callback(buf.toString(options.type||'hex'));
        });
    }

    Member._signup = function _member_signup(options) {

        var token;

        console.log('_signup');

        // generate unique email, and password
        Member.getToken({
            bytes: 32,
            callback: function getToken_callback(_token) {
                var token=options.token || _token.substr(0,32);
                var email=options.email || token+'@doxel.org';
                var password=options.password || _token.substr(32);

                var member_options={
                    username: options.username||'',
                    email: email,
                    password: password,
                    token: token,
                    ip: options.ip,
                    forwarded_for: options.forwarded_for,
                    fingerprint: options.fingerprint,
                    newInstance: true
                };

                console.log('find or create member',email,token);
                // email must be unique
                Member.findOrCreate({
                 where: {
                    or: [{
                      email: email
                    },{
                      token: token
                    }]
                 }
                },
                member_options,
                function(err, member) {
                  console.log('here');

                    if (err) {
                        console.trace('signup failed',member_options,err);
                        options.callback(err);
                        return;
                    }

                    if (options.migrate) {
                        if (member) {
                            throw "migrate: unexpected token collision";

                        } else {
                            options.callback();
                            return;
                        }
                    }

                    if (member) {

                        console.log('member',token,member.token);

                        if (!member.newInstance) {
                          if (email==member.email) {
                              // given email exists for another instance, abort
                              options.callback(null,{error: 'email address already registered'});
                              return;
                          }

                          if (token==member.token) {
                            // generated token already exists, retry
                            _member_signup(options);
                            return;
                          }

                        } else {
                          member.unsetAttribute('newInstance');
                          member.save(function(err){
                            if (err) {
                              console.trace(err);
                              options.callback(err);

                            } else {
                              Member.login({
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

    Member.signup = function member_signup(options, req, callback) {
      console.log('signup');
      console.log(arguments);
        Member._signup({
            username: options.username,
            email: options.email,
            password: options.password,
            fingerprint: options.fingerprint,
            ip: req.ip,
            forwarded_for: req.ips,
            callback: callback
        });
    }

    Member.remoteMethod(
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
