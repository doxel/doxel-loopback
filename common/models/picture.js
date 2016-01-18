/*
 * picture.js
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

 module.exports = function(Picture) {
  var Q=require('q');

  Picture.prototype.uniqueTimestamp=function() {
    var picture=this;
    var sec=picture.timestamp.substr(0,10);
    var usc=parseInt(picture.timestamp.substr(11),10);
    var q=Q.defer();

    function loop(timestamp, callback) {
      var q=Q.defer();

      Picture.findOne({
        where: {
          and: [
            {timestamp: timestamp},
            {userId: picture.userId},
            {id: {neq: picture.id}}
          ]
        }
      }, function(err, _picture) {
        if (err) {
          q.reject(err);

        } else {
          if (_picture) {
            // try again
            q.resolve();

          } else {
            // use this timestamp
            q.resolve(timestamp);
          }
        }
      });

      q.promise
      .then(function(timestamp){
        if (!timestamp) {
          var nusc=String(++usc);
          timestamp=sec+'_'+'000000'.substr(nusc.length)+nusc;
          loop(timestamp, callback);

        } else {
          callback(null,timestamp)
        }

      })
      .fail(function(err){
        console.log(err);
        callback(err);

      });

    } // loop

    loop(picture.timestamp, function(err,timestamp){
      if (err) {
        q.reject(err);

      } else {
        picture.timestamp=timestamp;
        q.resolve();
      }

    });

    return q.promise;
  }

  Picture.isHashUnique=function(options, req, res, callback) {
    Picture.findOne({
      where: {
        sha256: new Buffer(options.sha256, 'hex')
      }
    }, function(err, picture){
      if (err) {
        console.log(err.message,err.stack);
        callback(err); //,{error: {code: 500, message: 'Internal server error', originalError: {message: err.message, stack: err.stack}}});
      } else {
        callback(null,{unique: !picture});
      }
    });
  }

  Picture.remoteMethod(
    'isHashUnique',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

};
