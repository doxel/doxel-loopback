module.exports = function(Role) {
  var Q=require('q');
  var extend=require('extend');

  Role.getUsers=function(options){
    var app = this.app;
    var User = app.models.user;
    var RoleMapping = app.models.roleMapping;
    var filter=extend(true,{},options.filter,{
      include: 'principals'
    });
    return Q(Role.find(filter))
    .then(function(roles) {
      var users=[];
      return roles.reduce(function(promise,role){
        return promise.then(function(){
           return role.principals().reduce(function(promise,principal){
             return promise.then(function(){
               if (principal.principalType=='USER' && !users.find(function(u){return u.id==principal.principalId})) {
                 return app.models.user.findById(principal.principalId);
               }
             })
             .then(function(user){
               if (user) {
                 users.push(user);
               }
             });
           },Q.resolve());
        })
      },Q.resolve())
      .then(function(){
        return users;
      })
    })

  }

  Role.notify=function(options) {
    var app=this.app;
    var Role=app.models.role;
    var filter={where:{}};

    if (options.role) {
      var role=options.role;
      if (typeof(role)=='string') {
        role=[role];
      }
      switch(role.length) {
        case 0: return Q.reject(new Error('no role specified')); break;
        case 1: filter.where.name=role[0]; break;
        default:
          filter.where.or=[];
          role.forEach(function(roleName){
            filter.where.or.push({name: roleName});
          });
          break;
      }
    } else {
      return Q.reject(new Error('no role specified'));
    }

    return Q(Role.getUsers(filter))
    .then(function(users){
      var emails=[];
      users.forEach(function(user){
        if (emails.indexOf(user.email)<0) {
          emails.push(user.email);
        }
      });
      return emails;
    })
    .then(function(emails){
      if (emails.length) return Q(app.models.Email.send({
        bcc: emails.join(','),
        from: options.from,
        subject: options.subject,
        html: options.html
      }))
      .then(function(){
        console.log('sending mail to:', emails.join(','));
      })
      .catch(function(err){
        console.log('sending mail failed !');
        return console.log(err);
      });
    });
  } // Role.notify

};
