/*
 * upsert-users.js
 *
 * Copyright (c) 2015-2019 ALSENET SA - http://doxel.org
 * Please read <http://doxel.org/license> for more information.
 *
 * Author(s):
 *
 *      Rurik Bugdanov <rurik.bugdanov@alsenet.com>
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

 module.exports=function(app){
  /*
   * add or update users from command line
   *
   * eg: PORT=1234 node . $(pwd)/server/scripts/upsert-users.js '[{"user": {"username": "...", "password": "...", "email": "..."}, "roles": ["..."], "forceUpdate": false}, ...]'
   *
  */

  var Q=require('q');

  var User=app.models.user;

  Q.fcall(function(){
    var toBeAdded=JSON.parse(process.argv[3]);
    User.upsertList(toBeAdded,true)
    .then(function(){
      process.exit(0);
    })
    .catch(function(){
      process.exit(1);
    });

  });
}
