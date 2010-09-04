fs     = require 'fs'
path   = require 'path'
crypto = require 'crypto'

exports.idFromString = (string) ->
  string.trim().toLowerCase().replace /[^a-z0-9]+/ig, '-'

exports.md5 = (string) ->
  crypto.createHash('md5').update(string).digest('hex')

exports.base64Encode = (string) ->
  new Buffer(string, 'utf8').toString('base64')

exports.base64Decode = (string) ->
  new Buffer(string, 'base64').toString('utf8')

# Iterate over files
directoryWalker = exports.directoryWalker = (dir, callback, maxLevels, currentLevel, fromRoot) ->
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
