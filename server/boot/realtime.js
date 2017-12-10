// https://loopback.io/doc/en/lb3/Realtime-server-sent-events.html
var es = require('event-stream');
module.exports = function(app) {
  var MyModel = app.models.Segment;
  MyModel.createChangeStream(function(err, changes) {
    changes.pipe(es.stringify()).pipe(process.stdout);
  });
}
