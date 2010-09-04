# Scan for music and stuff, update database
ID3    = require 'id3'
redis  = require './redis'
utils  = require './utils'
config = require './config'
fs     = require 'fs'
path_m = require 'path'
Song   = require './model/song'
Artist = require './model/artist'
Album  = require './model/album'
Task   = require('parallel').Task
Seq    = require('parallel').Sequence
crypto = require 'crypto'

idFromString = utils.idFromString

saveArtist = (song, tags, cb) ->
  artist = new Artist
    name: song.get 'artist_name'
  redis.getLink 'artist', artist.stringId(), (error, result) ->
    return cb error if error
    if result
      artist.id = result.toString()
      done()
    else artist.save done
  done = (error) ->
    return cb error if error
    song.set('artist_id', artist.id)
    saveAlbum artist, song, tags, cb

saveAlbum = (artist, song, tags, cb) ->
  album = new Album
    name:        song.get 'album_name'
    artist_id:   artist.id
    artist_name: artist.get 'name'
  year = tags.get('year') if tags
  album.set('year', year) if year
  redis.getLink "album", album.stringId(), (error, link) ->
    return cb error if error
    if link
      album.id = link.toString()
      saved()
    else album.save saved
  saved = (error) ->
    return cb error if error
    song.set 'album_id', album.id
    link_task = new Task
      artist:  [artist.linkTo, album]
      artist2: [artist.linkTo, song]
      album:   [album.linkTo, song]
    error = null
    link_task.run (task, err) ->
      error = err if err
      if not task
        return cb error if error
        cb null, song

working         = no
queue           = []
queue_callbacks = []
addToQueue = (filename, stat) ->
  if queue.indexOf(filename) is -1
    queue.unshift  filename
  queueUpdated()
queueUpdated = ->
  return if working
  if queue.length is 0
    callback() for callback in queue_callbacks
    return queue_callbacks = []

  working = yes
  path    = queue.pop()
  path_e  = utils.base64Encode path
  tags    = song = null
  redis.getLink 'path', path_e, (error, data) ->
    return if error
    if data then redis.getModel new Song, data.toString(), populate
    else populate null, new Song
  populate = (error, song_model) ->
    return next() if error
    song = song_model
    if song.id then next()
    else fs.readFile path, parseSong
  parseSong = (error, buffer) ->
    if error
      return redis.deleteLink 'path', path_e, -> next()
    tags = new ID3 buffer
    song.set 'md5', utils.md5 buffer
    redis.getLink 'song', song.stringId(), setTags
  setTags = (error, result) ->
    return next() if error
    if result
      redis.getModel new Song, result.toString(), updatePath
      return next()
    tags.parse()
    song.set 'name',        (tags.get 'title')  or 'Unknown'
    song.set 'artist_name', (tags.get 'artist') or 'Unknown'
    song.set 'album_name',  (tags.get 'album')  or 'Unknown'
    song.set 'genre',       (tags.get 'genre')  or 'Unknown'
    song.set 'track',       (tags.get 'track')  or '0'
    song.set 'track',       song.get('track').toString().split('/')[0]
    song.set 'rating',      song.get 'rating', 0
    song.set 'path',        path
    redis.getId('song', saveSong)
    next()
  saveSong = (error, song_id) ->
    return next() if error
    song.id = song_id.toString()
    saveArtist song, tags, done
  updatePath = (error, song) ->
    return if error
    song.set 'path', path
    task = new Task
      song: [redis.updateModelKey, song, 'path']
      path: [redis.addLink, 'path', path_e, song.id]
    task.run ->
  done = (error) ->
    if error then song.remove ->
    else
      console.log "[Index] Added: #{song.get 'name'} - #{song.get 'artist_name'} (#{song.get 'album_name'})"
      song.save ->

next = ->
  working = no
  queueUpdated()

dirs = []
watchDirectory = (dir) ->
  return if dirs.indexOf(dir) isnt -1
  dirs.push dir
  fs.watchFile dir, (current, previous) ->
    scanDirectory dir
scanDirectory = (dir, cb) ->
  fs.readdir dir, (error, list) ->
    return if error
    task = new Task
    for filename in list
      if isMedia filename
        task.add filename, [fs.stat, path_m.join dir, filename]
    task.run (filename, error, stat) ->
      if not task then cb()
      else if stat
        if stat.isDirectory()
          ((dir) -> scanDirectory dir, -> watchDirectory dir)(path_m.join dir, filename)
        else addToQueue path_m.join(dir, filename), stat

isMedia = (filename) ->
  config.filetypes.indexOf(path_m.extname filename) isnt -1
fullScan = (cb) ->
  queue_callbacks.push cb if cb
  watchDirectory config.music_dir
  utils.directoryWalker config.music_dir, (filename, dirname, path) ->
    return watchDirectory path if @isDirectory()
    if isMedia filename then addToQueue path, this

# Clean up, cleanup, everybody everywhere
cleanIndex = exports.cleanIndex = (cb) ->
  # TODO: Find broken paths, remove un-used albums
  # and artists
  findMissingSongs = (error, songs) ->
    return cb error if error
    task      = new Task
    song_task = new Task
    for id in songs
      id = id.toString()
      task.add id, [redis.getModel, new Song, id]
    task.run (id, err, song) ->
      if not id
        song_task.run (id) ->
          redis.getCollection 'album', removeEmptyAlbums unless id
      else if song then song_task.add id, [processSong, song]
  processSong = (song, cb) ->
    fs.stat song.get('path'), (error, stat) ->
      if error and song.id
        song.remove cb
      else cb()

  removeEmptyAlbums = (error, albums) ->
    return cb error if error
    remove_task = new Task
    get_task    = new Task
    task        = new Task
    for id in albums
      id = id.toString()
      task.add id, [redis.sCard, "link:album:#{id}:song"]
    task.run (id, error, songs) ->
      if not id
        get_task.run (id, error, album) ->
          if not id 
            remove_task.run (task) ->
              redis.getCollection 'artist', removeEmptyArtists unless task
          else if album and album.id
            remove_task.add id, [album.remove]
      else if songs and songs.length is 0
        get_task.add id, [redis.getModel, new Album, id]

  removeEmptyArtists = (error, artists) ->
    return cb error if error
    remove_task = new Task
    get_task    = new Task
    task        = new Task
    for id in artists
      id = id.toString()
      task.add id, [redis.sCard, "link:artist:#{id}:song"]
    task.run (id, error, songs) ->
      if not id
        get_task.run (id, error, artist) ->
          if not id 
            remove_task.run (task) ->
              cb() unless id
          else if artist and artist.id
            remove_task.add id, [artist.remove]
      else if songs and songs.length is 0
        get_task.add id, [redis.getModel, new Artist, id]

  # Remove bad paths
  redis.client.hgetall 'link:path', (error, data) ->
    return cb error if error
    fn = (id, path_e, path) ->
      (next) ->
        pathExists = (error, stat) ->
          if error
            redis.deleteLink 'path', path_e, ->
          next()
        redis.keyExists "song:#{id}", (error, exists) ->
          if error or not exists
            redis.deleteLink 'path', path_e, ->
            next()
          else fs.stat path, pathExists
    task = new Seq
    for path_e, song_id of data
      task.add fn(song_id.toString(), path_e, utils.base64Decode(path_e))
    task.run ->
      redis.getCollection 'song', findMissingSongs

# Do a full scan every 20 minutes and on startup
serviceTask = ->
  console.log '[Service] Performing cleaning of index.'
  cleanIndex ->
    console.log '[Service] Finished cleaning index.'
    console.log '[Service] Performing index.'
    fullScan()
redis.onLoad serviceTask
setInterval serviceTask, config.service_interval * 60 * 1000

