import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { DownloadTarget, StorageProvider, StoredObject } from '../storage.types';

/**
 * Filesystem-backed storage for development and self-hosted single-node installs.
 * Downloads are streamed back through the API, so the same authorization checks apply
 * as for any other endpoint — the files are never served directly by a web server.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;

  constructor(root: string) {
    // Resolved once so the containment check below compares two absolute paths.
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    // Keys are generated server-side, but never let one escape the storage root.
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Refusing to access a storage key outside the storage root');
    }
    return target;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { storageKey: key, size: body.byteLength };
  }

  download(key: string, _fileName: string, _contentType: string): Promise<DownloadTarget> {
    return Promise.resolve({ stream: createReadStream(this.resolve(key)) });
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
