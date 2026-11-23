import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import {
  buildMediaUrl,
  normalizePublicMediaBase,
  parseS3Config,
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
  test("production refuses LocalStorage even if MEDIA_DRIVER=local is requested", () => {
    assert.throws(
      () => resolveStorageSelection({ NODE_ENV: "production", MEDIA_DRIVER: "local" }),
      /Cloudflare R2.*LocalStorage dilarang di production/,
    );
    assert.throws(
      () => resolveStorageSelection({ NODE_ENV: "production" }),
      /Cloudflare R2/,
    );
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

  test("auto-detects S3/R2 in production and defaults region to auto", () => {
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
