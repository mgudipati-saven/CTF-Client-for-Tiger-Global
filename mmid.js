var csv = require("fast-csv")
  , fs = require("fs");


var _mmidmap = {};

var _csvStream = csv.format({headers: true});
  _csvStream.pipe(fs.createWriteStream("hk-l2-mm.csv"));

csv
 .fromPath("mmidmap.csv", {headers : true})
 .on("data", function(data){
   //console.log(data['MM.ID.INT'] + " => " + data['MM.ID']);
   _mmidmap[parseInt(data['MM.ID.INT'])] = data['MM.ID'];
 })
 .on("end", function(){
   console.log("done");
   console.log(_mmidmap);
    csv
     .fromPath("hk-l2.csv", {headers : true})
     .on("data", function(data){
       var arr = data['MM.ID.INT'].split(',');
       arr.forEach(function(id) {
         console.log(id + " => " + _mmidmap[id]);
         if (_mmidmap[id]) {
           data['MM.ID.INT'] = id;
           data['MM.ID'] = _mmidmap[id];
           _csvStream.write(data);
         }
       });
     })
     .on("end", function(){
       console.log("done");
     });
 });
 
 
 