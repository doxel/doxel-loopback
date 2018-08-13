/*
 * html5support.js
 *
 * Copyright (c) 2015-2018 ALSENET SA - http://doxel.org
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
  var path=require('path');
  var url=require('url');

  var prefix=app.get('html5Mode')?'':'#/';

  console.dump=require('object-to-paths').dump;

  function html5Mode_support() {

    app.all('/*', function(req, res, next) {
      if (req.url.substr(0,5)=='/api/') {
        return next();
      }
      var _documentRoot={ root: path.resolve(__dirname, '..', '..', 'client', (app.get('production')&&!req.cookies.debug)?'dist':'app') };
      res.sendFile('index.html', _documentRoot);
    });
  }

  if (app.get('html5Mode')) {
    html5Mode_support();
  }

}
