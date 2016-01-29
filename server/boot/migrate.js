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


if (!process.env['MIGRATE']) {
    return;
}

module.exports=function(app){
    var Q=require('q');
    var spawn=require('child_process').spawn;
    var MysqlUser=app.models.MysqlUser;
    var User=app.models.user;
    var Segment=app.models.Segment;
    var Picture=app.models.Picture;
    var tSegmentId={};

    MysqlUser.find({include: "mysqlPictures"},function(err,users){

        function find_pictures(user) {
            var q=Q.defer();
            var result='';
            var stderr='';

            console.log('find -maxdepth 1 /upload/*/*/*/*/'+user.pass+'/*/original_images/*.jpeg');
            var cmd='find /upload/*/*/*/*/'+user.pass+'/*/original_images/*.jpeg';
            var find=spawn('bash',['-c',cmd]);

            find.stdout.on('data', function(data) {
              result+=data;
            });

            find.stderr.on('data', function(data){
              stderr+=data;
              console.log('find: stderr: '+data);
            });

            find.on('close', function(code) {
              if (code!=0) {
                q.reject(new Error('find: error'));

              } else {
                q.resolve([user,result.split('\n')]);
              }
            });

            return q.promise;
        }

        function iter_user(args) {
            var user=args[0];
            var pathlist=args[1];
            var q=Q.defer();

            if (!pathlist.length) {
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
                          pathlist: pathlist
                        });
                    }
                  }
              });
            }

            return q.promise;

        } // iter_user

        function getSegment(newUserId,picture_segment) {
          var q=Q.defer();
          var segmentId=tSegmentId[newUserId+'_'+picture_segment];

          if (segmentId) {
            q.resolve(segmentId);
            return q.promise;

          } else {
            Segment.create({
              userId: newUserId,
              timestamp: picture_segment

            }, function(err,segment){
              if (err) {
                q.reject(err);

              } else {
                tSegmentId[newUserId+'_'+picture_segment]=segment.id;
                q.resolve(segment.id);
              }
            });

            return q.promise;

          }
        }

        var prevSegment=0;
        function iter_picture(args) {
          var q=Q.defer();
          if (!args) {
            q.resolve(null);
            return q.promise;
          }
          var newUserId=args[0];
          var user=args[1];
          var filepath=args[2];
          var picture=args[3];
          var sha256=args[4]

          var filepath_elem=filepath.substr(1).split('/');
          var timestamp=filepath_elem[8].split('.')[0];
          var segment=filepath_elem[6];
          getSegment(newUserId,segment)
          .then(function(segmentId) {
            if (segmentId!=prevSegment) {
              console.log('segment :'+segmentId);
              prevSegment=segmentId;
            }
            Picture.create({
              sha256: new Buffer(sha256,'hex'),
              created: picture.created.getTime(),
              timestamp: timestamp,
              lng: picture.lon,
              lat: picture.lat,
              userId: newUserId,
              segmentId: segmentId

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

        function getPictureDetails(newUserId,user,filepath) {
          var q=Q.defer();

          var result='';
          var stderr='';

          var sha256sum=spawn('sha256sum',[filepath]);

          sha256sum.stdout.on('data', function(data) {
            result+=data;
          });

          sha256sum.stderr.on('data', function(data) {
            stderr+=data;
            console.log('stderr: '+data);
          });

          sha256sum.on('close', function(code){
            if (code!=0) {
              q.reject(new Error('could not get old hash'));

            } else {
              var oldhash=result.substr(0,64);
              console.log('old hash: '+oldhash);
              var picture;
              var pictures=user.mysqlPictures();
              console.log(pictures.length+' mysql pictures');
              for (var i=0; i<pictures.length; ++i) {
                if (pictures[i].sha256.toString('hex')==oldhash) {
                  picture=pictures[i];
                  break;
                }
              }
              if (!picture) {
                console.log(filepath+': no matching picture in database !');
                q.resolve(null);

              } else {
                q.resolve([newUserId,user,filepath,picture]);
              }

            }
          });

          return q.promise;

        }

        function getnewhash(args) {
          var q=Q.defer();

          if (!args) {
            q.resolve(null);
            return q.promise;
          }

          var newUserId=args[0];
          var user=args[1];
          var filepath=args[2];
          var picture=args[3];

          var result='';
          var stderr='';

          var jpeg_sha256=spawn('jpeg_sha256',[filepath]);

          jpeg_sha256.stdout.on('data', function(data) {
            result+=data;
          });

          jpeg_sha256.stderr.on('data', function(data) {
            stderr+=data;
            console.log('stderr: '+data);
          });

          jpeg_sha256.on('close', function(code){
            if (code!=0) {
              q.reject(new Error('could not get new hash'));

            } else {
              var newhash=result.substr(0,64);
              console.log('new hash: '+newhash);
              q.resolve([newUserId,user,filepath,picture,newhash]);
            }
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
                      find_pictures(users[i])
                      .then(iter_user)
                      .then(function(reply){
                        // iter pictures
                        var q=Q.defer();
                        if (!reply) {
                          // no pictures, skip user
                          q.resolve();

                        } else {
                          var pathlist=reply.pathlist||[];
                          var newUserId=reply.newUserId;
                          var k=0;

                          console.log('user id '+newUserId);
                          console.log('migrating '+(pathlist.length-1)+' pictures');

                          function picture_loop() {
                            if (k<pathlist.length-1) {
                              (function(newUserId,pathlist,k){
                                console.log(newUserId,'picture '+k,pathlist[k]);
                                getPictureDetails(newUserId,users[i],pathlist[k])
                                .then(getnewhash)
                                .then(iter_picture)
                                .then(function(){
                                  picture_loop();
                                })
                                .fail(function(err){
                                  console.log(err.message,err.stack);
                                  picture_loop();
                                });

                              })(newUserId,pathlist,k++);

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
