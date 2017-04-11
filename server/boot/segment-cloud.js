module.exports=function(app){
  /*
   * import cloud data in database:
   *
   * - create pointCloud instance
   * - update segment picture
  */

  var Q=require('q');

    console.log(process.argv[1]);
  if (!process.argv[1].split('/').pop()=='doxel-loopback' || !process.env.REINJECT_POINTCLOUDS) {
    return;
  }

  var Segment=app.models.Segment;
  var Pose=app.models.Pose;
  var PointCloud=app.models.PointCloud;

  Q.fcall(function(){
    // delete all PointCloud and Pose instances
    return Q(PointCloud.destroyAll()).then(Q(Pose.destroyAll()));

  })
  .then(function(){
   // get all the segment ids
   return Q(Segment.find({
     fields: ['id']
   }))

  })
  .then(function(segments){
    var segment_idx=0;

    function segments_loop(){
      // exit loop when no segment left
      if (segment_idx>=segments.length) {
        console.log('segment-viewer-status-update DONE');
        return
      }

      // get next segment
      var segment=segments[segment_idx++];
      console.log(segment_idx+'/'+segments.length);

      // create segment PointCloud and Pose instances
      Segment._injectPointcloud(segment.id)
      .fail(console.log)
      .finally(segments_loop)
      .done();
    }

    // enter the loop
    segments_loop();

  });
}

