var csv = require("fast-csv")
  , fs = require("fs");


var _mmidmap = {};

var _csvStream = csv.format({headers: true});
  _csvStream.pipe(fs.createWriteStream("hkl2mm.csv"));

csv
 .fromPath("mmidmap.csv", {headers : true})
 .on("data", function(data){
   _mmidmap[parseInt(data['MM.ID.INT'])] = data['MM.ID'];
 })
 .on("end", function(){
    csv
     .fromPath("hkl2.csv", {headers : true})
     .on("data", function(data){
       console.log(data);
       var newdata = {};
       newdata['AsOfDate'] = data['CURRENT.DATETIME'].split(' ')[0];
       newdata['AsOfTime'] = data['CURRENT.DATETIME'].split(' ')[1];
       newdata['Ticker'] = data['SYMBOL.TICKER'].slice(2) + " HK";
       newdata['Serial#'] = data['PRICE.LEVEL'];
       var arr = data['MM.ID.INT'].split(',').filter(function(item, i, ar){ return ar.indexOf(item) === i; });
       console.log(arr);
       arr.forEach(function(id) {
         console.log(id);
         if (_mmidmap[id]) {
           console.log(_mmidmap[id]);
           if (data['BID.LEVEL.PRICE']) {
             newdata['Bid MMKR'] = _mmidmap[id];
             newdata['Bid Price'] = data['BID.LEVEL.PRICE'];
             newdata['Ask MMKR'] = null;
             newdata['Ask Price'] = null;
           } else if (data['ASK.LEVEL.PRICE']) {
             newdata['Bid MMKR'] = null;
             newdata['Bid Price'] = null;
             newdata['Ask MMKR'] = _mmidmap[id];
             newdata['Ask Price'] = data['ASK.LEVEL.PRICE'];
           }
           console.log(newdata);
           _csvStream.write(newdata);
         }
       });
     })
     .on("end", function(){
       console.log("done");
     });
 });
 
 
 