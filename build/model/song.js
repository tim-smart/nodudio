var Base, Song, redis, utils;
var __bind = function(func, context) {
    return function(){ return func.apply(context, arguments); };
  }, __extends = function(child, parent) {
    var ctor = function(){};
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
    child.prototype.constructor = child;
    if (typeof parent.extended === "function") parent.extended(child);
    child.__super__ = parent.prototype;
  };
Base = require('./base');
redis = require('../redis');
utils = require('../utils');
Song = function() {
  return Base.apply(this, arguments);
};
__extends(Song, Base);
Song.prototype.name = 'song';
Song.prototype.properties = ['name', 'album_id', 'artist_id', 'artist_name', 'album_name', 'genre', 'rating', 'path', 'track', 'md5'];
Song.prototype.belongs_to = ['artist', 'album'];
Song.prototype.private = ['path'];
Song.prototype.stringId = function() {
  return this.data['md5'];
};
Song.prototype.remove = function(cb) {
  return Song.__super__.remove.call(this, __bind(function(error) {
    var path_e;
    if (error) {
      return cb(error);
    }
    path_e = utils.base64Encode(this.data.path);
    return redis.deleteLink('path', path_e, cb);
  }, this));
};
Song.prototype.save = function(cb) {
  return Song.__super__.save.call(this, __bind(function(error, song) {
    var path;
    if (error) {
      return cb(error);
    }
    path = song.data.path;
    return !path ? cb(null, this) : redis.addLink('path', utils.base64Encode(path), this.id, function(error) {
      if (error) {
        return cb(error);
      }
      return cb(null, this);
    });
  }, this));
};
module.exports = Song;