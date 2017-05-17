'use strict';
var path=require('path');
module.exports = function () {
    //4XX - URLs not found
    return function customRaiseUrlNotFoundError(req, res, next) {
        res.sendFile(path.join(__dirname,'404.html'), function (err) {
            if (err) {
                console.error(err);
                res.status(err.status).end();
            }
        });
    };
};
