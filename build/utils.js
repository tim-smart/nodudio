var DirectoryWalker, FileSender, FreeList, Task, crypto, fs, ioWatchers, noop, path;
fs = require('fs');
path = require('path');
crypto = require('crypto');
Task = require('parallel').Task;
FreeList = require('freelist').FreeList;
noop = (exports.noop = function() {});
exports.idFromString = function(string) {
  return string.trim().toLowerCase().replace(/[^a-z0-9]+/ig, '-');
};
exports.md5 = function(string) {
  return crypto.createHash('md5').update(string).digest('hex');
};
exports.base64Encode = function(string) {
  return new Buffer(string, 'utf8').toString('base64');
};
exports.base64Decode = function(string) {
  return new Buffer(string, 'base64').toString('utf8');
};
exports.makeCacheKey = function(resource, id, action) {
  var key;
  key = ['cache', resource];
  if (id) {
    key.push(id);
  }
  if (action) {
    key.push(action);
  }
  return key.join(':');
};
DirectoryWalker = function(dir) {
  this.dir = dir;
  return this;
};
DirectoryWalker.prototype.counter = 0;
DirectoryWalker.prototype.run = function(callback) {
  this.callback = callback;
  return this.onDir(this.dir);
};
DirectoryWalker.prototype.onDir = function(dir) {
  var $;
  ++this.counter;
  $ = this;
  return fs.readdir(dir, function(error, files) {
    var _a, _b, _c, file, task;
    if (error) {
      --$.counter;
      if ($.counter <= 0) {
        $.callback();
      }
      return null;
    }
    task = new Task();
    _b = files;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      file = _b[_a];
      task.add(file, [fs.stat, path.join(dir, file)]);
    }
    return task.run(function(file, error, stat) {
      var file_path;
      if (!file) {
        --$.counter;
        if ($.counter <= 0) {
          return $.callback();
        }
      } else if (stat) {
        file_path = path.join(dir, file);
        if (stat.isDirectory()) {
          $.callback(file, file_path, stat, true);
          return $.onDir(file_path);
        }
        return $.callback(file, file_path, stat, false);
      }
    });
  });
};
exports.DirectoryWalker = DirectoryWalker;
ioWatchers = new FreeList('iowatcher', 100, function() {
  return new process.IOWatcher();
});
FileSender = function(fd, socket) {
  var $;
  this.socket = socket;
  this.fd = fd;
  this.watcher = ioWatchers.alloc();
  this.start = 0;
  this.length = 0;
  $ = this;
  this.watcher.callback = function(r, w) {
    return $.onDrain(r, w);
  };
  this.watcher.set(this.socket.fd, false, true);
  return this;
};
FileSender.prototype.send = function(start, length, cb) {
  this.callback = cb || noop;
  this.start = start;
  this.length = length || 0;
  return this.sendfile();
};
FileSender.prototype.sendfile = function() {
  var $;
  $ = this;
  if (this.socket.fd && this.fd) {
    return fs.sendfile(this.socket.fd, this.fd, this.start, this.length, function(e, b) {
      return $.onWrite(e, b);
    });
  }
  return this.onEnd();
};
FileSender.prototype.onWrite = function(error, bytes) {
  if (error) {
    switch (error.errno) {
    case process.EAGAIN:
      return this.watcher.start();
    case process.EPIPE:
      return this.onEnd();
    default:
      return this.onEnd(error);
    }
  }
  this.start += bytes;
  this.length -= bytes;
  if (this.length > 0) {
    return this.sendfile();
  }
  return this.onEnd();
};
FileSender.prototype.onDrain = function(readable, writable) {
  this.watcher.stop();
  return this.sendfile();
};
FileSender.prototype.onEnd = function(error) {
  this.callback(error);
  this.watcher.stop();
  this.watcher.callback = noop;
  ioWatchers.free(this.watcher);
  return fs.close(this.fd, noop);
};
exports.FileSender = FileSender;