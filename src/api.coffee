redis = require './redis'
Task  = require('parallel').Task

module.exports =
  get: (resource, id, action, cb) ->
    return cb not_found unless resource

    action   = action.toLowerCase() if action
    resource = resource.toLowerCase()
    try
      model = require "./model/#{resource}"
    catch error
      return cb error

    # We have model, prew!
    # Do we want a collection?
    if not id
      redis.getCollection resource, (error, result) ->
        return cb error if error
        task = new Task
        for id in result
          id = id.toString()
          task.add id, [redis.getModel, new model, id]
        error   = null
        results = []
        task.run (task, err, instance) ->
          error = err if err
          if not task
            return cb error if error
            cb null, results
          else
            instance.set '_id', task
            results.push instance
    else
      redis.getModel new model, id, (error, result) ->
        return cb error        if error
        return cb null, result unless result.id
        result.set '_id', id
        if action and result.has_many.indexOf action
          redis.getModelLinks result, action, (error, results) ->
            return cb error if error
            model = require "./model/#{action}"
            task = new Task
            for id in results
              id = id.toString()
              task.add id, [redis.getModel, new model, id]
            error = null
            ret   = []
            task.run (task, err, instance) ->
              error = err if err
              if not task
                return cb error if error
                cb null, ret
              else if instance and instance.id
                instance.set '_id', task
                ret.push instance
        else cb null, result

  cache: {}

not_found = new Error 'Not Found'
