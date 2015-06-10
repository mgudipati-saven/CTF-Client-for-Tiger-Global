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
    , _loginQueryTag = 999
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
        // collect the orders from market depth snapshot response...
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
        // ctf timestamp, save it...
        _ctfTimeStamp = json;
      }
      
      if (json['ENUM.QUERY.STATUS'] == 0) {
        var qtag = json['QUERY.TAG'];
        
        if (qtag == _loginQueryTag) {
          // successful login, start the timer to request level 2 data every interval seconds...
          setInterval(requestL2Data, 1000 * csp.interval);
          
          // send CTF commands
          csp.commands.forEach(function(cmd) {
            _l2Client.sendCommand(cmd);
          });
        } else {
          // check if the query tag belongs to a pending level 2 request...
          var sym = getSymbolForPendingQueryTag(qtag);
          if (sym) {
            // orderbook response done...
            _logger.debug("Sell Side Orders: " + JSON.stringify(_sellOrders[sym]));
            _logger.debug("Buy Side Orders: " + JSON.stringify(_buyOrders[sym]));

            // purge query tag for this symbol...
            deleteQueryTagForSymbol(sym);
        
            // update orderbook with broker queue information...
            if (_buyBrokerQ[sym]) {
              updateBookWithBrokerQ(_buyOrders[sym], _buyBrokerQ[sym]);
              printBook(_buyOrders[sym]);
            }
          
            if (_sellBrokerQ[sym]) {
              updateBookWithBrokerQ(_sellOrders[sym], _sellBrokerQ[sym]);
              printBook(_sellOrders[sym]);
            }
          }
        }
      }
    });
    
    // send login command...
    _l2Client.sendCommand("5022=LoginUser|5028=" + csp.user + "|5029=" + csp.password + "|5026=" + _loginQueryTag);
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
    book.forEach(function(order, level) {
      order['PRICE.LEVEL'] = level;
      order['MM.ID.INT'] = q[level];
      order['CURRENT.DATETIME'] = _ctfTimeStamp != null ? _ctfTimeStamp['CURRENT.DATETIME'] : order['QUOTE.DATETIME'];
    });
  }
}

/*
 */
function printBook(book) {
  book.forEach(function(order) {
    var res = {};
    config.l2.fields.forEach(function(field) {
      res[field] = order[field];
    });
    _csvStream.write(res);
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
                      updateBrokerQForSym(_buyBrokerQ, sym, item);
                    } else if (json['NEWS.HEADLINE'].search(/sell/gi) != -1) {
                      // Sell side...
                      updateBrokerQForSym(_sellBrokerQ, sym, item);
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

/*
 */
function updateBrokerQForSym(q, sym, item) {
  if (typeof q[sym] === 'undefined') {
    q[sym] = {};
  }
  q[sym][item.level] = item.q;
}

/*
 */
function requestL2Data() {
  _l2Client.sendCommand("5022=QuerySnap|4=922|5=.UTC.TIME.DATE|5026=" + getNextQueryTag());
  config.l2.symbols.forEach(function(sym) {
    // request level 2 snapshot, if there is no pending query for this symbol...
    sym = "E:" + sym;
    if (getPendingQueryTagForSymbol(sym) == null) {
      var qtag = getNextQueryTag();
      _l2Client.sendCommand("5022=QueryDepth|4=938|5=" + sym + "|5026=" + qtag);
      setPendingQueryTagForSymbol(sym, qtag);
      
      // clear the books...
      _buyOrders[sym] = [];
      _sellOrders[sym] = [];
    }
  });
}