/*
 * segment-coords.js
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
  This scripts (re)compute the segment(s) average coordinate and boundaries.

  run it with PORT=<unused_port> node . $(pwd)/server/scripts/segment-coords.js [<where>]
  eg: PORT=1234 node . $(pwd)/server/scripts/segment-coords.js '{"id":"57f929a4536d597a25df5c80"}'

  where defaults to {geo: {exists: false}}

*/
module.exports=function(app){

  var Q=require('q');
  var Segment=app.models.Segment;
  var loopback=require('loopback');
  var geolib=require('geolib');

  var where={
    geo: {
      exists: false
    }
  };

  if (process.argv[3].length){
    where=JSON.parse(process.argv[3]);
  }

  Segment.find({
    where: where,
    include: 'pictures'

  }, function(err,segments){
    var segment_idx=0;
    segment_loop();

    function segment_loop(){
      if (segment_idx>=segments.length) {
        console.log('segment_loop: DONE');
        return;
      }

      var segment=segments[segment_idx++];
      segment.unsetAttribute('geo');

      var pictures=segment.pictures();
      console.log(segment.id+' pictures: '+pictures.length);
      if (!pictures.length) {
        Segment._purge(segment.id).finally(function(){
          process.nextTick(segment_loop);
        });
        return;
      }

      var coords=[];
      var picture_idx=0;

      function picture_loop() {
        if (picture_idx>=pictures.length) {
          return picture_loop.q.resolve();
        }

        var picture=pictures[picture_idx++];
        var save=false;
        var q=Q.defer();

        picture.geo=null;
        if (!picture.geo || picture.geo.lat===undefined) {
          if (picture.lat!==undefined) {
            q.resolve({lat: picture.lat, lng: picture.lng});

          } else {
            picture.getGPSCoords().then(function(data){
              if (data.lat!==undefined) {
                q.resolve({lat: data.lat, lng: data.lon});
              } else {
                q.resolve();
              }

            }).catch(function(err){
              console.log(err);
              q.resolve();
            });
          }

        } else {
          q.resolve();
        }

        q.promise.then(function(geo){
          if (geo) {
            picture.geo=new loopback.GeoPoint(geo);
            save=true;

          } else {
            if (picture.geo && picture.geo.lat==undefined) {
              picture.unsetAttribute('geo');
              picture.unsetAttribute('bounds');
              save=true;
            }
          }

          if (picture.lat!=undefined) { picture.unsetAttribute('lat'); save=true; }
          if (picture.lng!=undefined) { picture.unsetAttribute('lng'); save=true; }

          if (picture.geo) {
            coords.push({
              latitude: picture.geo.lat,
              longitude: picture.geo.lng
            });
          }

          if (save) {
            return Q.ninvoke(picture,'save')
          }

        })
        .catch(console.log)
        .finally(function(){
          process.nextTick(picture_loop);
        });

      } // picture loop

      picture_loop.q=Q.defer();

      picture_loop();

      picture_loop.q.promise.then(function(){
        if (coords.length) {
          var center=geolib.getCenter(coords);
          segment.geo=new loopback.GeoPoint({lat: center.latitude, lng: center.longitude});
          console.log(segment.id, segment.geo)

          var bounds=geolib.getBounds(coords);
          segment.bounds={
             min: new loopback.GeoPoint({lat: bounds.minLat, lng: bounds.minLng}),
             max: new loopback.GeoPoint({lat: bounds.maxLat, lng: bounds.maxLng})
          };
          console.log(segment.id, segment.bounds)
        }

        if (segment.geo && segment.geo.lat===undefined) {
          segment.unsetAttribute('geo');
        }

        if (!segment.geo) {
          console.log(segment.id+' no gps info');
        }

        if (segment.lat!==undefined) segment.unsetAttribute('lat');
        if (segment.lng!==undefined) segment.unsetAttribute('lng');

        return Q.ninvoke(segment,'save');

      })
      .catch(console.log)
      .finally(function(){
        process.nextTick(segment_loop)
      });


    } // segment_loop

  });
}

