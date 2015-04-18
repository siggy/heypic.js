var sys      = require('sys')
  , arrays   = require('./vendor/arrays')
  , redis    = require("redis")
  , geocoder = require('geocoder')
  , buffer   = require("buffer");

var TWEETS_LIST_MAX = 500;
var TWEETS_LIST = "tweets_list";
var HEYPIC_PUBSUB = "heypic_pubsub";
var GEO_HASH = 'geo';
var redisClient = redis.createClient();

var stats = {
  tweets: 0,
  droppedTweets: 0,
  hasGeo: 0,
  hasPic: 0,
  geoQueryLimitSkips: 0,
  geoCacheHits: 0,
  geoCacheMisses: 0
};


function indexOf(buf, len, c) {
  var i = 0;
  for (i = 0; i < len; i++) {
    if (buf[i] == c) {
      return i;
    }
  }
  return -1;
}

var MAX_BUFFER_LEN = 16777216;
var WARN_BUFFER_LEN = MAX_BUFFER_LEN * 0.9;
var buf = new buffer.Buffer(MAX_BUFFER_LEN);
var bufLen = 0;
var newlineIndex = 0;
var newlineCode = "\r".charCodeAt(0);

setInterval(function() {
  redisClient.rpop(TWEETS_LIST, function(err, result) {
    if (result == null) {
      return;
    }

    bufLen += buf.write(result, bufLen);

    newlineIndex = indexOf(buf, bufLen, newlineCode);
    while (newlineIndex != -1) {

      stats.tweets += 1;

      var json = JSON.parse(buf.slice(0, newlineIndex).toString('utf8'));
      if ( (json.entities && ((json.entities.urls && json.entities.urls.length) || json.entities.media)) &&
          (json.geo || json.place || json.user.location)
        ) {
        processPic(json);
      }

      buf.copy(buf, 0, newlineIndex + 1, bufLen);
      bufLen -= (newlineIndex + 1);
      newlineIndex = indexOf(buf, bufLen, newlineCode);
    };

    if (bufLen > WARN_BUFFER_LEN) {
      console.log('buffer getting too large');
      bufLen = 0;
    }

    if (stats.tweets % 100 == 0) {
      redisClient.llen(TWEETS_LIST, function(err, len) {
        if (len > TWEETS_LIST_MAX) {
          stats.droppedTweets += len
          console.log('tweets_list at max size, trimming');
          redisClient.ltrim(TWEETS_LIST, 0, 0, function(err, results) {});
        }
      });
    }

    printStats();
  });
}, 10);

function processPic(json) {
  if (!json.entities.media && !json.entities.urls.length) {
    return;
  }

  if (json.entities.media) {
    json.hpm_thumb_url = json.entities.media[0].media_url_https + ":thumb";
    json.hpm_image_url = json.entities.media[0].media_url_https;
    json.hpm_url = json.entities.media[0].url;
  }

  if (json.entities.urls.length && !json.hpm_image_url) {
    var i = 0;
    for (i = 0; i < json.entities.urls.length; i++) {
      var url = json.entities.urls[i].url;
      var expandedUrl = json.entities.urls[i].expanded_url;
      if (!expandedUrl) {
        expandedUrl = url;
      }
      if (expandedUrl.indexOf('twitpic') != -1) {
        json.hpm_url = url;
        json.hpm_thumb_url = expandedUrl.replace('twitpic.com/','twitpic.com/show/thumb/');
        json.hpm_image_url = expandedUrl;
      }
      else if (expandedUrl.indexOf('yfrog') != -1) {
        json.hpm_url = url;
        json.hpm_thumb_url = expandedUrl + ':small';
        json.hpm_image_url = expandedUrl;
      }
      else if (expandedUrl.indexOf('plixi') != -1) {
        json.hpm_url = url;
        json.hpm_thumb_url = 'http://api.plixi.com/api/tpapi.svc/imagefromurl?size=thumbnail&url=' + expandedUrl;
        json.hpm_image_url = expandedUrl;
      }

      if (json.hpm_image_url) {
        break;
      }
    }
  }

  if (json.hpm_image_url) {
    stats.hasPic++;

    processGeo(json);
  }
}

function processGeo(json) {
  if (!json.geo && !json.place && !json.user.location) {
    return;
  }

  if (json.geo) {
    json.hpm_lat = json.geo.coordinates[0];
    json.hpm_lon = json.geo.coordinates[1];
  }

  if (json.place && json.place.bounding_box && !json.hpm_lat) {
    var min_lat = 90;
    var min_lon = 180;
    var max_lat = -90;
    var max_lon = -180;

    var i = 0;
    for (i = 0; i < json.place.bounding_box.coordinates[0].length; i++) {
      var lat = parseFloat(json.place.bounding_box.coordinates[0][i][1]);
      var lon = parseFloat(json.place.bounding_box.coordinates[0][i][0]);
      if (lat < min_lat) {
        min_lat = lat;
      }

      if (lon < min_lon) {
        min_lon = lon;
      }

      if (lat > max_lat) {
        max_lat = lat;
      }

      if (lon > max_lon) {
        max_lon = lon;
      }
    }

    json.hpm_lat = (max_lat + min_lat) / 2;
    json.hpm_lon = (max_lon + min_lon) / 2;
  }

  if (json.hpm_lat) {
    dispatchTweet(json);

    stats.hasGeo++;
  } else if (json.user.location) {
    // async
    return geocode(json);
  }
}

var backoff = 1000;
var nextTry = 0;

function geocode(json) {
  redisClient.hget(GEO_HASH, json.user.location, function (err, location) {
    if (location != null) {
      stats.hasGeo++;
      stats.geoCacheHits++

      var arr = location.split(",");
      json.hpm_lat = arr[0];
      json.hpm_lon = arr[1];
      dispatchTweet(json);
    }
    else {
      stats.geoCacheMisses++;

      if (new Date().getTime() < nextTry) {
        stats.geoQueryLimitSkips++;
        return;
      }

      geocoder.geocode(json.user.location, function ( err, data ) {
        if (data.status == "OVER_QUERY_LIMIT") {
          console.log("geocode: sleeping for " + backoff / 1000 + " seconds");
          nextTry = new Date().getTime() + backoff;
          backoff *= 2;
        }
        else if (data.status == "OK") {
          stats.hasGeo++;
          redisClient.hset(GEO_HASH, json.user.location, data.results[0].geometry.location.lat + "," + data.results[0].geometry.location.lng);
          backoff = 1000;
          nextTry = 0;

          json.hpm_lat = data.results[0].geometry.location.lat;
          json.hpm_lon = data.results[0].geometry.location.lng;
          dispatchTweet(json);
        }
      });
    }
  });
}

function dispatchTweet(json) {
  redisClient.publish(HEYPIC_PUBSUB, JSON.stringify(json));
}

function printStats() {
  redisClient.llen(TWEETS_LIST, function(err, tweetsListLen) {
    console.log("tweets_list length: " + tweetsListLen);
    console.log("tweets\n  total: " + stats.tweets + "\n  droppedTweets: " + stats.droppedTweets + "\n  hasPic: " + stats.hasPic + "\n  hasGeo: " + stats.hasGeo);
    console.log("geo cache\n  hits: " + stats.geoCacheHits + "\n  misses: " + stats.geoCacheMisses + "\n  queryLimitSkips: " + stats.geoQueryLimitSkips);
  });
}
