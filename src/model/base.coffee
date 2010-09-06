redis  = require '../redis'
server = require '../server'
Task   = require('parallel').Task
utils  = require '../utils'

idFromString = utils.idFromString

class Base
  constructor: (data) ->
    @data = data or {}

  id:         null
  name:       null
  properties: []
  data:       {}

  belongs_to: []
  has_many:   []
  private:    []

  get: (name, def) ->
    if @data[name]? then @data[name] else def

  set: (name, value) ->
    @data[name] = value
    this

  toObject: (private) ->
    if private then @data
    else
      data = @data
      for attr in @private
        data[attr] = undefined
      data

  linkTo: (model, cb) =>
    redis.addModelLink this, model, cb

  stringId: ->
    ids = for type in @belongs_to when type = @data[type + '_name']
      idFromString(type)
    ids.push(idFromString @data.name)
    ids.join(':')

  remove: (cb) ->
    model = this
    task = new Task
      self:  [redis.deleteModel, @name, @id]
      self2: [redis.deleteLink, @name, @stringId()]
    for type in @has_many
      task.add(type, [redis.deleteModelLinks, this, type])
    for type in @belongs_to
      task.add("bt#{type}", [redis.deleteModelLink, type, @data["#{type}_id"], @name, @id])
    error = null
    task.run (task, err) ->
      error = err if err
      if not task
        expireCaches model
        cb error

  save: (cb) ->
    redis.saveModel this, (error, model) ->
      return cb error if error
      server.socket.broadcast "save:#{model.name}:#{model.id}|#{JSON.stringify(model.toObject())}"
      expireCaches model
      cb()

expireCaches = (model) ->
  api.cache[utils.makeCacheKey model.name] = null
  api.cache[utils.makeCacheKey model.name, model.id] = null
  for type in model.belongs_to
    api.cache[utils.makeCacheKey type, model.get("#{type}_id"), model.name] = null

module.exports = Base
