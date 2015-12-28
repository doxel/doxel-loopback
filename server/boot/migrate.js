var Q=require('q');

if (!process.env['MIGRATE']) {
    return;
}

module.exports=function(app){
    var MysqlUser=app.models.MysqlUser;
    var Member=app.models.Member;

    MysqlUser.find({},function(err,users){

        function iter(user) {

            Member._signup({
                migrate: true,
                token: user.pass,
                fingerprint: user.fingerprint,
                ip: user.ip,
                forwarded_for: user.forwardedFor
            },
            null,
            function(err,obj){
                if (err) {
                    throw err;
                } else {
                    console.log('added '+user.pass+'@doxel.org');
                }
            });
        }

        setTimeout(function(){
            console.log('migrating '+users.length+' users');
            var q=new Q();
            for(var i=0; i<users.length; ++i) {
                // without this useless q an error it thrown
                q.then((function(i){
                    iter(users[i]);
                })(i));
            }
        },1000);
        
    });

}
