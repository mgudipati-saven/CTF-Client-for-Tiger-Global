var net = require('net'),
  events = require('events'),
  util = require('util'),
  winston = require('winston')
  ctf = require('./ctf'),
  config = require('./config')

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
  
// Initialize CTF Connection
initCTF();

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
