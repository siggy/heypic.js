var arrays   = require('./vendor/arrays')
  , express  = require('express')
  , sio      = require('socket.io')
  , redis    = require("redis");

var clients = [];

var HEYPIC_PUBSUB = "heypic_pubsub";
var redisClient = redis.createClient();
redisClient.subscribe(HEYPIC_PUBSUB);

redisClient.on("message", function (channel, message) {
  clients.forEach(function(client) {
    client.send(message);
  });
});

var app = express.createServer();
var io  = sio.listen(app);

app.listen(8124);

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

io.sockets.on('connection', function (socket) {
  console.log('connection: ' + socket);

  clients.push(socket);

  socket.on('disconnect', function () {
    console.log('disconnect: ' + socket);

    clients.remove(socket);
  });
});
