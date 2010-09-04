var crypto, directoryWalker, fs, path;
fs = require('fs');
path = require('path');
crypto = require('crypto');
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