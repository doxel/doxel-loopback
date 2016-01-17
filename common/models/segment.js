module.exports = function(Segment) {
  var path=require('path');

  Segment.prototype.getPath=function segment_getPath(baseDirectory,token,segmentDirDigits) {
    var segment=this;
    var date=new Date(Number(segment.timestamp.substr(0,10)));
    var mm=String(date.getMonth()+1);
    var dd=String(date.getDate());
    if (mm.length==1) mm='0'+mm;
    if (dd.length==1) dd='0'+dd;
    if (baseDirectory) {
      return path.join(baseDirectory,String(date.getFullYear()),mm,dd,token,segment.timestamp.substr(0,segmentDirDigits));
    } else {
      return path.join(date.getFullYear(),mm,dd,token,segment.timestamp.substr(0,segmentDirDigits));
    }
  }

};
