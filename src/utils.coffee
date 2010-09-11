fs       = require 'fs'
path     = require 'path'
crypto   = require 'crypto'
Task     = require('parallel').Task
FreeList = require('freelist').FreeList

# Shared noop for save lots of little closures.
noop = exports.noop = ->

exports.idFromString = (string) ->
  string.trim().toLowerCase().replace /[^a-z0-9]+/ig, '-'

exports.md5 = (string) ->
  crypto.createHash('md5').update(string).digest('hex')

exports.base64Encode = (string) ->
  new Buffer(string, 'utf8').toString('base64')

exports.base64Decode = (string) ->
  new Buffer(string, 'base64').toString('utf8')

exports.makeCacheKey = (resource, id, action) ->
  key = ['cache', resource]
  key.push id     if id
  key.push action if action
  key.join ':'

# Iterate over files
class DirectoryWalker
  constructor: (dir) ->
    @dir = dir

  counter: 0

  run: (callback) ->
    @callback = callback
    @onDir @dir

  onDir: (dir) ->
    ++@counter
    $ = this
    fs.readdir dir, (error, files) ->
      if error
        --$.counter
        $.callback() if $.counter <= 0
        return
      task = new Task
      for file in files
        task.add file, [fs.stat, path.join(dir, file)]
      task.run (file, error, stat) ->
        if not file
          --$.counter
          $.callback() if $.counter <= 0
        else if stat
          file_path = path.join(dir, file)
          if stat.isDirectory()
            $.callback file, file_path, stat, yes
            return $.onDir file_path
          $.callback file, file_path, stat, no

exports.DirectoryWalker = DirectoryWalker

ioWatchers = new FreeList 'iowatcher', 100, ->
  new process.IOWatcher

class FileSender
  constructor: (fd, socket) ->
    @socket  = socket
    @fd      = fd
    # Allocate a new watcher from the freelist
    @watcher = ioWatchers.alloc()
    @start   = 0
    @length  = 0
    # Callback called on event
    $ = this
    @watcher.callback = (r, w) ->
      $.onDrain r, w
    # set(fs, read, write)
    @watcher.set @socket.fd, no, yes

  send: (start, length, cb) ->
    @callback = cb or noop
    @start  = start
    @length = length or 0
    @sendfile()

  sendfile: ->
    #console.log @socket.fd, @fd, @start, @length
    $ = this
    if @socket.fd and @fd
      return fs.sendfile @socket.fd, @fd, @start, @length, (e, b) ->
        $.onWrite e, b

    @onEnd()

  onWrite: (error, bytes) ->
    if error
      return switch error.errno
        when process.EAGAIN
          @watcher.start()
        when process.EPIPE
          @onEnd()
        else
          @onEnd error

    @start  += bytes
    @length -= bytes

    return @sendfile() if @length > 0

    @onEnd()

  onDrain: (readable, writable) ->
    @watcher.stop()
    @sendfile()

  onEnd: (error) ->
    @callback error
    @watcher.stop()
    @watcher.callback = noop
    ioWatchers.free @watcher
    fs.close @fd, noop

exports.FileSender = FileSender
