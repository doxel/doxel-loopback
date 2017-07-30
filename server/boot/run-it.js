module.exports=function(app){

  // Allow to run maintenance scripts from command line
  // eg: PORT=4444 node . $(realpath updatedb.js)
  // 

  if ((process.argv.length>1 && process.argv[1].split('/').pop()!='doxel-loopback') || process.argv.length<3) {
    return;
  }

  require(process.argv[2])(app);

}

