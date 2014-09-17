var UDPPORT = 33333;
var TCPPORT = 1337;
var HOST = '127.0.0.1';
var DB = 'dos';

var MESSAGES = 'messages';
var NOTIFICATIONS = 'notifications';

var dgram = require('dgram');
var udpServer = dgram.createSocket('udp4');
var net = require('net');
var http = require('http');
var MongoClient = require('mongodb').MongoClient;
var engine = require('engine.io');

var onlineUsers = {};

var createHTTPServer = function(db){
  var httpServer = http.createServer(function (req, res) {
    handleRequests(req, res, db);
  }).listen(TCPPORT, HOST);
  var engineServer = engine.attach(httpServer);
  setupEngineServer(engineServer);
  console.log('Server running at http://' + HOST + ':' + TCPPORT + '/');
};

var handleRequests = function(req, res, db){
  switch(req.url){
    case '/':
      req.method == 'POST'?
        handlePost(req, res, db, MESSAGES):
        handleJsonResponse(res, db, MESSAGES);
      break;
    case '/version':
      handleVersion(res);
      break;
    case '/notifications':
      handleJsonResponse(res, db, NOTIFICATIONS);
      break;
    default:
      handleNotFound(res);
  }
};

var handlePost = function(req, res, db, collectionName){
  var fullBody = '';
  req.on('data', function(chunk) {
    fullBody += chunk.toString();
  });
  req.on('end', function() {
    try{
      var data = JSON.parse(fullBody);
      postDataReady(res, data, db, collectionName);
    }
    catch(err){
      errorResponse(res);
    }
  });
};

var postDataReady = function(res, data, db, collectionName){
  (!data.source && !data.message)?
    errorResponse(res):
    handleData(res, data, db, collectionName);
};

var handleData = function(res, data, db, collectionName){
  var date = new Date();
  data.date = date.toString();
  var collection = db.collection(collectionName);
  collection.insert([data], {w: 1}, function(err, docsInserted){
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

var handleJsonResponse = function(res, db, collectionName){
  var collection = db.collection(collectionName);
  collection.find({}, {limit: 10}).toArray(function(err, results) {
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
  udpServer.on('listening', function () {
    var address = udpServer.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
  });
  udpServer.on('message', function (message, remote) {
    try{
      var data = JSON.parse(message);
      // console.log(remote.address + ':' + remote.port +' - ' + data.username + ': ' + data.post);
      addNotification(db, data);
      // determine if the user is online to send a message via ws
      pushNotification(data);
    }
    catch(er){
      console.log(er);
    }
  });
  udpServer.bind(UDPPORT, HOST);
};

var addNotification = function(db, data){
  var collection = db.collection(NOTIFICATIONS);
  collection.insert([data], {w: 1}, function(err, docsInserted){
    if (err) throw err;
    // something to do after the notification was added
  });
};

var pushNotification = function (notification){
  var ws = onlineUsers[notification.user];
  // send via the socket
  if(ws) ws.send(JSON.stringify(notification));
};

// Engine.io Server
var setupEngineServer = function(engineServer){
  engineServer.on('connection', function(socket){
    // socket.send('utf 8 string').close();
    // socket.send(new Buffer([0, 1, 2, 3, 4, 5])); // binary data
    socket.on('message', parseWS);
  });
};

var parseWS = function(buff){
  // console.log("Message from ws : " + data.toString());
  try{
    var data = JSON.parse(buff);
    (!data.user)? this.close(): userInWS(data, this);
  }catch(err){
    this.close();
  }
};

var userInWS = function(data, socket){
  onlineUsers[data.user] = socket;
  socket.send("OK");
  // remove the web socket instance when the user closes the connection
  socket.on('close', function(){
    onlineUsers[data.user] = null; // null pointer
    delete onlineUsers[data.user]; // remove property
  });
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
MongoClient.connect('mongodb://127.0.0.1:27017/' + DB, createServers);

