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

class Indexer extends process.EventEmitter
  constructor: (dir) ->
    @dir     = dir
    @working = no
    @queue   = []
    @last    = no
    @on 'walk:file',    @onFile
    @on 'queue:update', @onQueueUpdate
    @on 'queue:item',   @onQueueItem
    @on 'queue:next',   @onQueueNext
    @on 'song:found',   @onSongFound
    @on 'song:move',    @onSongMove
    @on 'song:valid',   @onSongValid
    @on 'song:tagged',  @onSongTagged
    @on 'artist:saved', @onArtistSaved
    @on 'album:saved',  @onAlbumSaved
    @on 'linked',       @onLinked

  db: redis

  run: ->
    $ = this
    new utils.DirectoryWalker(@dir).run (file, file_path, stat, dir) ->
      if not file
        $.last = yes
        return $.emit 'queue:update'
      return $.emit('walk:directory', file_path, this) if dir
      $.emit 'walk:file', file_path, this

  onFile: (file, stat) ->
    if @validate file
      @queue.unshift [file, stat]
      @emit 'queue:update'

  validate: (filename) ->
    config.filetypes.indexOf(path_m.extname filename) isnt -1

  handleError: (error) ->
    $.emit 'queue:next'
    $.emit 'error', error

  onQueueUpdate: ->
    return if @working
    if @queue.length is 0
      if @last
        @last = no
        @emit 'complete'
      return
    @working     = yes
    [file, stat] = @queue.pop()
    @emit 'queue:item', file, stat

  onQueueNext: ->
    @working = no
    @emit 'queue:update'

  onQueueItem: (file_path, stat) ->
    $      = this
    path_e = encodeURI file_path
    @db.addLinkNx 'path', path_e, 0, (error, avail) ->
      return $.handleError error if error
      return $.emit 'queue:next' unless avail
      song = new Song path: file_path
      $.emit 'song:found', song, path_e

  onSongFound: (song, path_e) ->
    $ = this
    fs.readFile song.get('path'), (error, buffer) ->
      return $.handleError error if error
      tags = new ID3 buffer
      tags.parse()
      song.set 'name',        (tags.get 'title')  or 'Unknown'
      song.set 'artist_name', (tags.get 'artist') or 'Unknown'
      song.set 'album_name',  (tags.get 'album')  or 'Unknown'
      song.set 'genre',       (tags.get 'genre')  or 'Unknown'
      song.set 'track',       (tags.get 'track')  or '0'
      song.set 'track',       song.get('track').toString().split('/')[0]
      song.set 'rating',      song.get 'rating', 0
      $.db.getLink 'song', song.stringId(), (error, song_id) ->
        return $.handleError error if error
        # Same song different path?
        if song_id
          song.id = song_id.toString()
          $.emit 'song:move', song, path_e, buffer
        else
          $.emit 'song:valid', song, tags

  onSongMove: (song, path_e, buffer) ->
    $ = this
    @db.getModelKey song, 'path', (error, path) ->
      return $.handleError error if error
      fs.stat path.toString(), (error, stat) ->
        if error
          task = new Task
            song: [$.db.setModelKey, song, 'path']
            path: [$.db.addLink, 'path', path_e, song.id]
          task.run (key, error) ->
            $.emit 'error', error if error
            $.emit 'queue:next'   unless key
        else $.emit 'queue:next'

  onSongValid: (song, tags) ->
    $ = this
    @db.getId 'song', (error, song_id) ->
      return $.handleError error if error
      return $.emit 'queue:next' unless song_id
      song.id = song_id.toString()
      $.emit 'song:tagged', song, tags

  onSongTagged: (song, tags) ->
    $ = this
    artist = new Artist
      name: song.get 'artist_name'
    @db.getLink 'artist', artist.stringId(), (error, artist_id) ->
      return $.handleError error if error
      if artist_id
        artist.id = artist_id.toString()
        return $.emit 'artist:saved', artist, song, tags
      artist.save (error) ->
        return $.handleError error if error
        $.emit 'artist:saved', artist, song, tags

  onArtistSaved: (artist, song, tags) ->
    $ = this
    song.set 'artist_id', artist.id
    album = new Album
      name:        song.get 'album_name'
      artist_id:   artist.id
      artist_name: artist.get 'name'
    year = tags.get('year')
    album.set 'year', year if +year
    @db.getLink 'album', album.stringId(), (error, album_id) ->
      return $.handleError error if error
      if album_id
        album.id = album_id.toString()
        return $.emit 'album:saved', album, artist, song
      album.save (error) ->
        return $.handleError error if error
        $.emit 'album:saved', album, artist, song

  onAlbumSaved: (album, artist, song) ->
    $ = this
    song.set 'album_id', album.id
    task = new Task
      artist:  [artist.linkTo, album]
      artist2: [artist.linkTo, song]
      album:   [album.linkTo, song]
    err = no
    task.run (key, error) ->
      if error
        err = yes
        $.emit 'error', error    if error
      $.emit 'linked', err, song unless key

  onLinked: (error, song) ->
    $ = this
    if error
      song.remove (error) ->
        return $.handleError error if error
        $.emit 'queue:next'
    else
      song.save (error) ->
        return $.handleError error if error
        $.emit 'song:saved', song
        $.emit 'queue:next'

dirs = []
watchDirectory = (dir) ->
  return if dirs.indexOf(dir) isnt -1
  dirs.push dir
  fs.watchFile dir, (current, previous) ->
    console.log "[Service] Scanning: #{dir}"
    indexer = new Indexer dir
    indexer.on 'walk:directory', watchDirectory
    indexer.on 'song:saved', (song) ->
      console.log "[Index] Added: #{song.get 'name'} - #{song.get 'artist_name'} (#{song.get 'album_name'})"
    indexer.on 'complete', ->
      console.log "[Service] Finished scanning: #{dir}"
    indexer.run()

# Clean up, cleanup, everybody everywhere
class Cleaner
  constructor: ->
    @queue   = []
    @working = no

  db: redis

  run: (cb) ->
    @callback = cb
    $ = this
    @db.client.hkeys 'link:path', (error, data) ->
      return $.callback error if error
      return $.callback()     unless data
      for path_e in data
        path_e = path_e.toString()
        $.queue.push [decodeURI(path_e), path_e]
      $.queueUpdate()

  queueUpdate: ->
    return if working
    $ = this
    if @queue.length is 0
      return @db.getCollection 'album', (error, albums) ->
        return $.callback error if error
        $.removeEmptyAlbums albums
    working = yes
    [path, path_e] = @queue.pop()
    fs.stat path, (error, stat) ->
      if error then $.db.deleteLink 'path', path_e, -> $.queueNext()
      else $.queueNext()

  queueNext: ->
    @working = no
    @queueUpdate()

  removeEmptyAlbums: (albums) ->
    $ = this
    if not albums
      return @db.getCollection 'artist', (error, artists) ->
        return $.callback error if error
        $.removeEmptyArtists artists
    remove_task = new Task
    get_task    = new Task
    task        = new Task
    for id in albums
      id = id.toString()
      task.add id, [@db.sCard, "link:album:#{id}:song"]
    task.run (id, error, songs) ->
      if not id
        get_task.run (id, error, album) ->
          if not id 
            remove_task.run (task) ->
              if not task then $.db.getCollection 'artist', (error, artists) ->
                return $.callback error if error
                $.removeEmptyArtists artists
          else if album and album.id
            remove_task.add id, [album.remove]
      else if songs and songs.length is 0
        get_task.add id, [$.db.getModel, new Album, id]

  removeEmptyArtists: (artists) ->
    if not artists
      return @callback()
    $           = this
    remove_task = new Task
    get_task    = new Task
    task        = new Task
    for id in artists
      id = id.toString()
      task.add id, [@db.sCard, "link:artist:#{id}:song"]
    task.run (id, error, songs) ->
      if not id
        get_task.run (id, error, artist) ->
          if not id 
            remove_task.run (task) -> $.callback() unless id
          else if artist and artist.id
            remove_task.add id, [artist.remove]
      else if songs and songs.length is 0
        get_task.add id, [$.db.getModel, new Artist, id]

cleanIndex = exports.cleanIndex = (cb) ->
  cleaner = new Cleaner
  cleaner.run ->
    cb()

# Do a full scan every 20 minutes and on startup
serviceTask = ->
  console.log '[Service] Performing cleaning of index.'
  cleanIndex ->
    console.log '[Service] Finished cleaning index.'
    console.log '[Service] Performing index.'
    indexer = new Indexer config.music_dir
    indexer.on 'walk:directory', watchDirectory
    indexer.on 'song:saved', (song) ->
      console.log "[Index] Added: #{song.get 'name'} - #{song.get 'artist_name'} (#{song.get 'album_name'})"
    indexer.on 'complete', ->
      console.log '[Service] Finished indexing.'
    indexer.run()
redis.onLoad serviceTask
setInterval serviceTask, config.service_interval * 60 * 1000

