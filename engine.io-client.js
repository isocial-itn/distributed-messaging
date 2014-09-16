var socket = require('engine.io-client')('ws://127.0.0.1:1337');

socket.on('open', function(){
  
  socket.send(JSON.stringify({user: 'andres'}));
  
  socket.on('message', function(data){
    console.log("Message from ws : " + data.toString());
  });
    
  socket.on('close', function(){
    console.log("Connection ws closed");
  });
});

