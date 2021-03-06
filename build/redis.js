var Task, callbacks, client, config, redis, server, spawn;
redis = require('redis');
config = require('./config');
spawn = require('child_process').spawn;
Task = require('parallel').Task;
server = (exports.server = spawn(config.redis_exec, [config.redis_conf]));
server.stdout.on('data', function(data) {
  return console.log("[redis] " + data.toString());
});
server.stderr.on('data', function(data) {
  return console.log("[redis] " + data.toString());
});
client = (exports.client = null);
callbacks = [];
setTimeout(function() {
  client = (exports.client = redis.createClient(config.redis_port));
  return client.on("connect", function() {
    var _i, _len, _ref, callback;
    _ref = callbacks;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      callback = _ref[_i];
      callback();
    }
    return (callbacks = []);
  });
}, 500);
exports.onLoad = function(callback) {
  return callbacks.push(callback);
};
exports.onLoad(function() {
  console.log('[redis] Re-writing append-only file');
  return client.bgrewriteaof();
});
setInterval(function() {
  return client.bgrewriteaof();
}, config.redis_rewrite * 60 * 1000);
process.on('exit', function() {
  return server.kill();
});
exports["delete"] = function() {
  return client.del.apply(client, arguments);
};
exports.hDelete = function() {
  return client.hdel.apply(client, arguments);
};
exports.hSet = function() {
  return client.hset.apply(client, arguments);
};
exports.keyExists = function(key, cb) {
  return client.exists(key, cb);
};
exports.hKeyExists = function(hash, key, cb) {
  return client.hexists(hash, key, cb);
};
exports.sCard = function(key, cb) {
  return client.scard(key, cb);
};
exports.getId = function(type, cb) {
  return client.incr("ids:" + (type), cb);
};
exports.saveModel = function(model, cb) {
  var addedLinks, afterInsert, error, insert, is_new, keys, model_key;
  model_key = (keys = null);
  is_new = false;
  insert = function(error, id) {
    var _i, _len, _ref, data, key;
    if (error) {
      return cb(error);
    }
    model.id = id.toString();
    model_key = ("" + (model.name) + ":" + (id));
    data = [model_key];
    keys = Object.keys(model.data);
    _ref = keys;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      key = _ref[_i];
      data.push(key);
      data.push(new Buffer(model.data[key], 'utf8'));
    }
    return client.hmset(data, afterInsert);
  };
  afterInsert = function(error, result) {
    var string_id, task;
    if (error) {
      return cb(error);
    }
    task = new Task({
      coll: [exports.addCollection, model.name, model.id]
    });
    string_id = model.stringId();
    if (string_id) {
      task.add('link', [exports.addLink, model.name, model.stringId(), model.id]);
    }
    return task.run(addedLinks);
  };
  error = null;
  addedLinks = function(task, error) {
    var err;
    if (error) {
      err = error;
    }
    if (!(task)) {
      return cb(error, model);
    }
  };
  if (model.id) {
    return insert(null, model.id);
  } else {
    is_new = true;
    return client.incr("ids:" + (model.name), insert);
  }
};
exports.updateModelKey = (exports.setModelKey = function(model, key, cb) {
  if (!(model.id)) {
    return cb(new Error('id missing'));
  }
  return client.hset("" + (model.name) + ":" + (model.id), key, model.get(key), cb);
});
exports.getModelKey = function(model, key, cb) {
  if (!(model.id)) {
    return cb(new Error('id missing'));
  }
  return client.hget("" + (model.name) + ":" + (model.id), key, cb);
};
exports.getModel = function(model, id, cb) {
  var props;
  if (!id) {
    return cb(new Error('id missing'));
  }
  props = [("" + (model.name) + ":" + (id))];
  props.push.apply(props, model.properties);
  return client.hmget(props, function(error, result) {
    var _len, _ref, i, prop;
    if (error) {
      return cb(error);
    }
    _ref = model.properties;
    for (i = 0, _len = _ref.length; i < _len; i++) {
      prop = _ref[i];
      if (result[i]) {
        model.set(prop, result[i].toString());
      }
    }
    if (Object.keys(model.data).length === 0) {
      return cb(null, model);
    }
    model.id = id;
    return cb(null, model);
  });
};
exports.modelExists = function(type, id, cb) {
  return client.exists("" + (type) + ":" + (id), cb);
};
exports.deleteModel = function(type, id, cb) {
  if (!(id)) {
    return cb(new Error('id missing'));
  }
  return client.srem("collection:" + (type), id, function(error, result) {
    if (error) {
      return cb(error);
    }
    return client.del("" + (type) + ":" + (id), cb);
  });
};
exports.deleteModelField = function(model, field, cb) {
  if (!(model.id)) {
    return cb(new Error('id missing'));
  }
  return client.hdel("" + (model.name) + ":" + (model.id), field, cb);
};
exports.addLink = function(type, from, to, cb) {
  return client.hset("link:" + (type), from, to, cb);
};
exports.addLinkNx = function(type, from, to, cb) {
  return client.hsetnx("link:" + (type), from, to, cb);
};
exports.getLink = function(type, id, cb) {
  return client.hget("link:" + (type), id, cb);
};
exports.deleteLink = function(type, id, cb) {
  return client.hdel("link:" + (type), id, cb);
};
exports.deleteLinks = function(type, cb) {
  return client.del("link:" + (type), cb);
};
exports.linkExists = function(type, id, cb) {
  return client.hexists("link:" + (type), id, cb);
};
exports.addModelLink = function(from, to, cb) {
  if (!(from.id && to.id)) {
    return cb(new Error('id missing'));
  }
  return client.sadd("link:" + (from.name) + ":" + (from.id) + ":" + (to.name), to.id, cb);
};
exports.getModelLinks = function(model, type, cb) {
  if (!(model.id)) {
    return cb(new Error('id missing'));
  }
  return client.smembers("link:" + (model.name) + ":" + (model.id) + ":" + (type), cb);
};
exports.deleteModelLink = function(parent, id, type, field, cb) {
  return client.srem("link:" + (parent) + ":" + (id) + ":" + (type), field, cb);
};
exports.deleteModelLinks = function(model, type, cb) {
  if (!(model.id)) {
    return cb(new Error('id missing'));
  }
  return client.del("link:" + (model.name) + ":" + (model.id) + ":" + (type), cb);
};
exports.getCollection = function(type, cb) {
  return client.smembers("collection:" + (type), cb);
};
exports.addCollection = function(type, id, cb) {
  return client.sadd("collection:" + (type), id, cb);
};