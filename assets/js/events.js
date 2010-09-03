var EventEmitter = function EventEmitter() {
  this.listeners = {};
};

EventEmitter.prototype.emit = function emit() {
  var args = Array.prototype.slice.call(arguments, 0),
      name = args.shift();

  if (this.listeners[name]) {
    utils.each(this.listeners[name], function (listener) {
      listener.apply(null, args);
    });
  }

  return true;
};

EventEmitter.prototype.on = function addListener(name, fn) {
  return this.listeners[name] = fn;
};

nodudio.EventEmitter = EventEmitter;

