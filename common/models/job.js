'use strict';

module.exports = function(Job) {
  var app=require('../../server/server');
  var Q=require('q');
  var Segment=app.models.Segment;
  var extend=require('extend');

  // return a previously job not completed by the requesting user,
  // or assign him a new job
  Job.getOne=function(options, req, res, callback) {

    // decompose steps as functions
    function findUnfinishedJob(){
      return Q(Job.findOne({
        where: {
          userId: req.accessToken.userId,
          completed: {
            exists: false
          }
        }
      }));
    }

    function findOneQueuedSegment(){
      return Q(Segment.findOne({
        where: {
          status: 'queued'
        }
      }))
    }

    function setSegmentStatusToPending(segment) {
      if (!segment) {
        return Q.reject();
      }
      var q=Q.defer();
      Segment.proceed(segment.id, segment.status, segment.status_timestamp, 'forward', null, null, function(err,status,timestamp){
        if (err) {
          // another worker got the job (probably)
          q.reject(err);

        } else {
          segment.status=status;
          segment.status_timestamp=timestamp;
          q.resolve(segment);
        }

      });
      return q.promise;
    }

    function assignTheJob(segment){
      // create and assign the job
      return Q(Job.create({
        type: 'full',
        assigned: Date.now(),
        userId: req.accessToken.userId,
        segmentId: segment.id
      }));
    }


    findUnfinishedJob()
    .then(function(job){
      if (job) {
        callback(null,{job: job});
      } else {
        return findOneQueuedSegment()
        .then(setSegmentStatusToPending)
        .then(assignTheJob)
        .then(function(job){
          console.log(job);
          callback(null,{job: job});
        })
      }
    })
    .catch(function(err){
      console.log(err);
      callback(err);
    })
    .done();
  }

  Job.remoteMethod(
    'getOne',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

  Job.progress=function(options, req, res, callback) {
    // decompose steps as functions
    function findCurrentJob(){
      return Q(Job.findOne({
        where: {
          userId: req.accessToken.userId,
          completed: {
            exists: false
          }
        }
      }));
    }

    function startJob(job) {
      if (job.started) {
        return job;

      } else {
        // set Segment status to 'processing'
        return Q(job.__get__segment())
        .then(function(segment){
          if (segment.status!='pending') {
            return Q.reject(new Error('segment '+segment.id+' status is '+segment.status));
          }
          return Q.nfCall(Segment.proceed,segment.status,segment.status_timestamp,'forward',null,null)
        })
        .then(function(args){
          // set job started timestamp
          console.log('args[1]',args[1])
          var attributes={};
          attributes.started=args[1];
          return Q(job.updateAttributes(attributes));
        })
      }
    }

    function updateJobProgress(job) {
      var now=Date.now();
      var attributes={progressed: now};
      return Q(job.updateAttributes(attributes));
    }

    findCurrentJob()
    .then(startJob)
    .then(updateJobProgress)
    .then(function(job){
      callback(null,{job: job});
    })
    .catch(function(err) {
      console.log(err);
      callback(err);
    })
    .done();

  }

  Job.remoteMethod(
    'progress',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

  Job.complete=function(options, req, res, callback) {
    // decompose steps as functions
    function findCurrentJob(){
      return Q(Job.findOne({
        where: {
          userId: req.accessToken.userId,
          completed: {
            exists: false
          }
        }
      }));
    }

    function setJobStatusToCompleted(job) {
      if (!job) {
        return Q.reject();
      }
      var now=Date.now();
      var attributes={};
      attributes.completed=now;
      attributes.completion_status=options.status||'ok';
      return Q(job.updateAttributes(attributes));
    }

    function setSegmentStatusToProcessed(job) {
      if (!job) {
        return Q.reject();
      }
      return Q(job.__get__segment())
      .then(function(segment){
        if (segment.status!='processing') {
          return Q.reject(new Error('segment '+segment.id+' status is '+segment.status));
        }
        return Q.nfCall(Segment.proceed,segment.status,segment.status_timestamp,'forward',null,null)
        .then(function(){
          return job;
        })
      })
    }

    findCurrentJob()
    .then(setJobStatusToCompleted)
    .then(setSegmentStatusToProcessed)
    .then(function(job){
      callback(null,{job: job});
    })
    .catch(function(err) {
      console.log(err);
      callback(err);
    });

  }

  Job.remoteMethod(
    'complete',
    {
      accepts: [
        {arg: 'options', type: 'object', 'http': {source: 'body'}},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'}
    }
  );

};
