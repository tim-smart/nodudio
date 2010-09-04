sys   = require 'sys'
redis = require './redis'
api   = require './api'
fs    = require 'fs'
pathm = require 'path'

cache = {}

module.exports = ->
  (request, response, next, path) ->
    [resource, id, action] = path.split '/'
    redis.getCache resource, id, action, (error, cache) ->
      if error or not cache
        if resource is 'song' and action is 'download'
          api.get 'song', id, null, (error, song) ->
            return respondWith404 request, response if error or not song.id
            sendFile request, response, song.get 'path'
        else
          api.get resource, id, action, (error, result) ->
            return respondWith404 request, response if error
            result = handleResult request, response, result
            redis.setCache resource, id, action, result, ->
            response.sendJson 200, result
      else
        response.sendHeaders
          'Content-Type': 'application/json'
        response.end cache

handleResult = (request, response, result) ->
  if Buffer.isBuffer result
    result.toString()
  else if Array.isArray result
    result      = model.toObject() for model in result
    result.path = undefined
    result
  else if result.toObject then result.toObject()

sendFile = (request, response, path) ->
  fs.stat path, (error, stat) ->
    return respondWith404 request, response if error
    mime = switch pathm.extname path
      when '.m4a' then 'audio/mp4a-latm'
      else 'audio/mpeg'
    read_opts = {}
    headers   =
      'Content-Type':   mime
      'Content-Length': stat.size
      'Last-Modified':  stat.mtime.toUTCString()
      'Expires':        new Date(Date.now() + 31536000000).toUTCString()
      'Cache-Control': 'public max-age=' + 31536000
    if request.headers['range']
      setRangeHeaders request, stat, headers, read_opts
      response.sendHeaders 206, headers
    else response.sendHeaders 200, headers
    file = fs.createReadStream path, read_opts
    sys.pump file, response
    file.on 'end', -> response.end()

setRangeHeaders = (request, stat, headers, read_opts) ->
  range           = request.headers['range'].substring(6).split '-'
  read_opts.start = +range[0]
  read_opts.end   = +range[1]
  if range[1].length is 0 then read_opts.end = stat.size - 1
  else if range[0].length is 0
    read_opts.end   = stat.size - 1
    read_opts.start = read_opts.end - +range[1] + 1
  headers['Accept-Ranges']  = 'bytes'
  headers['Content-Length'] = read_opts.end - read_opts.start + 1
  headers['Content-Range']  = "bytes #{read_opts.start}-#{read_opts.end}/#{stat.size}"

respondWith404 = (request, response) ->
  response.sendJson 404,
    error: "Resource not found"
