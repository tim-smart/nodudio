var DirectoryWalker, Task, crypto, directoryWalker, fs, path;
fs = require('fs');
path = require('path');
crypto = require('crypto');
Task = require('parallel').Task;
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
directoryWalker = (exports.directoryWalker = function(dir, callback, maxLevels, currentLevel, fromRoot) {
  maxLevels = 'number' === typeof maxLevels ? maxLevels : 0;
  currentLevel = 'number' === typeof currentLevel ? currentLevel : 1;
  fromRoot = 'string' === typeof fromRoot ? fromRoot : '';
  return fs.readdir(dir, function(error, files) {
    return error ? console.log(error.message) : files.forEach(function(file) {
      return fs.stat(path.join(dir, file), function(error, stats) {
        if (error) {
          return console.log(error.message);
        }
        if (stats.isDirectory()) {
          if (0 === maxLevels || maxLevels > currentLevel) {
            directoryWalker(path.join(dir, file), callback, maxLevels, 1 + currentLevel, fromRoot + file + '/');
          }
        }
        return callback.call(stats, file, fromRoot, path.join(dir, file), stats);
      });
    });
  });
});