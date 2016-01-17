/*
 * plupload.js
 *
 * Copyright (c) 2015 ALSENET SA - http://doxel.org
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

module.exports=function(app) {

  var path=require('path');
  var fs=require('fs');
  var df=require('node-df');
  var Q=require('q');
  console.dump=require('object-to-paths').dump;
  var express_plupload=require('express-plupload');
  var crypto=require('crypto');
  var shell=require('shelljs');
  var upload=require(path.join('..','upload-config.json'));
  var mmm=require('mmmagic');

  // upload directory
  var uploadDir=path.join.apply(path,[__dirname].concat(upload.directory));

  // upload temporary directory
  var tmpDir=path.join(uploadDir,'tmp');

  // Remove old files
  var cleanupTmpDir=upload.cleanupTmpDir;

  // Temp file age in seconds
  var maxFileAge=upload.maxFileAge;

  app.use('/sendfile', function(req, res, next){

    // assert content-length is not null
    var contentLength=Number(req.get('content-length'));
    if (isNaN(contentLength)||!contentLength) {
      res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 105, "message": "File size exceed content-length !"}, "id" : "id"}');
      req._abort=true;
      return;
    }

    req.fail=function fail(err) {
      console.trace(err.message,err.stack);
      try {
        var obj=JSON.parse(err.message);
        if (obj.jsonrpc) {
          res.status(201).end(err.message);

        } else {
          res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "original": { "message": "'+err.message+'", "stack": "'+err.stack+'"}}, "id": "id"}');
        }

      } catch(e) {
        res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "original": { "message": "'+err.message+'", "stack": "'+err.stack+'"}}, "id": "id"}');

      }
      req._abort=true;
    };

    var q=Q();

    q.then(function(){
      var q=Q.defer();

      // authenticate user using cookie
      // and fetch user info
      var User=app.models.User;
      User.relations.accessTokens.modelTo.findById(
        req.signedCookies.access_token, {
          include: {
            relation: 'user'
          }

        }, function(err, accessToken) {
          if (err) {
            // user could not be authenticated
            // TODO: should return status 401
            q.reject(err);
          } else {
    //      console.log(accessToken);
            req.accessToken=accessToken;
            q.resolve();
          }
        }
      );
      return q.promise;

    }).then(function(){
      var q=Q.defer();

      // get free space
      df({
        file: uploadDir

      }, function(err, reply) {
        if (err) {
          q.reject(err);

        } else {
          if (reply[0].used / reply[0].size > upload.maxDiskUsage) {
            q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 907, "message": "Remote disk is full !"}, "id" : "id"}'));

          } else {
            q.resolve();
          }
        }

      });
      return q.promise;

    }).then(function(){
      // run express-plupload middleware

      // TODO: check for already validated, already received, or unknow fields
  //      req.validated=[];
      function validate(field,isValid){
  //        req.validated[field]=isValid;
        if (!isValid) {
          req._abort=true;
          if (req.busboy.file) {
            req.busboy.file.resume();
          }
        }
        return isValid;
      }

      express_plupload.middleware(req,res,next,{
        validate: {
          // validate timestamp
          timestamp: function(req,res,next,timestamp) {
            if (!timestamp.match(/^[0-9]{10}_[0-9]{6}$/)) {
              validate('timestamp',false);
              res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 901, "message": "Invalid or missing timestamp. ('+timestamp+')"}, "id" : "id"}');
              return false;
            }
          },
          // validate hash
          sha256: function(req,res,next,sha256) {
            if (!validate('sha256',sha256.match(/^[0-9a-z]{64}$/))) {
              res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash. ('+sha256+')"}, "id" : "id"}');
              return false;
            }
          }
        }
      });

    }).fail(req.fail);

  });

  app.use('/sendfile', function(req, res, next){
      var tmpFile=path.join(tmpDir, req.plupload.fields.timestamp+'-'+req.plupload.fields.sha256);

      // chunk received successfuly
      req.once('end', function(){
        var Picture=app.models.Picture;
        var Segment=app.models.Segment;

        var sha256=new Buffer(req.plupload.fields.sha256,'hex');

        // not the last chunk ?
        if (Number(req.plupload.fields.chunk)+1 < Number(req.plupload.fields.chunks)) {

          Q().then(function() {
            var q=Q.defer();
            // check for duplicate file
            Picture.findOne({
              where: {
                sha256: sha256
              }

            }, function(err,picture) {
              if (picture) {
                q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 904, "message": "Duplicate file: '+req.plupload.fields.name+' ('+picture.id+')."}, "id" : "id"}'));

              } else {
                q.resolve();
              }

            });

            return q.promise;

          }).then(function(){
            // check the mime type of the first chunk
            // TODO: determine why upload hangs without FORCE=true or this then() block
            var FORCE=true;
            if (FORCE || Number(req.plupload.fields.chunk)==0) {
              var q=Q.defer();
          //  check the file type
              var magic=new mmm.Magic(mmm.MAGIC_MIME_TYPE);
              magic.detectFile(tmpFile,function(err,result){
                if (err) {
                  q.reject(err);

                } else {
                  if (result=="image/jpeg") {
                    res.status(201).end('{"jsonrpc": "2.0", "result": {}, "id": "id"}');
                    q.resolve()

                  } else {
                    console.log(result);
                    q.reject(new Error('{"jsonrpc": "2.0", "error": {"code": 902, "message": "Not a jpeg image: '+req.plupload.fields.name+'"}, "id": "id"}'));
                  }
                }
              })
              return q.promise;
            }

          }).fail(req.fail);

          // not the last chunk
          return;
        }

        // last chunk received successfuly
        Q().then(function(){
          var q=Q.defer();

          if (Number(req.plupload.fields.chunks)>1) {
            // the file content mime type has already been checked
            q.resolve();

          } else {
            //  check the file content mime type
            var magic=new mmm.Magic(mmm.MAGIC_MIME_TYPE);
            magic.detectFile(tmpFile,function(err,result){
              if (err) {
                q.reject(err);

              } else {
                if (result=="image/jpeg") {
                  res.status(201).end('{"jsonrpc": "2.0", "result": {}, "id": "id"}');
                  q.resolve();

                } else {
                  console.log(result);
                  q.reject(new Error('{"jsonrpc": "2.0", "error": {"code": 902, "message": "Not a jpeg image: '+req.plupload.fields.name+'"}, "id": "id"}'));
                }
              }

            });
          }

          return q.promise;

        }).then(function(err){
          var q=Q.defer();

          // compare specified hash with computed hash
          var hash=crypto.createHash('sha256');
          hash.setEncoding('hex');

          // validate jpeg data offset
          // TODO: check offset against computed jpeg metadata length
          var stats=fs.statSync(tmpFile);
          if (req.plupload.fields.offset<=0 || req.plupload.fields.offset>=stats.size-8) {
            q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 914, "message": "Invalid offset. ('+req.plupload.fields.offset+')"}, "id" : "id"}'));
            return q.promise;
          }

          var stream=fs.createReadStream(tmpFile,{
            encoding: 'binary',
            // TODO: offset to jpeg data must be verified or computed on the server
            start: Number(req.plupload.fields.offset)
          });

          stream.on('end',function(){
            hash.end();
            var myhash=hash.read();
            if (req.plupload.fields.sha256!=myhash) {
      //            console.log (req.plupload.fields.sha256,myhash);
              q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash. ('+req.plupload.fields.sha256+')"}, "id" : "id"}'));

            } else {
              q.resolve();

            }
          });

          stream.pipe(hash);
          return q.promise;

        }).then(function(){
          var q=Q.defer();
          // add picture to database
          Picture.findOrCreate({
            where: {
              sha256: sha256
            }

          },{
            sha256: sha256,
            timestamp: req.plupload.fields.timestamp,
            userId: req.accessToken.userId,
            created: Date.now(),
            isNew: true

          },function(err,picture){
            if (err) {
              q.reject(err);
              return;
            }

            if (picture) {
              // check for duplicate file
              if (!picture.isNew) {
                q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 904, "message": "Duplicate file: '+req.plupload.fields.name+' ('+picture.id+')."}, "id" : "id"}'));
                return;
              }

              picture.isNew=null;
              picture.unsetAttribute('isNew');
              req.plupload.fields.lat && (picture.lat=req.plupload.fields.lat);
              req.plupload.fields.lon && (picture.lng=req.plupload.fields.lon);

              picture.save(function(err,picture){
                if (err) {
                  q.reject(err);
                } else {
                  req.picture=picture;
                  q.resolve();
                }
              });

            } else {
              q.reject(new Error('No picture'));
            }

          });

          return q.promise;

        }).then(function(){
          var q=Q.defer();

          // check for user specified segment, if any
          if (!req.plupload.fields.segmentId) {
            q.resolve();

          } else {
            Segment.findById(req.plupload.fields.segmentId, function(err,segment) {
              if (err) {
                q.reject(err);

              } else if (segment.userId!=req.accessToken.userId){
                // TODO: maybe segments could be owned by a group
                q.reject(new Error('segment owner mismatch'));

              } else {
                req.segment=segment;
                q.resolve();
              }

            });
          }
          return q.promise;

        }).then(function(){
          var q=Q.defer();
          if (req.segment) {
            // a valid segment was specified
            q.resolve();

          } else {
            // search for an existing picture matching
            // the "belongs to the same segment" condition
            var seconds=req.picture.timestamp.split('_')[0];
      //          var user=req.accessToken.user;
      //          user.Pictures.findOne({
            Picture.findOne({
              where: {
                and: [{
                  userId: req.accessToken.userId,
                },{
                  timestamp: {lt: seconds+120}
                }, {
                  timestamp: {gt: seconds-120}
                }]
              }

            }, function(err,picture){
              console.log('pict',picture)
              if (picture) {
                // retrieve existing segment
                Segment.findById({
                  id: picture.segmentId

                },function(err,segment){
                  console.log('seg',segment)
                  if (err) {
                    q.reject(err);
                  } else {
                    req.segment=segment;
                    q.resolve();
                  }

                });

              } else {
                // create new segment
                Segment.create({
                  userId: req.accessToken.userId,
                  timestamp: req.picture.timestamp

                }, function(err,segment) {
                  if (err) {
                    q.reject(err);
                  } else {
                    req.segment=segment;
                    q.resolve();
                  }

                });
              }
            });
          }
          return q.promise;

        }).then(function(){
          var q=Q.defer();

          // add picture to segment
          req.picture.segmentId=req.segment.id;
          req.picture.save(function(err,picture){
            if (err) {
              q.reject(err);
            } else {
              req.picture=picture;
              q.resolve();
            }
          });
          return q.promise;

        }).then(function(){
          var q=Q.defer();
          // move the temporary file to the segment directory
          var destDir=req.segment.getPath(uploadDir,req.accessToken.user().token,upload.segmentDigits);

          shell.mkdir('-p', destDir);
          var sherr=shell.error();
          if (sherr) {
            q.reject(new Error('Cannot create destination directory: '+sherr));

          } else {
            shell.mv(tmpFile, path.join(destDir,req.plupload.fields.timestamp+'.jpeg'));
            sherr=shell.error();
            if (sherr) {
              q.reject(new Error('Cannot move file to destination directory: '+sherr))

            } else {
              res.status(201).end('{"jsonrpc": "2.0", "result": {}, "id": "id"}');
              q.resolve();
            }
          }

          return q.promise;

        }).fail(req.fail);

      }); // req.once('end')

      // not already downloading ?
      if (req.plupload.isNew) {
        // open temporary file in append mode
        var writeStream=fs.createWriteStream(tmpFile, {
          start: req.plupload.completedOffset
        });

        // pipe stream to temporary file
        try {
          req.plupload.stream.pipe(writeStream);

        } catch(e) {
          req.fail(e);
        }
      }

  });

}
