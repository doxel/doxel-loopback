/*
 * segment-missing-dir.js
 *
 * Copyright (c) 2015-2018 ALSENET SA - http://doxel.org
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

/**
  This script list or purge segments with missing data directory

  run it with PORT=<unused_port> node . $(pwd)/server/scripts/segment-missing-dir.js
  eg: PORT=1234 node . $(pwd)/server/scripts/segment-missing-dir.js [--purge]

*/
module.exports=function(app){

  var Q=require('q');
  var Segment=app.models.Segment;
  var fs=require('fs');

  if (process.argv[3]=='--purge'){
    var purge=true;
  }

  Segment.find({
    fields: ['id'],

  }, function(err,segments){
    var segment_idx=0;
    segment_loop();

    function segment_loop(){
      if (segment_idx>=segments.length) {
        console.log('segment_loop: DONE');
        return;
      }
      var segment=segments[segment_idx++];

      segment._path(function callback(err,path){
        if (!err && path && path.length) {
          fs.stat(path,function(err,stats){
            if (err) {
              console.log(err);
              if (err.code=='ENOENT') {
                console.log('segment-missing-dir: path does not exists: '+path);
                if (purge) {
                  Segment._purge(segment.id)
                  .then(function(){
                    console.log('segment-missing-dir: purged '+segment.id);
                  })
                  .finally(segment_loop);
                  return;
                }
              } else {
                console.log('segment-missing-dir: unexpected file system error: '+err);
              }
            }
            process.nextTick(segment_loop);
          });

        } else {
          console.log('segment-missing-dir: unexpected problem with segment '+segment.id);
        }
      });

    } // segment_loop

  });
}
