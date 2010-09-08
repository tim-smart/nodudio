fs           = require 'fs'
path         = require 'path'
exec         = require('child_process').exec
coffeescript = require 'coffee-script'
Package      = require('node-asset').Package

APP_NAME    = 'nodudio'
COFFEE_ARGS = ['--no-wrap', '-c']
BUILD_DIR   = 'build'
SOURCE_DIR  = 'src'

directoryWalker = (dir, callback, maxLevels, currentLevel, fromRoot) ->
  maxLevels    = if 'number' is typeof maxLevels then maxLevels else 0
  currentLevel = if 'number' is typeof currentLevel then currentLevel else 1
  fromRoot     = if 'string' is typeof fromRoot then fromRoot else ''

  fs.readdir dir, (error, files) ->
    if error then console.log error.message
    else 
      files.forEach (file) ->
        fs.stat path.join(dir, file), (error, stats) ->
          return console.log error.message if error

          if stats.isDirectory()
            if 0 is maxLevels or maxLevels > currentLevel
              directoryWalker path.join(dir, file), callback,
                              maxLevels, 1 + currentLevel,
                              fromRoot + file + '/'
          callback.call stats, file, fromRoot, path.join(dir, file), stats

run = (cmd, args) ->
  args or= []
  proc = exec cmd + ' ' + args.join(' ')
  proc.stderr.on 'data', (err) -> if err then console.log err.toString()

task 'deps', 'Load in the git submodules', ->
  run 'git submodule update --init --recursive'

task 'build', 'Build the ' + APP_NAME + ' from source', ->
  invoke 'build:redis'
  invoke 'build:nodudio'
  invoke 'build:client'

task 'build:nodudio', 'Build the server Coffee-Script to JS', ->
  dirs = {}
  directoryWalker SOURCE_DIR, (file, shortPath, fullPath) ->
    if @isDirectory()
      run 'mkdir', ['-p', BUILD_DIR + '/' + shortPath + file]
    else if /\.coffee$/.test file
      args = Array::slice.call COFFEE_ARGS
      args.push.apply args, ['-o', BUILD_DIR + '/' + shortPath, fullPath]
      run 'coffee', args
    else if /\.(js|node|addon|py)$/.test file
      run 'cp', [fullPath, BUILD_DIR + '/' + shortPath + file]

task 'build:redis', 'Build the redis server', ->
  run 'cd deps/redis && make'

task 'build:client', 'Build client coffee', ->
  scripts = new Package 'public/js/all.js', [
    'assets/coffee/nodudio.coffee'
    'assets/js/events.js'
    'assets/coffee/socket.coffee'
    'assets/coffee/main.coffee'
  ], {
    type:     'coffee'
    wrap:     yes
    compile:  no
    compress: no
    watch:    yes
  }
  scripts.serve()

  css = new Package 'public/css/master.css', [
    'assets/css/common.css'
    'assets/css/screen.css'
  ], {
    type:     'css'
    compile:  no
    compress: no
    watch:    yes
  }
  css.serve()
