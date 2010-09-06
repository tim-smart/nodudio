var Package, api, config, handleResult, redis, router, socket, utils, ws;
router = new (require('biggie-router'))();
ws = require('websocket-server');
config = require('./config');
redis = require('./redis');
api = require('./api');
utils = require('./utils');
Package = require('node-asset').Package;
require('./service');
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
router.get(/^\/.*\.(js|css|html).*$/).module('gzip');
router.module('static', __dirname + '/../public').bind(function(request, response) {
  return response.sendBody(404, 'Asset not found: ' + request.url);
});
router.listen(config.http_port);
socket = (exports.socket = ws.createServer({
  server: router
}));
socket.on('connection', function(client) {
  return client.on('message', function(message) {
    var _a, cache_key, data, id, index;
    if (~(index = message.indexOf('|'))) {
      data = message.slice(index + 1);
      message = message.slice(0, index).split(':');
    } else {
      message = message.split(':');
    }
    console.log("[WebSocket] " + (message.join(':')));
    id = message.shift();
    if ((_a = message[0]) === 'get') {
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
  var _a, _b, _c, _d, model;
  if (Buffer.isBuffer(result)) {
    return result.toString();
  } else if (Array.isArray(result)) {
    result = (function() {
      _a = []; _c = result;
      for (_b = 0, _d = _c.length; _b < _d; _b++) {
        model = _c[_b];
        _a.push((function() {
          model.data.path = undefined;
          return model.data;
        })());
      }
      return _a;
    })();
    return result;
  } else if (result.data) {
    return result.toObject();
  } else {
    return result;
  }
};