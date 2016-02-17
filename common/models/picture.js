/*
 * picture.js
 *
 * Copyright (c) 2016 ALSENET SA - http://doxel.org
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

 module.exports = function(Picture) {
  var path=require('path');
  var app=require(path.join('..','..','/server/server.js'));
  var Q=require('q');
  var piexif=require('piexifjs');
  var upload=app.get('upload');
  var uploadRootDir=path.join.apply(path,[__dirname,'..','..'].concat(upload.directory));
  var fs=require('fs');
  var loopback=require('loopback');
  var exiv2=require('exiv2');
  var sharp=require('sharp');
  var piexif=require('piexifjs');

  Picture.getUploadRootDir=function(){
    return uploadRootDir;
  }

  Picture.observe('before delete', function group_delete(ctx, next) {
    app.models.InstanceAcl._delete(ctx, next);
  });

  function pictureFilePath(picture,segment,user){
    return path.join(
      app.models.Segment.prototype.getPath.apply(
        segment,
        [uploadRootDir, user.token, upload.segmentDigits]
      ),
      upload.imagesDir,
      picture.timestamp+'.'+upload.imageExtension
    );
  }

  Picture.prototype.getFilePath=function(callback){
    var picture=this;

    if (
      picture.segment
      && picture.segment.timestamp
      && picture.segment.user
      && picture.segment.user.token
    ) {
      return process.nextTick(function(){
        callback(null,pictureFilePath(picture,picture.segment,picture.segment.user));
      });

    } else {
      var q=Q.defer();
        app.models.Segment.findOne({
        where: {
          id: picture.segmentId
        },
        limit: 1,
        include: 'user'

      },function(err, segment){
        if (err) {
          return q.reject(err);
        }
        if (segment) {
          q.resolve({picture: picture, segment: segment});
        } else {
          return q.reject(new Error('Segment not found'));
        }
      });
    }

    q.promise.then(function(args){
      callback(null, pictureFilePath(args.picture,args.segment,args.segment.user()));
    })
    .fail(callback)
    .done();

  } // Picture.prototype.getFilePath

  Picture.prototype.getUnixTimestamp=function(){
    return Number(this.timestamp.substr(0,10)+this.timestamp.substr(11,3));
  }

  Picture.prototype.uniqueTimestamp=function() {
    var picture=this;
    var sec=picture.timestamp.substr(0,10);
    var usc=parseInt(picture.timestamp.substr(11),10);
    var q=Q.defer();

    function loop(timestamp, callback) {
      var q=Q.defer();

      Picture.findOne({
        where: {
          and: [
            {timestamp: timestamp},
            {userId: picture.userId},
            {id: {neq: picture.id}}
          ]
        }
      }, function(err, _picture) {
        if (err) {
          q.reject(err);

        } else {
          if (_picture) {
            // try again
            q.resolve();

          } else {
            // use this timestamp
            q.resolve(timestamp);
          }
        }
      });

      q.promise
      .then(function(timestamp){
        if (!timestamp) {
          var nusc=String(++usc);
          timestamp=sec+'_'+'000000'.substr(nusc.length)+nusc;
          loop(timestamp, callback);

        } else {
          callback(null,timestamp)
        }

      })
      .fail(function(err){
        console.log(err.stack, err.message);
        callback(err);

      });

    } // loop

    loop(picture.timestamp, function(err,timestamp){
      if (err) {
        q.reject(err);

      } else {
        picture.timestamp=timestamp;
        q.resolve();
      }

    });

    return q.promise;
  }

  Picture.isHashUnique=function(options, req, res, callback) {
    Picture.findOne({
      where: {
        sha256: options.sha256
      }
    }, function(err, picture){
      if (err) {
        console.log(err.message, err.stack);
        callback(err); //,{error: {code: 500, message: 'Internal server error', originalError: {message: err.message, stack: err.stack}}});
      } else {
        callback(null,{unique: !picture});
      }
    });
  }

  Picture.remoteMethod(
    'isHashUnique',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

  Picture.download=function(thumb, sha256, segmentId, pictureId, timestamp_jpg, req, res, callback) {
    var Role=app.models.role;
    var RoleMapping=app.models.roleMapping;
    var ACL=app.models.acl;
    var AccessToken=app.models.AccessToken;

    var timestamp=timestamp_jpg.substr(0,17);

    function getAccessToken(data) {
      var q=Q.defer();

      AccessToken.findForRequest(req, function(err, accessToken){
        if (err) {
          q.reject(err);

        } else {
          data.accessToken=accessToken||loopback.AccessToken.ANONYMOUS;
          q.resolve(data);
        }

      });
      return q.promise;

    } // getAccessToken

    function getPicture(data) {
      var q=Q.defer();

      Picture.findById(
        pictureId,
        {include: ['segment', 'user']},
        function(err, picture){
          if (err) {
            q.reject(err);

          } else if (picture &&
              picture.sha256==sha256 &&
              picture.segmentId==segmentId &&
              picture.timestamp==timestamp

          ) {
            data.picture=picture;
            q.resolve(data);

          } else {
            var err=new Error('File not found');
            err.status=404;
            err.message='File not found';
            q.reject(err);

          }
        }
      );
      return q.promise;

    } // getPicture


    function checkAccessForContext(data) {
      var q=Q.defer();

      if (false) {//data.picture.public===true || (data.accessToken && data.accessToken.userId==data.picture.userId)) {
        // Allow public access here to avoid useless database access in checkAccessForContext for this rule
        // (Bad practice because removing the rule in picture.json will not affect this)
        data.authorized=true;
        q.resolve(data);

      } else {
        ACL.checkAccessForContext(data.accessContext, function(err, resolved) {
          if (err) {
            q.reject(err);

          } else {
            console.log(resolved);
            data.authorized=(resolved.permission==ACL.ALLOW);
            q.resolve(data);

          }
        });
      }
      return q.promise;

    } // checkAccessForContext

    function streamFullSizePicture(data) {
      var q=Q.defer();

      fs.stat(data.filename,function(err,stats){
        if (err) {
          return q.reject(err);
        }

        res.set('Content-Type','image/jpeg');
        res.set('Content-Disposition','attachment;filename='+timestamp+'.jpg');
        res.set('Content-Transfer-Encoding','binary');
        res.set('Content-Size', stats.size);

        fs.createReadStream(data.filename)
        .on('end',function(){
          q.resolve(data);
        })
        .on('error',function(err){
          q.reject(err);
        })
        .pipe(res);

      });

      return q.promise;

    } // streamFullSizePicture

    function getImagePreviews(data) {
      var q=Q.defer();

      if (data.useExiv2) {
        exiv2.getImagePreview(data.filename, function(err, previews){
          if (err) {
            console.log(err.stack, err.message);
          }
          data.previews=previews;
          q.resolve(data);
        });
        return q.promise;
      }

      var jpeg_data='';
      fs.createReadStream(data.filename,{
        start: 0,
        end: 256*1024,
        encoding: 'binary'
      })
      .on('error', callback)
      .on('data', function(chunk){
        jpeg_data+=chunk;

      })
      .on('end', function(){
        try {
          var exif=data.exif=piexif.load(jpeg_data);

        } catch(e) {
          console.log(e.stack, e.message);
          q.resolve(data);
        }

        if (!exif) {
          q.resolve(data);
        }

        /*
        var exifObj=exif;
    for (var ifd in exifObj) {
        if (ifd == "thumbnail") {
            continue;
        }
        console.log("-" + ifd);
        for (var tag in exifObj[ifd]) {
            console.log("  " + piexif.TAGS[ifd][tag]["name"] + ":" + exifObj[ifd][tag]);
        }
    }
*/
        data.picture.width=exif['0th'][piexif.ImageIFD.ImageWidth];
        data.picture.height=exif['0th'][piexif.ImageIFD.ImageHeight];

        if (exif.thumbnail) {
          data.previews=[{
            mimeType: 'image/jpeg',
            data: exif.thumbnail,
            width: exif['1st'][piexif.ImageIFD.ImageWidth],
            height: exif['1st'][piexif.ImageIFD.ImageHeight]
          }];
        }

        q.resolve(data);

      });

      return q.promise;
    }

    function streamThumbnail(data) {

      // read thumbnails from jpeg
      return getImagePreviews(data)
      .then(function(data){
        var q=Q.defer();
        var previews=data.previews;

        if (previews) {
          var thumb;
          var width=0;
          previews.forEach(function(preview){
            if (preview.mimeType=='image/jpeg') {
              if (preview.width>width) {
                thumb=preview;
              }
            }
          });

          if (thumb && width>=256 && Math.abs(data.picture.width/data.picture.height-thumb.width/thumb.height)<0.01) {
            console.log(thumb);
            res.set('Content-Type','image/jpeg');
            res.set('Content-Transfer-Encoding','binary');
            res.set('Content-Size',thumb.data.length);
            res.end(thumb.data);
            return q.resolve(data);
          }

        }

        // no (suitable) preview, create thumbnail
        var thumbnailer=sharp()
        .resize(256)
        .on('error', function(err){
          q.reject(err);
        });

        console.log('TODO: streamThumbnail: save thumbnail in exif');

        res.set('Content-Type','image/jpeg');
        res.set('Content-Transfer-Encoding','binary');

        fs.createReadStream(data.filename)
        .on('error', function(err){
          q.reject(err);

        })
        .on('end', function(){
          q.resolve(data);

        })
        .pipe(thumbnailer)
        .pipe(res);

        return q.promise;

      });

    } // streamThumbnail

    function streamPicture(data) {

      if (!data.authorized) {
        var err=new Error('Not Authorized');
        err.status=401;
        var q=Q.defer();
        q.reject(err);
        return q.promise;

      } else {
        var picture=data.picture;
        data.filename=pictureFilePath(picture,picture.segment(),picture.user());
        console.log(data.filename);

        if (thumb) {
          return streamThumbnail(data);

        } else {
          return streamFullSizePicture(data);
        }
      }

    } // streamPicture


    // Put the pieces together

    var data={
      authorized: false
    };

    getPicture({
      authorized: false
    })
    .then(getAccessToken)
    .then(function(data){
      data.accessContext={
        accessToken: data.accessToken,
        model: 'Picture',
        id: data.picture.id,
        accessType: ACL.READ
      };
      return checkAccessForContext(data);
    })
    .then(streamPicture)
    .fail(function(err){
      console.log(err.stack, err.message);
      res.status(err.status||500).end(err.message);
    })
    .done();

  }

  Picture.remoteMethod('download',{
    accepts: [
      {arg: 'thumb', type: 'string', required: false},
      {arg: 'sha256', type: 'string', required: true},
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'pictureId', type: 'string', required: true},
      {arg: 'timestamp_jpg', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/download/:sha256/:segmentId/:pictureId/:timestamp_jpg',
      verb: 'get'
    }

  });

};
