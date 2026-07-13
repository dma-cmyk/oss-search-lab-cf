const NodeStream = require('node:stream');

const Stream = NodeStream.Stream || NodeStream;

module.exports = Stream;
module.exports.Stream = Stream;
module.exports.Readable = NodeStream.Readable;
module.exports.Writable = NodeStream.Writable;
module.exports.Duplex = NodeStream.Duplex;
module.exports.Transform = NodeStream.Transform;
module.exports.PassThrough = NodeStream.PassThrough;
