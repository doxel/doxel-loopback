module.exports=function(app){
  if (!process.env.UPDATECOORDS) {
    return;
  }

  var Q=require('q');
  var Segment=app.models.Segment;
  var loopback=require('loopback');

  Segment.find({
/*    where: {
      geo: {
        exists: false
      }
    },
*/
    include: 'pictures'

  }, function(err,segments){
    var segment_idx=0;
    segment_loop();

    function segment_loop(){
      if (segment_idx>=segments.length) {
        console.log('segment_loop: DONE');
        process.exit(0);
      }

      var segment=segments[segment_idx++];
      var pictures=segment.pictures();
      console.log(pictures.length+' pictures for segment '+segment.id);
      if (!pictures.length) {
        segment.destroy(function(){
          process.nextTick(segment_loop);
        });
        return;
      }

      var lng=0;
      var lat=0;
      var count=0;
      var picture_idx=0;

      var q=Q.defer();


      function picture_loop(){
        var geo=null;
        if (picture_idx==pictures.length) {
          q.resolve({
            segment: segment,
            count: count,
            lat: lat,
            lng: lng
          });
          return;
        }
      
        var picture=pictures[picture_idx++];  
        geo=picture.geo; // force save to delete latlnt
        if (!picture.geo) {
          if (picture.lat!==undefined) {
            geo=picture.geo=new loopback.GeoPoint({lat: picture.lat, lng: picture.lng});
          }
        } else {
          if (!picture.geo.lat && !picture.geo.lng) {
            picture.unsetAttribute('geo');
          }
        }

        picture.unsetAttribute('lat');
        picture.unsetAttribute('lng');
        if (picture.geo) {
          lat+=picture.geo.lat;
          lng+=picture.geo.lng;
          ++count;
        }
        if (geo) {
          picture.save(function(err){
            if (err) {
              console.log('ERROR: picture.save failed: ',err,picture.id);
            }
            process.nextTick(picture_loop);
          });
        } else {
          process.nextTick(picture_loop);
        }

      }  // picture_loop

      picture_loop();

      q.promise.then(function(args){
        if (args.count) {
          args.lat/=args.count;
          args.lng/=args.count;
          args.segment.geo=new loopback.GeoPoint({lat: args.lat, lng: args.lng});
        }

        if (args.segment.geo && !args.segment.geo.lat && !args.segment.geo.lng) {
          args.segment.unsetAttribute('geo');
        }
        args.segment.unsetAttribute('lat');
        args.segment.unsetAttribute('lng');
        args.segment.save(function(err){
          if (err) {
            console.log('ERROR: segment_save: ',err,args.segment.id);
          }
          process.nextTick(segment_loop);
        });

        /*
        } else {
          process.nextTick(segment_loop);
        }
        */

      }); // picture_loop

    } // loop

  });
}
