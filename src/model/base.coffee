redis  = require '../redis'
server = require '../server'

class Base
  constructor: (data) ->
    @data = data or {}

  id:         null
  name:       null
  properties: []
  data:       {}

  get: (name, def) ->
    if @data[name]? then @data[name] else def

  set: (name, value) ->
    @data[name] = value
    this

  exists: (cb) ->

  save: (cb) ->
    redis.saveModel this, (error, model) ->
      return cb error if error
      socket.broadcast "save:#{model.name}:#{model.id}|#{JSON.stringify(model.data)}"
      cb null, model

module.exports = Base
