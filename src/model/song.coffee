Base  = require './base'
redis = require '../redis'
utils = require '../utils'

class Song extends Base
  name: 'song'

  properties: [
    'name',        'album_id',   'artist_id'
    'artist_name', 'album_name', 'genre'
    'rating',      'path',       'track'
    'md5'
  ]

  belongs_to: ['artist', 'album']
  private:    ['path']

  stringId: ->
    @data['md5']

  remove: (cb) ->
    super (error) =>
      return cb error if error
      path_e = utils.base64Encode(@data.path)
      redis.deleteLink 'path', path_e, cb

  save: (cb) ->
    super (error, song) =>
      return cb error if error
      path = song.data.path
      if not path then cb null, this
      else redis.addLink 'path', utils.base64Encode(path), @id, (error) ->
        return cb error if error
        cb null, this

module.exports = Song
