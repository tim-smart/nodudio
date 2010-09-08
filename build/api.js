var Task, not_found, redis, utils;
redis = require('./redis');
Task = require('parallel').Task;
utils = require('./utils');
module.exports = {
  get: function(resource, id, action, cb) {
    var model;
    if (!(resource)) {
      return cb(not_found);
    }
    if (action) {
      action = action.toLowerCase();
    }
    resource = resource.toLowerCase();
    try {
      model = require("./model/" + (resource));
    } catch (error) {
      return cb(error);
    }
    return !id ? redis.getCollection(resource, function(error, result) {
      var _a, _b, _c, id, results, task;
      if (error) {
        return cb(error);
      }
      task = new Task();
      _b = result;
      for (_a = 0, _c = _b.length; _a < _c; _a++) {
        id = _b[_a];
        id = id.toString();
        task.add(id, [redis.getModel, new model(), id]);
      }
      error = null;
      results = [];
      return task.run(function(task, err, instance) {
        if (err) {
          error = err;
        }
        if (!task) {
          if (error) {
            return cb(error);
          }
          return cb(null, results);
        } else {
          instance.set('_id', task);
          return results.push(instance);
        }
      });
    }) : redis.getModel(new model(), id, function(error, result) {
      if (error) {
        return cb(error);
      }
      if (!(result.id)) {
        return cb(null, result);
      }
      result.set('_id', id);
      return action && ~result.has_many.indexOf(action) ? redis.getModelLinks(result, action, function(error, results) {
        var _a, _b, _c, id, ret, task;
        if (error) {
          return cb(error);
        }
        model = require("./model/" + (action));
        task = new Task();
        _b = results;
        for (_a = 0, _c = _b.length; _a < _c; _a++) {
          id = _b[_a];
          id = id.toString();
          task.add(id, [redis.getModel, new model(), id]);
        }
        error = null;
        ret = [];
        return task.run(function(task, err, instance) {
          if (err) {
            error = err;
          }
          if (!task) {
            if (error) {
              return cb(error);
            }
            return cb(null, ret);
          } else if (instance && instance.id) {
            instance.set('_id', task);
            return ret.push(instance);
          }
        });
      }) : cb(null, result);
    });
  },
  cache: {},
  cache_callbacks: {},
  getCache: function(resource, id, action, cb) {
    var cache, cache_callbacks, cache_key, result;
    cache = this.cache;
    cache_key = utils.makeCacheKey(resource, id, action);
    result = this.cache[cache_key];
    if (result) {
      return cb(null, result);
    } else if (result === false) {
      return this.cache_callbacks[cache_key].push(cb);
    } else {
      this.cache[cache_key] = false;
      this.cache_callbacks[cache_key] = [cb];
      cache_callbacks = this.cache_callbacks;
      return this.get(resource, id, action, function(error, result) {
        var _a, _b, _c, _d, _e, _f, _g, callback, model;
        if (error) {
          return cb(error);
        }
        result = (function() {
          if (Array.isArray(result)) {
            _a = []; _c = result;
            for (_b = 0, _d = _c.length; _b < _d; _b++) {
              model = _c[_b];
              _a.push(model.toObject());
            }
            return _a;
          } else {
            return result.toObject();
          }
        })();
        cache[cache_key] = new Buffer(JSON.stringify(result));
        _f = cache_callbacks[cache_key];
        for (_e = 0, _g = _f.length; _e < _g; _e++) {
          callback = _f[_e];
          callback(null, cache[cache_key]);
        }
        return (cache_callbacks[cache_key] = undefined);
      });
    }
  }
};
not_found = new Error('Not Found');