/*
 * instance-acl.js
 *
 * Copyright (c) 2016 ALSENET SA - http://doxel.org
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

module.exports = function(InstanceAcl) {
  var Q=require('q');

  InstanceAcl.observe('before save', function instanceAcl_validate(ctx, next) {
    // only remote create and remote findOrCreate are allowed
    if (!ctx.isNewinstance) {
      return Process.nextTick(function(){
        next(new Error('not a new InstanceAcl instance'));
      });
    }

    var instanceAcl=ctx.instance;

    // check whether model exists
    var Model=InstanceAcl.app.models[instanceAcl.modelName];
    if (!Model) {
      return Process.nextTick(function(){
        next(new Error(instanceAcl.modelName+': no such model'));
      });
    }

    // check whether model instance exists
    var q=Q.defer();
    Model.findById(instanceAcl.modelId, function(err, instance){
      if (err) {
        return q.reject(err);
      }
      if (!instance) {
        return q.reject(new Error('no such instance'));
      }
      q.resolve();

    });

    q.promise.then(function(){
      // check for rule uniqueness
      InstanceAcl.find({
        where: {
          userId: instanceAcl.userId,
          modelName: instanceAcl.modelName,
          modelId: instanceAcl.modelId,
          principalType: instanceAcl.principalType,
          principalId: instanceAcl.principalId
        }

      }, function(err, instance){
        if (err) {
          return next(err);
        }
        if (instanceAcl) {
          return next(new Error('Already member of instanceAcl'));
        }
        next();

      });

    })
    .fail(function(err){
      next(err);
    })
    .done();

  });

  // call this from  models "before delete" to remove instances from InstanceAcl
  InstanceAcl._delete=function(ctx,modelName,next) {
    var q=Q.defer();

    // only one instance is deleted when ctx.instance is set
    if (ctx.instance) {
      q.resolve([ctx.instance]);

    } else {
      // ctx.instance is unset, get the instance list
      ctx.Model.find({
        where: ctx.where

      }, function(err, instances) {
        if (err) {
          q.reject(err);

        } else {
          q.resolve(instances);
        }
      });

    }

    q.promise.then(function(instances) {
      var q=Q.defer();

      // destroy instanceAcl instances matching the deleted ctx.Model instances
      var i=0;
      function loop(){
        if (i>=instances.length) {
          return q.resolve()
        }

        (function(i){
          InstanceAcl.destroyAll({
            where: {
              modelName: modelName,
              modelId: instances[i].id
            }
          }, function(err, info) {
            if (err) {
              console.trace(err,info);
            }
            loop();

          });
        })(i++);

      } // loop

      loop();
      return q.promise;

    }).then(function(){
      next();
    })
    .fail(function(err) {
      next(err);
    })
    .done();
  };
};
