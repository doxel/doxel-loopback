module.exports=function(app){

  var Q=require('q');

  var Segment=app.models.Segment;

  Segment.find({
    include: ['user', 'pointCloud']

  }, function(err,segments){
    var idx=0;
    loop();

    function loop(){
      if (idx==segments.length) {
        console.log('segment-viewer-status-update DONE');
        return
      }

      var segment=segments[idx++];
      segment.getViewerJSON({segment: segment})
        .then(segment.getCloudJSON)
        .then(function(args){
          var json=args.viewerJSON;
          args.segment.pointCloud.create({
            poseCount: json.extrinsics.length,
            viewCount: json.views.length,
            pointCount: args.cloudJSON.points
          },function(err,pointCloud){
            var q=Q.defer();
            if (err) {
              console.log(err);
              q.reject(err);
              return;
            }
            args.segment.save(function(err){
              if (err) {
                q.reject(err);
                return;
              }
              q.resolve(args);
            });

            return q.promise;
          });
        })
        .fail(console.log)
        .finally(loop);

    } // loop

  });
}
