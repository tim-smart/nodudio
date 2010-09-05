var Album, Artist, ID3, Indexer, Seq, Song, Task, cleanIndex, config, crypto, dirs, fs, idFromString, path_m, redis, serviceTask, utils, watchDirectory;
var __extends = function(child, parent) {
    var ctor = function(){};
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
    child.prototype.constructor = child;
    if (typeof parent.extended === "function") parent.extended(child);
    child.__super__ = parent.prototype;
  };
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
Indexer = function(dir) {
  this.dir = dir;
  this.working = false;
  this.queue = [];
  this.last = false;
  this.on('walk:file', this.onFile);
  this.on('queue:update', this.onQueueUpdate);
  this.on('queue:item', this.onQueueItem);
  this.on('queue:next', this.onQueueNext);
  this.on('song:found', this.onSongFound);
  this.on('song:move', this.onSongMove);
  this.on('song:valid', this.onSongValid);
  this.on('song:tagged', this.onSongTagged);
  this.on('artist:saved', this.onArtistSaved);
  this.on('album:saved', this.onAlbumSaved);
  this.on('linked', this.onLinked);
  return this;
};
__extends(Indexer, process.EventEmitter);
Indexer.prototype.db = redis;
Indexer.prototype.run = function() {
  var $;
  $ = this;
  return new utils.DirectoryWalker(this.dir).run(function(file, file_path, stat, dir) {
    if (!file) {
      $.last = true;
      return $.emit('queue:update');
    }
    if (dir) {
      return $.emit('walk:directory', file_path, this);
    }
    return $.emit('walk:file', file_path, this);
  });
};
Indexer.prototype.onFile = function(file, stat) {
  if (this.validate(file)) {
    this.queue.unshift([file, stat]);
    return this.emit('queue:update');
  }
};
Indexer.prototype.validate = function(filename) {
  return config.filetypes.indexOf(path_m.extname(filename)) !== -1;
};
Indexer.prototype.handleError = function(error) {
  $.emit('queue:next');
  return $.emit('error', error);
};
Indexer.prototype.onQueueUpdate = function() {
  var _a, file, stat;
  if (this.working) {
    return null;
  }
  if (this.queue.length === 0) {
    if (this.last) {
      this.last = false;
      this.emit('complete');
    }
    return null;
  }
  this.working = true;
  _a = this.queue.pop();
  file = _a[0];
  stat = _a[1];
  return this.emit('queue:item', file, stat);
};
Indexer.prototype.onQueueNext = function() {
  this.working = false;
  return this.emit('queue:update');
};
Indexer.prototype.onQueueItem = function(file_path, stat) {
  var $, path_e;
  $ = this;
  path_e = encodeURI(file_path);
  return this.db.getLink('path', path_e, function(error, song_id) {
    var song;
    if (error) {
      return $.handleError(error);
    }
    if (song_id) {
      return $.emit('queue:next');
    }
    song = new Song({
      path: file_path
    });
    return $.emit('song:found', song, path_e);
  });
};
Indexer.prototype.onSongFound = function(song, path_e) {
  var $;
  $ = this;
  return fs.readFile(song.get('path'), function(error, buffer) {
    if (error) {
      return $.handleError(error);
    }
    song.set('md5', utils.md5(buffer));
    return $.db.getLink('song', song.stringId(), function(error, song_id) {
      var tags;
      if (error) {
        return $.handleError(error);
      }
      if (song_id) {
        song.id = song_id.toString();
        return $.emit('song:move', song, path_e, buffer);
      } else {
        tags = new ID3(buffer);
        tags.parse();
        return $.emit('song:valid', song, tags);
      }
    });
  });
};
Indexer.prototype.onSongMove = function(song, path_e, buffer) {
  var $;
  $ = this;
  return this.db.getModelKey(song, 'path', function(error, path) {
    if (error) {
      return $.handleError(error);
    }
    return fs.stat(path.toString(), function(error, stat) {
      var task;
      if (error) {
        task = new Task({
          song: [$.db.setModelKey, song, 'path'],
          path: [$.db.addLink('path', path_e, song.id)]
        });
        return task.run(function(key, error) {
          if (error) {
            $.emit('error', error);
          }
          if (!(key)) {
            return $.emit('queue:next');
          }
        });
      } else {
        return $.emit('queue:next');
      }
    });
  });
};
Indexer.prototype.onSongValid = function(song, tags) {
  var $;
  $ = this;
  song.set('name', (tags.get('title')) || 'Unknown');
  song.set('artist_name', (tags.get('artist')) || 'Unknown');
  song.set('album_name', (tags.get('album')) || 'Unknown');
  song.set('genre', (tags.get('genre')) || 'Unknown');
  song.set('track', (tags.get('track')) || '0');
  song.set('track', song.get('track').toString().split('/')[0]);
  song.set('rating', song.get('rating', 0));
  return this.db.getId('song', function(error, song_id) {
    if (error) {
      return $.handleError(error);
    }
    if (!(song_id)) {
      return $.emit('queue:next');
    }
    song.id = song_id.toString();
    return $.emit('song:tagged', song, tags);
  });
};
Indexer.prototype.onSongTagged = function(song, tags) {
  var $, artist;
  $ = this;
  artist = new Artist({
    name: song.get('artist_name')
  });
  return this.db.getLink('artist', artist.stringId(), function(error, artist_id) {
    if (error) {
      return $.handleError(error);
    }
    if (artist_id) {
      artist.id = artist_id.toString();
      return $.emit('artist:saved', artist, song, tags);
    }
    return artist.save(function(error) {
      if (error) {
        return $.handleError(error);
      }
      return $.emit('artist:saved', artist, song, tags);
    });
  });
};
Indexer.prototype.onArtistSaved = function(artist, song, tags) {
  var $, album, year;
  $ = this;
  song.set('artist_id', artist.id);
  album = new Album({
    name: song.get('album_name'),
    artist_id: artist.id,
    artist_name: artist.get('name')
  });
  year = tags.get('year');
  if (+year) {
    album.set('year', year);
  }
  return this.db.getLink('album', album.stringId(), function(error, album_id) {
    if (error) {
      return $.handleError(error);
    }
    if (album_id) {
      album.id = album_id.toString();
      return $.emit('album:saved', album, artist, song);
    }
    return album.save(function(error) {
      if (error) {
        return $.handleError(error);
      }
      return $.emit('album:saved', album, artist, song);
    });
  });
};
Indexer.prototype.onAlbumSaved = function(album, artist, song) {
  var $, err, task;
  $ = this;
  song.set('album_id', album.id);
  task = new Task({
    artist: [artist.linkTo, album],
    artist2: [artist.linkTo, song],
    album: [album.linkTo, song]
  });
  err = false;
  return task.run(function(key, error) {
    if (error) {
      err = true;
      if (error) {
        $.emit('error', error);
      }
    }
    if (!(key)) {
      return $.emit('linked', err, song);
    }
  });
};
Indexer.prototype.onLinked = function(error, song) {
  var $;
  $ = this;
  return error ? song.remove(function(error) {
    if (error) {
      return $.handleError(error);
    }
    return $.emit('queue:next');
  }) : song.save(function(error) {
    if (error) {
      return $.handleError(error);
    }
    $.emit('song:saved', song);
    return $.emit('queue:next');
  });
};
dirs = [];
watchDirectory = function(dir) {
  if (dirs.indexOf(dir) !== -1) {
    return null;
  }
  dirs.push(dir);
  return fs.watchFile(dir, function(current, previous) {
    return new Indexer(dir).run();
  });
};
cleanIndex = (exports.cleanIndex = function(cb) {
  var removeEmptyAlbums, removeEmptyArtists;
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
    var task;
    if (error) {
      return cb(error);
    }
    if (!(data)) {
      return cb();
    }
    task = new Seq();
    Object.keys(data).forEach(function(path_e) {
      var path;
      path = decodeURI(path_e);
      return task.add(function(next) {
        return fs.stat(path, function(error, stat) {
          return error ? redis.deletelink('path', path_e, function() {
            return next();
          }) : next();
        });
      });
    });
    return task.run(function() {
      return redis.getCollection('album', removeEmptyAlbums);
    });
  });
});
serviceTask = function() {
  console.log('[Service] Performing cleaning of index.');
  return cleanIndex(function() {
    var indexer;
    console.log('[Service] Finished cleaning index.');
    console.log('[Service] Performing index.');
    indexer = new Indexer(config.music_dir);
    indexer.on('walk:directory', watchDirectory);
    indexer.on('song:saved', function(song) {
      return console.log("[Index] Added: " + (song.get('name')) + " - " + (song.get('artist_name')) + " (" + (song.get('album_name')) + ")");
    });
    indexer.on('complete', function() {
      return console.log('[Service] Finished indexing.');
    });
    return indexer.run();
  });
};
redis.onLoad(serviceTask);
setInterval(serviceTask, config.service_interval * 60 * 1000);