var EventEmitter = require('events').EventEmitter;

module.exports = Transaction;

function Transaction(payload) {
  EventEmitter.call(this);
  this.payload = payload;
}

var t = Transaction.prototype = new EventEmitter();


