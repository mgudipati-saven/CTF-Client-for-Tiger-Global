var fs = require('fs')
  , net = require('net')
  , events = require('events')
  , util = require('util')
  , winston = require('winston')
  , csv = require('fast-csv')
  , redis = require('redis')
  , ctf = require('./ctf')
  , config = require('./config')
  , myutil = require('./util');

  // global .UTC.TIME.DATE from CSP
  var _ctfTimeStamp = null;

  // global ctf token defintions
  var _tokenDefs = null;

  // global l2 client
  var _l2Client = null;
  
  // global news client
  var _newsClient = null;
  
  // global query tag queue for pending level 2 responses, ticker symbol => query tag
  var _pendingQueryTag = {}
    , _nextQueryTag = 1000;
  
  // global csv stream
  var _csvStream = csv.format({headers: true});
  _csvStream.pipe(fs.createWriteStream(config.l2.ofile));
  
  // global orderbooks
  var _buyOrders = {}
    , _sellOrders = {};
  
  // global broker queues
    var _buyBrokerQ = {}
    , _sellBrokerQ = {};

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
      filename: './hkl2.log' 
    })
  ]
});

 
// Load CTF Token Definitions, also known as data dictionary from tokens.dat file
_tokenDefs = myutil.loadCTFTokens(config.ctf.tokens);

// Initialize L2 Connection
initL2(config.l2);

// Initialize News Connection
initNews(config.news);

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
      
      var json = myutil.toJSON(msg, _tokenDefs);
      _logger.debug("toJSON: " + JSON.stringify(json));

      if (json['ENUM.SRC.ID'] == 938) {
        // collect the orders from snapshot response...
        var sym = json['SYMBOL.TICKER'];
        if (sym) {
          if (json['ASK.LEVEL.PRICE']) {
            // Sell Side...
            if (typeof _sellOrders[sym] === 'undefined') {
              _sellOrders[sym] = [];
            }
            _sellOrders[sym].push(json);
          } else if (json['BID.LEVEL.PRICE']) {
            // Buy Side...
            if (typeof _buyOrders[sym] === 'undefined') {
              _buyOrders[sym] = [];
            }
            _buyOrders[sym].unshift(json);
          }
        }
      } else if (json['ENUM.SRC.ID'] == 922) {
        // ctf network timestamp in UTC format
        _ctfTimeStamp = json;
      }
      
      if (json['ENUM.QUERY.STATUS'] == 0) {
        var qtag = json['QUERY.TAG'];
        
        // check if the query tag belongs to a pending level 2 request...
        var sym = getSymbolForPendingQueryTag(qtag);
        if (sym) {
          // orderbook response done...
          _logger.debug("Sell Side Orders: " + JSON.stringify(_sellOrders[sym]));
          _logger.debug("Buy Side Orders: " + JSON.stringify(_buyOrders[sym]));
        
          // make broker queue copies and clear them for processing...
          // update orderbook with broker queue information...
          // reset orderbook...
          if (_buyBrokerQ[sym]) {
            var q = _buyBrokerQ[sym].splice(0, _buyBrokerQ[sym].length);
            updateBookWithBrokerQ(_buyOrders[sym], q);
            _buyOrders[sym] = [];
          }
          
          if (_sellBrokerQ[sym]) {
            q = _sellBrokerQ[sym].splice(0, _sellBrokerQ[sym].length);
            updateBookWithBrokerQ(_sellOrders[sym], q);
            _sellOrders[sym] = [];
          }
          
          // purge query tag for this symbol...
          deleteQueryTagForSymbol(sym);
        }
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
  if (book && q) {
    q.forEach(function(item) {
      if (item.level <= book.length) {
        var order = book[item.level];
        if (order) {
          order['MM.ID.INT'] = item.q;
          order['PRICE.LEVEL'] = item.level;
          order['CURRENT.DATETIME'] = _ctfTimeStamp != null ? _ctfTimeStamp['CURRENT.DATETIME'] : order['QUOTE.DATETIME'];
          var res = {};
          config.l2.fields.forEach(function(field) {
            res[field] = order[field];
          });
          _csvStream.write(res);
        }
      }
    });
  }
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
      
      var json = myutil.toJSON(msg, _tokenDefs);
      //_logger.debug("toJSON: " + JSON.stringify(json));

      if (json['ENUM.SRC.ID'] == 13542) {
        // news message, collect broker queues...
        var sym = json['SYMBOL.TICKER'];
        if (sym) {
          if (config.l2.symbols.indexOf(json['SYMBOL.TICKER']) != -1) {
            _logger.debug("toJSON: " + JSON.stringify(json));
            sym = "E:" + sym;
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
                      if (typeof _buyBrokerQ[sym] === 'undefined') {
                        _buyBrokerQ[sym] = [];
                      }
                      _buyBrokerQ[sym].push(item);
                    } else if (json['NEWS.HEADLINE'].search(/sell/gi) != -1) {
                      // Sell side...
                      _logger.debug("Sell Side Broker Queue at Level " + item.level + " = " + item.q);
                      if (typeof _sellBrokerQ[sym] === 'undefined') {
                        _sellBrokerQ[sym] = [];
                      }
                      _sellBrokerQ[sym].push(item);
                    }
                  
                    // request level 2 snapshot, if there is no pending query already...
                    if (getPendingQueryTagForSymbol(sym) == null) {
                      var qtag = getNextQueryTag();
                      _l2Client.sendCommand("5022=QuerySnap|4=922|5=.UTC.TIME.DATE|5026=100");
                      _l2Client.sendCommand("5022=QueryDepth|4=938|5=" + sym + "|5026=" + qtag);
                      setPendingQueryTagForSymbol(sym, qtag);
                    }
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

/*
 */
function getNextQueryTag() {
  return ++_nextQueryTag;
}

/*
 */
function getPendingQueryTagForSymbol(sym) {
  if (typeof _pendingQueryTag[sym] === 'undefined') {
    return null;
  }
  
  return _pendingQueryTag[sym];
}

/*
 */
function getSymbolForPendingQueryTag(qtag) {
  for (var sym in _pendingQueryTag) {
    if (_pendingQueryTag.hasOwnProperty(sym)) {
      if (_pendingQueryTag[sym] == qtag) {
        return sym;
      }
    }
  }
  
  return null;
}

/*
 */
function setPendingQueryTagForSymbol(sym, qtag) {
  _pendingQueryTag[sym] = qtag;
}

/* 
 */
function deleteQueryTagForSymbol(sym) {
  if (_pendingQueryTag[sym]) {
    delete _pendingQueryTag[sym];
  }
}
