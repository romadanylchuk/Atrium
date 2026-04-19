import { defaultBuffer, type LayoutSaveBuffer } from './layoutSaveBuffer';
import { saveLayoutByHash } from '@main/storage/layout';

export async function flushLayoutBuffer(buffer: LayoutSaveBuffer = defaultBuffer): Promise<void> {
  const snapshots = buffer.takeAllSnapshots();
  await Promise.all(
    snapshots.map(([hash, data]) => saveLayoutByHash(hash, data)),
  );
}
