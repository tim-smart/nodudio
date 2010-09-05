var api, fs, handleResult, pathm, redis, respondWith404, sendFile, setRangeHeaders;
redis = require('./redis');
api = require('./api');
fs = require('fs');
pathm = require('path');
module.exports = function() {
  return function(request, response, next, path) {
    var _a, action, id, resource;
    _a = path.split('/');
    resource = _a[0];
    id = _a[1];
    action = _a[2];
    return redis.getCache(resource, id, action, function(error, cache) {
      console.log(!!cache);
      if (error || !cache) {
        return resource === 'song' && action === 'download' ? api.get('song', id, null, function(error, song) {
          if (error || !song.id) {
            return respondWith404(request, response);
          }
          return sendFile(request, response, song.get('path'));
        }) : api.get(resource, id, action, function(error, result) {
          if (error) {
            return respondWith404(request, response);
          }
          result = handleResult(request, response, result);
          redis.setCache(resource, id, action, result, function() {});
          return response.sendJson(200, result);
        });
      } else {
        response.sendHeaders({
          'Content-Type': 'application/json'
        });
        return response.end(cache);
      }
    });
  };
};
handleResult = function(request, response, result) {
  var _a, _b, _c, _d, model;
  if (Buffer.isBuffer(result)) {
    return result.toString();
  } else if (Array.isArray(result)) {
    result = (function() {
      _a = []; _c = result;
      for (_b = 0, _d = _c.length; _b < _d; _b++) {
        model = _c[_b];
        _a.push(model.toObject());
      }
      return _a;
    })();
    result.path = undefined;
    return result;
  } else if (result.toObject) {
    return result.toObject();
  }
};
sendFile = function(request, response, path) {
  return fs.stat(path, function(error, stat) {
    var _a, file, headers, mime, read_opts;
    if (error) {
      return respondWith404(request, response);
    }
    mime = (function() {
      if ((_a = pathm.extname(path)) === '.m4a') {
        return 'audio/mp4a-latm';
      } else {
        return 'audio/mpeg';
      }
    })();
    read_opts = {};
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