var Album, Artist, ID3, Seq, Song, Task, addToQueue, cleanIndex, config, crypto, dirs, fs, fullScan, idFromString, isMedia, next, path_m, queue, queueUpdated, queue_callbacks, redis, saveAlbum, saveArtist, scanDirectory, serviceTask, utils, watchDirectory, working;
var __hasProp = Object.prototype.hasOwnProperty;
ID3 = require('id3');
redis = require('./redis');
utils = require('./utils');
config = require('./config');
fs = require('fs');
path_m = require('path');
Song = require('./model/song');
Artist = require('./model/artist');
Album = require('./model/album');
Task = require('parallel').Task;
Seq = require('parallel').Sequence;
crypto = require('crypto');
idFromString = utils.idFromString;
saveArtist = function(song, tags, cb) {
  var artist, done;
  artist = new Artist({
    name: song.get('artist_name')
  });
  redis.getLink('artist', artist.stringId(), function(error, result) {
    if (error) {
      return cb(error);
    }
    if (result) {
      artist.id = result.toString();
      return done();
    } else {
      return artist.save(done);
    }
  });
  return (done = function(error) {
    if (error) {
      return cb(error);
    }
    song.set('artist_id', artist.id);
    return saveAlbum(artist, song, tags, cb);
  });
};
saveAlbum = function(artist, song, tags, cb) {
  var album, saved, year;
  album = new Album({
    name: song.get('album_name'),
    artist_id: artist.id,
    artist_name: artist.get('name')
  });
  if (tags) {
    year = tags.get('year');
  }
  if (year) {
    album.set('year', year);
  }
  redis.getLink("album", album.stringId(), function(error, link) {
    if (error) {
      return cb(error);
    }
    if (link) {
      album.id = link.toString();
      return saved();
    } else {
      return album.save(saved);
    }
  });
  return (saved = function(error) {
    var link_task;
    if (error) {
      return cb(error);
    }
    song.set('album_id', album.id);
    link_task = new Task({
      artist: [artist.linkTo, album],
      artist2: [artist.linkTo, song],
      album: [album.linkTo, song]
    });
    error = null;
    return link_task.run(function(task, err) {
      if (err) {
        error = err;
      }
      if (!task) {
        if (error) {
          return cb(error);
        }
        return cb(null, song);
      }
    });
  });
};
working = false;
queue = [];
queue_callbacks = [];
addToQueue = function(filename, stat) {
  if (queue.indexOf(filename) === -1) {
    queue.unshift(filename);
  }
  return queueUpdated();
};
queueUpdated = function() {
  var _a, _b, _c, callback, done, parseSong, path, path_e, populate, saveSong, setTags, song, tags, updatePath;
  if (working) {
    return null;
  }
  if (queue.length === 0) {
    _b = queue_callbacks;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      callback = _b[_a];
      callback();
    }
    return (queue_callbacks = []);
  }
  working = true;
  path = queue.pop();
  path_e = encodeURI(path);
  tags = (song = null);
  redis.getLink('path', path_e, function(error, data) {
    if (error) {
      return null;
    }
    return data ? redis.getModel(new Song(), data.toString(), populate) : populate(null, new Song());
  });
  populate = function(error, song_model) {
    if (error) {
      return next();
    }
    song = song_model;
    return song.id ? next() : fs.readFile(path, parseSong);
  };
  parseSong = function(error, buffer) {
    if (error) {
      return redis.deleteLink('path', path_e, function() {
        return next();
      });
    }
    tags = new ID3(buffer);
    song.set('md5', utils.md5(buffer));
    return redis.getLink('song', song.stringId(), setTags);
  };
  setTags = function(error, result) {
    if (error) {
      return next();
    }
    if (result) {
      redis.getModel(new Song(), result.toString(), updatePath);
      return next();
    }
    tags.parse();
    song.set('name', (tags.get('title')) || 'Unknown');
    song.set('artist_name', (tags.get('artist')) || 'Unknown');
    song.set('album_name', (tags.get('album')) || 'Unknown');
    song.set('genre', (tags.get('genre')) || 'Unknown');
    song.set('track', (tags.get('track')) || '0');
    song.set('track', song.get('track').toString().split('/')[0]);
    song.set('rating', song.get('rating', 0));
    song.set('path', path);
    redis.getId('song', saveSong);
    return next();
  };
  saveSong = function(error, song_id) {
    if (error) {
      return next();
    }
    song.id = song_id.toString();
    return saveArtist(song, tags, done);
  };
  updatePath = function(error, song) {
    var task;
    if (error) {
      return null;
    }
    song.set('path', path);
    task = new Task({
      song: [redis.updateModelKey, song, 'path'],
      path: [redis.addLink, 'path', path_e, song.id]
    });
    return task.run(function() {});
  };
  return (done = function(error) {
    if (error) {
      return song.remove(function() {});
    } else {
      console.log("[Index] Added: " + (song.get('name')) + " - " + (song.get('artist_name')) + " (" + (song.get('album_name')) + ")");
      return song.save(function() {});
    }
  });
};
next = function() {
  working = false;
  return queueUpdated();
};
dirs = [];
watchDirectory = function(dir) {
  if (dirs.indexOf(dir) !== -1) {
    return null;
  }
  dirs.push(dir);
  return fs.watchFile(dir, function(current, previous) {
    return scanDirectory(dir);
  });
};
scanDirectory = function(dir, cb) {
  return fs.readdir(dir, function(error, list) {
    var _a, _b, _c, filename, task;
    if (error) {
      return null;
    }
    task = new Task();
    _b = list;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      filename = _b[_a];
      if (isMedia(filename)) {
        task.add(filename, [fs.stat, path_m.join(dir, filename)]);
      }
    }
    return task.run(function(filename, error, stat) {
      if (!task) {
        return cb();
      } else if (stat) {
        return stat.isDirectory() ? (function(dir) {
          return scanDirectory(dir, function() {
            return watchDirectory(dir);
          });
        })(path_m.join(dir, filename)) : addToQueue(path_m.join(dir, filename), stat);
      }
    });
  });
};
isMedia = function(filename) {
  return config.filetypes.indexOf(path_m.extname(filename)) !== -1;
};
fullScan = function(cb) {
  if (cb) {
    queue_callbacks.push(cb);
  }
  watchDirectory(config.music_dir);
  return utils.directoryWalker(config.music_dir, function(filename, dirname, path) {
    if (this.isDirectory()) {
      return watchDirectory(path);
    }
    return isMedia(filename) ? addToQueue(path, this) : null;
  });
};
cleanIndex = (exports.cleanIndex = function(cb) {
  var findMissingSongs, processSong, removeEmptyAlbums, removeEmptyArtists;
  findMissingSongs = function(error, songs) {
    var _a, _b, _c, id, song_task, task;
    if (error) {
      return cb(error);
    }
    task = new Task();
    song_task = new Task();
    _b = songs;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      id = _b[_a];
      id = id.toString();
      task.add(id, [redis.getModel, new Song(), id]);
    }
    return task.run(function(id, err, song) {
      if (!id) {
        return song_task.run(function(id) {
          if (!(id)) {
            return redis.getCollection('album', removeEmptyAlbums);
          }
        });
      } else if (song) {
        return song_task.add(id, [processSong, song]);
      }
    });
  };
  processSong = function(song, cb) {
    return fs.stat(song.get('path'), function(error, stat) {
      return error && song.id ? song.remove(cb) : cb();
    });
  };
  removeEmptyAlbums = function(error, albums) {
    var _a, _b, _c, get_task, id, remove_task, task;
    if (error) {
      return cb(error);
    }
    remove_task = new Task();
    get_task = new Task();
    task = new Task();
    _b = albums;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      id = _b[_a];
      id = id.toString();
      task.add(id, [redis.sCard, ("link:album:" + (id) + ":song")]);
    }
    return task.run(function(id, error, songs) {
      if (!id) {
        return get_task.run(function(id, error, album) {
          if (!id) {
            return remove_task.run(function(task) {
              if (!(task)) {
                return redis.getCollection('artist', removeEmptyArtists);
              }
            });
          } else if (album && album.id) {
            return remove_task.add(id, [album.remove]);
          }
        });
      } else if (songs && songs.length === 0) {
        return get_task.add(id, [redis.getModel, new Album(), id]);
      }
    });
  };
  removeEmptyArtists = function(error, artists) {
    var _a, _b, _c, get_task, id, remove_task, task;
    if (error) {
      return cb(error);
    }
    remove_task = new Task();
    get_task = new Task();
    task = new Task();
    _b = artists;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      id = _b[_a];
      id = id.toString();
      task.add(id, [redis.sCard, ("link:artist:" + (id) + ":song")]);
    }
    return task.run(function(id, error, songs) {
      if (!id) {
        return get_task.run(function(id, error, artist) {
          if (!id) {
            return remove_task.run(function(task) {
              if (!(id)) {
                return cb();
              }
            });
          } else if (artist && artist.id) {
            return remove_task.add(id, [artist.remove]);
          }
        });
      } else if (songs && songs.length === 0) {
        return get_task.add(id, [redis.getModel, new Artist(), id]);
      }
    });
  };
  return redis.client.hgetall('link:path', function(error, data) {
    var _a, fn, path_e, song_id, task;
    if (error) {
      return cb(error);
    }
    if (!(data)) {
      return cb();
    }
    fn = function(id, path_e, path) {
      return function(next) {
        var pathExists;
        pathExists = function(error, stat) {
          if (error) {
            redis.deleteLink('path', path_e, function() {});
          }
          return next();
        };
        return redis.keyExists("song:" + (id), function(error, exists) {
          if (error || !exists) {
            redis.deleteLink('path', path_e, function() {});
            return next();
          } else {
            return fs.stat(path, pathExists);
          }
        });
      };
    };
    task = new Seq();
    _a = data;
    for (path_e in _a) {
      if (!__hasProp.call(_a, path_e)) continue;
      song_id = _a[path_e];
      task.add(fn(song_id.toString(), path_e, decodeURI(path_e)));
    }
    return task.run(function() {
      return redis.getCollection('song', findMissingSongs);
    });
  });
});
serviceTask = function() {
  console.log('[Service] Performing cleaning of index.');
  return cleanIndex(function() {
    console.log('[Service] Finished cleaning index.');
    console.log('[Service] Performing index.');
    return fullScan();
  });
};
redis.onLoad(serviceTask);
setInterval(serviceTask, config.service_interval * 60 * 1000);