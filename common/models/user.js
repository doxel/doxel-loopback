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
  var path=require('path');

  User.prototype.getRoles=function(callback){
    var user=this;
    var Role=User.app.models.role;
    var RoleMapping=User.app.models.roleMapping;

    Role.getRoles({
      principalType: RoleMapping.USER,
      principalId: user.id

    }, function(err, roles){
      if (err) {
        return callback(err);
      }
      if (!roles) {
        return callback(null,null);
      }
      var result=[];
      roles.forEach(function(role){
        if (!result[role]) {
          result.push(role);
        }
      });
      callback(null,result);
    });
  }

  /**
  * @method User.authenticate
  * @param args {Object}
  * @param args.access_token {String} access token to validate
  * @return defer {Promise}
  * @resolve args {Object} same as input
  * @resolve args.accessToken {Object} the accessToken instance
  */
  User.authenticate=function authenticate(args) {
    var q=Q.defer();

    if (!args.access_token) {
      q.reject(new Error('authentication failed'));
      return q.promise;
    }

    // authenticate user using args.access_token
    // and fetch user info
    User.relations.accessTokens.modelTo.findById(
      args.access_token, {
        include: {
          relation: 'user'
        }

      }, function(err, accessToken) {
        if (err) {
          args.accessToken=null;
          q.reject(err);

        } else {
          if (!accessToken) {
            q.reject(new Error('Access token expired. '+access_token));

          } else {
            accessToken.validate(function(err,isValid){
              if (err) {
                q.reject(err);

              } else if (!isValid) {
                q.reject(new Error('Access token expired '+access_token));

              } else {
                args.accessToken=accessToken;
                q.resolve(args);

              }
            });
          }
        }
      }
    );
    return q.promise;

  } // authenticate

  //send password reset link when password reset requested
  User.on('resetPasswordRequest', function(info) {
    var app=User.app;
    var url = 'http' + (app.get('httpOnly')? '' : 's') + '://' + app.get('host') + ':' + app.get('port') + '/reset-password-form';
    var html = 'Click <a href="' + url + '/' + info.accessToken.id + '">here</a> to reset your password';

    app.models.Email.send({
      to: info.email,
      from: info.email,
      subject: 'Password reset',
      html: html

    }, function(err) {
      if (err) {
        return console.log('> error sending password reset email');
      }
      console.log('> sending password reset email to:', info.email);

    });
  });

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
        var token=options.token || _token.substr(0,32)
        var username=options.username;
        var email;

        if (options.email) {
          email=options.email;

        } else {
          if (username) {
            email=username.match(/@/) ? username : username+'@anonymous';

          } else {
            email=token+'@anonymous';
          }
        }
        username=username || email.split('@')[0];
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
                options.callback(err,user);
              });
            }
            return;
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

    q.then(function user_login(){
      var q3=Q.defer();
      console.log(options);

      User.login({
        username: options.username,
        email: options.email,
        password: options.password
      },
      function(err,accessToken) {
        if (err) {
          console.log((options.email||options.username)+': password mismatch');
          q3.reject(err);
          return;
        }
        console.log(accessToken);
        callback(null,{session: accessToken});
        q3.resolve();
      });

      return q3.promise;

    }).fail(function(err){
      console.log(err.stack,err.message);
      callback(null,{error: 'loginFailed'});

    }).done();

  }; // User.signin

  User.remoteMethod(
    'signin',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}}
      ],
      returns: {arg: 'result', type: 'object'}
    }
  );

  User.signout=function(options,req,callback){

    function failed(err){
      console.log(err.stack, err.message)
      callback(null,{error: 'logoutFailed'});
    }

    User.authenticate(req)
    .then(function(req){
      if (options.removeAllAccessTokens) {
        User.app.models.AccessToken.destroyAll({
          where: {userId: req.accessToken.userId}
        }, function(err){
          if (err) {
            return failed(err);
          }
          callback();
        });

      } else {
        req.accessToken.destroy(function(err){
          if (err) {
            return failed(err);
          }
          callback();
        });
      }
    })
    .fail(failed)
    .done();

  } // User.signout

  User.remoteMethod(
    'signout',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}}
      ],
      returns: {arg: 'result', type: 'object'}
    }
  );

  User.changePassword = function(options,req,callback) {
    User.authenticate({
      access_token: req.headers.authorization

    }).then(function(args){
      var user=args.accessToken.user();
      user.updateAttribute('password', options.password, function(err, user) {
        if (err) {
          console.log('changePassword:', err.message, err.stack);
          return callback(null,{error: 'tokenExpired'});
        }
        console.log('password changed for '+req.accessToken.userId);
        callback(null,{success: true});
      });

    }).fail(function(err){
        console.log('changePassword:', err.message, err.stack);
        callback(null,{error: 'tokenExpired'});
    }).done();

  };

  User.remoteMethod(
      'changePassword',
      {
          accepts: [
              {arg: 'options', type: 'object', 'http': {source: 'body'}},
              {arg: 'req', type: 'object', http: {source: 'req'}},
          ],
          returns: { arg: 'result', type: 'object' }
      }
  );

};
