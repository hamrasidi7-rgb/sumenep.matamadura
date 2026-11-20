import { createHash, randomBytes } from "node:crypto";

import { SESSION_TOKEN_PATTERN } from "./cookie";

// The browser keeps the raw token (in an httpOnly cookie); the database keeps
// only its SHA-256. A leaked database therefore holds no usable session.

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: string | undefined | null): token is string {
  return typeof token === "string" && SESSION_TOKEN_PATTERN.test(token);
}
