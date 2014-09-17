/*
Based on Hack Sparrow's example:
Node.js UDP Server and Client Example
Available at http://www.hacksparrow.com/node-js-udp-server-and-client-example.html
*/

var PORT = 33333;
var HOST = '127.0.0.1';

var dgram = require('dgram');

var date = new Date();

var jsonData = {
  source: {
    user: "pi",
    url: "10.16.21.214"
  },
  user: "andres",
  date: date.toString()
};


var sendDatagram = function(jsonData){
  var buff = new Buffer(JSON.stringify(jsonData));
  var client = dgram.createSocket('udp4');
  client.send(buff, 0, buff.length, PORT, HOST, function(err, bytes) {
    if (err) throw err;
    console.log('UDP notification sent to ' + HOST +':'+ PORT);
    client.close();
  });
};

// call the method to send the datagram
sendDatagram(jsonData);

/*
The next part is an addition to simulate several concurrent connections and test performance.
*/

// Uncomment if needed for perfomance testing.
/*
var num = 1; // number of clients to emulate
var time = 1 // the duration of the test

var clients = [];
for (var i = 0; i <= num; i ++){
  //clients.push(setInterval(function(){
    sendDatagram(jsonData);
  }, 250));
}

setTimeout(function(){
  for (var i = 0; i <= num; i ++){
    clearInterval(clients[i]);
  }
  console.log('UDP clients finished');
}, time * 1000);

console.log('UDP clients begin ' + num + ' instances for ' + time + ' seconds' );
*/

