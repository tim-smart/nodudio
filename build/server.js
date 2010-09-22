var Package, api, config, handleResult, redis, router, socket, utils, ws;
router = new (require('biggie-router'))();
ws = require('websocket-server');
config = require('./config');
redis = require('./redis');
api = require('./api');
utils = require('./utils');
Package = require('node-asset').Package;
require('./service');
Buffer.poolSize = 1024 * 1024 * 1;
router.addModule('nodudio', __dirname + '/rest');
router.bind(function(request, response, next) {
  console.log("[HTTP] " + request.method + " " + request.url);
  return next();
});
router.all(/^\/api\/?(.*)$/).module('nodudio');
router.get('/').bind(function(request, response, next) {
  request.url = '/index.html';
  return next();
});
router.get(/^\/.*\.(css|js|html).*?$/).module('gzip').module('static', __dirname + '/../public');
router.module('sendfile', __dirname + '/../public').bind(function(request, response) {
  return response.sendBody(404, 'Asset not found: ' + request.url);
});
router.listen(config.http_port);
socket = (exports.socket = ws.createServer({
  server: router
}));
socket.on('connection', function(client) {
  return client.on('message', function(message) {
    var cache_key, data, id, index;
    if (~(index = message.indexOf('|'))) {
      data = message.slice(index + 1);
      message = message.slice(0, index).split(':');
    } else {
      message = message.split(':');
    }
    console.log("[WebSocket] " + (message.join(':')));
    id = message.shift();
    switch (message[0]) {
      case 'get':
        cache_key = utils.makeCacheKey(message[1], message[2], message[3]);
        return !api.cache[cache_key] ? api.get(message[1], message[2], message[3], function(error, result) {
          if (error) {
            return client.send("" + (id) + ":error|" + (error.toString()));
          }
          result = handleResult(result);
          result = JSON.stringify(result);
          client.send("" + (id) + "|" + (result));
          return (api.cache[cache_key] = new Buffer(result));
        }) : client.send("" + (id) + "|" + (api.cache[cache_key].toString()));
    }
  });
});
handleResult = function(result) {
  var _i, _len, _ref, _result, model;
  if (Buffer.isBuffer(result)) {
    return result.toString();
  } else if (Array.isArray(result)) {
    result = (function() {
      _result = []; _ref = result;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        model = _ref[_i];
        _result.push((function() {
          model.data.path = undefined;
          return model.data;
        })());
      }
      return _result;
    })();
    return result;
  } else if (result.data) {
    return result.toObject();
  } else {
    return result;
  }
};