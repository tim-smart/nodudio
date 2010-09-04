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
      cb error unless task

  save: (cb) ->
    redis.saveModel this, (error, model) ->
      return cb error if error
      attr = {}
      for private in model.private
        attr[private] = model.data[private]
        model.data.path = undefined
      server.socket.broadcast "save:#{model.name}:#{model.id}|#{JSON.stringify(model.data)}"
      for private in model.private
        model.data[private] = attr[private]
      expireCaches model, cb

expireCaches = (model, cb) ->
  task = new Task
    type: [redis.expireCache, model.name, null, null]
    self: [redis.expireCache, model.name, model.id, null]
  for type in model.belongs_to
    task.add type, [redis.expireCache, type, model.get("#{type}_id"), model.name]
  task.run (task) -> cb null, model unless task

module.exports = Base
