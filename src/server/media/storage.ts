import fs from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectCommandInput,
  type GetObjectCommandInput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

// Penyimpanan berkas media CMS:
//   - Development / pengujian: LocalStorage pada MEDIA_ROOT (default "media")
//   - Production: wajib S3Storage (Cloudflare R2 S3-compatible API)
//
// Antarmuka MediaStorage tetap seragam agar pemanggil tidak bergantung pada
// implementasi penyimpanan. Key berbentuk "YYYY/MM/<16-hex>.webp" (diturunkan
// dari SHA-256 isi berkas, sehingga immutable dan aman di-cache permanen).

export interface MediaStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type StorageSelection =
  | { driver: "local"; root: string }
  | { driver: "s3"; s3: S3StorageConfig };

export interface S3CommandSender {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export const MEDIA_KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/;

export function assertMediaKey(key: string): string {
  if (!MEDIA_KEY_PATTERN.test(key)) throw new Error(`Kunci media tidak valid: ${key}`);
  return key;
}

/** Normalisasi R2_PUBLIC_URL (opsional) untuk menyajikan URL publik custom domain R2. */
export function normalizePublicMediaBase(raw = process.env.R2_PUBLIC_URL): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("R2_PUBLIC_URL tidak valid (harus URL https:// atau http://).");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("R2_PUBLIC_URL wajib menggunakan protokol https:// atau http://.");
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${cleanPath}`;
}

export function buildMediaUrl(key: string, env: Record<string, string | undefined> = process.env): string {
  const cleanKey = key.replace(/^\/+/, "");
  if (!cleanKey || cleanKey.split("/").includes("..")) {
    throw new Error(`Kunci media tidak aman untuk URL: ${key}`);
  }
  const publicBase = normalizePublicMediaBase(env.R2_PUBLIC_URL);
  return publicBase ? `${publicBase}/${cleanKey}` : `/media/${cleanKey}`;
}

function hasAnyS3Env(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.S3_ENDPOINT?.trim() ||
      env.S3_BUCKET?.trim() ||
      env.S3_ACCESS_KEY_ID?.trim() ||
      env.S3_SECRET_ACCESS_KEY?.trim(),
  );
}

export function parseS3Config(env: Record<string, string | undefined> = process.env): S3StorageConfig {
  const endpointRaw = env.S3_ENDPOINT?.trim() ?? "";
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim() ?? "";
  const region = env.S3_REGION?.trim() || "auto";

  const missing: string[] = [];
  if (!endpointRaw) missing.push("S3_ENDPOINT");
  if (!bucket) missing.push("S3_BUCKET");
  if (!accessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (missing.length > 0) {
    throw new Error(`Konfigurasi Cloudflare R2 belum lengkap (${missing.join(", ")}).`);
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpointRaw);
  } catch {
    throw new Error("S3_ENDPOINT tidak valid (contoh: https://<account-id>.r2.cloudflarestorage.com).");
  }
  if (parsedEndpoint.protocol !== "https:" && parsedEndpoint.protocol !== "http:") {
    throw new Error("S3_ENDPOINT harus memakai https:// atau http://.");
  }

  return {
    endpoint: parsedEndpoint.origin + parsedEndpoint.pathname.replace(/\/+$/, ""),
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
  };
}

export function resolveStorageSelection(env: Record<string, string | undefined> = process.env): StorageSelection {
  const explicit = env.MEDIA_DRIVER?.trim().toLowerCase();
  if (explicit && explicit !== "s3" && explicit !== "local") {
    throw new Error(`MEDIA_DRIVER tidak dikenali: "${env.MEDIA_DRIVER}". Gunakan "s3" atau "local".`);
  }

  const isProd = env.NODE_ENV === "production";
  const allowLocalForE2e = env.SUMENEP_LOCAL_MEDIA_FOR_E2E_ONLY === "1";

  if (explicit === "s3" || (!explicit && hasAnyS3Env(env))) {
    return { driver: "s3", s3: parseS3Config(env) };
  }

  if (isProd && !allowLocalForE2e) {
    throw new Error(
      "Penyimpanan media produksi wajib menggunakan Cloudflare R2 (MEDIA_DRIVER=s3 beserta S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). LocalStorage dilarang di production.",
    );
  }

  return { driver: "local", root: path.resolve(env.MEDIA_ROOT || "media") };
}

export class LocalStorage implements MediaStorage {
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

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "NoSuchKey" || err.name === "NotFound" || err.Code === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
}

async function bodyToBuffer(body: unknown): Promise<Buffer | null> {
  if (!body) return null;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3Storage implements MediaStorage {
  private readonly client: S3CommandSender;
  private readonly bucket: string;

  constructor(config: S3StorageConfig, client?: S3CommandSender) {
    this.bucket = config.bucket;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        // Cloudflare R2 S3-compatible endpoint memakai path-style (/bucket/key) agar sertifikat TLS selalu cocok.
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const safeKey = assertMediaKey(key);
    const mime = contentType.trim() || "application/octet-stream";
    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: safeKey,
      Body: data,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    };
    await this.client.send(new PutObjectCommand(input));
  }

  async get(key: string): Promise<Buffer | null> {
    const safeKey = assertMediaKey(key);
    const input: GetObjectCommandInput = { Bucket: this.bucket, Key: safeKey };
    try {
      const response = (await this.client.send(new GetObjectCommand(input))) as { Body?: unknown };
      return await bodyToBuffer(response?.Body);
    } catch (error) {
      if (isS3NotFound(error)) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    const safeKey = assertMediaKey(key);
    const input: DeleteObjectCommandInput = { Bucket: this.bucket, Key: safeKey };
    await this.client.send(new DeleteObjectCommand(input));
  }
}

export function createMediaStorage(env: Record<string, string | undefined> = process.env): MediaStorage {
  const selection = resolveStorageSelection(env);
  return selection.driver === "s3" ? new S3Storage(selection.s3) : new LocalStorage(selection.root);
}

let storage: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  storage ??= createMediaStorage(process.env);
  return storage;
}

export function resetMediaStorageForTests(): void {
  storage = undefined;
}
