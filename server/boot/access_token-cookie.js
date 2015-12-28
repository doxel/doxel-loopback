var cookieParser = require('cookie-parser');

module.exports = function(app) {

    var secret='saGG3=(&%as[ü!232+"+*4q}°<sd3';
    app.use(cookieParser(secret));

    app.use(function(req, res, next) {
        var token = req.accessToken && req.accessToken.id;
        if(token) {
            res.cookie('access_token', token, {signed: true});
        }
        next();
    });

};

