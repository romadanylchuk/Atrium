/**
 * Minimal ambient declaration for write-file-atomic (v7.x CJS, no bundled types).
 * Do not install @types/write-file-atomic — the plan explicitly forbids it.
 */
declare module 'write-file-atomic' {
  type WriteData = string | Buffer | Uint8Array;

  interface WriteOptions {
    mode?: number;
    chown?: { uid: number; gid: number };
    encoding?: BufferEncoding | null;
    tmpfileCreated?: (tmpfile: string) => void;
    fsync?: boolean;
    temporary?: boolean;
  }

  function writeFile(
    filename: string,
    data: WriteData,
    options?: WriteOptions,
  ): Promise<void>;

  function writeFileSync(
    filename: string,
    data: WriteData,
    options?: WriteOptions,
  ): void;

  export = writeFile;
  export { writeFileSync as sync };
}
