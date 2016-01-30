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
    var tokenToUserId={};
    var piexif=require('piexifjs');

    function getExifLngLat(filepath,data) {
      var jpeg=fs.readFileSync(filepath);
      var jpeg_data=jpeg.toString('binary');
      var exif=piexif.load(jpeg_data);
      if (exif.GPS) {
        var lat=exif.GPS[piexif.GPSIFD.GPSLatitude];
        lat=(lat[0][0]/lat[0][1])+(lat[1][0]/lat[1][1])/60+(lat[2][0]/lat[2][1])/3600;
        if (exif.GPS[piexif.GPSIFD.GPSLatitudeRef]=='S') {
          lat=-Math.abs(lat);
        }

        var lng=exif.GPS[piexif.GPSIFD.GPSLongitude];
        lng=(lng[0][0]/lng[0][1])+(lng[1][0]/lng[1][1])/60+(lng[2][0]/lng[2][1])/3600;
        if (exif.GPS[piexif.GPSIFD.GPSLongitudeRef]=='W') {
          lng=-Math.abs(lng);
        }

        data.lat=lat;
        data.lng=lng;

      }
    }

    MysqlUser.find({include: "mysqlPictures"},function(err,mysqlUsers){

        /**
         * @function findPicturesOnDisk
         *
         * Find pictures on disk, either for the the specified mysqlUser
         * instance, either all the pictures on disk.
         *
         * @param args {Object}
         * @param args.mysqlUser {Object} optional mysqlUser instance
         *
         * @return defer {Promise}
         *
         * @resolve args {Object} same as input
         * @resove args.filelist {Array}
         *
         */
        function findPicturesOnDisk(args) {
            var q=Q.defer();
            var result='';
            var stderr='';
            var cmd;

            if (args.mysqlUser) {
              cmd='find /upload/*/*/*/*/'+args.mysqlUser.pass+' -maxdepth 8 -wholename \*/original_images/*.jpeg';

            } else {
              cmd='find /upload/ -maxdepth 8 -wholename \*/original_images/\*.jpeg';

            }

            console.log(cmd);
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
                args.filelist=result.split('\n');
                q.resolve(args);
              }
            });

            return q.promise;
        }

        /**
         * @function migrateMysqluser
         *
         * Migrate the specified mysqlUser, if has pictures
         *
         * @param args {Object}
         * @param args.mysqlUser {Object} mysqlUser instance
         * @param args.filelist {Array}
         *
         * @return defer {Promise}
         *
         * @resolve args {Object} same as input
         * @resolve args.newUserId {String}
         */
        function migrateMysqluser(args) {
            var mysqlUser=args.mysqlUser;
            var q=Q.defer();

            if (!args.mysqlPictures.length && (!args.filelist || !args.filelist.length)) {
              console.log('no pictures, use skipped');
              q.resolve(null);

            } else {
              User._signup({
                  migrate: true,
                  token: mysqlUser.pass,
                  fingerprint: mysqlUser.fingerprint,
                  ip: mysqlUser.ip,
                  forwarded_for: mysqlUser.forwardedFor,
                  callback: function(err,newUser){
                    console.log('new user',arguments);
                    if (err) {
                        q.reject(err);
                    } else {
                        console.log('added '+newUser.email);
                        tokenToUserId[newUser.token]=newUser.id;
                        args.newUserId=newUser.id;
                        q.resolve(args);
                    }
                  }
              });
            }

            return q.promise;

        } // migrateMysqluser

        function findOrCreateSegment(newUserId,picture_segment) {
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
        /**
         * @function migrateMysqlpicture
         *
         * @param args {Object}
         * @param args.mysqlPicture {Object) mysqlPicture instance
         * @param args.filepath {String} image file path
         * @param args.newUserId {String}
         * @param args.sha256 {String} image jpeg_sha256 hash
         *
         * @return defer {Promise}
         *
         * @resolve args {Object} same as input
         * @resolve args.picture {Object} new picture instance
         *
         */
        function migrateMysqlpicture(args) {
          var q=Q.defer();
          if (!args) {
            q.resolve(null);
            return q.promise;
          }
          var mysqlPicture=args.mysqlPicture;

          var filepath_elem=args.filepath.substr(1).split('/');
          var timestamp=filepath_elem[8].split('.')[0];
          var segment=filepath_elem[6];

          findOrCreateSegment(args.newUserId,segment)
          .then(function(segmentId) {
            if (segmentId!=prevSegment) {
              console.log('segment :'+segmentId);
              prevSegment=segmentId;
            }

            var data={
              sha256: args.sha256,
              created: mysqlPicture && mysqlPicture.created.getTime() || Date.now(),
              timestamp: timestamp,
              userId: args.newUserId,
              segmentId: segmentId
            }

            if (mysqlPicture) {
              if (mysqlPicture.lon!==undefined) {
                data.lng=mysqlPicture.lon;
                data.lat=mysqlPicture.lat;
               }

            } else {
              getExifLngLat(args.filepath,data);
            }

            Picture.create(data, function(err,picture){
              if (err) {
                q.reject(err);

              } else {
                args.picture=picture;
                q.resolve(args);
              }
            });

          }).fail(function(err){
            q.reject(err);
          });

          return q.promise;

        } // migrateMysqlpicture

        /**
         * @function getMysqlpicture
         *
         * Compute the sha256sum for the specified image file and
         * return the matching mysqlPicture instance
         *
         * @param args {Object}
         * @param args.filepath {String} image file path
         * @param args.mysqlUser {Object} mysqlUser instance
         * @param args.mysqlPictures {Array} mysqlUser picture instances
         * @param args.newUserId {String) userId
         *
         * @return defer {Promise}
         *
         * @resolve args {Object} same as input
         * @resolve.args.mysqlPicture {Object} mysqlPicture instance
         */
        function getMysqlpicture(args) {
          var q=Q.defer();

          var result='';
          var stderr='';

          var sha256sum=spawn('sha256sum',[args.filepath]);

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
              for (var i=0; i<args.mysqlPictures.length; ++i) {
                if (args.mysqlPictures[i].sha256.toString('hex')==oldhash) {
                  picture=args.mysqlPictures[i];
                  break;
                }
              }
              if (!picture) {
                console.log(args.filepath+': no matching picture in database ! adding...');
              }
              args.mysqlPicture=picture;
              q.resolve(args);

            }
          });

          return q.promise;

        } // getMysqlpicture

        /**
         * @function getJpegSha256
         *
         * Compute the jpeg_sha256 hash for the specified image file
         *
         * @param args {Object}
         * @param args.filepath {String} the jpeg to hash
         *
         * @return defer {Promise}
         *
         * @resolve args {Object} same as input parameter
         * @resolve args.sha256 {String}
         *
         */
        function getJpegSha256(args) {
          var q=Q.defer();

          if (!args) {
            q.resolve(null);
            return q.promise;
          }

          var result='';
          var stderr='';

          var jpeg_sha256=spawn('jpeg_sha256',[args.filepath]);

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
              args.sha256=newhash;
              q.resolve(args);
            }
          });

          return q.promise;

        } // getJpegSha256

        /**
         * @function importPicturesFromMysqluser
         * @param args {Object}
         * @param args.filelist {Array} picture path list
         * @param args.mysqlUser {Object} mysqlUser instance
         * @param args.newUserId {String}
         * @return defer {Promise}
         * @resolve null
         *
         */
        function importPicturesFromMysqluser(args){
          var q=Q.defer();

          if (!args) {
            // no pictures, skip user
            q.resolve();

          } else {
            var filelist=args.filelist||[];
            var newUserId=args.newUserId;
            var mysqlUser=args.mysqlUser;
            var mysqlPictures=args.mysqlPictures;
            var k=0;

            console.log('user id '+newUserId);
            console.log('migrating '+(filelist.length-1)+' pictures');

            function mysqlPicture_loop() {
              if (k<filelist.length-1) {
                (function(k){
                  console.log(newUserId,'picture '+k,filelist[k]);
                  getMysqlpicture({
                    newUserId: newUserId,
                    mysqlUser: mysqlUser,
                    mysqlPictures: mysqlPictures,
                    filepath: filelist[k]
                  })
                  .then(getJpegSha256)
                  .then(migrateMysqlpicture)
                  .then(mysqlPicture_loop)
                  .fail(function(err){
                    console.log(err.message,err.stack);
                    mysqlPicture_loop();
                  });

                })(k++);

              } else {
                // next user
                q.resolve();
              }
            }

            mysqlPicture_loop();
          }

          return q.promise;

        } // importPicturesFromMysqluser

        setTimeout(function(){
            console.log('migrating '+mysqlUsers.length+' mysqlUsers');
            var i=0;

            var q=Q.defer();

            function mysqlUser_loop() {
              console.log('user '+i);

              if (i<mysqlUsers.length) {
                  (function(i){
                      var mysqlPictures=mysqlUsers[i].mysqlPictures();
                      console.log(mysqlPictures.length+' mysql pictures');

                      findPicturesOnDisk({
                        mysqlUser: mysqlUsers[i],
                        mysqlPictures: mysqlPictures
                      })
                      .then(migrateMysqluser)
                      .then(importPicturesFromMysqluser)
                      .then(mysqlUser_loop)
                      .fail(function(err){
                        console.log(err.message,err.stack);
                        mysqlUser_loop();
                      });

                  })(i++);

              } else {
                q.resolve();
              }

            } // mysqlUser_loop

            mysqlUser_loop();

            q.promise.then(function(){

              // add pictures with no matching user in database
              findPicturesOnDisk({})
              .then(function(args){
                /**
                 * @function findOrAddUser
                 *
                 * Find or add user using token from filepath
                 *
                 * @param args {Object}
                 * @param args.filepath_elem {Array}
                 *
                 * @return promise {Promise} deferred promise
                 *
                 * @resolve args {Object} same as input parameter
                 * @resolve args.userId {String}
                 */
                function findOrAddUser(args /*filepath_elem*/) {
                  var q=Q.defer();

                  var token=args.filepath_elem[5];
                  var userId=tokenToUserId[token];
                  if (userId) {
                    args.userId=userId;
                    q.resolve(args);

                  } else {
                    User._signup({
                      migrate: true,
                      token: token,
                      callback: function(err, user){
                        console.log('add user',arguments);
                        if (err) {
                          q.reject(err);

                        } else {
                            console.log('added '+user.email);
                            tokenToUserId[token]=user.id;
                            args.userId=user.id;
                            q.resolve(args);
                        }
                      }

                    });
                  }

                  return q.promise;

                } // findOrAddUser

                /**
                 * @function findOrCreateSegment
                 *
                 * @param args {Object}
                 * @param args.filepath_elem {Array} the splitted filepath
                 * @param args.userId {String} the segment owner
                 *
                 * @return promise {Promise} deferred promise
                 *
                 * @resolve args {Object} same as input parameter
                 * @resolve args.segmentId {String}
                 */
                function findOrCreateSegment(args) {
                  var q=Q.defer();

                  var picture_segment=args.filepath_elem[6];
                  var segmentId=tSegmentId[args.userId+'_'+picture_segment];
                  if (segmentId) {
                    args.segmentId=segmentId;
                    q.resolve(args);

                  } else {
                    Segment.create({
                      userId: args.userId,
                      timestamp: picture_segment

                    }, function(err,segment){
                      if (err) {
                        q.reject(err);

                      } else {
                        tSegmentId[args.userId+'_'+picture_segment]=segment.id;
                        args.segmentId=segment.id;
                        q.resolve(args);
                      }

                    });
                  }

                  return q.promise;

                } // findOrCreateSegment

                /**
                 * @function createPicture
                 *
                 * @param args {Object}
                 * @param args.filepath {String} the jpeg file path
                 * @param args.filepath_elem {Array} the splitted path
                 * @param args.userId {String}
                 * @param args.segmentId {String}
                 * @param args.sha256 {String}
                 *
                 * @return promise {Promise} deferred promise
                 *
                 * @resolve args {Object} same as input
                 * @resolve args.picture {Object}
                 */
                function createPicture(args) {
                  var q=Q.defer();

                  var data={
                    userId: args.userId,
                    segmentId: args.segmentId,
                    timestamp: args.filepath_elem[8].split('.')[0],
                    sha256: args.sha256,
                    created: Date.now()
                  }

                  getExifLngLat(args.filepath,data);

                  Picture.create(data, function(err, picture){
                    if (err) {
                      q.reject(err);

                    } else {
                      args.picture=picture;
                      q.resolve(args);
                    }

                  });

                  return q.promise;

                } // createPicture

                var i=0;
                function filelist_loop() {
                  if (i<args.filelist.length-1) {
                    (function(filepath){
                      var filepath_elem=filepath.substr(1).split('/');
                      var token=filepath_elem[5];
                      // user has not been migrated
                      findOrAddUser({
                        filepath: filepath,
                        filepath_elem: filepath_elem
                      })
                      .then(findOrCreateSegment)
                      .then(getJpegSha256)
                      .then(createPicture)
                      .then(filelist_loop)
                      .fail(function(err){
                        console.log(err.message,err.stack);
                        filelist_loop();
                      })

                    })(args.filelist[i++])
                  }
                } // filelist_loop

                filelist_loop();

            });

          });

        },1000);

    });

}
