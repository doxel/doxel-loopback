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

 var app = require('../../server/server');

 module.exports = function(Segment) {
  var path=require('path');
  var fs=require('fs');
  var Q=require('q');
  var upload=app.get('upload');
  var uploadRootDir=path.join.apply(path,[__dirname,'..','..'].concat(upload.directory));
  var viewerPath=path.join(process.cwd(),app.get('viewerPath'));

  Segment.prototype.getUnixTimestamp=function(timestamp){
    if (timestamp===undefined) {
      timestamp=this.timestamp;
    }
    return Number(timestamp.substr(0,10)+timestamp.substr(11,3));
  }

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

  Segment.path=function(segmentId, req, res, callback){
    var ip = req.headers['x-real-ip'] || req.ip;
    if (ip!='127.0.0.1' && ip!='::1') {
      res.status(404).end();
      return;
    }

    app.models.Segment.findById(segmentId,{include: 'user'},function(err,segment){
      if (err || !segment) {
        if (err) console.log(err.message,err.stack);
        return res.status(404).end()
      }
      var _user=segment.user();
      if (!_user) {
        console.trace('no such owner: ',segment.userId, ' for segment:',segment.id);
        return res.status(404).end();
      }
      res.status(200).end(segment.getPath(uploadRootDir,segment.user().token,upload.segmentDigits));

    });
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
      var extrinsic_idx=0;
      var extrinsics;

      function extrinsics_loop(){
        var view;

        // get the next pose
        if (extrinsic_idx>=segment.viewerJSON.extrinsics.length) {
          q.resolve();
          return;
        }
        extrinsics=segment.viewerJSON.extrinsics[extrinsic_idx++];

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
          rotation: extrinsics.value.rotation
        }))
        .fail(console.log)
        .finally(extrinsics_loop)
        .done();

      } // extrinsics_loop

      extrinsics_loop();

      return q.promise;

    })
  }

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
      path: '/:segmentId/inject-pointcloud',
      verb: 'get'
    }

  });

  Segment._purge=function(segmentId) {
    return Q(app.models.PointCloud.findOne({
      'where': {'segmentId': segmentId}
    }, function(err, pointCloud){
      if (err) {
        return Q.reject(err);
      }

      if (pointCloud) {
        return Q(app.models.Pose.destroyAll({pointCloudId: pointCloud.id},function(err,info,count){
          if (err) return Q.reject(err);
          console.log(info,'segment '+segmentId+' pointCloud '+pointCloud+': '+count+' poses destroyed');
          return Q.resolve();
        }))
        .then(Q(app.models.PointCloud.destroyById(pointCloudId,function(err){
          if (err) return Q.reject(err);
          console.log(info,'segment '+segmentId+' pointCloud '+pointCloud+' destroyed');
          return Q.resolve();
        })));

      } else {
        return Q.resolve();
      }

    }))
    .then(Q(app.models.Picture.destroyAll({segmentId: segmentId},function(err,info,count){
      if (err) return Q.reject(err);
      console.log(info,'segment '+segmentId+': '+count+' pictures destroyed');
      return Q.resolve();
    })))
    .then(Q(app.models.Segment.destroyById(segmentId,function(err){
      if (err) return Q.reject(err);
      console.log('segment '+segmentId+' purged successfuly');
      return Q.resolve();
    })));
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
    .then(Segment._purge)
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
      path: '/:segmentId/purge',
      verb: 'get'
    }

  });

};





