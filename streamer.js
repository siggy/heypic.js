var https    = require('https')
  , base64   = require('./vendor/base64')
  , redis    = require("redis");

var USERNAME = process.env.TWITTER_USERNAME;
var PASSWORD = process.env.TWITTER_PASSWORD;

var headers = {
  'Authorization' : "Basic " + base64.encode(USERNAME + ':' + PASSWORD),
  'Host'          : "stream.twitter.com"
};

var request = https.request({
   host: "stream.twitter.com",
   port: 443,
   path: "/1/statuses/filter.json?locations=-180,-90,180,90&track=twitpic,yfrog,plixi,pic.twitter.com",
   method: "",
   headers: headers
 });

var TWEETS_LIST = "tweets_list";
var TWEET_READY = 'tweet_ready';
var redisClient = redis.createClient();

var stats = {
  tweets: 0,
};

var message = "";
request.addListener('response', function (response) {
  response.setEncoding("utf8");
  response.addListener("data", function (chunk) {
    message += chunk;

    var newlineIndex = message.indexOf('\r');
    if (newlineIndex !== -1) {
      var tweet = message.slice(0, newlineIndex);
      redisClient.rpush(TWEETS_LIST, tweet);
      stats.tweets += 1;
      process.stdout.write(".");
    }
    message = message.slice(newlineIndex + 1);
  });
});
request.end();

function printStats() {
  console.log("tweets\n  total: " + stats.tweets + "\n  droppedTweets: " + stats.droppedTweets + "\n  hasPic: " + stats.hasPic + "\n  hasGeo: " + stats.hasGeo);
  console.log("geo cache\n  hits: " + stats.geoCacheHits + "\n  misses: " + stats.geoCacheMisses + "\n  queryLimitSkips: " + stats.geoQueryLimitSkips);

  // redis.createClient().llen(TWEETS_LIST, function(err, len) {
  //   console.log("tweets_list length: " + len);
  // });
}
