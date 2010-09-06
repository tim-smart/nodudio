emitter = nodudio.socket = new nodudio.EventEmitter

socket = new io.Socket location.hostname,
  transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling']

socket.connect()
counter   = 0
callbacks = {}

emitter.request = (args...) ->
  if typeof args[args.length - 1] is 'function'
    id            = counter++
    callbacks[id] = args.pop()
    args.unshift(id)
  socket.send(args.join(':'))

emitter.write = (msg) ->
  socket.send(msg)

socket.on 'message', (message) ->
  try
    if index = message.indexOf('|')
      data    = message.slice(index + 1)
      message = message.slice(0, index).split(':')
    else message = message.split(':')
    switch message[0]
      when 'save'
        emitter.emit('save', message[1], message[2], JSON.parse(data))
      else
        if callback = callbacks[message[0]]
          callbacks[message[0]] = undefined
          callback data
  catch error
    console.log(error) if console and console.log

# TODO: Remove debug statement
emitter.on 'save', (model, id, data) ->
  console.log(model, id, data)
