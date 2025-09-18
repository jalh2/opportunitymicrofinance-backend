const { EventEmitter } = require('events');

// Global, lightweight event bus for cross-module signaling
const bus = new EventEmitter();

module.exports = bus;
