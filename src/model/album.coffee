Base  = require './base'

class Album extends Base
  name: 'album'

  properties: [
    'name',     'year', 'artist_name'
    'artist_id'
  ]

module.exports = Album
