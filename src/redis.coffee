redis  = require '../deps/redis-client'
config = require './config'
spawn  = require('child_process').spawn
Task   = require('parallel').Task

server = exports.server = spawn config.redis_exec, [config.redis_conf]

server.stdout.on 'data', (data) -> console.log "[redis] " + data.toString()
server.stderr.on 'data', (data) -> console.log "[redis] " + data.toString()

client = exports.client = null

callbacks = []
setTimeout ->
  client = exports.client = redis.createClient config.redis_port
  callback() for callback in callbacks
  callbacks = []
, 500

exports.onLoad = (callback) ->
  callbacks.push callback

# Rewrite append onle file every 10 minutes and on startup
exports.onLoad ->
  console.log '[redis] Re-writing append-only file'
  client.sendCommand 'BGREWRITEAOF'
setInterval ->
  client.sendCommand 'BGREWRITEAOF'
, config.redis_rewrite * 60 * 1000

process.on 'exit', ->
  server.kill()

exports.delete  = ->
  client.del.apply client, arguments
exports.hDelete = ->
  client.hdel.apply client, arguments

exports.hSet = ->
  client.hset.apply client, arguments

exports.keyExists = (key, cb) -> client.exists key, cb

exports.hKeyExists = (hash, key, cb) -> client.hexists hash, key, cb

exports.sCard = (key, cb) -> client.scard key, cb

exports.getId = (type, cb) ->
  client.incr "ids:#{type}", cb

exports.saveModel = (model, cb) ->
  model_key = keys = null
  is_new    = no

  insert = (error, id) ->
    return cb error if error
    model.id  = id.toString()
    model_key = "#{model.name}:#{id}"
    data      = [model_key]
    keys      = Object.keys model.data
    for key in keys
      data.push key
      data.push new Buffer model.data[key], 'utf8'
    client.hmset data, afterInsert
  afterInsert = (error, result) ->
    return cb error if error
    task = new Task
      coll: [exports.addCollection, model.name, model.id]
    string_id = model.stringId()
    task.add 'link', [exports.addLink, model.name, model.stringId(), model.id] if string_id
    task.run addedLinks
  error = null
  addedLinks = (task, error) ->
    err = error if error
    cb error, model unless task

  if model.id then insert null, model.id
  else
    is_new = yes
    client.incr "ids:#{model.name}", insert

exports.updateModelKey = exports.setModelKey = (model, key, cb) ->
  return cb new Error 'id missing' unless model.id
  client.hset "#{model.name}:#{model.id}", key, model.get(key), cb

exports.getModelKey = (model, key, cb) ->
  return cb new Error 'id missing' unless model.id
  client.hget "#{model.name}:#{model.id}", key, cb

exports.getModel = (model, id, cb) ->
  return cb new Error 'id missing' if not id
  props = ["#{model.name}:#{id}"]
  props.push.apply props, model.properties
  client.hmget props, (error, result) ->
    return cb error if error
    for prop, i in model.properties when result[i]
      model.set prop, result[i].toString()
    return cb null, model if Object.keys(model.data).length is 0
    model.id = id
    cb null, model

exports.modelExists = (type, id, cb) ->
  client.exists "#{type}:#{id}", cb

exports.deleteModel = (type, id, cb) ->
  return cb new Error 'id missing' unless id
  client.srem "collection:#{type}", id, (error, result) ->
    return cb error if error
    client.del "#{type}:#{id}", cb

exports.deleteModelField = (model, field, cb) ->
  return cb new Error 'id missing' unless model.id
  client.hdel "#{model.name}:#{model.id}", field, cb

exports.addLink = (type, from, to, cb) ->
  client.hset "link:#{type}", from, to, cb

exports.addLinkNx = (type, from, to, cb) ->
  client.hsetnx "link:#{type}", from, to, cb

exports.getLink = (type, id, cb) ->
  client.hget "link:#{type}", id, cb

exports.deleteLink = (type, id, cb) ->
  client.hdel "link:#{type}", id, cb

exports.deleteLinks = (type, cb) ->
  client.del "link:#{type}", cb

exports.linkExists = (type, id, cb) ->
  client.hexists "link:#{type}", id, cb

exports.addModelLink = (from, to, cb) ->
  return cb new Error 'id missing' unless from.id and to.id
  client.sadd "link:#{from.name}:#{from.id}:#{to.name}", to.id, cb

exports.getModelLinks = (model, type, cb) ->
  return cb new Error 'id missing' unless model.id
  client.smembers "link:#{model.name}:#{model.id}:#{type}", cb

exports.deleteModelLink = (parent, id, type, field, cb) ->
  client.srem "link:#{parent}:#{id}:#{type}", field, cb

exports.deleteModelLinks = (model, type, cb) ->
  return cb new Error 'id missing' unless model.id
  client.del "link:#{model.name}:#{model.id}:#{type}", cb

exports.getCollection = (type, cb) ->
  client.smembers "collection:#{type}", cb

exports.addCollection = (type, id, cb) ->
  client.sadd "collection:#{type}", id, cb

exports.getCache = (resource, id, action, cb) ->
  key = cacheKey resource, id, action
  client.get key, cb

exports.setCache = (resource, id, action, result, cb) ->
  key = cacheKey resource, id, action
  client.set key, new Buffer(JSON.stringify(result)), cb

exports.expireCache = (resource, id, action, cb) ->
  key = cacheKey resource, id, action
  client.del key, cb

cacheKey = (resource, id, action) ->
  key = ['cache', resource]
  key.push id     if id
  key.push action if action
  key.join ':'
