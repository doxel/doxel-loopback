/*
 * user.js
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


module.exports = function(User) {

  var crypto=require('crypto');
  var Q=require('q');

  User.getToken=function getToken(options) {
    var options=options||{};
    crypto.randomBytes(options.bytes||16, function(ex, buf) {
      options.callback(buf.toString(options.type||'hex'));
    });
  }

  // create a unique token for users logged in with third party accounts
  User.observe('before save', function setToken(ctx, next) {
    var obj=ctx.instance||ctx.data;
    if (obj.token) {
      next();

    } else {
      function _gotToken(token) {
        // check for token uniqueness
        User.findOne({
          where: {
            token: token
          }
        }, function(err, user) {
          if (err) {
            throw err;
          }

          if (user) {
            // token already owned
            User.getToken({
              callback: _gotToken
            });

          } else {
            obj.token=token;
            next();
          }

        });

      } // _gotToken

      User.getToken({
        callback: _gotToken
      });

    }
  });

  /**
  * @method User._signup
  */
  User._signup = function _user_signup(options) {

    var token;

    console.log('_signup');

    // generate unique email, and password
    User.getToken({
      bytes: 32,
      callback: function getToken_callback(_token) {
        var token=options.token || _token.substr(0,32);
        var email=options.email || token+'@doxel.org';
        var username=options.username || email;
        var password=options.password || _token.substr(32);

        var user_options={
          username: username,
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
              username: username
            },{
              token: token
            }]
          }
        },
        user_options,
        function(err, user) {
          if (err) {
            console.trace('signup failed',user_options,err);
            options.callback(err);
            return;
          }

          if (options.migrate) {
            if (!user.newInstance) {
              throw "migrate: unexpected token collision";

            } else {
              user.unsetAttribute('newInstance');
              user.save(function(err){
                if (err) {
                  console.trace(err);
                }
                options.callback(err);
              });
              return;
            }
          }

          if (user) {
            console.log('user',token,user.token);

            if (!user.newInstance) {
              if (email==user.email) {
                // given email exists for another instance, abort
                options.callback(null,{error: 'emailExists'});
                return;
              }

              if (token==user.token) {
                // generated token already exists, retry
                _user_signup(options);
                return;
              }

              if (username==user.username) {
                // given username
                options.callback(null,{error: 'usernameExists'});
                return;
              }

            } else {
              user.unsetAttribute('newInstance');
              user.save(function(err){
                if (err) {
                  console.trace(err);
                  options.callback(err);
                  return;

                } else {
                  User.login({
                    email: email,
                    password: password

                  }, function(err, session) {
                    if (err) {
                      console.trace(err);
                      options.callback(err);
                      return
                    }
                    options.callback(null,{
                      email: email,
                      password: password,
                      session: session
                    });
                    return;
                  })
                }

              });
            }

          } else {
            console.trace('user is null, unexpected error');
            options.callback(null,{
              error: 'unexpected'
            });
            return;
          }
        });
      }
    });
  }

  /**
  * @method User.signup
  */
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

  /**
  * @method User.signin
  */
  User.signin=function user_signin(options,req,callback) {
    var where={};

    // need at least username or email
    if (!options.email) {
      if (!options.username) {
        callback(null,{error: 'noUsername'});
        return;
      }
    }

    // and password
    if (!options.password) {
      callback(null,{error: 'noPassword'});
      return;
    }

    var q=Q();

    q.then(function getEmailFromUsername(){
      console.log('1');
      var q2=Q.defer();

      if (options.email) {
        q2.resolve();
        return;
      }

      User.findOne({
        where: {
          username: options.username
        }
      },
      function(err,user) {
        if (err) {
          throw err;
        }
        if (user) {
          options.email=user.email;
          q2.resolve();

        } else {
          callback(null,{error: 'loginFailed'});
          q2.reject();
        }

      });

      return q2.promise;

    }).then(function user_login(){
      var q3=Q.defer();
      console.log(options);

      User.login({
        email: options.email,
        password: options.password
      },
      function(err,accessToken) {
        console.log(3);
        if (err) {
          q3.reject(err);
        }
        console.log(accessToken);
        callback(null,{session: accessToken});
        q3.resolve();
      });

    }).fail(function(err){
      console.trace(err);
      options.callback(err);
    });

  };

  User.remoteMethod(
    'signin',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
      ],
      returns: {arg: 'result', type: 'object'}
    }
  );

};
