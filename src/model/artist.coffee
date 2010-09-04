Base  = require './base'

class Artist extends Base
  name: 'artist'

  properties: [
    'name'
  ]

  has_many: ['album', 'song']

module.exports = Artist
