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
      var _i, _len, _ref, id, results, task;
      if (error) {
        return cb(error);
      }
      task = new Task();
      _ref = result;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        id = _ref[_i];
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
        var _i, _len, _ref, id, ret, task;
        if (error) {
          return cb(error);
        }
        model = require("./model/" + (action));
        task = new Task();
        _ref = results;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          id = _ref[_i];
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
        var _i, _len, _ref, _result, callback, model;
        if (error) {
          return cb(error);
        }
        result = (function() {
          if (Array.isArray(result)) {
            _result = []; _ref = result;
            for (_i = 0, _len = _ref.length; _i < _len; _i++) {
              model = _ref[_i];
              _result.push(model.toObject());
            }
            return _result;
          } else {
            return result.toObject();
          }
        })();
        cache[cache_key] = new Buffer(JSON.stringify(result));
        _ref = cache_callbacks[cache_key];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          callback = _ref[_i];
          callback(null, cache[cache_key]);
        }
        return (cache_callbacks[cache_key] = undefined);
      });
    }
  }
};
not_found = new Error('Not Found');