'use strict';

module.exports = function(Job) {
  var app=require('../../server/server');
  var Q=require('q');
  var extend=require('extend');
  var ObjectID = require('mongodb').ObjectID;

  // return a previously job not completed by the requesting user,
  // or assign him a new job
  Job.get=function(req, res, callback) {
    var Segment=Job.app.models.Segment;

    /* decompose steps into functions */
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

    /* here we go */
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
    'get',
    {
      accepts: [
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
      ],
      returns: {arg: 'result', type: 'object'},
      http: {
        path: '/get',
        verb: 'get'
      }
    }
  );

  Job.progress=function(jobId, state, req, res, callback) {

console.log(jobId,req.accessToken.userId)
    /* decompose steps into functions */
    function findCurrentJob(){
      return Q(Job.findOne({
        where: {
          id: jobId,
          userId: req.accessToken.userId,
          completed: {
            exists: false
          }
        },
        include: 'segment'
      }));
    }

    function startJob(job) {
      if (!job){
        return Q.reject(new Error('no such running job: '+jobId));
      }
      if (job.started) {
        return job;

      } else {
        // set Segment status to 'processing'
        console.log('get segment')
        var segment=job.segment();
        if (segment.status!='pending') {
          return Q.reject(new Error('segment '+segment.id+' status is '+segment.status));
        }
        return Q.nfcall(Job.app.models.Segment.proceed,segment.id,segment.status,segment.status_timestamp,'forward',null,null)
        .then(function(args){
          // set job started timestamp
          var attributes={};
          attributes.started=args[1];
          return Q(job.updateAttributes(attributes));
        })
      }
    }

    function updateJobProgress(job) {
      var now=Date.now();
      var attributes={progressed: now};
      if (state) {
        if (!job.history) job.history=[];
        job.history.push(state);
        attributes.history=job.history;
      }
      return Q(job.updateAttributes(attributes));
    }

    function checkForCompletion(job) {
      var data=JSON.parse(state);
      if (data.completed || data.error) {
        return Q.nfcall(Job.complete,jobId,data.msg,req,res);
      } else {
        return Q.resolve(job);
      }
    }

    /* here we go */
    findCurrentJob()
    .then(startJob)
    .then(updateJobProgress)
    .then(checkForCompletion)
    .then(function(job){
      callback(null,{job: job});
    })
    .catch(function(err) {
      console.log(err);
      if (res) {
        res.status(500).end(JSON.stringify(err));
        return;
      }
      callback(err);
    })
    .done();

  }

  Job.remoteMethod(
    'progress',
    {
      accepts: [
        {arg: 'id', type: 'string', required: true},
        {arg: 'state', type: 'string', required: false},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'},
      http: {
        path: '/progress/:id/:state',
        verb: 'get'
      }
    }
  );

  Job.complete=function(jobId, status, req, res, callback) {

    /* decompose steps into functions*/
    function findCurrentJob(){
      return Q(Job.findOne({
        where: {
          id: jobId,
          userId: req.accessToken.userId,
          completed: {
            exists: false
          }
        },
        include: 'segment'
      }));
    }

    function setJobStatusToCompleted(job) {
      if (!job) {
        return Q.reject(new Error('no such running job: '+jobId));
      }
      var now=Date.now();
      var attributes={};
      attributes.completed=now;
      attributes.completion_status=status||'ok';
      return Q(job.updateAttributes(attributes));
    }

    function setSegmentStatusToProcessed(job) {
      var segment=job.segment();
      if (segment.status!='processing') {
        return Q.reject(new Error('segment '+segment.id+' status is '+segment.status));
      }
      return Q.nfcall(Job.app.models.Segment.proceed,segment.id,segment.status,segment.status_timestamp,'forward',null,null)
      .then(function(){
        return job;
      })
    }

    /* here we go */
    findCurrentJob()
    .then(setJobStatusToCompleted)
    .then(setSegmentStatusToProcessed)
    .then(function(job){
      callback(null,{job: job});
    })
    .catch(function(err) {
      console.log(err);
      if (res) {
        res.status(500).end(JSON.stringify(err));
        return;
      }
      callback(err);
    });

  }

  Job.remoteMethod(
    'complete',
    {
      accepts: [
        {arg: 'id', type: 'string', required: true},
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}},
    ],
      returns: {arg: 'result', type: 'object'},
      http: {
        path: '/complete/:id',
        verb: 'get'
      }
    }
  );

};
