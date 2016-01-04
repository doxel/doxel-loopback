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

 console.dump=require('object-to-paths').dump;

module.exports=function(app) {

  var path = require('path');
  var fs = require('fs');
  var pluploadMiddleware = require('express-plupload').middleware;
  var df = require('node-df');
  var Q = require('q');

  var maxDiskUsage=95/100;

  // upload directory
  var uploadDir = path.join(__dirname, "..", "upload");

  // upload temporary directory
  var tmpDir = path.join(uploadDir,'tmp');

  // Remove old files
  var cleanupTmpDir = true;

  // Temp file age in seconds
  var maxFileAge = 5 * 3600;


  app.use('/sendfile', pluploadMiddleware);
  app.use('/sendfile', function(req, res, next){
    console.log('yo');

    // already downloading ?
    if (!req.plupload.isNew) {
      req.once('end', function(){
        res.sendStatus(201).send('{"jsonrpc": "2.0", "result": {}}');
      });
      return;
    }

//    req.plupload.stream.maxBytes=10;

    // check timestamp
    var timestamp=req.plupload.fields.timestamp;
    if (!timestamp.match(/^[0-9]{10}_[0-9]{6}$/)) {
      res.sendStatus(500).send({"jsonrpc" : "2.0", "error" : {"code": 901, "message": "Invalid or missing timestamp."}, "id" : "id"});
      return;
    }

    // check hash
    var sha256=req.plupload.fields.sha256;
    if (!sha256.match(/^[0-9a-z]{64}$/)) {
      res.sendStatus(500).send('{"jsonrpc" : "2.0", "error" : {"code": 913, "message": "Invalid hash."}, "id" : "id"}');
      return;
    }

    // get free space
    df({
      file: uploadDir

    }, function(err, reply) {
      console.log(reply);
      if (err) {
        // error getting free space
        res.sendStatus(500).send('{"jsonrpc" : "2.0", "error" : {"code": 906, "message": "Could not compute free space on '+uploadDir+'."}, "id" : "id"}');

      } else if (Number(reply.used)/Number(reply.size) < maxDiskUsage) {
        // disk full
        res.sendStatus(500).send('{"jsonrpc" : "2.0", "error" : {"code": 907, "message": "Remote disk is full !"}, "id" : "id"}');

      } else {
        // receive file
        var writePath = path.join(tmpDir, timestamp+'-'+sha256);
        var writeStream = fs.createWriteStream(writePath);
        req.once('end', function(){
          res.sendStatus(201).send('{"jsonrpc": "2.0", "result": {}}');
        });
        req.plupload.stream.pipe(writeStream);
      }
    });
  });

}
