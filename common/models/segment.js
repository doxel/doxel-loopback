/*
 * segment.js
 *
 * Copyright (c) 2015-2018 ALSENET SA - http://doxel.org
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
'use strict';

 module.exports = function(Segment) {
  var validStatus=[
    'new',
    'queued',
    'pending',
    'processing',
    'error',
    'processed',
    'publishable',
    'published',
    'discarded'
  ];
  var app = require('../../server/server');
  var loopback = require('loopback');
  var path=require('path');
  var fs=require('fs');
  var Q=require('q');
  var upload=app.get('upload');
  var uploadRootDir=upload.directory;
  var viewerPath=path.join(process.cwd(),app.get('viewerPath'));
  var loopbackFilters=require('loopback-filters');
  var extend=require('extend');
  var klaw=require('klaw');
  var magic = require('stream-mmmagic');
  var childProcess = require('child_process');
  var geolib=require('geolib');
  var shell=require('shelljs');
  const Transform = require('stream').Transform;
  try {
    var openGraph = app.get('openGraph').join('');
  } catch(e) {
    var openGraph=null;
    console.log('WARNING: openGraph is not defined, check example in server/config*.json');
  }

  function replace(url,data){
    var _url=[];
    url.split('/').forEach(function(elem){
      if (elem.substr(0,1)==':') {
        _url.push(data[elem.substr(1)]);
      } else {
        _url.push(elem);
      }
    });
    return _url.join('/');
  }

  function getCenterAndBounds(pictures) {
    var coords=[];
    var geo;
    var bounds;
    pictures.forEach(function(picture){
      if (picture.geo) {
        coords.push({
          latitude: picture.geo.lat,
          longitude: picture.geo.lng
        });
      }
    });

    if (coords.length) {
      var center=geolib.getCenter(coords);
      geo=new loopback.GeoPoint({lat: center.latitude, lng: center.longitude});

      bounds=geolib.getBounds(coords);
      bounds={
         min: new loopback.GeoPoint({lat: bounds.minLat, lng: bounds.minLng}),
         max: new loopback.GeoPoint({lat: bounds.maxLat, lng: bounds.maxLng})
      };
    }

    return {
      geo: geo,
      bounds: bounds
    }
  }

  Segment.prototype.getUnixTimestamp=function(timestamp){
    if (timestamp===undefined) {
      timestamp=this.timestamp;
    }
    return Number(timestamp.substr(0,10)+timestamp.substr(11,3));
  }

  /**
    @method Segment.getPath
    @description return segment filepath synchronously
    @param baseDirectory
    @param token
    @param segmentDirDigits
  */
  Segment.prototype.getPath=function segment_getPath(baseDirectory,token,segmentDirDigits) {
    var segment=this;
    var date=new Date(segment.getUnixTimestamp(segment.timestamp));
    var mm=String(date.getMonth()+1);
    var dd=String(date.getDate());
    if (mm.length==1) mm='0'+mm;
    if (dd.length==1) dd='0'+dd;
    return path.join(
      baseDirectory || '',
      String(date.getFullYear()),
      mm,
      dd,
      segment.timestamp.substr(0,segmentDirDigits),
      token,
      segment.timestamp
    );
  }

  Segment.preview=function(segmentId,timestamp,previewId,req,res,callback) {

    var Picture=Segment.app.models.Picture;
    Picture.findById(previewId,{
      include: ['segment', 'user']

    },function(err,picture){
        if (err) {
          return callback(err);
        }
        // users should not be able to guess combination
        if (!picture || picture.segmentId!=segmentId || picture.segment().timestamp!=timestamp) {
          return callback(new Error('Could not find segment preview for '+segmentId));
        }
        Picture.download('thumb', picture.sha256, segmentId, picture, picture.timestamp+'.jpg', req, res, callback);
    });

  }


  Segment.remoteMethod('preview',{
    accepts: [
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'timestamp', type: 'string', required: true},
      {arg: 'previewId', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/preview/:segmentId/:timestamp/:previewId',
      verb: 'get'
    }

  });

  Segment.prototype.getViewerJSON=function(args) {
    args=args||{};
    var q=Q.defer();
    var segment=args.segment||this;
    try {
      var jsonpath=path.join(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits),'viewer','viewer.json');
      fs.readFile(jsonpath,'utf8',function(err,data){
        if (err) {
          q.reject(err);
          return;
        }
        args.viewerJSON=JSON.parse(data);
        q.resolve(args);
      });

    } catch (e) {
      q.reject(e);
    }

    return q.promise;
  }

  Segment.prototype.getCloudJSON=function(args) {
    args=args||{};
    var q=Q.defer();
    var segment=args.segment||this;

    try {
      var jsonpath=path.join(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits),'potree','resources','pointclouds','potree','cloud.js');
      fs.readFile(jsonpath,'utf8',function(err,data){
        if (err) {
          q.reject(err);
          return;
        }
        args.cloudJSON=JSON.parse(data);
        q.resolve(args);
      });

    } catch (e) {
      q.reject(e);

    }

    return q.promise;
  }


  Segment.viewer=function(req, res, callback){
    var segment;
    var q=Q.defer();
    var folder=req.params[0].split('/');
    if (app.get('viewer').folders.indexOf(folder[0])>=0) {

//console.log(folder);
      if (folder[0]=='potree' && folder[2]!='pointclouds'/*potree/resources/pointclouds*/ && folder[2]!='potree.js'/*potree/examples/potree.js*/) {
          // serve common files from common potree viewer folder
 //         console.log('common',req.params[0]);
          q.resolve(process.cwd()+'/client');

      } else {
        // serve segment related potree viewer files from upload directory
        // TODO: maybe we should cache results if not done at lower level
        app.models.Segment.findById(req.params.segmentId,{include: 'user'},function(err,_segment){
          segment=_segment;
          if (err || !segment || segment.timestamp!=req.params.timestamp) {
            if (err) console.log(err.message,err.stack);
            return res.status(404).end()
          }
          var _user=segment.user();
          if (!_user) {
            console.trace('no such owner: ',segment.userId, ' for segment:',segment.id);
            return res.status(404).end();
          }
          q.resolve(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits));

        });
      }

    } else {
      q.resolve(viewerPath);
    }

    q.promise.then(function(baseUrl){
      var url=(baseUrl+'/'+req.params[0]);
//      console.log(url);
//      if (req.params[0].match(/\.php/)) {
//        php.cgi(url);
//      } else {

      if (req.params[0]=='viewer.html') {
        // inject thumbnail url in meta og:image of viewer index
        Q(app.models.Segment.findById(req.params.segmentId,{include: 'preview'}))
        .then(function(segment){
          var picture=segment.preview();

          res
          .set('Content-Type','text/html')
          .set('Cache-Control','public, max-age=3153600000000');

          var stream=fs.createReadStream(url);

          if (!openGraph) {
            stream.pipe(res);
            return;
          }

          var ogImageMetaInject = new Transform();
          ogImageMetaInject._transform=function(data,encoding,done){
            picture.url='/api/Pictures/thumb/'+picture.sha256+'/'+segment.id+'/'+picture.id+'/'+picture.timestamp+'.jpg';
            var metas=openGraph
              .replace('{{og:url}}',req.url)
              .replace('{{og:image}}',picture.url);

            const str=data.toString().replace('<head>','<head>'+metas)
            this.push(str);
            done();
          };

          stream
          .pipe(ogImageMetaInject)
          .pipe(res);

        }).catch(function(err){
          console.log(err);
          res.status(500).end();

        }).done();

      } else {
        res.sendFile(url,{
          maxAge: 3153600000000 // 10 years
        });
      }
    }).done();

  }

  Segment.remoteMethod('viewer',{
    accepts: [
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/viewer/:segmentId/:timestamp/*',
      verb: 'get'
    }

  });

  /**
    @method Segment._path
    @description return segment instance filepath asynchronously
    @param callback(err,path)
  */
  Segment.prototype._path=function(callback){
    var q=Q.defer();

    var segment=this;
    if (segment.user && segment.user()) {
      q.resolve(segment);

    } else {
      app.models.Segment.findById(segment.id,{
        include: 'user'

      }, function(err,_segment){
        if (err || !_segment) {
          if (!err) {
            err=new Error('no such segment: '+segment.id);
          }
          return q.reject(err);

        } else {
          return q.resolve(_segment);
        }
      });
    }

    q.promise.then(function(segment){
      var _user=segment.user();
      if (!_user) {
        console.log(segment);
        var err=new Error('no such owner: '+segment.userId+' for segment: '+segment.id);
        console.log(err);
        callback(err);

      } else {
        callback(null,segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits));
      }

    })
    .catch(function(err){
      console.log(err);
      callback(err);

    });

  }; // _path

  Segment.path=function(segmentId, req, res, callback){
    Segment.prototype._path.apply({id:segmentId},[function(err,path){
      if (err||!path||!path.length) {
        return res.status(404).end()
      }
      res.status(200).end(path);
    }]);
  }

  Segment.remoteMethod('path',{
    accepts: [
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/path/:segmentId',
      verb: 'get'
    }

  });

  Segment._injectPointcloud=function(segmentId){
    var segment;

    // fetch segment data
    return Q(app.models.Segment.findById(segmentId,{
      include: ['user', 'pointCloud', 'pictures']

    })).then(function(_segment){
      if (!_segment) {
        return Q.reject(new Error('segment not found: '+segmentId));
      }
      segment=_segment;
      return Q.resolve();
    })
    .then(function(){
      // remove existing related PointCloud and Pose model intances
      var pointCloudId=segment.pointCloudId||(segment.pointCloud&&segment.pointCloud.id);
      if (pointCloudId){
        return Q(app.models.Pose.destroyAll({pointCloudId: pointCloudId}).then(Q(app.models.PointCloud.destroyById(pointCloudId))));
      }

    })
    .then(function(){
      // check for existing pictures
      if (!segment.pictures || !segment.pictures.length) {
        return Q.reject(new Error('no pictures in segment '+segment.id));
      }
      return segment.getViewerJSON();
    })
    // get cloud.js
    .then(function(args){
      return segment.getCloudJSON(args);

    })
    .then(function(args){
      segment.viewerJSON=args.viewerJSON;
      var cloudJSON=args.cloudJSON;

      // create PointCloud instance
      return app.models.PointCloud.create({
        poseCount: segment.viewerJSON.extrinsics.length,
        viewCount: segment.viewerJSON.views.length,
        pointCount: cloudJSON.points,
        segmentId: segment.id
      });


    }).then(function(pointCloud){
      // store pointCloudId in segment
      segment.pointCloudId=pointCloud.id;
      return Q(segment.updateAttribute('pointCloudId',pointCloud.id));

    }).then(function(){
      // create poses
      var q=Q.defer();
      var extrinsic_idx=-1;
      var extrinsics;

      function extrinsics_loop(){
        var view;
        ++extrinsic_idx;

        // get the next pose
        if (extrinsic_idx>=segment.viewerJSON.extrinsics.length) {
          q.resolve();
          return;
        }
        extrinsics=segment.viewerJSON.extrinsics[extrinsic_idx];

        // get view
        var view;
        view=segment.viewerJSON.views[extrinsics.key];

        if (!view) {
          q.reject(new Error('ERROR: missing view '+extrinsics.key+' for segment '+segment.id+' '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000'))));
          return;
        }
        if (extrinsics.key!=view.value.ptr_wrapper.data.id_pose) {
          q.reject(new Error('ERROR: extrinsics.key != view.id_pose !!! '+extrinsics.key+' '+view.value.ptr_wrapper.data.id_pose+' for segment '+segment.id+' '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000'))));
          return;
        }

        // get pose picture
        var timestamp=view.value.ptr_wrapper.data.filename.substr(0,17);
        var picture=null;
        segment.pictures().some(function(_picture){
          if (_picture.timestamp==timestamp) {
            picture=_picture;
            return true;
          }
        });

        if (!picture) {
          console.log(new Error('ERROR: Picture '+timestamp+' not found in segment '+segment.id+' '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000'))));
          picture={};
        }

        // create pointCloud.pose instance
        Q(app.models.PointCloud.scopes.poses.modelTo.create({
          pointCloudId: segment.pointCloudId,
          pictureId: picture.id,
          center: extrinsics.value.center,
          rotation: extrinsics.value.rotation,
          index: extrinsic_idx
        }))
        .fail(console.log)
        .finally(extrinsics_loop)
        .done();

      } // extrinsics_loop

      extrinsics_loop();

      return q.promise.then(Q.nfcall(segment.setStatus,'publishable'));
    })

  } // Segment._injectPointcloud

  Segment.timestampToId=function(timestamp) {
    return Q.fcall(function(){
      // check if segmentId is a timestamp
      if (timestamp.match(/^[0-9]{10}_[0-9]{6}$/)) {
        return Q(app.models.Segment.find({
          fields: 'id',
          where: {
            timestamp: timestamp
          }

        })).then(function(segments){
          // no matching segment ?
          if (!segments.length) {
            return Q.reject(new Error('ERROR: no such timestamp: '+timestamp));
          }
          // many matching segments ?
          if (segments.length>1) {
            var list=[];
            segments.some(function(segment){list.push(segment.id)});
            return Q.reject(new Error('ERROR: many segments with timestamp '+timestamp+' : '+list.join(', ')));
          }
          // return unique matching segment id
          return segments[0].id;
        });

      } else {
        // return specified segmentId
        return timestamp;
      }

    });
  }

  Segment.injectPointcloud=function(segmentId, req, res, callback) {
    var segment;

    Segment.timestampToId(segmentId)
    .then(function(_segmentId){
      segmentId=_segmentId;
      return segmentId;
    })
    .then(Segment._injectPointcloud)
    .then(function(){
      // set segment.status to 'published'  when user is admin
      if (req.accessToken && req.accessToken.userId) {
        return Q(app.models.user.findById(req.accessToken.userId))
        .then(function(user){
          var isAdmin=user.roles().find(function(role){return role.name=='admin'});
          if (isAdmin) {
            return Q(Segment.findById(segmentId,{include: 'user'}))
            .then(function(segment){
              return Q(segment.updateAttributes({
                status: 'published',
                status_timestamp: Date.now()
              }))
              .then(function(segment){
                Segment.sendMail(segment); // do not return error (promise)
              })
            });
          }
        })
      }
    })
    .catch(function(err){
      console.log(err.message,err.stack);
      res.status(500).end('ERROR: could not inject cloud for segment '+segmentId+' : '+err.message);
    })
    .then(function(){
      res.status(200).end('DONE: cloud injected for segment '+segmentId);
    })
    .done();
  }

  Segment.remoteMethod('injectPointcloud',{
    accepts: [
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/inject-pointcloud/:segmentId',
      verb: 'get'
    }

  });

  Segment._purge=function(segmentId,keepPictures,keepSegment) {
    // get pointCloud (assume there's only one point cloud per segment)
    if (!segmentId) {
      return Q.reject(new Error('no segmentId specified'));
    }

    return Q(app.models.PointCloud.findOne({
      'where': {'segmentId': segmentId}

    }, function(err, pointCloud){
      if (err) {
        return Q.reject(err);
      }

      if (pointCloud) {
        // better worry than sorry (maybe segmentId is invalid and the first pointcloud is returned)
        if (pointCloud.segmentId!=segmentId) {
          return Q.reject(new Error('pointcloud segmentId ('+pointCloud.segmentId+') does not match segment.id ('+segmentId+') !'));
        }
        // destroy pointcloud poses
        return Q(app.models.Pose.destroyAll({pointCloudId: pointCloud.id},function(err,info,count){
          if (err) return Q.reject(err);
          console.log(info,'segment '+segmentId+' pointCloud '+pointCloud+': '+count+' poses destroyed');
          return Q.resolve();
        }))
        // destroy pointcloud
        .then(Q(app.models.PointCloud.destroyById(pointCloudId,function(err){
          if (err) return Q.reject(err);
          console.log(info,'segment '+segmentId+' pointCloud '+pointCloud+' destroyed');
          return Q.resolve();
        })));

      } else {
        return Q.resolve();
      }

    }))
    .then(function(){
      if (keepPictures) {
        return Q.resolve();
      }

      // TODO: destroy segment pictureTags (rebuild tags with server/scripts/segment-tag in the meanwhile)

      // destroy segment pictures
      return Q(app.models.Picture.destroyAll({segmentId: segmentId},function(err,info,count){
        if (err) return Q.reject(err);
        console.log(info,'segment '+segmentId+': '+count+' pictures destroyed');
        return Q.resolve();
      }));
    })
    .then(function(){
      // destroy segment tags
      return Q(app.models.SegmentTag.destroyAll({segmentId: segmentId},function(err,info,count){
        if (err) return Q.reject(err);
        console.log(info,'segment '+segmentId+': '+count+' segmentTags destroyed');
        return Q.resolve();
      }));
    })
    .then(function(){
      // destroy jobs
      return Q(app.models.Job.destroyAll({
        segmentId: segmentId
      }));
    })
    .then(function(){
      if (keepSegment) {
        return Q.resolve();
      }
      // destroy segment
      return Q(app.models.Segment.destroyById(segmentId,function(err){
        if (err) return Q.reject(err);
        console.log('segment '+segmentId+' purged successfuly');
        return Q.resolve();
      }));
    });
  };

  Segment.purge=function(segmentId, req, res, callback) {
    // only from localhost (or via ssh wget)
    console.log(req.headers)
    var ip = (req.headers && req.headers['x-real-ip']) || req.ip;
    if (ip!='127.0.0.1' && ip!='::1') {
      res.status(404).end();
      return;
    }

    var segment;

    Segment.timestampToId(segmentId)
    .then(function(segmentId){
      return Segment._purge(segmentId,req.keepSegment,req.keepSegment);
    })
    .fail(function(err){
      console.log(err.message,err.stack);
      res.status(500).end('ERROR: could not purge segment '+segmentId+' : '+err.message);
    })
    .then(function(){
      res.status(200).end('DONE: purged segment '+segmentId+ ' from database.');
    })
    .done();
  }

  Segment.remoteMethod('purge',{
    accepts: [
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/purge/:segmentId',
      verb: 'get'
    }

  });

  Segment.removePointcloud=function(segmentId,req,res,callback){
    req.keepSegment=true; // will force keepPictures
    return this.purge(segmentId,req,res,callback);
  }

  Segment.remoteMethod('removePointcloud',{
    accepts: [
      {arg: 'segmentId', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: {},
    http: {
      path: '/remove-pointcloud/:segmentId',
      verb: 'get'
    }

  });

  Segment._find=function(filter,req, res, callback) {
//    console.log(JSON.stringify(_filter,false,4));

    // TODO: filter with geo + something else "natively"

    var _filter=extend(true,{},filter);
    if (filter && filter.where && filter.where.geo) {

      var geo=filter.where.geo;
      geo.near=new loopback.GeoPoint(geo.near);
      filter.where.geo={exists: true};

      var limit=filter.limit||undefined;
      delete filter.limit;

      var skip=filter.skip||0;
      delete filter.skip;

      var timestamp=filter.where.timestamp;
      delete filter.where.timestamp;

      delete filter.order;

      Segment.find(filter,function(err,segments){
        if (err) callback(err,null);
        else filterByGeo(segments);
      });

      console.log(JSON.stringify(filter,false,6));
      function filterByGeo(segments){
        console.log('fetched',segments.length);
        var result=[];
        segments.some(function(segment){
          var segment_geo=new loopback.GeoPoint(segment.geo);
          var d=segment_geo.distanceTo(geo.near,{type: 'meters'});
          if (!geo.maxDistance || d<geo.maxDistance) {
            result.push(segment);
            segment.d=d;
          }
        });
        delete _filter.geo;
        var res=loopbackFilters(result,_filter);
        callback(null,res);

/*        result.sort(function(a,b){
          return a.d-b.d;
        });
        if (limit||skip) callback(null,result.slice(skip,skip+limit));
        else callback(null,result)
        */;
      }

    } else {
      Segment.find(filter,callback);
    }

  }

  Segment.remoteMethod('_find',{
    accepts: [
      {arg: 'filter', type: 'object', http: {source: 'query'}, required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      { arg: 'segments', type: 'array', root: true}

    ],
    http: {
      path: '/_find',
      verb: 'get'
    }
  });

  /**
   * @method Segment._updateClassifiers
   * @param segmentId
   * @return promise
   * For each picture in segment <segmentId>
   * - parse the <segment>/tensorflow/<timestamp>.jpeg.txt file
   * - add new classifiers to model Tag
   * - add new classifiers to segment.tags
   * - add classifiers to picture.tags
   */
  Segment._updateClassifiers=function(segmentId) {

    return Q(app.models.Segment.findById(segmentId,{
      include: ['user', {'pictures' : 'tags'}, 'tags']

    }).then(function(segment){
      if (!segment) {
        return Q.reject(new Error('Error: no such segment: '+segmentId));
      }

      var classifiersPath=path.join(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits),'tensorflow');
      var pictures=segment.pictures();
      var picture_idx=0;
      var q=Q.defer();
      var segmentTags=segment.tags();

      // pictures loop iteration
      function pictureLoop(){
        if (picture_idx>=pictures.length) {
          // exit the picture loop
          return q.resolve();
        }
        var picture=pictures[picture_idx];
        var pictureTags=picture.tags();

        // read tensorflow file
        var filename=path.join(classifiersPath,picture.timestamp+'.jpeg.txt');
        console.log(filename);

        fs.readFile(filename,'utf8',function(err,data){
          if (err) {
            return q.reject(err);
          }
          var q2=Q.defer();
          var lines=data.split('\n');

          // classifiers loop iteration
          function classifierLoop(){
            if (!lines.length) {
              // exit the classifierLoop
              return q2.resolve();
            }

            // pop a line from the file
            var line=lines.pop();

            // get classifier list and score
            var m=line.match(/(.*) \(score = ([0-9\.]+)/);
            if (m) {
              var text=m[1];
              var score=Number(m[2]);
 //             console.log(line);
              // fetch or create tag
              Q(app.models.Tag.findOrCreate({
                where: {
                  value: text
                }
              },{
                value: text

              }))
              .then(function(result){
                var tag=result[0];

                function addClassifierToSegment(){
                  // search existing segmentTag
                  var segmentTag;
                  var found=segmentTags.some(function(_segmentTag){
                    if (tag.id.equals(_segmentTag.tagId)) {
                      segmentTag=_segmentTag;
                      return true;
                    }
                  });

                  if (!found) {
                    // create new segmentTag
                    return Q(app.models.Segment.scopes.tags.modelTo.create({
                      segmentId: segment.id,
                      tagId: tag.id,
                      score: score
                    }))
                    .then(function(segmentTag){
                      // add to the list of existing segmentTags
                      segmentTags.unshift(segmentTag);
                    });

                  } else {
                    // update existing segmentTag (keep highest score)
                    segmentTag.score=Math.max(segmentTag.score,score);
//                    console.log('SCORE',tag,segmentTag);
                    return Q(segmentTag.save());
                  }
                } // addClassifierToSegment

                function addClassifierToPicture(){
                  // search existing pictureTag
                  var found=pictureTags.some(function(_pictureTag){
                    return tag.id.equals(_pictureTag.tagId);
                  });
                  if (!found) {
                    // create new pictureTag
                    return Q(app.models.Picture.scopes.tags.modelTo.create({
                      pictureId: picture.id,
                      tagId: tag.id,
                      score: score
                    }))
                    .then(function(pictureTag){
                      // add to the list of existing pictureTags
                      pictureTags.unshift(pictureTag);
                    });

                  } else {
                    return Q.resolve();
                  }
                } // addClassifierToPicture

                return addClassifierToSegment()
                .then(addClassifierToPicture);

              })
              .catch(function(err){
                console.log(err);
              })
              .finally(classifierLoop)
              .done();

            } else {
              process.nextTick(classifierLoop);
            }
          } // classifierLoop

          // enter the classifiers loop
          classifierLoop();

          q2.promise
          .catch(function(err){
            console.trace(err);
          })
          .finally(function(){
            ++picture_idx;
            pictureLoop();
          })
          .done();

        }); // readFile


      } // pictures_loop

      // enter the loop
      pictureLoop();
      return q.promise;

    }));

  } // Segment._updateClassifiers

  Segment.prototype.setStatus=function(status,callback) {
    var segment=this;
    if (!callback) callback=console.log;

    if (status==segment.status) {
      return Q(callback(null,segment.status,segment.status_timestamp));

    } else {
      var timestamp=Date.now();
      return Q(segment.updateAttributes({
        status: status,
        status_timestamp: timestamp
      }))
      .then(function(segment){
        Segment.sendMail(segment).catch(console.log);
        // return new status
        return callback(null,status,timestamp);
      })
      .catch(callback);
    }

  } // Segment.prototype.setStatus

  Segment.prototype._proceed=function(operationIndex,callback) {
    var segment=this;

    if (operationIndex==2) {
      segment.setStatus('error',callback);
      return;
    }

    var forward=(operationIndex==1);

    // undefined -> queued -> pending -> processing -> processed -> publishable -> published

    switch(segment.status) {
      case 'new':
        // discarded <- new -> queued
        segment.setStatus((forward)?'queued':'discarded',callback);
        break;

      case 'discarded':
       if (segment.pointCloudId) {
         // discarded <- discarded -> published
          segment.setStatus((forward)?'published':'discarded',callback);
        } else {
         // discarded <- discarded -> new
          segment.setStatus((forward)?'new':'discarded',callback);
        }
        break;

      case 'error':
        // discarded <- error -> queued
        segment.setStatus((forward)?'queued':'discarded',callback);
        break;

      case 'queued':
        // new <- queued -> pending
        segment.setStatus((forward)?'pending':'new',callback);
        break;

      case 'pending':
        // queued <- pending -> processing
        segment.setStatus((forward)?'processing':'queued',callback);
        break;

      case 'processing':
        // queued <- processing -> processed
        segment.setStatus((forward)?'processed':'queued',callback);
        break;

      case 'processed':
        if (segment.pointCloudId) {
          // queued <- processed -> publishable
          segment.setStatus((forward)?'publishable':'queued',callback);
        } else {
          // publishable cannot be set without pointcloud in db
          // queued <- processed -> processed
          segment.setStatus((forward)?'processed':'queued',callback);
        }
        break;

        case 'publishable':
          if (segment.pointCloudId) {
            // discarded <- publishable -> published
            segment.setStatus((forward)?'published':'discarded',callback);
          } else {
            // discarded <- publishable -> processed
            segment.setStatus((forward)?'processed':'discarded',callback);
          }
          break;

        case 'published':
          // discarded <- published
          if (!forward) {
            segment.setStatus('discarded',callback);
            break;
          }

      default:
         // nothing to do
         callback(null,segment.status,segment.status_timestamp);
         break;
    }
  } // Segment.prototype._proceed

  Segment.proceed=function(segmentId, status, timestamp, operation, req, res, callback) {

    Segment.findById(segmentId, {include: 'user'}, function(err,segment){
      if (err) {
        return callback(err);
      }
      function abort(message) {
        if (res) res.status(500).end(message);
        else callback(new Error(message));
      }
      if (!segment) {
        abort('no such segment: '+segmentId);
        return;
      }

      try {
        // check the current status match the client side one
        if ((segment.status||'new')!==status || (segment.status_timestamp && segment.status_timestamp!=timestamp)) {
          abort('status mismatch: '+segment.status+' '+status+' '+segment.status_timestamp+' '+timestamp);
          return;
        }
      } catch(e) {
        abort(JSON.stringify(e));
        return;
      }

      var operationIndex=['backward','forward','error'].indexOf(operation);
      if (operationIndex<0) {
        abort('invalid operation: '+operation);
        return;
      }
      segment._proceed(operationIndex,callback);
    });

  } // Segment.proceed

  Segment.remoteMethod('proceed',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'status', type: 'string', required: true},
      {arg: 'status_timestamp', type: 'number', required: true},
      {arg: 'operation', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'status', type: 'string'},
      {arg: 'status_timestamp', type: 'number'}

    ],
    http: {
      path: '/proceed/:id/:status/:status_timestamp/:operation',
      verb: 'get'
    }
  });

  Segment.getOrUpdateStatus=function(segmentId,timestamp,status) {
    return Q(Segment.findById(segmentId))
    .then(function(segment){
      if (!timestamp||timestamp=='{timestamp}') {
        return [segment.status, segment.status_timestamp];
      } else {
        if (validStatus.indexOf(status)<0) {
          throw new Error('Invalid status: '+ status);
        }
        if (segment.status_timestamp!=timestamp) {
          throw new Error('Timestamp mismatch !');
        }
        return segment.setStatus(status,function(err,status,timestamp){
          if (err) throw err;
          return [segment.status, segment.status_timestamp];
        });
      }
    })
    .catch(function(err){
      console.log(err);
    });
  }

  Segment.remoteMethod('getOrUpdateStatus',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'timestamp', type: 'string', required: false},
      {arg: 'status', type: 'string', required: false},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'status', type: 'string'},
      {arg: 'status_timestamp', type: 'number'}

    ],
    http: [
    {
      path: '/:id/status',
      verb: 'get'
    }, {
      path: '/:id/status/:timestamp/:status',
      verb: 'get'
    }
    ]
  });

/*
  // worker
  Segment.startProcessing=function(segmentId, data, req, res, callback) {
    var segment;

    Segment.findById(segmentId, {}, function(err,_segment){
      if (err) {
        return callback(err);
      }
      segment=_segment;
      if (!segment) {
        res.status(500).end('no such segment: '+segmentId);
        return;
      }
      function setStatus(status) {
        segment.status=status;
        segment.status_timestamp=Date.now();
        Q(segment.save())
        .then(function(){
          // return new status
          callback(null,segment);
        })
        .catch(callback);
      }

      switch(segment.status) {

        case 'queued':
          // set new status
          segment.processing=data;
          setStatus('processing');
          break;

        default:
          callback(null,segment)
          break;
      }

    });

  } // Segment.proceed

  Segment.remoteMethod('startProcessing',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'data', type: 'object', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'segment', type: 'object'}

    ],
    http: {
      path: '/startProcessing/:id',
      verb: 'get'
    }
  });
*/

  // merge and delete one segment
  Segment.prototype.mergeOne=function(segment) {
    var target=this;

    if (segment.pointCloudId) {
      return Q.reject(new Error('Cannot merge segment '+segment.id+' with poincloud yet, TODO: implement Segment hasMany PointClouds'));
    }

    // update ownership (userId) and segmentId of related models
    return Q.fcall(function(){
      return Q(segment.__update__pictures({},{
        segmentId: target.id,
        userId: target.userId
      }));
    })
    .then(function(){
      return Q(segment.__update__segmentTags({},{
        segmentId: target.id,
        userId: target.userId
      }));
    })
    /*
    .finally(function(){
      // TODO: segment hasMany pointClouds
      return Q(segment.__update__pointClouds({},{segmentId: target.id}));

    })
    */
    // delete segment
    .then(function(){
      return Q(segment.destroy());
    });
  }

  Segment.merge=function(segmentList,req,res,callback) {

    if (segmentList.length<2){
      res.status(500).end('Segment.merge needs at least two segment Ids');
      return;
    }

    // fetch segments and sort by timestamp
    function getSegments(segmentList) {
      var segments=[];
      return segmentList.reduce(function(promise,segmentId){
        return promise.then(function(){
          return Q(Segment.findById(segmentId,{}))
          .then(function(segment){
            if (segment) {
              segments.push(segment);
            } else {
              throw new Error('no such segment: '+segmentId);
            }
          });
        });
      },Q.resolve())
      .then(function(){
        return segments.sort(function(a,b){
          return a.timestamp<b.timestamp?-1:1;
        });
      });

    } // get segments

    // merge segments with the last one
    function mergeSegments(segments) {
      console.log(segments);
      var target=segments.shift();
      console.log('target',target.id);
      return segments.reduce(function(promise,segment){
        return promise.then(function(){
          console.log(segment.id);
          return target.mergeOne(segment);
        })
      }, Q.resolve())
      .then(function(){
        return target;
      });

    } // mergeSegments


    getSegments(segmentList)
    .then(mergeSegments)
    .then(function(segment){
      callback(null,{segment:segment});
    })
    .catch(function(err){
      console.log(err);
      res.status(500).end(err.message||err)
    })
    .done();

  }

  Segment.remoteMethod('merge',{
    accepts: [
      {arg: 'segmentList', type: 'array', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'segment', type: 'object'}

    ],
    http: {
      path: '/merge/:segmentList',
      verb: 'get'
    }
  });

// should not split yet segment with pointcloud or with tags
  Segment.split=function(segmentId, timestamp, req, res, callback){
    var segments=[];

    if (
      !segmentId
      || !segmentId.match
      || !segmentId.match(/^[0-9a-z]{24}$/)
    ) {
      throw new Error('Segment.split: Invalid segmentId '+segmentId);
    }

    if (
      !timestamp
      || !timestamp.match
      || !timestamp.match(/^[0-9]{10}_[0-9]{6}$/)
    ) {
      throw new Error('Segment.split: Invalid timestamp '+timestamp);
    }

    Q(Segment.findById(segmentId,{
      include: [{
        relation: 'user',
        scope: {
          fields: {
            token: true
          }
        }
      }, {
        relation: 'pictures',
        scope: {
          fields: {
            id: true,
            timestamp: true,
            geo: true
          },
          where: {
            timestamp: {
              gte: timestamp
            }
          },
          order: 'timestamp ASC'
        }
      }]
    }))
    .then(function(segment){
      if (!segment) {
        throw new Error('cannot split segment '+segment.id+' at '+timestamp+' (no such segment)');
      }
      var pictures=segment.pictures();
      console.log(JSON.stringify(pictures,false,4));
      if (!pictures || !pictures.length || !timestamp || !pictures.find(function(picture){return picture.timestamp==timestamp})) {
        throw new Error('cannot split segment '+segment.id+' at '+timestamp+' (no matching pictures)');
      }
      if (timestamp==segment.timestamp) {
        throw new Error('cannot split segment '+segment.id+' at '+timestamp+' (cannot split at first picture)');
      }

      segments[0]=segment;
      segment.path=path.join(segment.getPath(uploadRootDir,segments[0].user().token,upload.segmentDigits));


      return Q(Segment.create(
        extend({
          userId: segment.userId,
          timestamp: pictures[0].timestamp,
          previewId: pictures[0].id
        }, getCenterAndBounds(pictures))
      ));

    })
    .then(function(segment){
      segments[1]=segment;
      segment.path=path.join(segment.getPath(uploadRootDir,segments[0].user().token,upload.segmentDigits));

      // create segment directory
      return Q.nfcall(shell.exec,'mkdir -p '+segments[1].path);

    })
    .then(function(){
      // create pictures directory
      return Q.nfcall(fs.mkdir,path.join(segments[1].path,'original_images'));

    })
    .then(function(){
      // move pictures
      var pictureIndex=0;
      var q=Q.defer();
      var fromPath=path.join(segments[0].path,'original_images');
      var toPath=path.join(segments[1].path,'original_images');

      var pictures=segments[0].pictures();
      (function loop(){
        if (pictureIndex>=pictures.length) {
          return q.resolve();
        }
        var picture=pictures[pictureIndex++];
        console.log(pictures);
        picture.filename=picture.timestamp+'.jpeg';
        Q.nfcall(fs.rename,path.join(fromPath,picture.filename),path.join(toPath,picture.filename))
        .catch(function(err){
          console.log(err);
          q.reject(err);
        })
        .finally(function(){
          process.nextTick(loop);
        })
        .done();

      })()

      return q.promise;

    })
    .then(function(){
      // update pictures segmentId
      return Q(app.models.Picture.updateAll({
        segmentId: segmentId,
        timestamp: {gte: timestamp}
      }, {
        segmentId: segments[1].id

      }))
    })
    .then(function(info){
      console.log(info);
      delete segments[1].path;
      callback(null,segments[1]);

    })
    .catch(function(err){
      console.log(err);
      res.status(500).end(err.message||err);
    })
    .done();
  }

  Segment.remoteMethod('split',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'timestamp', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'segment', type: 'object'}

    ],
    http: {
      path: '/:id/split/:timestamp',
      verb: 'get'
    }
  });

  Segment.files=function(id, req, res, callback) {
    Q(Segment.findById(id,{include: 'user'}))
    .then(function(segment){
      segment.path=path.join(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits));
      return segment;
    })
    .then(function(segment){
      if (segment.path && segment.path.length) {
        var items=[];
        klaw(segment.path)
        .on('readable', function(){
          var item;
          while(item=this.read()) {
            if (!item.stats.isDirectory()) {
              item.path=item.path.substr(segment.path.length+1);
              items.push(item);
            }
          }
        })
        .on('end', function(){
          callback(null,items);
        })
        .on('error', function(err, item){
          console.log('ERROR',item.path,err);
        })
      }
    })
  }

  Segment.remoteMethod('files',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'files', type: 'array'}

    ],
    http: {
      path: '/:id/files',
      verb: 'get'
    }
  });

  Segment.getFilePath=function(id, requestedPath) {
    // fetch segment and user
    return Q(Segment.findById(id,{include: 'user'}))
    .then(function(segment){
      // get segment path
      segment.path=path.join(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits));
      return segment;

    })
    .then(function(segment){
      if (!segment.path || !segment.path.length) {
        throw new Error('cannot find segment path');
      }

      var q=Q.defer();

      // requested path
      fs.realpath(path.join(segment.path,requestedPath),function(err,pathname){
        if (err) return q.reject(err);
        console.log(pathname);

        // assert base directory is segment.path
        if (pathname.substr(0,segment.path.length)!=segment.path) {
          return q.reject(new Error('unauthorized'));
        } else {
          return q.resolve(pathname);
        }
      })

      return q.promise;
    });

  } // getFilePath

  Segment.download=function(id, requestedPath, req, res, callback, options) {
    options=options||{};

    return Segment.getFilePath(id,requestedPath)
    .then(createReadStream)
    .then(streamIt)
    .catch(function(err){
      console.log(err);
      res.status(500).end(err.message);
    });

    function createReadStream(pathname) {
      var q=Q.defer();

      // what are we going to serve ?
      fs.stat(pathname,function(err,stats){
        if (err) {
          q.reject(err);
          return
        }

        var basename=pathname.substr(uploadRootDir.length+1);

        if (stats.isDirectory()) {
          var root;

          if (options.shortPath) {
            root=path.dirname(pathname);
            basename=path.basename(pathname);

          } else {
            root=uploadRootDir;
          }

          // stream a tar archive
          var child=childProcess.spawn('tar',['-C',root,'-zc',basename]);
          child.on('error',q.reject);
          q.resolve({
            stats: stats,
            basename: basename+(options.shortPath?'-'+id:'')+'.tar.gz',
            stream: child.stdout
          });

        } else {
          // stream a file
          q.resolve({
            stats: stats,
            basename: basename,
            stream: fs.createReadStream(pathname),
          });
        }

      });

      return q.promise;

    } // createReadStream

    function streamIt(options) {
      var q=Q.defer();

      // get mime time from file content
      magic(options.stream, function(err,mime,output){
        if (err) {
          q.reject(err);
          return;
        }

        // set http headers
        res
        .set('Content-Type',mime.type)
        .set('Content-Disposition','attachment;filename='+options.basename)
        .set('Content-Transfer-Encoding','binary')
        .set('Cache-Control','public, max-age=0');

        if (!options.stats.isDirectory()) {
          res.set('Content-Size', options.stats.size);
        }

        // stream body
        output
        .on('end',q.resolve)
        .on('error',q.reject)
        .pipe(res);

      });

      return q.promise;

    } // streamIt
  }

  Segment.remoteMethod('download',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'requestedPath', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    http: {
      path: '/:id/download/:requestedPath',
      verb: 'get'
    }
  });

  Segment.ply=function(id, req, res, callback) {
    var ply;
    Segment.getFilePath(id,'viewer/doxel.json')
    .then(function(pathname){
      try { delete require.cache[require.resolve(pathname)] } catch(e) {} 
      var data=require(pathname);
      ply=data.ply;
    })
    .finally(function(){
      Segment.download(id, ply||'PMVS/models', req, res, callback, {shortPath: true});
    })
  }

  Segment.remoteMethod('ply',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    http: {
      path: '/:id/ply',
      verb: 'get'
    }
  });

  Segment.sendMail=function(segment,segmentId){
    var q;
    var user;

    if (segment){
      q=Q.resolve(segment);

    } else {
      q=Q(Segment.findById(segmentId,{include: 'user'}));
    }

    return q.then(function(segment){
      if (segment.user()) {
        user=segment.user();
        return segment;

      } else {
        return Q(Segment.app.models.user.findById(segment.userId))
        .then(function(_user){
          user=_user;
          return segment;
        })
      }
    })
    .then(function(segment){
      return segment.jobs.findOne({order: 'completed DESC'}).then(function(job){
        segment.job=job;
        segment.jobId=job.id;
        return segment;
      })
    })
    .then(function(segment){
      console.log(JSON.stringify(segment));
      var html=[];

      switch(segment.status){
        case 'publishable':
          html.push('<div>Segment '+segment.id+' uploaded by '+user.username+' ('+user.email+') is publishable</div>');
          html.push('<br />');
          var href=replace('https://doxel.org/api/segments/viewer/:id/:timestamp/viewer.html',segment);
          html.push('<div>View pointcloud: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/api/segments/:id/ply',segment);
          html.push('<div>You can download the PLY(s) here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/segment/:id/pictures',segment);
          html.push('<div>View pictures: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          var href=replace('https://doxel.org/api/segments/:id/download/job/:jobId/LOG.txt',segment);
          html.push('<div>You can download the job log here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/segment/:id/download/job/:jobId/script.sh',segment);
          html.push('<div>You can download the job script here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/segment/:id/files',segment);
          html.push('<div>Browse and download files: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/api/segments/proceed/:id/:status/:status_timestamp/:operation',extend({},segment,{
            operation: 'forward'
          }));
          html.push('<div>Publish: <a href="'+href+'">'+href+'</a></div>');

          return app.models.role.sendMail({
            role: ['admin','foreman'],
            from: 'noreply@doxel.org',
            subject: 'Segment '+segment.id+' is publishable',
            html: html.join('')
          });
          break;

        case 'published':
          if (!segment.userNotified) {
            html.push('<div>The pointcloud for the segment '+segment.id+' you uploaded has been published</div>');
            html.push('<br />');
            var href=replace('https://doxel.org/doxel/viewer/:id',segment);
            html.push('<div>You can view it here : <a href="'+href+'">'+href+'</a></div>');
            html.push('<br />');
            var href=replace('https://doxel.org/api/segments/viewer/:id/:timestamp/viewer.html',segment);
            html.push('<div>or here (standalone): <a href="'+href+'">'+href+'</a></div>');
            html.push('<br />');
            href=replace('https://doxel.org/api/segments/:id/ply',segment);
            html.push('<div>You can download the PLY(s) here: <a href="'+href+'">'+href+'</a></div>');
            html.push('<br />');
//            html.push(emailFooter);
          }

          return Q(function(){
            return app.models.Email.send({
              from: 'noreply@doxel.org',
  //            to: ((user.email.split('@')[1]!='anonymous')?user.email:undefined),
              to: 'luc.deschenaux@freesurf.ch',
              subject: 'Pointcloud published',
              html: html.join('')
            });
           })
          .finally(function(){
            return Q(segment.updateAttributes({
              userNotified: true
            }));
          });
          break;

        case 'error':
          html.push('<div>The processing of segment '+segment.id+' uploaded by '+user.username+' ('+user.email+') did fail.</div>');
          html.push('<br />');
          var href=replace('https://doxel.org/segment/:id/joblogs',segment);
          html.push('<div>You can view the log history here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          var href=replace('https://doxel.org/api/segments/:id/download/job/:jobId/LOG.txt',segment);
          html.push('<div>You can download the job log here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          href=replace('https://doxel.org/segment/:id/download/job/:jobId/script.sh',segment);
          html.push('<div>You can download the job script here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');
          var href=replace('https://doxel.org/segment/:id/pictures',segment);
          html.push('<div>You can view the pictures here: <a href="'+href+'">'+href+'</a></div>');
          html.push('<br />');

          return app.models.role.sendMail({
            role: ['admin','foreman'],
            from: 'noreply@doxel.org',
            subject: 'Error while processing segment '+segment.id,
            html: html.join('')
          });
          break;

        default:
          break;
      }
    });
  }

};
