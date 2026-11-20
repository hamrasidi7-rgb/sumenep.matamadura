import type { PrismaClient } from "@prisma/client";

import { logActivity } from "@/server/activity-log";
import { hashPassword } from "@/server/auth/password";
import { isUniqueViolation } from "@/server/db/errors";
import { adminBootstrapSchema, type AdminBootstrapInput } from "@/server/validation/admin";

// Creates the first and only Admin. Used by scripts/admin/bootstrap.ts — there
// is deliberately no web route, Server Action or API that creates an account.

export class AdminExistsError extends Error {
  constructor() {
    super("Admin sudah ada. SUMENEP hanya memiliki satu akun Admin; gunakan admin:recover untuk memulihkan akses.");
    this.name = "AdminExistsError";
  }
}

export async function adminExists(db: PrismaClient): Promise<boolean> {
  return (await db.adminUser.count()) > 0;
}

export async function bootstrapAdmin(db: PrismaClient, input: AdminBootstrapInput) {
  const data = adminBootstrapSchema.parse(input);
  // Fail fast, before the (deliberately slow) password hash.
  if (await adminExists(db)) throw new AdminExistsError();
  const passwordHash = await hashPassword(data.password);

  try {
    return await db.$transaction(async (tx) => {
      // No id given: it defaults to 1, so a concurrent second bootstrap hits
      // the primary key and fails instead of creating another Admin.
      const admin = await tx.adminUser.create({
        data: { email: data.email, name: data.name, passwordHash },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      await logActivity(tx, {
        actor: "CLI",
        adminId: admin.id,
        action: "admin.bootstrap",
        entityType: "admin_user",
        entityId: String(admin.id),
        summary: "Akun Admin pertama dibuat lewat CLI.",
        meta: { email: admin.email },
      });
      return admin;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AdminExistsError();
    throw error;
  }
}
