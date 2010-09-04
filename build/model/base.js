var Base, Task, expireCaches, idFromString, redis, server, utils;
redis = require('../redis');
server = require('../server');
Task = require('parallel').Task;
utils = require('../utils');
idFromString = utils.idFromString;
Base = function(data) {
  var _a;
  _a = this;
  this.linkTo = function(){ return Base.prototype.linkTo.apply(_a, arguments); };
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
  var _a;
  return (typeof (_a = this.data[name]) !== "undefined" && _a !== null) ? this.data[name] : def;
};
Base.prototype.set = function(name, value) {
  this.data[name] = value;
  return this;
};
Base.prototype.toObject = function(private) {
  var _a, _b, _c, attr, data;
  if (private) {
    return this.data;
  } else {
    data = this.data;
    _b = this.private;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      attr = _b[_a];
      data[attr] = undefined;
    }
    return data;
  }
};
Base.prototype.linkTo = function(model, cb) {
  return redis.addModelLink(this, model, cb);
};
Base.prototype.stringId = function() {
  var _a, _b, _c, _d, ids, type;
  ids = (function() {
    _a = []; _c = this.belongs_to;
    for (_b = 0, _d = _c.length; _b < _d; _b++) {
      type = _c[_b];
      if (type = this.data[type + '_name']) {
        _a.push(idFromString(type));
      }
    }
    return _a;
  }).call(this);
  ids.push(idFromString(this.data.name));
  return ids.join(':');
};
Base.prototype.remove = function(cb) {
  var _a, _b, _c, _d, _e, _f, error, task, type;
  task = new Task({
    self: [redis.deleteModel, this.name, this.id],
    self2: [redis.deleteLink, this.name, this.stringId()]
  });
  _b = this.has_many;
  for (_a = 0, _c = _b.length; _a < _c; _a++) {
    type = _b[_a];
    task.add(type, [redis.deleteModelLinks, this, type]);
  }
  _e = this.belongs_to;
  for (_d = 0, _f = _e.length; _d < _f; _d++) {
    type = _e[_d];
    task.add("bt" + (type), [redis.deleteModelLink, type, this.data[("" + (type) + "_id")], this.name, this.id]);
  }
  error = null;
  return task.run(function(task, err) {
    if (err) {
      error = err;
    }
    if (!(task)) {
      return cb(error);
    }
  });
};
Base.prototype.save = function(cb) {
  return redis.saveModel(this, function(error, model) {
    var _a, _b, _c, _d, _e, _f, attr, private;
    if (error) {
      return cb(error);
    }
    attr = {};
    _b = model.private;
    for (_a = 0, _c = _b.length; _a < _c; _a++) {
      private = _b[_a];
      attr[private] = model.data[private];
      model.data.path = undefined;
    }
    server.socket.broadcast("save:" + (model.name) + ":" + (model.id) + "|" + (JSON.stringify(model.data)));
    _e = model.private;
    for (_d = 0, _f = _e.length; _d < _f; _d++) {
      private = _e[_d];
      model.data[private] = attr[private];
    }
    return expireCaches(model, cb);
  });
};
expireCaches = function(model, cb) {
  var _a, _b, _c, task, type;
  task = new Task({
    type: [redis.expireCache, model.name, null, null],
    self: [redis.expireCache, model.name, model.id, null]
  });
  _b = model.belongs_to;
  for (_a = 0, _c = _b.length; _a < _c; _a++) {
    type = _b[_a];
    task.add(type, [redis.expireCache, type, model.get("" + (type) + "_id"), model.name]);
  }
  return task.run(function(task) {
    if (!(task)) {
      return cb(null, model);
    }
  });
};
module.exports = Base;