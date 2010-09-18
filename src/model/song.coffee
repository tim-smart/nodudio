Base  = require './base'
redis = require '../redis'
utils = require '../utils'

class Song extends Base
  name: 'song'

  properties: [
    'name',        'album_id',   'artist_id'
    'artist_name', 'album_name', 'genre'
    'rating',      'path',       'track'
  ]

  belongs_to: ['artist', 'album']
  private:    ['path']

  remove: (cb) ->
    super (error) =>
      return cb error if error
      path_e = encodeURI(@data.path)
      redis.deleteLink 'path', path_e, cb

  save: (cb) ->
    super (error, song) =>
      return cb error if error
      path = song.data.path
      if not path then cb null, this
      else redis.addLink 'path', encodeURI(path), @id, (error) ->
        return cb error if error
        cb null, this

module.exports = Song
