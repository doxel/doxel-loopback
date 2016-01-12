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

  var path = require('path');
  var fs = require('fs');
  var df = require('node-df');
  var Q = require('q');
  console.dump=require('object-to-paths').dump;
  var express_plupload=require('express-plupload');
  var crypto=require('crypto');


  var maxDiskUsage=95/100;

  // upload directory
  var uploadDir = path.join(__dirname, "..", "upload");

  // upload temporary directory
  var tmpDir = path.join(uploadDir,'tmp');

  // Remove old files
  var cleanupTmpDir = true;

  // Temp file age in seconds
  var maxFileAge = 5 * 3600;

  app.use('/sendfile', function(req, res, next){

    // assert content-length is not null
    var contentLength=Number(req.get('content-length'));
    if (isNaN(contentLength)||!contentLength) {
      res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 105, "message": "File size exceed content-length !"}, "id" : "id"}');
      return;
    }

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
            res.status(401).end();
            q.reject(err);
            return;

          }
    //      console.log(accessToken);
          req.accessToken=accessToken;
          q.resolve();
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
          return;
        }

        if ((Number(reply.used)+contentLength)/Number(reply.size) < maxDiskUsage) {
          // disk full
          res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 907, "message": "Remote disk is full !"}, "id" : "id"}');
          req._abort=true;
          q.reject(new Error('disk full'));

        } else {
          q.resolve();
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
              res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 901, "message": "Invalid or missing timestamp. ('+timestamp+')"}, "id" : "id"}');
              return false;
            }
          },
          // validate hash
          sha256: function(req,res,next,sha256) {
            if (!validate('sha256',sha256.match(/^[0-9a-z]{64}$/))) {
              res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash. ('+sha256+')"}, "id" : "id"}');
              return false;
            }
          }
        }
      });

    }).fail(function(err){
      if (err) {
        console.trace(err);
        res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 500, "message": "Internal server error."}, "id" : "id"}');
        req._abort=true;
    }

    });

  });

  app.use('/sendfile', function(req,res,next) {
    var tmpFile=path.join(tmpDir, req.plupload.fields.timestamp+'-'+req.plupload.fields.sha256);

    // chunk received successfuly
    req.once('end', function(){
      var Picture=app.models.Picture;
      var Segment=app.models.Segment;

      var sha256=new Buffer(req.plupload.fields.sha256,'hex');

      // not the last chunk ?
      if (Number(req.plupload.fields.chunk)+1 < Number(req.plupload.fields.chunks)) {

        // check for duplicate file
        Picture.findOne({
          where: {
            sha256: sha256
          }

        }, function(err,picture) {
          if (picture) {
            res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 904, "message": "Duplicate file: '+req.plupload.fields.name+' ('+picture.id+')."}, "id" : "id"}');

          } else {
            res.status(201).end('{"jsonrpc": "2.0", "result": {}}');
          }

        });
        return;
      }

      // last chunk received successfuly
      Q().then(function(){
        var q=Q.defer();
        // compare specified hash with computed hash
        var stream=fs.createReadStream(tmpFile,{
          encoding: 'binary',
          start: Number(req.plupload.fields.offset)
        });
        var hash=crypto.createHash('sha256');
        hash.setEncoding('hex');

        stream.on('end',function(){
          hash.end();
          var myhash=hash.read();
          if (req.plupload.fields.sha256!=myhash) {
            console.log (req.plupload.fields.sha256,myhash);

            res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash. ('+req.plupload.fields.sha256+')"}, "id" : "id"}');
            q.reject(new Error('invalid hash'));

          } else {
            q.resolve();
          }
        })
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
              res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 904, "message": "Duplicate file: '+req.plupload.fields.name+' ('+picture.id+')."}, "id" : "id"}');
              q.reject(new Error('duplicate file'));
              return;
            }

            picture.isNew=null;
            picture.unsetAttribute('isNew');
            req.plupload.fields.lat && (picture.lat=req.plupload.fields.lat);
            req.plupload.fields.lon && (picture.lng=req.plupload.fields.lon);

            picture.save(function(err,obj){
              if (err) {
                q.reject(err);
              } else {
                q.resolve(picture);
              }
            });

          } else {
            q.reject(new Error('no picture'));
          }
        });
        return q.promise;

      }).then(function(picture){
        var q=Q.defer();

        // check for user specified segment, if any
        if (!req.plupload.fields.segmentId) {
          q.resolve(picture);

        } else {
          Segment.findById(req.plupload.fields.segmentId, function(err,segment) {
            if (err) {
              q.reject(err);

            } else if (segment.userId!=req.accessToken.userId){
              q.reject(new Error('segment owner mismatch'));

            } else {
              q.resolve(picture, segment.id);
            }

          });
        }
        return q.promise;

      }).then(function(picture,segmentId){
        var q=Q.defer();
        if (segmentId) {
          // a valid segment was specified
          q.resolve(picture,segmentId);

        } else {
          // search for an existing picture matching
          // the "belongs to the same segment" condition
          var seconds=picture.timestamp.split('_')[0];
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

          }, function(err,existing){
            // use existing segment
            if (existing) {
              q.resolve(picture,existing.segmentId);

            } else {
              // create new segment
              Segment.create({
                userId: req.accessToken.userId

              }, function(err,segment) {
                if (err) {
                  q.reject(err);
                } else {
                  q.resolve(picture,segment.segmentId);
                }
              });

            }
          });
        }
        return q.promise;

      }).then(function(picture,segmentId){
        var q=Q.defer();

        // add picture to segment
        picture.segmentId=segmentId;
        picture.save(function(err,picture){
          if (err) {
            q.reject(err);
          } else {
            q.resolve();
          }
        });
        return q.promise;

      }).then(function(){
        // move the temporary file to the segment directory
        console.log('move file')

      }).fail(function(err){
        console.trace(err);
      });

    }); // app.use('/sendfile')

    // not already downloading ?
    if (req.plupload.isNew) {
      // open temporary file in append mode
      var writeStream = fs.createWriteStream(tmpFile, {
        start: req.plupload.completedOffset
      });

      // pipe stream to temporary file
      try {
        req.plupload.stream.pipe(writeStream);

      } catch(e) {
        console.trace(e);
        res.status(500).end('{"jsonrpc" : "2.0", "error" : {"code": 911, "message": "Upload failed !"}, "id" : "id"}');
      }
    }

  });

}
