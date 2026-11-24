import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import {
  buildMediaUrl,
  defaultProductionMediaRoot,
  LocalStorage,
  normalizePublicMediaBase,
  parseS3Config,
  productionMediaRoot,
  resolveStorageSelection,
  S3Storage,
  type S3CommandSender,
} from "@/server/media/storage";

const VALID_S3_ENV = {
  NODE_ENV: "production",
  MEDIA_DRIVER: "s3",
  S3_ENDPOINT: "https://acct123.r2.cloudflarestorage.com/",
  S3_BUCKET: "sumenep-media",
  S3_ACCESS_KEY_ID: "AKIA_TEST_KEY",
  S3_SECRET_ACCESS_KEY: "super-secret-value-never-leaked",
};

describe("media storage configuration", () => {
  const app = path.resolve(os.tmpdir(), "sumenep-app");
  const outside = path.resolve(os.tmpdir(), "sumenep-media");

  test("production uses the local disk, in an absolute MEDIA_ROOT outside the app directory", () => {
    const selection = resolveStorageSelection({ NODE_ENV: "production", MEDIA_ROOT: outside }, app);
    assert.deepEqual(selection, { driver: "local", root: outside });
    // Stray S3 variables never switch production to a bucket: only MEDIA_DRIVER=s3 does.
    const stray = resolveStorageSelection({ NODE_ENV: "production", MEDIA_ROOT: outside, S3_ENDPOINT: "https://x.r2.cloudflarestorage.com" }, app);
    assert.equal(stray.driver, "local");
  });

  test("production without MEDIA_ROOT uses ~/sumenep-data/media (outside every deploy folder)", () => {
    assert.deepEqual(resolveStorageSelection({ NODE_ENV: "production" }, app), {
      driver: "local",
      root: path.join(os.homedir(), "sumenep-data", "media"),
    });
    assert.equal(defaultProductionMediaRoot("/home/u123456789"), path.join("/home/u123456789", "sumenep-data", "media"));
  });

  test("production refuses a relative, in-app or .next MEDIA_ROOT", () => {
    assert.throws(() => resolveStorageSelection({ NODE_ENV: "production", MEDIA_ROOT: "media" }, app), /path absolut/);
    assert.throws(() => resolveStorageSelection({ NODE_ENV: "production", MEDIA_ROOT: path.join(app, "media") }, app), /di dalam direktori aplikasi/);
    assert.throws(() => resolveStorageSelection({ NODE_ENV: "production", MEDIA_ROOT: app }, app), /di dalam direktori aplikasi/);
    assert.throws(() => productionMediaRoot(path.join(outside, ".next", "media"), app), /\.next/);
  });

  test("LocalStorage keeps every file inside MEDIA_ROOT and survives a new instance (restart)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sumenep-media-unit-"));
    try {
      const key = "2026/11/0123456789abcdef.webp";
      await new LocalStorage(root).put(key, Buffer.from("webp"));
      assert.equal((await new LocalStorage(root).get(key))?.toString(), "webp", "a fresh instance reads what an earlier one wrote");
      await assert.rejects(() => new LocalStorage(root).put("../../evil.webp", Buffer.from("x")), /Kunci media tidak valid/);
      assert.equal(await new LocalStorage(root).get("../../etc/passwd"), null, "an invalid key reads nothing");
      const leftovers = (await fs.readdir(path.join(root, "2026", "11"))).filter((f) => f.endsWith(".tmp"));
      assert.deepEqual(leftovers, [], "no temporary files left behind");
      await new LocalStorage(root).remove(key);
      assert.equal(await new LocalStorage(root).get(key), null);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("incomplete S3 credentials fail clearly without leaking secret values", () => {
    assert.throws(
      () =>
        parseS3Config({
          S3_ENDPOINT: "https://acct123.r2.cloudflarestorage.com",
          S3_BUCKET: "sumenep-media",
          S3_ACCESS_KEY_ID: "AKIA_TEST_KEY",
          S3_SECRET_ACCESS_KEY: "",
        }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        assert.match(message, /S3_SECRET_ACCESS_KEY/);
        assert.doesNotMatch(message, /AKIA_TEST_KEY/);
        return true;
      },
    );
  });

  test("optional S3/R2 driver only with MEDIA_DRIVER=s3; region defaults to auto", () => {
    const selection = resolveStorageSelection(VALID_S3_ENV);
    assert.equal(selection.driver, "s3");
    if (selection.driver !== "s3") return;
    assert.equal(selection.s3.endpoint, "https://acct123.r2.cloudflarestorage.com");
    assert.equal(selection.s3.bucket, "sumenep-media");
    assert.equal(selection.s3.region, "auto");
  });

  test("development uses LocalStorage when S3 is not configured", () => {
    const selection = resolveStorageSelection({ NODE_ENV: "development", MEDIA_ROOT: "media" });
    assert.equal(selection.driver, "local");
  });
});

describe("S3Storage (Cloudflare R2 adapter)", () => {
  const key = "2026/11/0123456789abcdef.webp";
  const config = parseS3Config(VALID_S3_ENV);

  test("put, get, and remove issue correct S3 commands and reject traversal keys", async () => {
    const sent: unknown[] = [];
    const payload = Buffer.from("webp-bytes");
    const sender: S3CommandSender = {
      async send(command) {
        sent.push(command);
        if (command instanceof GetObjectCommand) {
          return {
            Body: {
              async transformToByteArray() {
                return new Uint8Array(payload);
              },
            },
          };
        }
        return {};
      },
    };

    const s3 = new S3Storage(config, sender);
    await s3.put(key, payload, "image/webp");
    const fetched = await s3.get(key);
    await s3.remove(key);

    assert.equal(fetched?.toString(), "webp-bytes");
    assert.equal(sent.length, 3);
    assert.ok(sent[0] instanceof PutObjectCommand);
    assert.equal(sent[0].input.Bucket, "sumenep-media");
    assert.equal(sent[0].input.Key, key);
    assert.equal(sent[0].input.ContentType, "image/webp");
    assert.equal(sent[0].input.CacheControl, "public, max-age=31536000, immutable");
    assert.ok(sent[1] instanceof GetObjectCommand);
    assert.equal(sent[1].input.Key, key);
    assert.ok(sent[2] instanceof DeleteObjectCommand);
    assert.equal(sent[2].input.Key, key);

    await assert.rejects(() => s3.put("../../bad.webp", payload, "image/webp"), /Kunci media tidak valid/);
    await assert.rejects(() => s3.get("2026/11/not-hex.webp"), /Kunci media tidak valid/);
  });

  test("get returns null on NoSuchKey / 404 and rethrows unexpected errors", async () => {
    const notFoundSender: S3CommandSender = {
      async send() {
        const err = new Error("missing") as Error & { name: string; $metadata: { httpStatusCode: number } };
        err.name = "NoSuchKey";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      },
    };
    assert.equal(await new S3Storage(config, notFoundSender).get(key), null);

    const brokenSender: S3CommandSender = {
      async send() {
        throw new Error("network timeout");
      },
    };
    await assert.rejects(() => new S3Storage(config, brokenSender).get(key), /network timeout/);
  });
});

describe("public R2 custom domain URL", () => {
  test("uses /media/<key> when R2_PUBLIC_URL is unset and normalized URL when set", () => {
    assert.equal(buildMediaUrl("2026/11/0123456789abcdef.webp", {}), "/media/2026/11/0123456789abcdef.webp");
    assert.equal(
      buildMediaUrl("2026/11/0123456789abcdef.webp", { R2_PUBLIC_URL: "https://media.sumenep.matamaduranews.com/" }),
      "https://media.sumenep.matamaduranews.com/2026/11/0123456789abcdef.webp",
    );
    assert.equal(
      normalizePublicMediaBase("https://cdn.example.com/sumenep/"),
      "https://cdn.example.com/sumenep",
    );
    assert.throws(() => normalizePublicMediaBase("ftp://cdn.example.com"), /R2_PUBLIC_URL/);
    assert.throws(() => buildMediaUrl("../secret.webp", {}), /Kunci media tidak aman/);
  });
});
