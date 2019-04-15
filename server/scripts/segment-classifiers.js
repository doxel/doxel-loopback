/*
 * segment-classifiers.js
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
   * import tensorflow classifiers <segment>/tensorflow/<timestamp>.jpeg.txt files into database
   * run with eg PORT=1234 node . $(pwd)/server/scripts/segment-classifiers.js
   *
  */
  var Q=require('q');

  var Segment=app.models.Segment;
  var Picture=app.models.Picture;
  var Classifier=app.models.Classifier;

  function importClassifiers() {

    // get all the segment ids
    return Q.fcall(function(){
      return Segment.find({ fields: ['id'] })

    }).then(function(segments){
      var q=Q.defer();
      var segment_idx=0;

      console.log(segments.length,'segments');
      function segments_loop(){
        // exit loop when no segment left
        if (segment_idx>=segments.length) {
          console.log('import-classifiers DONE');
          return q.resolve();
        }

        // get next segment
        var segment=segments[segment_idx++];
        console.log('import-classifiers: '+segment_idx+'/'+segments.length);

        // create segment PointCloud and Pose instances
        Segment._updateClassifiers(segment.id)
        .fail(console.log)
        .finally(segments_loop)
        .done();
      }

      // enter the loop
      segments_loop();

      return q.promise;

    });
  }

  importClassifiers()
  .catch(function(err){
    console.log(err);
  })
  .done();

}
