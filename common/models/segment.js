/*
 * segment.js
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

 module.exports = function(Segment) {
  var app = require('../../server/server');
  var loopback = require('loopback');
  var path=require('path');
  var fs=require('fs');
  var Q=require('q');
  var upload=app.get('upload');
  var uploadRootDir=path.join.apply(path,[__dirname,'..','..'].concat(upload.directory));
  var viewerPath=path.join(process.cwd(),app.get('viewerPath'));
  var loopbackFilters=require('loopback-filters');
  var extend=require('extend');

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
        app.models.Segment.findById(req.params.segmentId,{include: 'user'},function(err,segment){
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
      res.sendFile(url,{
        maxAge: 3153600000000 // 10 years
      });
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
    var ip = req.headers['x-real-ip'] || req.ip;
    if (ip!='127.0.0.1' && ip!='::1') {
      res.status(404).end();
      return;
    }

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

      return q.promise.then(segment.updateAttributes({
        status: 'published',  // TODO: set it to processed !
        status_timestamp: new Date()
      }));

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
    // only from localhost (or via ssh wget)
    console.log(req.headers)
    var ip = (req.headers && req.headers['x-real-ip']) || req.ip;
    if (ip!='127.0.0.1' && ip!='::1') {
      res.status(404).end();
      return;
    }

    var segment;

    Segment.timestampToId(segmentId)
    .then(Segment._injectPointcloud)
    .fail(function(err){
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
    if (status==segment.status) {
      callback(null,segment.status,segment.status_timestamp);

    } else {
      segment.status=status;
      segment.status_timestamp=Date.now();
      Q(segment.save())
      .then(function(){
        // return new status
        callback(null,segment.status,segment.status_timestamp);
      })
      .catch(callback);
    }

  } // Segment.prototype.setStatus


  Segment.prototype._proceed=function(forward,callback) {
    var segment=this;

    // undefined -> queued -> pending -> processing -> processed -> published

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

     case 'queued':
        // new <- queued -> pending
        segment.setStatus((forward)?'pending':'new',callback);
        break;

      case 'pending':
        // queued <- pending -> processing
        segment.setStatus((forward)?'processing':'queued',callback);
        break;

      case 'processing':
        // cancel_pending <- processing -> processed
        segment.setStatus((forward)?'processed':'cancel pending',callback);
        break;

      case 'cancel_pending':
        // queued <- cancel_pending -> processing
        segment.setStatus((forward)?'processing':'queued',callback);
        break;

      case 'processed':
        // discarded <- processed -> published
        segment.setStatus((forward)?'published':'discarded',callback);
        break;

      default:
         // nothing to do
         callback(null,segment.status,segment.status_timestamp);
         break;
    }
  } // Segment.prototype._proceed

  Segment.proceed=function(segmentId, status, timestamp, direction, req, res, callback) {

    Segment.findById(segmentId, {}, function(err,segment){
      if (err) {
        return callback(err);
      }
      function errmsg(message) {
        if (res) res.status(500).end(message);
        else callback(new Error(message));
      }
      if (!segment) {
        errmsg('no such segment: '+segmentId);
        return;
      }

      try {
        // check the current status match the client side one
        if ((segment.status||'new')!==status || (segment.status_timestamp && segment.status_timestamp!=timestamp)) {
          errmsg('status mismatch: '+segment.status+' '+status+' '+segment.status_timestamp+' '+timestamp);
          return;
        }
      } catch(e) {
        errmsg(JSON.stringify(e));
        return;
      }

      var forward=['backward','forward'].indexOf(direction);
      if (forward<0) {
        errmsg('invalid direction: '+direction);
        return;
      }
      segment._proceed(forward,callback);
    });

  } // Segment.proceed

  Segment.remoteMethod('proceed',{
    accepts: [
      {arg: 'id', type: 'string', required: true},
      {arg: 'status', type: 'string', required: true},
      {arg: 'status_timestamp', type: 'number', required: true},
      {arg: 'direction', type: 'string', required: true},
      {arg: 'req', type: 'object', 'http': {source: 'req'}},
      {arg: 'res', type: 'object', 'http': {source: 'res'}}

    ],
    returns: [
      {arg: 'status', type: 'string'},
      {arg: 'status_timestamp', type: 'number'}

    ],
    http: {
      path: '/proceed/:id/:status/:status_timestamp/:direction',
      verb: 'get'
    }
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
      return Q.reject(new Error('Cannot merge segment with poincloud yet, TODO: implement Segment hasMany PointClouds'));
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

  Segment.merge=function(segmentList,req,res,calback) {

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
      var target=segments.pop();
      return segments.reduce(function(promise,segment){
        return promise.then(function(){
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

};
