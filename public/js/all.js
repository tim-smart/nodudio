(function() {
  window.nodudio = (window.ndo = {
    socket: null,
    EventEmitter: null
  });
})();

(function () {var EventEmitter = function EventEmitter() {
  this.listeners = {};
};

EventEmitter.prototype.emit = function emit() {
  var args = Array.prototype.slice.call(arguments, 0),
      name = args.shift();

  if (this.listeners[name]) {
    for (var i = 0, il = this.listeners[name].length; i < il; i++) {
      this.listeners[name][i].apply(null, args);
    }
  }

  return true;
};

EventEmitter.prototype.on = function addListener(name, fn) {
  if (this.listeners[name]) this.listeners[name].push(fn);
  else this.listeners[name] = [fn];
  return this;
};

nodudio.EventEmitter = EventEmitter;


})();
(function() {
  var callbacks, counter, createWebsocket, emitter;
  var __slice = Array.prototype.slice;
  emitter = (nodudio.socket = new nodudio.EventEmitter());
  counter = 0;
  callbacks = {};
  createWebsocket = function() {
    emitter._ws = new WebSocket("ws://" + (location.host));
    emitter._ws.onmessage = function(event) {
      return emitter.emit('message', event.data);
    };
    return (emitter._ws.onclose = function() {
      return setTimeout(createWebsocket, 20000);
    });
  };
  createWebsocket();
  emitter.request = function() {
    var args, id;
    args = __slice.call(arguments, 0);
    if (typeof args[args.length - 1] === 'function') {
      id = counter++;
      callbacks[id] = args.pop();
      args.unshift(id);
    }
    return this._ws.send(args.join(':'));
  };
  emitter.write = function(msg) {
    return this._ws.send(msg);
  };
  emitter.on('message', function(message) {
    var _a, callback, data, index;
    try {
      if (index = message.indexOf('|')) {
        data = message.slice(index + 1);
        message = message.slice(0, index).split(':');
      } else {
        message = message.split(':');
      }
      if ((_a = message[0]) === 'save') {
        return emitter.emit('save', message[1], message[2], JSON.parse(data));
      } else {
        if (callback = callbacks[message[0]]) {
          callbacks[message[0]] = undefined;
          return callback(data);
        }
      }
    } catch (error) {
      if (console && console.log) {
        return console.log(error);
      }
    }
  });
  emitter.on('save', function(model, id, data) {
    return console.log(model, id, data);
  });
})();

