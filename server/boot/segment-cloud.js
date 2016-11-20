module.exports=function(app){
  /*
   * import cloud data in database:
   *
   * - create pointCloud instance
   * - update segment picture
  */

  var Q=require('q');

  var Segment=app.models.Segment;
  var Pose=app.models.Pose;
  var PointCloud=app.models.PointCloud;

  Q(Segment.find({
    include: ['user', 'pointCloud', 'pictures']

  }))
  .then(function(segments){
    var segment_idx=0;
    segments_loop();

    function segments_loop(){
      if (segment_idx>=segments.length) {
        console.log('segment-viewer-status-update DONE');
        return
      }

      var segment=segments[segment_idx++];

      console.log(segment_idx+'/'+segments.length);

      if (segment.pointCloud()) {
        console.log('already got a pointcloud for segment '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000')));
        process.nextTick(segments_loop);
        return;
      }

      // get viewer.json
      segment.getViewerJSON({segment: segment})
        // get cloud.js
        .then(segment.getCloudJSON)
        .then(function(args){
          console.log('got cloud.json');
          var viewerJSON=args.viewerJSON;
          var cloudJSON=args.cloudJSON;

          return Q(args.pointCloud=segment.pointCloud.create({
            poseCount: viewerJSON.extrinsics.length,
            viewCount: viewerJSON.views.length,
            pointCount: cloudJSON.points

          })).then(function(pointCloud){

            function delete_poses(){
              return Q(Pose.remove({
                where: {
                  pointCloudId: pointCloud.id
                }
              }));
            }

            function create_poses(){
              var q=Q.defer();
              var extrinsic_idx=0;
              var extrinsics;

              function extrinsics_loop(){
                var view;

                // get the next pose
                if (extrinsic_idx>=viewerJSON.extrinsics.length) {
                  q.resolve();
                  return;
                }
      console.log(segment_idx+'/'+segments.length+' - '+extrinsic_idx+'/'+viewerJSON.extrinsics.length);
                extrinsics=viewerJSON.extrinsics[extrinsic_idx++];

                // get view
                var view;
                view=viewerJSON.views[extrinsics.key];

                if (!view) {
                  console.log(new Error('ERROR: missing view '+extrinsics.key+' for segment '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000'))));
                  extrinsics_loop();
                  return;
                }
                if (extrinsics.key!=view.value.ptr_wrapper.data.id_pose) {
                  q.reject(new Error('ERROR: extrinsics.key != view.id_pose !!! '+extrinsics.key+' '+view.value.ptr_wrapper.data.id_pose));
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
                  console.log(new Error('ERROR: Picture '+timestamp+' not found in segment '+segment.timestamp+' '+new Date(Number(segment.timestamp.substr(0,10)+'000'))));
                  picture={};
                }

                // add pointCloud.pose
                Q(PointCloud.scopes.poses.modelTo.create({
                  pointCloudId: pointCloud.id,
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

            } // create poses

//            return delete_poses().then(create_poses);
            return create_poses();

          })

        })
        .fail(console.log)
        .finally(segments_loop)
        .done();

    } // loop

  });
}
