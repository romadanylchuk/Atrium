export function toArrayBuffer(str: string): ArrayBuffer {
  const buf = Buffer.from(str, 'utf8');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
