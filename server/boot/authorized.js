/*
 * authorized.js
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

module.exports = function(app) {
  var Q=require('q');
  var Role = app.models.role;
  var ACL=app.models.acl;
  var InstanceAcl=app.models.InstanceAcl;
  var User=app.models.user;

  Role.registerResolver('authorized', function(role, context, callback) {
    if (context.modelId===undefined) {
      return process.nextTick(function(){
        callback(null,false);
      });
    }

    // first check if public access is in authorized for the given instance
    var q=Q.defer();
    context.model.findById(context.modelId, function(err, instance) {
      if(err) {
        q.reject(err);

      } else {
        q.resolve(instance);
      }

    });

    q.promise.then(function(instance){
      var q=Q.defer();
      if (instance && instance.public) {
        q.resolve(true);
        return q.promise;
      }

      var userId = context.accessToken.userId;
      if (!userId) {
        console.log('Anonymous access disabled');
        q.resolve(false);
        return q.promise;
      }

      InstanceAcl.find({
        where: {
          modelName: context.modelName,
          modelId: context.modelId
        }

      }, function(err, rules){
        if (err) {
          return q.reject(err);
        }
        if (!rules) {
          return q.resole(false);
        }

        var authorized=false;
        var roleRules=[];
        rules.some(function(rule){
          switch(rule.principalType) {
            case ACL.USER:
              // The id can be a MongoDB ObjectID
              authorized=(rule.principalId==userId || rule.principalId.toString()==userId.toString())
              break;

            case ACL.ROLE:
              rolesRules.push(rule);
              break;

            default:
              q.reject(new Error('unhandled principal type'));
              break;
          }

          return authorized;

        });

        if (authorized || !roleRules.length) {
          q.resolve(authorized);

        } else {
          User.findById(userId, function(err,user){
            if (err) {
              return q.reject(new Error('no such user'));
            }
            user.getRoles().then(function(roles){
              roleRules.some(function(rule){
                authorized=(roles.indexOf(rule.principalId.toString())>=0);
                return authorized;

              });
              q.resolve(authorized);

            });
          })
        }
      });

      return q.promise;

    }).then(function(authorized){
      callback(null,authorized);

    }).fail(function(err){
      callback(err);

    }).done();

  });
};
