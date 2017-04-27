/*
 * segment-tag.js
 *
 * Copyright (c) 2017 ALSENET SA - http://doxel.org
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

/**
  This scripts generate the table of tagId (segment.tag) from segment.segmentTags()

  run it with PORT=<unused_port> node . $(pwd)/server/scripts/segment-tag.js [<where>]
  eg: PORT=1234 node . $(pwd)/server/scripts/segment-tag.js '{"id":"57f929a4536d597a25df5c80"}'

  where defaults to empty object

*/
module.exports=function(app){

  var Q=require('q');
  var Segment=app.models.Segment;
  var loopback=require('loopback');

  var where={
  };

  if (process.argv[3] && process.argv[3].length){
    where=JSON.parse(process.argv[3]);
  }

  Segment.find({
    where: where,
    include: 'segmentTags'

  }, function(err,segments){
    var segment_idx=0;
    segment_loop();

    function segment_loop(){
      if (segment_idx>=segments.length) {
        console.log('segment_loop: DONE');
        return;
      }

      var segment=segments[segment_idx++];

      var segmentTags=segment.segmentTags();
      console.log(segment.id+' segmentTags: '+segmentTags.length);

      segment.tag=[];
      segmentTags.forEach(function(segmentTag){
        segment.tag.push({
          'tagId': segmentTag.tagId,
          'score': segmentTag.score
        });
      });

      if (!segment.tag.length) {
        segment.unsetAttribute('tag');
      }

      Q.ninvoke(segment,'save')
      .then(segment_loop)
      .catch(console.log);

    } // segment_loop

  });
}

