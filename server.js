var UDPPORT = 33333;
var TCPPORT = 1337;
var HOST = '127.0.0.1';

var MESSAGES = 'messages';
var NOTIFICATIONS = 'notifications';

var dgram = require('dgram');
var server = dgram.createSocket('udp4');
var net = require('net');
var http = require('http');
var MongoClient = require('mongodb').MongoClient;

var createHTTPServer = function(db){
  http.createServer(function (req, res) {
    handleRequests(req, res, db);
  }).listen(TCPPORT, HOST);
  console.log('Server running at http://' + HOST + ':' + TCPPORT + '/');
};

var handleRequests = function(req, res, db){
  switch(req.url){
    case '/':
      req.method == 'POST'?
        handlePost(req, res, db, MESSAGES):
        handleJsonResponseMESSAGES(res, db, MESSAGES);
      break;
    case '/version':
      handleVersion(res);
      break;
    case '/notifications':
      handleJsonResponseMESSAGES(res, db, NOTIFICATIONS);
      break;
    default:
      handleNotFound(res);
  }
};

var handlePost = function(req, res, db, MESSAGESName){
  var fullBody = '';
  req.on('data', function(chunk) {
    fullBody += chunk.toString();
  });
  req.on('end', function() {
    try{
      var data = JSON.parse(fullBody);
      postDataReady(res, data, db, MESSAGESName);
    }
    catch(err){
      errorResponse(res);
    }
  });
};

var postDataReady = function(res, data, db, MESSAGESName){
  (!data.source && !data.message)?
    errorResponse(res):
    handleData(res, data, db, MESSAGESName);
};

var handleData = function(res, data, db, MESSAGESName){
  var date = new Date();
  data.date = date.toString();
  var MESSAGES = db.MESSAGES(MESSAGESName);
  MESSAGES.insert([data], {w: 1}, function(err, docsInserted){
    err?
      errorResponse(res):
      onMessageAdded(res, docsInserted);
  });
}

var onMessageAdded = function(res, docsInserted){
  sendResponse(res, serializeResults(docsInserted));
  // notify the readers
  // remember the format
  // "readers" : [  {  "url" : "10.16.21.214",  "users" : [  "pi" ] } ]
  var message = docsInserted[0];
  var source = message.source;
  var readers = message.readers;
  var reader, users, user, url, buff;
  var queue = [];
  var date = new Date();
  for(var i = 0; i < readers.length; i++){
    reader = readers[i];
    users = reader.users;
    url = reader.url;
    
    for(var j = 0; j < users.length; j++){
      user = users[j];
      queue.push({
        buff: new Buffer(JSON.stringify({
          source: source,
          user: user,
          date: date.toString()
        })),
        url: url
      }); // close push to the queue
    } // close for loop for users
  } // close for loop for readers
  // at this point we send the UDP datagrams
  var datagram;
  // there will be a small delay on the propagation to a large set of readers
  // but this we will ensure that the server remains more responsive
  for(var i = 0; i < queue.length; i ++){
    datagram = queue[i];
    setTimeout(function(){
      sendDatagram(datagram.buff, datagram.url);
    }, i * 5);
  }
};

var sendDatagram = function(buff, host){
  var client = dgram.createSocket('udp4');
  client.send(buff, 0, buff.length, UDPPORT, host, function(err, bytes) {
    if (err) throw err;
    // console.log('UDP message sent to ' + host +':'+ UDPPORT);
    client.close();
  });
};

var handleJsonResponseMESSAGES = function(res, db, MESSAGESName){
  var MESSAGES = db.MESSAGES(MESSAGESName);
  MESSAGES.find({}, {limit: 10}).toArray(function(err, results) {
    if(err) throw err;
    sendResponse(res, serializeResults(results));
    // we do not close it, let the server take care of it when we kill it
    // db.close();
  });
};

var serializeResults = function(results){
  var data = JSON.stringify(results, null, '\t');
  return data;
};

var sendResponse = function(res, data){
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(data + '\n');
};

var errorResponse = function(res){
  var message = serializeResults({error: "not a valid POST request"});
  res.writeHead(504, "Not found", {'Content-Type': 'application/json'});
  res.end(message + '\n');
};

var handleVersion = function(res){
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(serializeResults({version: "0.1.2"}));
};

var handleNotFound = function(res){
  res.writeHead(404, "Not found", {'Content-Type': 'application/json'});
  res.end(serializeResults({message: "not found"}));
};

// UDP notification server
var createUDPServer = function(db){
  server.on('listening', function () {
    var address = server.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
  });
  server.on('message', function (message, remote) {
    try{
      var data = JSON.parse(message);
      // Database test
      var MESSAGES = db.MESSAGES(NOTIFICATIONS);
      MESSAGES.insert([data], {w: 1}, function(err, docsInserted){
        if (err) throw err;
      });
      // console.log(remote.address + ':' + remote.port +' - ' + data.username + ': ' + data.post);
    }
    catch(er){
      console.log(er);
    }
  });
  server.bind(UDPPORT, HOST);
};

// Run UDP and HTTP services
var createServers = function (err, db){
  if(err) throw err;
  // if no errors connecting to the db then create the servers
  createHTTPServer(db);
  createUDPServer(db);
};

// first connect to the db
// then create the HTTP server
MongoClient.connect('mongodb://127.0.0.1:27017/dos', createServers);

