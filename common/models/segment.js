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

};
