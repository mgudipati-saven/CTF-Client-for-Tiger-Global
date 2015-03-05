var net = require('net'),
    events = require('events'),
    util = require('util'),
    winston = require('winston')
    iniparser = require('iniparser'),
    ctf = require('./ctf'),

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
  
// parse ini configuration file
var _ini = iniparser.parseSync('./config.ini');
_logger.debug(JSON.stringify(_ini));

//
// global settings
//
var _prop = {};

// ctf configuration
_prop.ctf = {};
_prop.ctf.host = _ini.CTF.Host;
_prop.ctf.port = _ini.CTF.Port;
_prop.ctf.userid = _ini.CTF.UserID;
_prop.ctf.password = _ini.CTF.Password;
_prop.ctf.exch = _ini.CTF.Exchanges.split(",");
_prop.fieldmap = _ini.FieldMap;

//    
// master securities = { 
//  securities: [
//    {SourceID: 938, TickerSymbol: E:941},
//    {SourceID: 938, TickerSymbol: E:942},
//    {SourceID: 938, TickerSymbol: E:943},
//    ...
//    ...
//    {SourceID: 138, TickerSymbol: IBM},
//  ]
// };

var arr = new Array();
_prop.ctf.exch.forEach(function(exch, pos) {
  var section = _ini[exch];
  if (section) {
    if (section.SourceID && section.Tickers) {
      section.Tickers.split(",").forEach(function(ticker, pos) {
        arr.push({SourceID: section.SourceID,
                  TickerSymbol: ticker
                });
      });
    }
  }
});
_prop.securities = arr;
_logger.debug(JSON.stringify(_prop));

// Initialize CTF Connection
initCTF();

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(_prop.ctf.port, _prop.ctf.host, function() {
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

    // send login command
    _ctfClient.sendCommand("5022=LoginUser|5028="+_prop.ctf.userid+"|5029="+_prop.ctf.password+"|5026=1");
    _ctfClient.sendCommand("5022=SelectAvailableTokens|5026=2");

    // send QueryDepth commands
  	_prop.securities.forEach(function(sec, pos) {
  	  var cmd = "5022=QueryDepth|4="+sec.SourceID+"|5="+sec.TickerSymbol+"|5026="+10+pos;
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
    
    cols.forEach(function(token, i) {
        var val = ctfmsg[token]
        if (val) {
            csv += val;
        } 
        
        if (i != cols.length - 1) {
            csv += ",";
        }
    });
	
	return csv;
}
