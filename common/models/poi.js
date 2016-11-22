module.exports = function(POI) {

  POI.observe('before delete', function(ctx, next) {
    POI.app.models.Group._delete(ctx,next);
  });

};
