const NodeEvents = require('node:events');

const EventEmitter = NodeEvents.EventEmitter || NodeEvents;

module.exports = EventEmitter;
module.exports.EventEmitter = EventEmitter;
module.exports.once = NodeEvents.once;
module.exports.on = NodeEvents.on;
