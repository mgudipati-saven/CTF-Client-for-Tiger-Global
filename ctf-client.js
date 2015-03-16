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
  var readln = new liner('tokens.dat');

  readln.on('error', function (err) {
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
  _ctfStream = net.createConnection(config.ctf.port, config.ctf.host, function() {
    _logger.info("established ctf connection...");

    // CTF Client Object
    _ctfClient = ctf.createClient(_ctfStream);

    // register messsage listener
    _ctfClient.on('message', function(msg) {
      _logger.info("new ctf message received: " + msg);
      
      var json = toJSON(msg);
      console.log(msg);
      console.log(json);
      if (json['ENUM.SRC.ID']) {
        // quotes...
        var res = {}
        config.ctf.fields.forEach(function(field) {
          res[field] = json[field];
        });
        console.log(res);
        _logger.debug(msg);
        //_logger.debug(json);
        _csvStream.write(res);
        //console.log(toCSV(msg, [20, 5, 612, 609, 614, 613]));
      }
    });

    // send login command
    _ctfClient.sendCommand("5022=LoginUser|5028="+config.ctf.userid+"|5029="+config.ctf.password+"|5026=1");
    _ctfClient.sendCommand("5022=SelectAvailableTokens|5026=2");

    // send CTF commands
    config.ctf.commands.forEach(function(cmd) {
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
