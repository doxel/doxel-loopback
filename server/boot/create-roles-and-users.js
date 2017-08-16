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
    var Role = app.models.Role;
    var User = app.models.User;
    var RoleMapping = app.models.RoleMapping;
    var q = new Q();
    var extend=require('extend');
    var _created_admin_role;

    q.then(function(){

        var q=Q.defer();
        // add role "admin"
        Role.findOrCreate({
            where: { name: 'admin' }

        }, {
            name: 'admin'

        }, function(err, role, created) {
            if (err) {
                throw err;
            }
            _created_admin_role=created;
            console.log('Found or created role:', role.name);
            q.resolve();
        });

        return q.promise;

    }).then(function(){

        var q=Q.defer();
        // add role "member"
        Role.findOrCreate({
            where: { name: 'member' }

        }, {
            name: 'member'

        }, function(err, role) {
            if (err) {
                throw err;
            }
            console.log('Found or created role:', role.name);
            q.resolve();

        });
        return q.promise;

    }).then(function() {
        // add member "admin"
        var admin=extend({
          user: 'admin',
          pass: 'admin',
          email: 'admin@doxel.org'
        },app.get('admin'));

        User.findOrCreate({
            where: {
              username: 'admin',
            }

        }, {
            email: admin.email,
            username: admin.user,
            emailVerified: true,
            password: admin.pass,
            fingerprint: 'dummy',
            ip: '127.0.0.1'

        }, function(err, user, created) {
            if (err) {
                throw err;
            }
            console.log((created?'Created':'Found')+' user:', user.email);


            if (created || _created_admin_role) Role.findOne({
                where: {
                    name: 'admin'
                }

            }, function(err, role) {
                if (err) {
                    return;
                }

                role.principals.create({
                    principalType: RoleMapping.USER,
                    principalId: user.id

                }, function(err, principal) {
                    if (err) {
                        throw err;
                    }
                    console.log('> User type set to ' + role.name);
                });

            });

        });
    });

}
