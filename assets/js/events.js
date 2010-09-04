var EventEmitter = function EventEmitter() {
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

