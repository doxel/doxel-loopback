'use strict';
var path=require('path');
module.exports = function () {
    //4XX - URLs not found
    return function customRaiseUrlNotFoundError(req, res, next) {
        // send html only when acceptable
        if (req.headers.accept && req.headers.accept.match(/html/)) {
          res.sendFile(path.join(__dirname,'404.html'), function (err) {
              if (err) {
                  console.error(err);
                  res.status(err.status).end();
              }
          });

        } else {
          res.status(404).end();
          return;
        }
    };
};
