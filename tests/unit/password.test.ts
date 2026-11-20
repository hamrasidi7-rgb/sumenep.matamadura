import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { describe, test } from "node:test";

import { generatePassword, hashPassword, needsRehash, SCRYPT_PARAMS, verifyPassword } from "@/server/auth/password";
import { adminPasswordSchema } from "@/server/validation/admin";

const PASSWORD = "garam pulau kangean 2026";

describe("scrypt password hashing", () => {
  test("stores algorithm, parameters, salt and key", async () => {
    const hash = await hashPassword(PASSWORD);
    // salt 16 bytes → 22 chars, key 64 bytes → 86 chars (base64url, no padding)
    assert.match(hash, /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    assert.deepEqual(SCRYPT_PARAMS, { N: 131072, r: 8, p: 1 });
  });

  test("verifies the right password and rejects others", async () => {
    const hash = await hashPassword(PASSWORD);
    assert.equal(await verifyPassword(PASSWORD, hash), true);
    assert.equal(await verifyPassword(PASSWORD + " ", hash), false);
    assert.equal(await verifyPassword("garam pulau kangean 2025", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });

  test("uses a fresh salt for every hash", async () => {
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword(PASSWORD, a), true);
    assert.equal(await verifyPassword(PASSWORD, b), true);
  });

  test("a tampered or malformed hash never verifies (and never throws)", async () => {
    const hash = await hashPassword(PASSWORD);
    const parts = hash.split("$");
    const flipped = parts[5].startsWith("A") ? "B" + parts[5].slice(1) : "A" + parts[5].slice(1);
    const tampered = [...parts.slice(0, 5), flipped].join("$");
    for (const bad of [tampered, "", "scrypt$1$2", `bcrypt$${parts.slice(1).join("$")}`, hash.replace("$131072$", "$33554432$"), hash.replace("$131072$", "$100000$")]) {
      assert.equal(await verifyPassword(PASSWORD, bad), false, bad.slice(0, 30));
    }
  });

  test("needsRehash flags hashes made with weaker parameters", async () => {
    const salt = randomBytes(16);
    const key = scryptSync(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 });
    const legacy = `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
    assert.equal(await verifyPassword(PASSWORD, legacy), true, "old hashes keep working");
    assert.equal(needsRehash(legacy), true);
    assert.equal(needsRehash(await hashPassword(PASSWORD)), false);
    assert.equal(needsRehash("not-a-hash"), true);
  });

  test("Unicode is normalised (NFKC) before hashing", async () => {
    const hash = await hashPassword("café di pasar anom sumenep");
    assert.equal(await verifyPassword("café di pasar anom sumenep", hash), true);
  });
});

describe("generatePassword", () => {
  test("24 base64url characters, unique, accepted by the password policy", () => {
    const passwords = new Set(Array.from({ length: 50 }, generatePassword));
    assert.equal(passwords.size, 50);
    for (const password of passwords) {
      assert.match(password, /^[A-Za-z0-9_-]{24}$/);
      assert.equal(adminPasswordSchema.safeParse(password).success, true);
    }
  });
});
