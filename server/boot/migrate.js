/*
 * migrate.js
 *
 * Copyright (c) 2015-2016 ALSENET SA - http://doxel.org
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

var Q=require('q');

if (!process.env['MIGRATE']) {
    return;
}

module.exports=function(app){
    var MysqlUser=app.models.MysqlUser;
    var User=app.models.user;
    var Segment=app.models.Segment;
    var Picture=app.models.Picture;
    var tSegmentId={};

    MysqlUser.find({include: "mysqlPictures"},function(err,users){

        function iter_user(user) {
            var q=Q.defer();

            var pictures=user.mysqlPictures();
            if (!pictures.length) {
              console.log('no pictures, use skipped');
              q.resolve(null);

            } else {
              User._signup({
                  migrate: true,
                  token: user.pass,
                  fingerprint: user.fingerprint,
                  ip: user.ip,
                  forwarded_for: user.forwardedFor,
                  callback: function(err,newUser){
                    console.log('new user',arguments);
                    if (err) {
                        q.reject(err);
                    } else {
                        console.log('added '+user.pass+'@doxel.org');
                        q.resolve({
                          newUserId: newUser.id,
                          pictures: user.mysqlPictures()
                        });
                    }
                  }
              });
            }

            return q.promise;

        } // iter_user

        function getSegment(newUserId,picture) {
          var q=Q.defer();
          var segmentId=tSegmentId[picture.segment];

          if (segmentId) {
            q.resolve(segmentId);
            return q.promise;

          } else {
            Segment.create({
              userId: newUserId,

            }, function(err,segment){
              if (err) {
                q.reject(err);

              } else {
                tSegmentId[picture.segment]=segment.id;
                q.resolve(segment.id);
              }
            });

            return q.promise;

          }
        }

        var prevSegment=0;
        function iter_picture(newUserId,user,picture) {
          var q=Q.defer();

          getSegment(newUserId,picture)
          .then(function(segmentId) {
            if (segmentId!=prevSegment) {
              console.log('segment :'+segmentId);
              prevSegment=segmentId;
            }
            Picture.create({
              sha256: picture.sha256,
              created: picture.created,
              timestamp: picture.timestamp,
              lng: picture.lon,
              lat: picture.lat,
              userId: newUserId,
              segment: segmentId

            }, function(err,picture){
              if (err) {
                q.reject(err);

              } else {
                q.resolve();
              }
            });

          }).fail(function(err){
            q.reject(err);
          });

          return q.promise;
        }


        setTimeout(function(){
            console.log('migrating '+users.length+' users');
            var i=0;

            function user_loop() {
              console.log('user '+i);

              if (i<users.length) {
                  (function(i){
                      iter_user(users[i])
                      .then(function(reply){
                        var q=Q.defer();
                        if (!reply) {
                          // no pictures, skip user
                          q.resolve();

                        } else {
                          var pictures=reply.pictures||{};
                          var newUserId=reply.newUserId;
                          var k=0;

                          console.log('user id '+newUserId);
                          console.log('migrating '+pictures.length+' pictures');

                          function picture_loop() {
                            if (k<pictures.length) {
                              (function(newUserId,pictures,k){
                                console.log(newUserId,'picture '+k);
                                iter_picture(newUserId,users[i],pictures[k])
                                .then(function(){
                                  picture_loop();
                                })
                                .fail(function(err){
                                  console.log(err.message,err.stack);
                                  picture_loop();
                                });

                              })(newUserId,pictures,k++);

                            } else {
                              // next user
                              q.resolve();
                            }
                          }

                          picture_loop();
                        }

                        return q.promise;
                      })
                      .then(user_loop)
                      .fail(function(err){
                        console.log(err.message,err.stack);
                        user_loop();
                      });
                  })(i++);
              }
            }
            user_loop();

        },1000);

    });

}
