const nativeBuffer = globalThis.Buffer;

const safer = {
  Buffer: nativeBuffer,
  alloc: (size, fill, encoding) => nativeBuffer.alloc(size, fill, encoding),
  allocUnsafe: (size) => nativeBuffer.allocUnsafe(size),
  from: (value, encodingOrOffset, length) => nativeBuffer.from(value, encodingOrOffset, length),
};

if (nativeBuffer) {
  safer.kStringMaxLength = nativeBuffer.kStringMaxLength;
}

module.exports = safer;
