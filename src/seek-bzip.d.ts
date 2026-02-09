declare module 'seek-bzip' {
  const seekBzip: {
    decode(buffer: Buffer): Buffer;
    decodeBlock(buffer: Buffer, blockStartBits: number): Buffer;
  };
  export default seekBzip;
}
