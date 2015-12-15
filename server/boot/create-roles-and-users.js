var Q = require('q');

module.exports = function(app) {
    var Role = app.models.Role;
    var Member = app.models.Member;
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
        Member.findOrCreate({
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

        }, function(err, member) {
            if (err) {
                throw err;
            }
            console.log('Found or created member:', member.email);

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
                    principalId: member.id

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
