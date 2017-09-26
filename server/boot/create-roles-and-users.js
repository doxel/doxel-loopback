/*
 * create-roles-and-users.js
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

 var Q = require('q');

module.exports = function(app) {
  var debug=false;
  var Role = app.models.role;
  var User = app.models.user;
  var RoleMapping = app.models.roleMapping;
  var extend=require('extend');
  var created_role={};
  var path=require('path');
  var toBeCreated=app.get('users');

  toBeCreated.reduce(function(promise,_user){
    var user_roles=_user.roles;
    delete _user.roles;
    delete _user.remark;

    return promise.then(function(){
      if (debug) console.log(_user)
      // create user's roles
      return user_roles.reduce(function(promise,_role){
        if (debug) console.log(_role);
        return promise.then(function(){
          return Q(Role.findOrCreate({
            where: {name: _role}
          }, {
            name: _role
          }))
          .then(function(args) {
            var role=args[0];
            var created=args[1];
            created_role[_role]|=created;
            console.log((created?'Created':'Found')+' role:', role.name);
          })
        })
        .catch(console.log);

      },Q.resolve())
      .then(function() {
        // add or update user
        return Q(User.upsertWithWhere({
          username: _user.username
        }, extend({
          email: _user.username+'@doxel.org',
          emailVerified: true,
          password: _user.username,
          fingerprint: 'dummy',
          ip: '127.0.0.1'
        }, _user)))
      })
      .then(function(user){
        console.log(user);

        // destroy all existing RoleMappings for user
        return Q(RoleMapping.destroyAll({
          principalType: RoleMapping.USER,
          principalId: user.id.toString()
        }))
        .then(function(){
          // get user's roles
          return user_roles.reduce(function(promise,_role){
            return promise.then(function(){
              return Q(Role.findOne({
                where: {
                  name: _role
                }
              }))
              .then(function(role) {
                // map role to user
                return Q(role.principals.create({
                  principalType: RoleMapping.USER,
                  principalId: user.id
                }))
                .then(function(){
                  console.log('> User '+user.email+' added to role '+ _role);
                })
              })
            })
            .catch(console.log);

          },Q.resolve())
        })
      })
    })
    .catch(console.log);

  },Q.resolve())
  .then(function(){
    console.log('Users created')
  })
  .catch(console.log);
}
