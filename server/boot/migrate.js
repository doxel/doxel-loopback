var Q=new require('q');

if (!process.env['MIGRATE']) {
    return;
}

module.exports=function(app){
    var MysqlUser=app.models.MysqlUser;
    var Member=app.models.Member;

    MysqlUser.find({},function(err,users){

        function iter(user) {
            Member.findOrCreate({
                where: {
                    email: user.pass+'@doxel.org'
                }
            },
            {
                password: user.pass,
                email: user.pass+'@doxel.org',
                fingerprint: user.fingerprint,
                ip: user.ip,
                forwardedFor: user.forwardedFor,
                created: user.created
            },
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
                console.log(i);
                q.then((function(i){
                    console.log(i, users[i]);
                    iter(users[i]);
                })(i));
            }
        },1000);
        
    });

}
