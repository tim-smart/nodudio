var Package, api, config, handleResult, io, redis, router, socket;
router = new (require('biggie-router'))();
io = require('socket.io');
config = require('./config');
redis = require('./redis');
api = require('./api');
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
socket = (exports.socket = io.listen(router));
process.setgid(1000);
process.setuid(1000);
socket.on('connection', function(client) {
  return client.on('message', function(message) {
    var _a, data, id, index;
    if (index = message.indexOf('|')) {
      data = message.slice(index + 1);
      message = message.slice(0, index).split(':');
    } else {
      message = message.split(':');
    }
    id = message.shift();
    if ((_a = message[0]) === 'get') {
      return api.get(message[1], message[2], message[3], function(error, result) {
        if (error) {
          return client.send("" + (id) + ":error|" + (error.toString()));
        }
        result = handleResult(result);
        return client.send("" + (id) + "|" + (JSON.stringify(result)));
      });
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
        _a.push(model.data);
      }
      return _a;
    })();
    result.path = undefined;
    return result;
  } else if (result.data) {
    return result.data;
  } else {
    return result;
  }
};