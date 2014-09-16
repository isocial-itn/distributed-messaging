var PORT = 33333;
var HOST = '127.0.0.1';

var dgram = require('dgram');

var date = new Date();

var jsonData = {
  source: {
    user: "andres",
    url: "10.16.21.215"
  },
  user: "all",
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
/*
var num = 1;
var time = 1

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

sendDatagram(jsonData);
