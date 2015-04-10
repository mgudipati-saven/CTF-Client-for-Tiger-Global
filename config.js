var config = {}

config.l2 = {}
config.l2.ofile = "./hkl2.csv"
config.l2.host="198.190.11.21"
config.l2.port=4012
config.l2.fields = [
  'QUOTE.DATETIME', 
  'SYMBOL.TICKER',
  'PRICE.LEVEL',
  'BID.LEVEL.PRICE', 
  'ASK.LEVEL.PRICE',
  'MM.ID.INT'
]
config.l2.symbols = [
  '566'
]
config.l2.commands = [
  "5022=LoginUser|5028=tiger|5029=tiger|5026=1",
  "5022=SelectAvailableTokens|5026=2",
  //"5022=QueryDepth|4=938|5=E:566|5026=4",
]

config.news = {}
config.news.host="198.190.11.31"
config.news.port=4002
config.news.commands = [
  "5022=LoginUser|5028=tiger|5029=tiger|5026=1",
  "5022=Subscribe|4=13542|5026=2",
]

config.ctf = {}
config.ctf.tokens="./tokens.dat"
config.ctf.host="198.190.11.31"
config.ctf.port=4002
config.ctf.commands = [
  "5022=LoginUser|5028=tiger|5029=tiger|5026=1",
  //"5022=LoginUser|5028=pfcanned|5029=cypress|5026=1",
  //"5022=LoginUser|5028=plusserver|5029=plusserver|5026=1",
  //"5022=ListAdministrationInfo|5026=2",
  //"5022=ListSystemPermission|5026=3",
  //"5022=ListUserPermission|5026=4",
  //"5022=SelectAvailableTokens|5026=5",
  //"5022=ListAvailableTokens|5026=6",
  //"5022=ListEnumeration|5026=7",
  //"5022=ListExchangeTokens|4=941|5026=8",
  //"5022=SelectUserTokens|5035=5|5035=308|5035=378|5026=9",
  //"5022=ListUserTokens|5026=10",
  //"5022=QuerySnap|4=941|5=E:TCS.EQ|5026=11",
  //"5022=QuerySnap|4=1057|5=IBM|5026=11",
  //"5022=QuerySnap|4=941|5026=11",
  //"5022=QuerySnap|4=938|5=E:941|5026=11",
  //"5022=QuerySnap|4=922|5=.UTC.TIME.DATE|5026=11",
  "5022=Subscribe|4=13542|5026=12",
  //"5022=Unsubscribe|5026=13",
  //"5022=SelectOutput|5018=ON|5026=14",
  //"5022=ListSplitExchanges|5026=15",
  //"5022=QueryWildCard|4=941|3177={machine}|5026=16",
  //"5022=QuerySubscribedExchanges|5026=17",
  //"5022=QuerySubscribedSymbols|5026=18",
  //"5022=ListSubscribedExchanges|5026=19",
  //"5022=ListSubscribedNews|5026=20",
  //"5022=ListSubscribedSymbols|5026=21",
  //"5022=QuerySnapAndSubscribe|4=1057|5026=22",
  //"5022=QuerySnapAndSubscribe|4=941|5=E:TCS.EQ|5026=22",
  //"5022=QueryDepth|4=328|5=IBM|5026=24",
  //"5022=QuerySnapAndSubscribe|4=938|5=E:941|5026=11",
  //"5022=QueryDepth|4=938|5=E:560|5026=11",
  //"5022=QueryDepth|4=938|5=E:566|5026=11",
  //"5022=QueryDepth|4=938|5026=11",
  //"5022=QueryDepthAndSubscribe|4=328|5=IBM|5026=23",
  //"5022=QueryTasDates|5026=24",
  //"5022=QueryTas|4=1057|5=IBM|5026=25"
  //"5022=QueryTas|5040=CORRECTED|4=558|5=IBM|5026=6|5045=100",
  //"5022=QueryDepthAndSubscribe|4=249|5=IBM|5026=7",
  //"5022=QueryCorrections|5042=1223546400|5049=1224151200|4=558|5=IBM|5026=10",
  //"5022=QueryHistory|49227=1223546400|49228=1224151200|4=558|5=IBM|5026=11",
  //"5022=QueryHistory|49227=1214904600|49228=1225272600|4=558|5=IBM|5026=12",
  //"5022=QueryInterval|5043=10|5042=1223546400|5049=1224151200|4=558|5=IBM|5026=13",
  //"5022=QueryTas|7=P|5042=1223546400|5049=1224151200|49168=Q|5040=CORRECTED|4=558|5=IBM|5026=14",
  //"5022=QueryTas|7=P|5042=1223546400|5049=1224151200|5040=CORRECTED|4=558|5=IBM|5026=15",
  //"5022=QueryTas|5042=1224669600|5049=1224680400|49168=B|5040=CORRECTED|4=558|5=IBM|5026=16",
  //"5022=QueryTas|5042=1224669600|5049=1224680400|49168=T|5040=corrected|4=558|5=IBM|5026=17",
  //"5022=QueryTas|5042=1224669600|5049=1224680400|49168=T|5040=uncorrected|4=558|5=IBM|5026=18",
  //"5022=QueryTas|5042=1224669600|5049=1224680400|5040=CORRECTED|4=558|5=IBM|5026=19",
  //"5022=QueryTas|5042=1224669600|5049=1224680400|5040=CORRECTED|4=558|5=IBM|5026=20",
  //"5022=QueryTas|7=|5042=1225310400|5049=1225317600|5040=CORRECTED|4=558|5=IBM|5026=21",
  //"5022=QueryTas|7=|5042=1225704600|5049=1225715400|49168=B|5040=CORRECTED|4=558|5=IBM|5026=22"
]
module.exports = config;