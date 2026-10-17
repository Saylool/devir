import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, head, put, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import { HttpError } from '../errors';

export type Document = { value: string; etag: string };
export interface DocumentStore {
  read(key: string): Promise<Document | null>;
  write(key: string, value: string, expected: string | null): Promise<void>;
}

export class StorageConflict extends Error {}

function safeKey(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid workspace key');
  return `workspaces/${key}.json`;
}

export class BlobDocumentStore implements DocumentStore {
  async read(key: string): Promise<Document | null> {
    const pathname = safeKey(key);
    // Read the storage ETag BEFORE the consistent content download. Download
    // response ETags can describe a compressed HTTP representation instead.
    // If another writer changes the object between these reads, the older
    // metadata ETag makes the eventual CAS fail safely, never overwrite it.
    let metadata;
    try { metadata = await head(pathname); }
    catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
    const result = await get(pathname, {
      access: 'private', useCache: false,
      headers: { 'Accept-Encoding': 'identity' },
    });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream || !metadata.etag) throw new Error('Unexpected storage response');
    return { value: await new Response(result.stream).text(), etag: metadata.etag };
  }

  async write(key: string, value: string, expected: string | null) {
    try {
      await put(safeKey(key), value, {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: expected !== null,
        ...(expected === null ? {} : { ifMatch: expected }),
      });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError ||
          (error instanceof Error && /already exists/i.test(error.message))) {
        throw new StorageConflict();
      }
      throw error;
    }
  }
}

// Development only: atomic renames and an exclusive lock preserve CAS across
// local Node processes. Vercel always uses private, persistent Blob storage.
export class FileDocumentStore implements DocumentStore {
  constructor(private directory = path.join(process.cwd(), '.devir-data')) {}
  private filename(key: string) { return path.join(this.directory, safeKey(key)); }

  async read(key: string): Promise<Document | null> {
    try {
      const value = await readFile(this.filename(key), 'utf8');
      return { value, etag: createHash('sha256').update(value).digest('hex') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(key: string, value: string, expected: string | null) {
    const filename = this.filename(key);
    await mkdir(path.dirname(filename), { recursive: true });
    const lock = `${filename}.lock`;
    try { await mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StorageConflict();
      throw error;
    }
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      if ((await this.read(key))?.etag !== (expected ?? undefined)) throw new StorageConflict();
      await writeFile(temporary, value, { mode: 0o600 });
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}

export function configuredStorage(): DocumentStore {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return new BlobDocumentStore();
  if (process.env.VERCEL) throw new HttpError(503, 'Görev depolaması henüz yapılandırılmadı.');
  return new FileDocumentStore();
}
