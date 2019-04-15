/*
 * plupload.js
 *
 * Copyright (c) 2015-2019 ALSENET SA - http://doxel.org
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
  var shell=require('shelljs');
  var upload=require(path.join(__dirname,'/config.json')).upload;
  var mmm=require('mmmagic');
  var spawn=require('child_process').spawn;
  var loopback=require('loopback');
  var extend=require('extend');
//  var NodeGeocoder=require('node-geocoder');

  /*
  var geocoder_options=app.get('geocoder');
  var HttpsAdapter = require('node-geocoder/lib/httpadapter/httpsadapter.js');
  var httpAdapter = new HttpsAdapter(null, geocoder_options.httpsAdapter_options);
  var geocoder=NodeGeocoder(extend({},geocoder_options.nodeGeocoder,{
    httpAdapter: httpAdapter
  }));
  */

  // upload temporary directory
  var tmpDir=path.join(upload.directory,'tmp');

  // Remove old files
  var cleanupTmpDir=upload.cleanupTmpDir;

  // Temp file age in seconds
  var maxFileAge=upload.maxFileAge;


  app.use('/sendfile', function(req, res, next){

//    req.setTimeout(300);

    req.success=function success() {
      res.status(201).end('{"jsonrpc": "2.0", "result": {}, "id": "id"}');
    }

    req.fail=function fail(err) {
      if (!err) {
        err=new Error('{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "id": "id"}');
      }
      console.trace(err);

    //  res.socket.setNoDelay(true);
      res.setHeader('Content-Type','text/plain; charset=UTF-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      try {
        var obj=JSON.parse(err.message);
        if (obj.jsonrpc) {
          res.setHeader('Content-Length',strlen(err.message));
          res.status(201).end(err.message);

        } else {
          var message='{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "original": '+JSON.stringify({ message: err.message, stack: err.stack})+'}, "id": "id"}';
          res.status(201).end(message);
        }

      } catch(e) {
        var message='{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "original": '+JSON.stringify({ message: err.message, stack: err.stack})+'}, "id": "id"}';
        res.status(201).end(message);
      }

    } // req.fail

    req.abort=function abort(err) {
      if (err) console.log(err.message,err.stack);
      var req=this;
      if (req._abort) return;
      req._abort=true;
      if (req.busboy && req.busboy.file) {
        req.busboy.file.resume();
      }

      req.fail(err);

      if (req.headers && req.headers['user-agent'] && !req.headers['user-agent'].match(/chrome/i)) {
        console.log(req.headers);
   /**** works with firefox but not with chrome (status and error message are not received) */
        try {
          req.socket.end();
        } catch(e) {
          console.log(e.message,e.stack);
        }

        try {
          res.socket.end();
        } catch(e) {
          console.log(e.message,e.stack);
        }

  /**/
        try {
          req.unpipe();
        } catch(e) {
          console.log(e.message,e.stack);
        }
      }

    } // req.abort

    function checkFreeSpace() {
      var q=Q.defer();

      // get free space
      df({
        file: upload.directory

      }, function(err, reply) {
        if (err) {
          req.abort(err);
    //      q.reject();

        } else {
          if (reply[0].used / reply[0].size > upload.maxDiskUsage) {
            req.abort(new Error('{"jsonrpc" : "2.0", "error" : {"code": 907, "message": "Remote disk is full !"}, "id" : "id"}'));
    //        q.reject();

          } else {
            q.resolve();
          }
        }

      });
      return q.promise;

    } // checkFreeSpace

    // assert content-length is not null
    var contentLength=Number(req.get('content-length'));
    if (isNaN(contentLength)||!contentLength) {
      res.status(201).end('{"jsonrpc" : "2.0", "error" : {"code": 105, "message": "File size exceed content-length !"}, "id" : "id"}');
      req.abort();
      return;
    }

    req.access_token=req.headers['authorization']||req.signedCookies.access_token;
    app.models.User.authenticate(req)
    .then(checkFreeSpace)
    .then(function(){

      // run express-plupload middleware

      // TODO: check for already validated, already received, or unknow fields
  //      req.validated=[];
      function validate(field,isValid){
  //        req.validated[field]=isValid;
        return isValid;
      }

      express_plupload.middleware(req,res,next,{
        validate: {
          // validate timestamp
          timestamp: function(req,res,next,timestamp) {
            if (!validate('timestamp',timestamp.match(/^[0-9]{10}_[0-9]{6}$/))) {
              req.abort(new Error('{"jsonrpc" : "2.0", "error" : {"code": 901, "message": "Invalid or missing timestamp. ('+timestamp+')"}, "id" : "id"}'));
              return false;
            }
          },
          // validate hash
          sha256: function(req,res,next,sha256) {
            if (!validate('sha256',sha256.match(/^[0-9a-z]{64}$/))) {
              req.abort(new Error('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash. ('+sha256+')"}, "id" : "id"}'));
              return false;
            }
          }
        }
      });

    }).fail(req.abort)
    .done();

  });

  app.use('/sendfile', function(req, res, next){
      var tmpFile=path.join(tmpDir, req.plupload.fields.timestamp+'-'+req.plupload.fields.sha256);

      req.busboy.on('error',function(e){
        req.abort();
      });

      // chunk received successfuly
      req.busboy.on('finish', function(){

        var Picture=app.models.Picture;
        var Segment=app.models.Segment;

        var sha256=req.plupload.fields.sha256;

        function checkForDuplicateFile() {
          var q=Q.defer();
          // check for duplicate file
          Picture.findOne({
            where: {
              sha256: sha256
            }

          }, function(err,picture) {
            if (picture) {
              req.abort(new Error('{"jsonrpc" : "2.0", "error" : {"code": 904, "message": "Duplicate file: '+req.plupload.fields.name+' ('+picture.id+')."}, "id" : "id"}'));
        //      q.reject();

            } else {
              q.resolve();
            }

          });
          return q.promise;

        }  // checkForDuplicateFile

        function checkMimeType() {
          var q=Q.defer();
          // check the mime type of the first chunk
          // TODO: determine why upload hangs without FORCE=true or this then() block
          var FORCE=false;
          if (FORCE || Number(req.plupload.fields.chunk)==0) {
        //  check the file type
            var magic=new mmm.Magic(mmm.MAGIC_MIME_TYPE);
            magic.detectFile(tmpFile,function(err,result){
              if (err) {
                q.reject(err);

              } else {
                if (result=="image/jpeg") {
                  q.resolve()

                } else {
                  console.log(result);
                  q.reject(new Error('{"jsonrpc": "2.0", "error": {"code": 902, "message": "Not a jpeg image: '+req.plupload.fields.name+'"}, "id": "id"}'));
                }
              }
            })

          } else {
            q.resolve();
          }
          return q.promise;

        } // checkMimeType

        // compare specified hash with computed hash
        function checkReceivedHash() {
          var q=Q.defer();
          var result='';
          var stderr='';

          var jpeg_sha256=spawn('jpeg_sha256',[tmpFile]);

          jpeg_sha256.stdout.on('data', function(data) {
            result+=data;
          });

          jpeg_sha256.stderr.on('data', function(data) {
            stderr+=data;
            console.log('stderr: '+data);
          });

          jpeg_sha256.on('close', function(code){
            if (code!=0) {
              q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error !", "original": '+JSON.stringify({ message: stderr })+'}, "id": "id"}'));

            } else {
              if (req.plupload.fields.sha256==result.substr(0,64)) {
                q.resolve();

              } else {
                q.reject(new Error('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Hash mismatch. ('+tmpFile+')"}, "id" : "id"}'));
              }
            }
          });

          return q.promise;

        } // checkReceivedHash

        function checkForSpecifiedSegment() {
          var q=Q.defer();

          // check for user specified segment, if any
          if (!req.plupload.fields.segmentId) {
            q.resolve();

          } else {
            Segment.findById(
              req.plupload.fields.segmentId,
              function(err,segment) {
                if (err) {
                  q.reject(err);

                } else if (segment.userId!=req.accessToken.userId){
                  // TODO: maybe segments could be owned by a group
                  q.reject(new Error('segment owner mismatch'));

                } else {
                  req.segment=segment;
                  q.resolve();
                }

              }
            );
          }
          return q.promise;

        } // checkForSpecifiedSegment

        function getPictureSegment(){
          var q=Q.defer();
          if (req.segment) {
            // a valid segment was specified
            q.resolve();

          } else {
            // search for an existing picture matching
            // the "belongs to the same segment" condition
            var timestamp=req.plupload.fields.timestamp;
            var unixTimestamp=Number(timestamp.substr(0,10)+timestamp.substr(11,3));
            Picture.findOne({
              where: {
                and: [{
                  userId: req.accessToken.userId,
                },{
                  timestamp: {lt: unixTimestamp+120000}
                }, {
                  timestamp: {gt: unixTimestamp-120000}
                }]
              }

            }, function(err,picture){
              if (picture && picture.segmentId) {
                // retrieve existing segment
                Segment.findById(
                  picture.segmentId,
                  function(err,segment){
                    if (err) {
                      q.reject(err);
                    } else {
                      req.segment=segment;
                      q.resolve();
                    }
                  }

                );

              } else {
                // create new segment
                Segment.create({
                  userId: req.accessToken.userId,
                  timestamp: timestamp

                }, function(err,segment) {
                  if (err) {
                    q.reject(err);
                  } else {
                    req.newSegment=true;
                    req.segment=segment;
                    q.resolve();
                  }

                });
              }
            });
          }
          return q.promise;

        } // getPictureSegment

        function addPictureToDatabase() {
          var q=Q.defer();
          // add picture to database
          Picture.findOrCreate({
            where: {
              sha256: sha256
            }

          },{
            sha256: sha256,
            segmentId: req.segment.id,
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
              if (
                req.plupload.fields.lat!==undefined &&
                req.plupload.fields.lat!=='undefined' &&
                req.plupload.fields.lon!==undefined &&
                req.plupload.fields.lon!=='undefined'
              ) {
                console.log(req.plupload.fields)
                picture.geo=new loopback.GeoPoint({
                  lat: Number(req.plupload.fields.lat),
                  lng: Number(req.plupload.fields.lon)
                });
              }

              picture.uniqueTimestamp()
              .then(function(){
                picture.save(function(err,picture){
                  if (err) {
                    q.reject(err);
                  } else {
                    req.picture=picture;
                    q.resolve();
                  }
                });

              });

            } else {
              q.reject(new Error('No picture'));
            }

          });
          return q.promise;

        } // addPictureToDatabase

        function updateSegment() {
          var update;

          // set segment preview
          if (req.newSegment) {
            req.segment.previewId=req.picture.id;
            update=true;
          }

          // update segment coords
          if (req.picture.geo) {
            if (!req.segment.geo) {
              req.segment.geo=new loopback.GeoPoint({
                lat: req.picture.geo.lat,
                lng: req.picture.geo.lng
              });
            } else {
              req.segment.geo.lat=(req.segment.geo.lat+req.picture.geo.lat)*0.5;
              req.segment.geo.lng=(req.segment.geo.lng+req.picture.geo.lng)*0.5;
            }
            update=true;
          }

          var q=new Q.defer();


  //      setCountry(function(){
            if (update) {
              req.segment.save(function(err,segment){
                if (err) {
                  q.reject(err);
                } else {
                  q.resolve();
                }
              });

            } else {
              // dont mix async with sync
              q.resolve();
            }
 //       });
          return q.promise;

        } // updateSegment

        /*
         * TODO: setCountry (must use separate unique process and queuing for georeferencing)
        function setCountry(callback){
          if (!req.segment.country) {
            callback();
            return;
          }
          callback();

        }
        */

        function movePictureToDestination() {
          var q=Q.defer();

          // move the temporary file to the segment directory
          var destDir=path.join(
            req.segment.getPath(upload.directory,req.accessToken.user().token,upload.segmentDigits),
            'original_images'
          );

          var sherr;
          try {
            shell.mkdir('-p', destDir);
            sherr=shell.error();
          } catch(e) {
            sherr=e.message;
          }
          if (sherr) {
            q.reject(new Error('Cannot create destination directory: '+sherr));

          } else {
            try {
              shell.mv(tmpFile, path.join(destDir,req.picture.timestamp+'.jpeg'));
              sherr=shell.error();

            } catch(e) {
              sherr=e.message;
            }

            if (sherr) {
              q.reject(new Error('Cannot move file to destination directory: '+sherr))

            } else {
              q.resolve();
            }
          }

          return q.promise;

        } // movePictureToDestination

        // not the last chunk ?
        if (Number(req.plupload.fields.chunk)+1 < Number(req.plupload.fields.chunks)) {
          checkForDuplicateFile()
          .then(checkMimeType)
          .then(req.success)
          .fail(req.fail);

        } else {
          // last chunk received successfuly
          checkForDuplicateFile()
          .then(checkMimeType)
          .then(checkReceivedHash)
          .then(checkForSpecifiedSegment)
          .then(getPictureSegment)
          .then(addPictureToDatabase)
          .then(updateSegment)
          .then(movePictureToDestination)
          .then(req.success)
          .fail(req.fail)
          .done();
        }

      }); // busboy.on('finish')

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

  }); // app.use('/sendfile')

}
