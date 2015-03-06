var fs = require('fs'),
  net = require('net'),
  events = require('events'),
  util = require('util'),
  winston = require('winston'),
  liner = require('line-by-line'),
  ctf = require('./ctf'),
  config = require('./config'),
  myutil = require('./util'),

  // global data dictionary
  dataDictionary = {},

  // global ctf socket stream
  _ctfStream = null,
  
  // global ctf client
  _ctfClient = null;
  
//
// Create a new winston logger instance with two tranports: Console, and File
//
var _logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ 
      levels: winston.config.syslog.levels, 
      level: 'crit', 
      timestamp: true
    }),
    new (winston.transports.File)({ 
      levels: winston.config.syslog.levels, 
      level: 'info', 
      timestamp: true, 
      json: false, 
      filename: './ctf.log' 
    })
  ]
});

// Initialize CTF Token Definitions, also known as data dictionary
initDataDictionary()

// Initialize CTF Connection
initCTF();

/*
 */
function initDataDictionary () {
  var linereader = new liner('tokens.dat');

  linereader.on('error', function (err) {
    _logger.crit("error while loading tokens.dat file into the data dictionary...");
  }).on('line', function (line) {
    _logger.debug(line);
    updateDataDictionary(line);
  }).on('end', function () {
    _logger.info("loaded tokens.dat file into the data dictionary...");
  });
}

/*
 */
function updateDataDictionary(ctfmsg) {
  var tok = {};
  
  ctfmsg.split("|").forEach(function(token) {
    var tvpair = token.split("=");
    
    switch (tvpair[0]) {
      case '5035': 
        tok.num = parseInt(tvpair[1]);
        break;
        
      case '5010': 
        tok.name = tvpair[1]; 
        break;
      
      case '5002': 
        tok.store = tvpair[1] == '0' ? false : true;
        break;
      
      case '5011': 
        tok.size = parseInt(tvpair[1]); 
        break;
      
      case '5012': 
        tok.type = tvpair[1]; 
        break;
    }
  });
  
  if (tok.num) {
    dataDictionary[tok.num] = tok; 
  }
}

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(config.ctf.port, config.ctf.host, function() {
    _logger.info("established ctf connection...");

    // CTF Client Object
    _ctfClient = ctf.createClient(_ctfStream);

    // register messsage listener
    _ctfClient.on('message', function(msg) {
      _logger.info("new ctf message received: " + JSON.stringify(msg));
      
      if (msg['4']) {
          // quotes...
          console.log(toCSV(msg, [20, 5, 612, 609, 614, 613]));
      }
    });

    // send CTF commands
    config.ctf.commands.forEach(function(cmd) {
      _ctfClient.sendCommand(cmd);
    });
  });

  _ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    //initCTF();
  });
}

/**
 * toCSV
 *    Converts a ctf message into CSV string
 * 
 * @param {JSON} ctfmsg
 *    A ctf message in JSON format
 *
 * @return {String} 
 *    A comma separated value of the given ctf message
 */
function toCSV (ctfmsg, cols) {
  var csv = "";
  
  cols.forEach(function(toknum, i) {
    var val = ctfmsg[toknum];
    if (val) {
      var token = dataDictionary[toknum];
      if (token && token.type == "DATETIME") {
        var millis = val.split('.')[1];
        csv += new Date(parseInt(val)*1000).format("yyyy-mm-dd HH:MM:ss", true) + "." + millis;
      } else {
        csv += val;
      }
    } 
    
    if (i != cols.length - 1) {
      csv += ",";
    }
  });
	
	return csv;
}
