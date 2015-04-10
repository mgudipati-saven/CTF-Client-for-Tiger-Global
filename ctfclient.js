var fs = require('fs'),
  net = require('net'),
  events = require('events'),
  util = require('util'),
  winston = require('winston'),
  csv = require('fast-csv'),
  redis = require('redis'),
  ctf = require('./ctf'),
  config = require('./config'),
  myutil = require('./util'),

  // global data dictionary
  _tokenDefs = {},

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
      level: 'debug', 
      timestamp: true
    }),
    new (winston.transports.File)({ 
      levels: winston.config.syslog.levels, 
      level: 'debug', 
      timestamp: true, 
      json: false, 
      filename: './ctf-client.log' 
    })
  ]
});

 
// Initialize CTF Token Definitions, also known as data dictionary
_tokenDefs = myutil.loadCTFTokens(config.ctf.tokens);

// Initialize CTF Connection
initCTF();

/*
 */
function initCTF () {
  _ctfStream = net.createConnection(config.ctf.port, config.ctf.host, function() {
    _logger.info("established ctf connection with " + config.ctf.host + " on port " + config.ctf.port);

    // CTF Client Object
    _ctfClient = ctf.createClient(_ctfStream);

    // register messsage listener
    _ctfClient.on('message', function(msg) {
      _logger.debug("new ctf message received: " + msg);
      
      var json = myutil.toJSON(msg, _tokenDefs);
      _logger.info("toJSON: " + JSON.stringify(json));
    });

    // send CTF commands
    config.ctf.commands.forEach(function(cmd) {
      _ctfClient.sendCommand(cmd);
    });
  });

  _ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    _csvStream.end();
  });
}
