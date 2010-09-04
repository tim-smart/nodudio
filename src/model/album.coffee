Base  = require './base'

class Album extends Base
  name: 'album'

  properties: [
    'name',     'year', 'artist_name'
    'artist_id'
  ]

  belongs_to: ['artist']
  has_many:   ['song']

module.exports = Album
