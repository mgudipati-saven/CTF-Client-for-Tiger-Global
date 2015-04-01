var fs = require('fs'),
  net = require('net'),
  events = require('events'),
  util = require('util'),
  winston = require('winston'),
  liner = require('line-by-line'),
  csv = require('fast-csv'),
  ctf = require('./ctf'),
  config = require('./config'),
  myutil = require('./util'),

  // global data dictionary
  _dataDictionary = {},

  // global ctf socket stream
  _ctfStream = null,
  
  // global ctf client
  _ctfClient = null;

  // global csv stream
  _csvStream = csv.format({headers: true}),
  _csvStream.pipe(fs.createWriteStream(config.out));
  
//
// Create a new winston logger instance with two tranports: Console, and File
//
var _logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ 
      levels: winston.config.syslog.levels, 
      level: 'debug', 
      timestamp: true
    }),
    new (winston.transports.File)({ 
      levels: winston.config.syslog.levels, 
      level: 'info', 
      timestamp: true, 
      json: false, 
      filename: './news-client.log' 
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
  var readln = new liner('tokens.dat');

  readln.on('error', function (err) {
    _logger.crit("error while loading tokens.dat file into the data dictionary...");
  }).on('line', function (line) {
    updateDataDictionary(line);
  }).on('end', function () {
    _logger.info("loaded tokens.dat file into the data dictionary...");
  });
}

/*
 */
function updateDataDictionary(ctfmsg) {
  var tok = {},
    json = toJSON(ctfmsg);
 
    ctfmsg.split("|").forEach(function(token) {
      var tvpair = token.split("="),
        key = tvpair[0],
        val = tvpair[1];
    
        switch (key) {
        case '5035':
          tok.num = parseInt(val);
          break;      
        case '5010':
          tok.name = val; 
          break;
        case '5012':
          tok.type = val;
          break;
        case '5011':
          tok.size = parseInt(val);
          break;
        case '5002':
          tok.store = val == '0' ? false : true;
          break;
      }
    });
 
    
  if (tok.num) {
    _dataDictionary[tok.num] = tok; 
  }
}

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(config.news.port, config.news.host, function() {
    _logger.info("established ctf connection with " + config.news.host + " on port " + config.news.port);

    // CTF Client Object
    _ctfClient = ctf.createClient(_ctfStream);

    // register messsage listener
    _ctfClient.on('message', function(msg) {
      _logger.debug("new ctf message received: " + msg);
      
      var json = toJSON(msg);
      _logger.debug("toJSON: " + JSON.stringify(json));
    });

    // send CTF commands
    config.news.commands.forEach(function(cmd) {
      _ctfClient.sendCommand(cmd);
    });
  });

  _ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    _csvStream.end();
    //initCTF();
  });
}

/**
 * toCSV
 *    Converts a ctf message into CSV string
 * 
 * @param {String} ctfmsg
 *    A ctf message
 *
 * @return {String} 
 *    A comma separated value of the given ctf message
 */
function toCSV (ctfmsg, cols) {
  var csv = "",
    json = toJSON(ctfmsg);
  
  cols.forEach(function(toknum, i) {
    var val = json[toknum];
    if (val) {
      csv += val;
    } 
    
    if (i != cols.length - 1) {
      csv += ",";
    }
  });
	
	return csv;
}

/**
 * toJSON
 *    Converts a ctf message into JSON object
 * 
 * @param {String} ctfmsg
 *    A ctf message
 *
 * @return {JSON} 
 *    A JSON Object containing parsed ctf message
 */
function toJSON (ctfmsg) {
  var json = {};
  
  ctfmsg.split("|").forEach(function(token) {
    var tvpair = token.split("="),
      key = tvpair[0],
      val = tvpair[1];
    
    var token = _dataDictionary[key];
    if (token) {
      key = token.name;
      switch (token.type) {
        case "DATETIME":
          var millis = tvpair[1].split('.')[1];
          val = new Date(parseInt(tvpair[1])*1000).format("yyyy-mm-dd HH:MM:ss", true) + "." + millis;
          break;
          
        case "FLOAT":
          val = parseFloat(tvpair[1]);
          break;
          
        case "INTEGER":
          val = parseInt(tvpair[1]);
          break;

        case "BOOL":
          val = tvpair[1] == '0' ? false : true;
          break;
      }
    }

		json['' + key] = val;    
  });

	return json;
}
