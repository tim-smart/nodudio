router  = new (require 'biggie-router')
ws      = require 'websocket-server'
config  = require './config'
redis   = require './redis'
api     = require './api'
Package = require('node-asset').Package
require './service'

router.addModule 'nodudio', __dirname + '/rest'

router.bind (request, response, next) ->
  console.log "[HTTP] " + request.method + " " + request.url
  next()

router.all(/^\/api\/?(.*)$/).module('nodudio')

router.get('/').bind (request, response, next) ->
  request.url = '/index.html'
  next()

router.get(/^\/.*\.(js|css|html).*$/).module('gzip')

router.module('static', __dirname + '/../public').bind (request, response) ->
  response.sendBody(404, 'Asset not found: ' + request.url)

router.listen(config.http_port)

socket = exports.socket = ws.createServer
  server: router

socket.on 'connection', (client) ->
  client.on 'message', (message) ->
    if ~(index = message.indexOf('|'))
      data    = message.slice(index + 1)
      message = message.slice(0, index).split(':')
    else message = message.split(':')
    console.log "[WebSocket] #{message.join ':'}"
    id = message.shift()

    switch message[0]
      when 'get'
        api.get message[1], message[2], message[3], (error, result) ->
          return client.send("#{id}:error|#{error.toString()}") if error
          result = handleResult(result)
          client.send("#{id}|#{JSON.stringify(result)}")

handleResult = (result) ->
  if Buffer.isBuffer result
    result.toString()
  else if Array.isArray result
    result = for model in result
      model.data.path = undefined
      model.data
    result
  else if result.data
    result.toObject()
  else result
