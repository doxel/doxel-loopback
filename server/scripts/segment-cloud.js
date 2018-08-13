/*
 * segment-cloud.js
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

 module.exports=function(app){
  /*
   * import cloud data in database:
   *
   * - create pointCloud instance
   * - update segment picture
  */

  var Q=require('q');

  var Segment=app.models.Segment;
  var Pose=app.models.Pose;
  var PointCloud=app.models.PointCloud;

  Q.fcall(function(){
    // delete all PointCloud and Pose instances
    return Q(PointCloud.destroyAll()).then(Q(Pose.destroyAll()));

  })
  .then(function(){
   // get all the segment ids
   return Q(Segment.find({
     fields: ['id']
   }))

  })
  .then(function(segments){
    var segment_idx=0;

    function segments_loop(){
      // exit loop when no segment left
      if (segment_idx>=segments.length) {
        console.log('segment-viewer-status-update DONE');
        return
      }

      // get next segment
      var segment=segments[segment_idx++];
      console.log(segment_idx+'/'+segments.length);

      // create segment PointCloud and Pose instances
      Segment._injectPointcloud(segment.id)
      .fail(console.log)
      .finally(segments_loop)
      .done();
    }

    // enter the loop
    segments_loop();

  });
}
