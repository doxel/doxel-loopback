/*
 * session.js
 *
 * Copyright (c) 2015-2019 ALSENET SA - http://doxel.org
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

 // https://github.com/strongloop/loopback/issues/1032
module.exports = function(app) {
  var session = require('express-session');
  var MongoDBStore = require('connect-mongodb-session')(session);

  var store = new MongoDBStore({
    uri: 'mongodb://localhost:27017/connect_mongodb_session',
    collection: 'doxel'
  },console.log);
  store.on('error',console.log);

//  var RedisStore = require('connect-redis')(session);
//  var store = new RedisStore({ host: '127.0.0.1' });
  app.middleware('session', session({
    "store": store,
    "saveUninitialized": true,
    "resave": true,
    "secret": app.get('sessionSecret')
  }));
}
