import fs from "node:fs/promises";
import path from "node:path";

// Where media files live. Fase 4 ships the local-disk driver (development,
// tests). Fase 6 adds the S3-compatible driver (Cloudflare R2) behind the same
// interface, chosen by configuration — callers do not change.
//
// Keys look like "2026/11/3fa2c1d09b7e4a51.webp": content-derived, never
// reused for different bytes, so files can be cached forever.

export interface MediaStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

export const MEDIA_KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/;

export function assertMediaKey(key: string): string {
  if (!MEDIA_KEY_PATTERN.test(key)) throw new Error(`Kunci media tidak valid: ${key}`);
  return key;
}

class LocalStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  private file(key: string): string {
    return path.join(this.root, ...assertMediaKey(key).split("/"));
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.file(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, target); // never a half-written file under the real name
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.file(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.file(key), { force: true });
  }
}

let storage: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  storage ??= new LocalStorage(path.resolve(process.env.MEDIA_ROOT || "media"));
  return storage;
}
