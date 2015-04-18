var https  = require('https')
  , base64 = require('./vendor/base64')
  , redis  = require("redis");

var USERNAME = "heypicme";
var PASSWORD = "heypic123";

var headers = {
  'Authorization' : "Basic " + base64.encode(USERNAME + ':' + PASSWORD),
  'Host'          : "stream.twitter.com"
};

var request = https.request({
   host: "stream.twitter.com",
   port: 443,
   path: "/1/statuses/filter.json?locations=-180,-90,180,90&track=twitpic,yfrog,plixi,photo",
   method: "",
   headers: headers
 });

var TWEETS_LIST = "tweets_list";
var redisClient = redis.createClient();

request.addListener('response', function (response) {
  response.setEncoding("utf8");
  response.addListener("data", function (chunk) {
    redisClient.rpush(TWEETS_LIST, chunk);
    process.stdout.write(".");
  });
});
request.end();
