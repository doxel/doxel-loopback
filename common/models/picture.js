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

  Picture.prototype.getUnixTimestamp=function(timestamp){
    if (timestamp===undefined) {
      timestamp=this.timestamp;
    }
    return Number(timestamp.substr(0,10)+timestamp.substr(11,3));
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

      })
      .done();

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

  Picture.download=function(what, sha256, segmentId, pictureId, timestamp_jpg, req, res, callback) {
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

      // allow Segment.preview to pass picture object instead of pictureId
      if (pictureId && pictureId.id) {
        data.picture=pictureId;
        q.resolve(data);

      } else {
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
      }
      return q.promise;

    } // getPicture


    function checkAccessForContext(data) {
      var q=Q.defer();
      if (data.picture.public===true || (data.accessToken && data.accessToken.userId==data.picture.userId)) {
        // Allow public access here to avoid useless database access in checkAccessForContext for this rule
        // (Bad practice because removing the rule in picture.json will not affect this)
        data.authorized=true;
        q.resolve(data);

      } else {
        ACL.checkAccessForContext(data.accessContext, function(err, resolved) {
          if (err) {
            q.reject(err);

          } else {
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

    function getExif(data) {
      var q=Q.defer();

      sharp(data.filename)
      .metadata(function(err,metadata){
        if (err) {
          return q.reject(err);
        }
        data.metadata=metadata;
        data.picture.aspect=metadata.width/metadata.height;

        if (metadata.exif) {
          try {
            var exif=piexif.load(metadata.exif.toString('binary'));
            data.exif=exif;

          } catch(e) {
            console.log(e, e.stack, e.message);
            data.exif=null;
          }

        } else {
          data.exif=null;

        }
        q.resolve(data);

      });

      return q.promise;

    } // getExif

    function getExifThumbnails(data) {
      return getExif(data)
      .then(function(data){

/*
          var exifObj=data.exif;
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
          var exif=data.exif;

          if (exif.thumbnail) {
            data.previews=[{
              mimeType: 'image/jpeg',
              data: exif.thumbnail,
              width: exif['1st'][piexif.ImageIFD.ImageWidth],
              height: exif['1st'][piexif.ImageIFD.ImageHeight]
            }];
          }

          return data;
      });

    } // getExifThumbnails

    function getThumbnail(data) {
      // read thumbnails from jpeg
      return getExifThumbnails(data)
      .then(function(data){
        var previews=data.previews;
        var picture=data.picture;

        if (previews) {
          var thumb;
          previews.forEach(function(preview){
            if (preview.mimeType=='image/jpeg') {
              if (!thumb || preview.width>thumb.width) {
                thumb=preview;
              }
            }
          });

          if (thumb && thumb.width>=256 && Math.abs(picture.aspect-thumb.width/thumb.height)<0.01) {
            data.thumb=thumb;
            return data;
          }

        }

        // no (suitable) preview, create thumbnail
        return createThumbnail(data)/*.then(function(data){
          // TODO: save thumb in EXIF
        });
        */
      });
    } // getThumbnail

    function createThumbnail(data) {
      var q=Q.defer();

      var width=data.picture.aspect>=1?256:Math.round(256*data.picture.aspect);
  //    console.log(data.picture.aspect,width)
      var thumbnailer=sharp(data.filename)
      .resize(width)
      .rotate()
      .quality(70)
      .withMetadata()
      .on('error', function(err){
        q.reject(err);
      })
      .toBuffer(function(err, buf, info){
        if (err) {
          q.reject(err);
        }
        data.thumb={
          mimeType: 'image/jpeg',
          data: buf,
          width: info.width,
          height: info.height,
          isNew: true
        };

        q.resolve(data);

      });

      return q.promise;

    } // createThumbnail

    function streamThumbnail(data) {

      var thumb=data.thumb;
      res
      .set('Content-Type','image/jpeg')
      .set('Content-Transfer-Encoding','binary')
      .set('Cache-Control','public, max-age=315360000')
      .set('Content-Length',thumb.data.length)
      .end(thumb.data);

    } // streamThumbnail

    function streamExif(data){
      var q=Q.defer();
      var json=JSON.stringify(data.exif);

      res
      .on('end', function() {
        q.resolve(data);
      })
      .on('error', function(err){
        q.reject(err);
      })
      .set('Content-Type','text/plain')
      .set('Content-Transfer-Encoding','binary')
      .set('Cache-Control','public, max-age=315360000')
      .set('Content-Length',json.length)
      .end(json);

      return q.promise;

    } // streamExif(data)

    function streamRequestedData(data) {

      if (!data.authorized) {
        var err=new Error('Not Authorized');
        err.status=401;
        throw err;

      } else {
        var picture=data.picture;
        data.filename=pictureFilePath(picture,picture.segment(),picture.user());
        console.log(what+': '+data.filename);
        switch(what) {
          case 'thumb':
            return getThumbnail(data)
            .then(streamThumbnail);

          case 'exif':
            return getThumbnail(data)
            .then(streamExif);

          default:
            return streamFullSizePicture(data);
        }
      }

    } // streamRequestedData

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
    .then(streamRequestedData)
    .fail(function(err){
      console.log(err.stack, err.message);
      res.status(err.status||500).end(err.message);
    })
    .done();

  }

  Picture.remoteMethod('download',{
    accepts: [
      {arg: 'what', type: 'string', required: false},
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
