var Base, Task, api, expireCaches, idFromString, redis, server, utils;
var __hasProp = Object.prototype.hasOwnProperty;
redis = require('../redis');
server = require('../server');
Task = require('parallel').Task;
utils = require('../utils');
api = require('../api');
idFromString = utils.idFromString;
Base = function(data) {
  var _this;
  _this = this;
  this.linkTo = function(){ return Base.prototype.linkTo.apply(_this, arguments); };
  this.data = data || {};
  return this;
};
Base.prototype.id = null;
Base.prototype.name = null;
Base.prototype.properties = [];
Base.prototype.data = {};
Base.prototype.belongs_to = [];
Base.prototype.has_many = [];
Base.prototype.private = [];
Base.prototype.get = function(name, def) {
  var _ref;
  return (typeof (_ref = this.data[name]) !== "undefined" && _ref !== null) ? this.data[name] : def;
};
Base.prototype.set = function(name, value) {
  this.data[name] = value;
  return this;
};
Base.prototype.toObject = function(private) {
  var _i, _ref, attr, data;
  if (private) {
    return this.data;
  } else {
    data = {};
    _ref = this.data;
    for (attr in _ref) {
      if (!__hasProp.call(_ref, attr)) continue;
      _i = _ref[attr];
      if (!~this.private.indexOf(attr)) {
        data[attr] = this.data[attr];
      }
    }
    return data;
  }
};
Base.prototype.linkTo = function(model, cb) {
  return redis.addModelLink(this, model, cb);
};
Base.prototype.stringId = function() {
  var _i, _len, _ref, _result, ids, type;
  ids = (function() {
    _result = []; _ref = this.belongs_to;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      type = _ref[_i];
      if (type = this.data[type + '_name']) {
        _result.push(idFromString(type));
      }
    }
    return _result;
  }).call(this);
  ids.push(idFromString(this.data.name));
  return ids.join(':');
};
Base.prototype.remove = function(cb) {
  var _i, _len, _ref, error, model, task, type;
  model = this;
  task = new Task({
    self: [redis.deleteModel, this.name, this.id],
    self2: [redis.deleteLink, this.name, this.stringId()]
  });
  _ref = this.has_many;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    type = _ref[_i];
    task.add(type, [redis.deleteModelLinks, this, type]);
  }
  _ref = this.belongs_to;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    type = _ref[_i];
    task.add("bt" + (type), [redis.deleteModelLink, type, this.data[("" + (type) + "_id")], this.name, this.id]);
  }
  error = null;
  return task.run(function(task, err) {
    if (err) {
      error = err;
    }
    if (!task) {
      expireCaches(model);
      return cb(error);
    }
  });
};
Base.prototype.save = function(cb) {
  return redis.saveModel(this, function(error, model) {
    if (error) {
      return cb(error);
    }
    server.socket.broadcast("save:" + (model.name) + ":" + (model.id) + "|" + (JSON.stringify(model.toObject())));
    expireCaches(model);
    return cb(null, model);
  });
};
expireCaches = function(model) {
  var _i, _len, _ref, _result, type;
  api.cache[utils.makeCacheKey(model.name)] = null;
  api.cache[utils.makeCacheKey(model.name, model.id)] = null;
  _result = []; _ref = model.belongs_to;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    type = _ref[_i];
    _result.push(api.cache[utils.makeCacheKey(type, model.get("" + (type) + "_id"), model.name)] = null);
  }
  return _result;
};
module.exports = Base;