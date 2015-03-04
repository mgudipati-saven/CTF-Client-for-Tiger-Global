var net = require('net'),
    events = require('events'),
    util = require('util'),
    winston = require('winston')
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
    
// Initialize CTF Connection
initCTF();

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(4012, "198.190.11.21", function() {
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
    _ctfClient.sendCommand("5022=LoginUser|5028=tiger|5029=tiger|5026=1");
    _ctfClient.sendCommand("5022=SelectAvailableTokens|5026=2");
    _ctfClient.sendCommand("5022=QueryDepth|4=938|5=E:941|5026=3");
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
    
	for (var i = 0; i < cols.length; i++) {
        var val = ctfmsg[cols[i]]
        if (val) {
            csv += val + ",";
        } else {
            csv += ",";
        }
	}
	
	return csv;
}
