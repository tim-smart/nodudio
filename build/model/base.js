var Base, redis, server;
redis = require('../redis');
server = require('../server');
Base = function(data) {
  this.data = data || {};
  return this;
};
Base.prototype.id = null;
Base.prototype.name = null;
Base.prototype.properties = [];
Base.prototype.data = {};
Base.prototype.get = function(name, def) {
  var _a;
  return (typeof (_a = this.data[name]) !== "undefined" && _a !== null) ? this.data[name] : def;
};
Base.prototype.set = function(name, value) {
  this.data[name] = value;
  return this;
};
Base.prototype.exists = function(cb) {};
Base.prototype.save = function(cb) {
  return redis.saveModel(this, function(error, model) {
    if (error) {
      return cb(error);
    }
    socket.broadcast("save:" + (model.name) + ":" + (model.id) + "|" + (JSON.stringify(model.data)));
    return cb(null, model);
  });
};
module.exports = Base;