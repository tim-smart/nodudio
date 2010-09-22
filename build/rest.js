var api, cacheKey, fs, pathm, redis, respondWith404, sendFile, setRangeHeaders, sys, utils;
sys = require('sys');
redis = require('./redis');
api = require('./api');
fs = require('fs');
pathm = require('path');
utils = require('./utils');
module.exports = function() {
  return function(request, response, next, path) {
    var _ref, action, id, resource;
    _ref = path.split('/');
    resource = _ref[0];
    id = _ref[1];
    action = _ref[2];
    return resource === 'song' && action === 'download' ? api.get('song', id, null, function(error, song) {
      if (error || !song.id) {
        return respondWith404(request, response);
      }
      return sendFile(request, response, song.get('path'));
    }) : api.getCache(resource, id, action, function(error, buffer) {
      if (error) {
        return respondWith404(request, response);
      }
      return response.sendJson(200, buffer);
    });
  };
};
sendFile = function(request, response, path) {
  return fs.stat(path, function(error, stat) {
    var file, headers, mime, read_opts;
    if (error) {
      return respondWith404(request, response);
    }
    mime = (function() {
      switch (pathm.extname(path)) {
        case '.m4a':
          return 'audio/mp4a-latm';
        default:
          return 'audio/mpeg';
      }
    })();
    read_opts = {
      bufferSize: 1024 * 64
    };
    headers = {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Last-Modified': stat.mtime.toUTCString(),
      'Expires': new Date(Date.now() + 31536000000).toUTCString(),
      'Cache-Control': 'public max-age=' + 31536000
    };
    if (request.headers['range']) {
      setRangeHeaders(request, stat, headers, read_opts);
      response.sendHeaders(206, headers);
    } else {
      response.sendHeaders(200, headers);
    }
    file = fs.createReadStream(path, read_opts);
    sys.pump(file, response);
    return file.on('end', function() {
      return response.end();
    });
  });
};
setRangeHeaders = function(request, stat, headers, read_opts) {
  var range;
  range = request.headers['range'].substring(6).split('-');
  read_opts.start = +range[0];
  read_opts.end = +range[1];
  if (range[1].length === 0) {
    read_opts.end = stat.size - 1;
  } else if (range[0].length === 0) {
    read_opts.end = stat.size - 1;
    read_opts.start = read_opts.end - +range[1] + 1;
  }
  headers['Accept-Ranges'] = 'bytes';
  headers['Content-Length'] = read_opts.end - read_opts.start + 1;
  return (headers['Content-Range'] = ("bytes " + (read_opts.start) + "-" + (read_opts.end) + "/" + (stat.size)));
};
respondWith404 = function(request, response) {
  return response.sendJson(404, {
    error: "Resource not found"
  });
};
cacheKey = (exports.makeCacheKey = function(resource, id, action) {
  var key;
  key = ['cache', resource];
  if (id) {
    key.push(id);
  }
  if (action) {
    key.push(action);
  }
  return key.join(':');
});