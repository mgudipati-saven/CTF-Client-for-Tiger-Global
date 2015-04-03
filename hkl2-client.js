var fs = require('fs')
  , net = require('net')
  , events = require('events')
  , util = require('util')
  , winston = require('winston')
  , liner = require('line-by-line')
  , csv = require('fast-csv')
  , redis = require('redis')
  , ctf = require('./ctf')
  , config = require('./config')
  , myutil = require('./util');

  // global .UTC.TIME.DATE from CSP
  var _ctfTimeStamp = null;

  // global data dictionary
  var _dataDictionary = null;

  // global l2 client
  var _l2Client = null;
  
  // global news client
  var _newsClient = null;
  
  // global flag to indicate if a level 2 query to csp is pending
  var _pendingL2Query = false;
  
  // global query tag for level 2 query
  var _l2QueryTag = 100;
  
  // global csv stream
  var _csvStream = csv.format({headers: true});
  _csvStream.pipe(fs.createWriteStream(config.l2.ofile));
  
  // global orderbook
  var _buyOrders = []
    , _sellOrders = [];
  
  // global broker queue
  var _buyBrokerQ = []
    , _sellBrokerQ = [];

//
// Create a new winston logger instance with two tranports: Console, and File
//
var _logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ 
      levels: winston.config.syslog.levels, 
      level: 'info', 
      timestamp: true
    }),
    new (winston.transports.File)({ 
      levels: winston.config.syslog.levels, 
      level: 'debug', 
      timestamp: true, 
      json: false, 
      filename: './hkl2-client.log' 
    })
  ]
});

 
// Load CTF Token Definitions, also known as data dictionary from tokens.dat file
loadDataDictionary(config.ctf.tokens);

// Initialize L2 Connection
initL2(config.l2);

// Initialize News Connection
initNews(config.news);

/*
 */
function loadDataDictionary (file) {
  _dataDictionary = {};

  var readln = new liner(file);
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
function initL2 (csp) {
  var ctfStream = net.createConnection(csp.port, csp.host, function() {
    _logger.info("established ctf connection with " + csp.host + " on port " + csp.port);

    // CTF Client Object
    _l2Client = ctf.createClient(ctfStream);

    // register messsage listener
    _l2Client.on('message', function(msg) {
      _logger.debug("new ctf message received: " + msg);
      
      var json = toJSON(msg);
      _logger.debug("toJSON: " + JSON.stringify(json));

      // collect the orders from snapshot response...
      if (json['ENUM.SRC.ID'] == 938 && json['SYMBOL.TICKER'] == "E:566") {
        if (json['ASK.LEVEL.PRICE']) {
          // Sell Side...
          _sellOrders.push(json);
        } else if (json['BID.LEVEL.PRICE']) {
          // Buy Side...
          _buyOrders.unshift(json);
        }
      }
      
      if (json['ENUM.QUERY.STATUS'] == 0 && json['QUERY.TAG'] == _l2QueryTag) {
        // orderbook response done...
        _pendingL2Query = false;
        _logger.debug("Sell Side Orders: " + JSON.stringify(_sellOrders));
        _logger.debug("Buy Side Orders: " + JSON.stringify(_buyOrders));
        
        // make broker queue copies and clear them for processing...
        // update orderbook with broker queue information...
        // reset orderbook...
        var q = _buyBrokerQ.splice(0, _buyBrokerQ.length);
        updateBookWithBrokerQ(_buyOrders, q);
        _buyOrders = [];
        q = _sellBrokerQ.splice(0, _sellBrokerQ.length);
        updateBookWithBrokerQ(_sellOrders, q);
        _sellOrders = [];
      }
    });

    // send CTF commands
    csp.commands.forEach(function(cmd) {
      _l2Client.sendCommand(cmd);
    });
  });

  ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    _csvStream.end();
  });
}

/*
 * Update orderbook with broker queue information and write to a CSV file
*/
function updateBookWithBrokerQ(book, q) {
  q.forEach(function(item) {
    if (item.level <= book.length) {
      var order = book[item.level];
      order['MM.ID.INT'] = item.q;
      var res = {};
      config.l2.fields.forEach(function(field) {
        res[field] = order[field];
      });
      _csvStream.write(res);
    }
  });
}

/*
 */
function initNews (csp) {
  var ctfStream = net.createConnection(csp.port, csp.host, function() {
    _logger.info("established ctf connection with " + csp.host + " on port " + csp.port);

    // CTF Client Object
    _newsClient = ctf.createClient(ctfStream);

    // register messsage listener
    _newsClient.on('message', function(msg) {
      //_logger.debug("new ctf message received: " + msg);
      
      var json = toJSON(msg);
      //_logger.debug("toJSON: " + JSON.stringify(json));

      if (json['ENUM.SRC.ID'] == 13542) {
        // news message, collect broker queues...
        if (json['SYMBOL.TICKER'] == "566") {
          _logger.debug("toJSON: " + JSON.stringify(json));
          //"NEWS.STORY.TEXT":"&#13; Broker Queue at Level 0 from Best Price 5980 6386"
          var levelarr = json['NEWS.STORY.TEXT'].match(/Level [0-9]+/gi);
          if (levelarr) {
            // Level 0,
            var pricearr = levelarr[0].match(/[0-9]+/gi);
            if (pricearr) {
              // 0,
              var level = parseInt(pricearr[0]);
              var start = json['NEWS.STORY.TEXT'].search(/Best Price/gi);
              if (start) {
                var brokerstr = json['NEWS.STORY.TEXT'].substr(start);
                if (brokerstr) {
                  // Best Price 5980 6386,
                  var brokerq = brokerstr.match(/[0-9]+/g);
                  var item = {};
                  item.level = level;
                  item.q = brokerq;
                  //"NEWS.HEADLINE":"Broker Queue for securityCode 566 Sell Side"
                  if (json['NEWS.HEADLINE'].search(/buy/gi) != -1) {
                    // Buy side...
                    _logger.debug("Buy Side Broker Queue at Level " + item.level + " = " + item.q);
                    _buyBrokerQ.push(item);
                  } else if (json['NEWS.HEADLINE'].search(/sell/gi) != -1) {
                    // Sell side...
                    _logger.debug("Sell Side Broker Queue at Level " + item.level + " = " + item.q);
                    _sellBrokerQ.push(item);
                  }
                  
                  // request level 2 snapshot, if there is no pending query already...
                  if (!_pendingL2Query) {
                    _l2Client.sendCommand("5022=QueryDepth|4=938|5=E:566|5026="+_l2QueryTag);
                    _pendingL2Query = true;
                  }
                }
              }
            }
          }
        }
      }
    });

    // send CTF commands
    csp.commands.forEach(function(cmd) {
      _newsClient.sendCommand(cmd);
    });
  });

  ctfStream.addListener("end", function () {
    _logger.debug("ctf server disconnected...");
    _csvStream.end();
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
