var Q = require('q');

module.exports = function(app) {
    var Role = app.models.Role;
    var User = app.models.User;
    var RoleMapping = app.models.RoleMapping;
    var q = new Q();

    q.then(function(){
        // add role "admin"
        Role.findOrCreate({
            where: { name: 'admin' }

        }, {
            name: 'admin'

        }, function(err, role) {
            if (err) {
                throw err;
            }
            console.log('Found or created role:', role.name);
        });

    }).then(function(){
        // add role "member"
        Role.findOrCreate({
            where: { name: 'member' }

        }, {
            name: 'member'

        }, function(err, role) {
            if (err) {
                throw err;
            }
            console.log('Found or created role:', role.name);

        });

    }).then(function() {
        // add member "admin"
        User.findOrCreate({
            where: {
                email: 'admin@doxel.org'
            }

        }, {
            email: 'admin@doxel.org',
            emailVerified: true,
            password:'admin',
            token: 'dummy',
            fingerprint: 'dummy',
            ip: '127.0.0.1'

        }, function(err, user) {
            if (err) {
                throw err;
            }
            console.log('Found or created user:', user.email);

            Role.findOne({
                where: {
                    name: 'admin'
                }

            }, function(err, role) {
                if (err) {
                    return;
                }

                role.principals.create({
                    principalType: RoleMapping.USER,
                    principalId: user.id

                }, function(err, principal) {
                    if (err) {
                        throw err;
                    }
                    console.log('> User type set to ' + role.name);
                });

            });

        });
    });

}
