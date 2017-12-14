/*
 * segment-autoqueue.js
 *
 * Copyright (c) 2017 ALSENET SA - http://doxel.org
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
  This scripts set segment.states to queued for new segments with at least two
  pictures when last uploaded picture older than 1 day

  run it with PORT=<unused_port> node . $(pwd)/server/scripts/segment-autoqueue.js
  eg: PORT=1234 node . $(pwd)/server/scripts/segment-autoqueue.js

*/
module.exports=function(app){
  process.nextTick(function(){

    var Segment=app.models.Segment;
    var yesterday=Date.now()-86400000;

    Segment.find({
      where: {
        or: [
          { status: 'new' },
          { status: { exists: false } }
        ],
      },
      include: {
        relation: 'pictures',
        scope: {
          fields: ['created'],
        }
      }

    }, function(err,segments){

      if (err) {
        console.log('autoqueue:',err.message);
        return;
      }
      console.log('autoqueue: '+segments.length+' new segments');

      var segment_idx=0;
      segment_loop();

      function segment_loop(){
        if (segment_idx>=segments.length) {
          console.log('segment_loop: DONE');
          process.exit(0);
        }
        var segment=segments[segment_idx++];

        var pictures=segment.pictures();

        var fresh=pictures.some(function(p){
          return p.created>yesterday;
        });

        if (fresh) {
          //console.log('too fresh', yesterday, segment);
          process.nextTick(segment_loop);

        } else {
          if (pictures.length>1) {
            console.log('set segment '+segment.id+' status to "queued"');
            segment.setStatus('queued',function(err,status,status_timestamp){
              if (err) console.log('failed !"',err);
              process.nextTick(segment_loop);
            });
          } else {
            // console.log('no picture pairs', segment);
            //TODO
            // segment.purge()
            process.nextTick(segment_loop);
          }
        }

      } // segment_loop

    });

  });
}


