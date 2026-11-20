import { randomBytes } from "node:crypto";

// The Admin that scripts/test/run-e2e-tests.ts creates in its throw-away
// database. The password is generated for each run and handed over in
// E2E_ADMIN_PASSWORD — no password is written in the repository.

export function generateTestPassword(label: string): string {
  return `e2e ${randomBytes(12).toString("base64url")} ${label}`;
}

export const E2E_ADMIN = {
  email: "admin.uji@sumenep.test",
  name: "Admin Uji",
  get password(): string {
    const value = process.env.E2E_ADMIN_PASSWORD;
    if (!value) throw new Error("E2E_ADMIN_PASSWORD missing — run through npm run test:e2e");
    return value;
  },
};
