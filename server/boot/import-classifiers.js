module.exports=function(app){
  /*
   * import tensorflow classifiers <segment>/tensorflow/<timestamp>.jpeg.txt files into database
   * run with export UPDATE_CLASSIFIERS=true ; ./node .
   *
  */
  var Q=require('q');

//  console.log(process.argv[1],process.env.UPDATE_CLASSIFIERS)
  if (process.argv[1].split('/').pop()!='doxel-loopback' || !process.env.UPDATE_CLASSIFIERS) {
    return;
  }

  var Segment=app.models.Segment;
  var Picture=app.models.Picture;
  var Classifier=app.models.Classifier;

  function importClassifiers() {

    // get all the segment ids
    return Q.fcall(function(){
      return Segment.find({ fields: ['id'] })

    }).then(function(segments){
      var q=Q.defer();
      var segment_idx=0;

      console.log(segments.length,'segments');
      function segments_loop(){
        // exit loop when no segment left
        if (segment_idx>=segments.length) {
          console.log('import-classifiers DONE');
          return q.resolve();
        }

        // get next segment
        var segment=segments[segment_idx++];
        console.log('import-classifiers: '+segment_idx+'/'+segments.length);

        // create segment PointCloud and Pose instances
        Segment._updateClassifiers(segment.id)
        .fail(console.log)
        .finally(segments_loop)
        .done();
      }

      // enter the loop
      segments_loop();

      return q.promise;

    });
  }

  importClassifiers()
  .catch(function(err){
    console.log(err);
  })
  .done();

}

