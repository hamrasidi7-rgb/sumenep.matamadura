import type { PrismaClient } from "@prisma/client";

// Integrity guards applied by the database client to EVERY query the app or a
// CLI script makes through Prisma. They replace the PostgreSQL triggers that
// only reject or stamp, because a MariaDB user on shared hosting usually cannot
// create triggers (binary logging on, no SUPER: error 1419). When the host does
// allow it, the same rules are also installed as database triggers
// (prisma/sql/guard-triggers.sql), and a separate runtime user additionally
// lacks the privileges (scripts/db/grants.ts) — `npm run db:verify` reports
// which layers are active.
//
//   activity_log        append-only: no update/upsert/delete; created_at is
//                       always the database's (any value sent is dropped)
//   admin_user          never deleted (one Admin, changed in place)
//   homepage_settings,
//   site_settings       singletons: never deleted
//   section             kind never changes (kind cannot be sent in an update)
//   article             kanal must be a KANAL section, rubrik a RUBRIK section
//   homepage_rubric     only RUBRIK sections
//
// Raw SQL through Prisma ($queryRaw, $executeRaw and the *Unsafe variants) is
// screened too: statements that would change or remove Activity Log entries,
// delete the Admin or the singletons, or change triggers/table definitions are
// refused (rawSqlViolation). The app itself only runs two SELECT … FOR UPDATE.
// Someone holding the database password can still bypass all of this with
// their own SQL client — that is what the trigger and privilege layers are for.

export class GuardError extends Error {
  override name = "GuardError";
}

const PROTECTED_SQL: Array<[RegExp, string]> = [
  [/\b(?:update|delete\s+from|truncate(?:\s+table)?|replace\s+into|drop\s+table|alter\s+table|rename\s+table)\s+(?:`?\w+`?\s*\.\s*)?`?activity_log`?\b/i, "activity_log is append-only"],
  [/\bdelete\s+from\s+(?:`?\w+`?\s*\.\s*)?`?(?:admin_user|homepage_settings|site_settings)`?\b/i, "the Admin and the settings singletons cannot be deleted"],
  [/\b(?:drop|create|alter)\s+(?:definer\s*=\s*\S+\s+)?trigger\b/i, "triggers are changed by migrations only"],
  [/\b(?:drop|alter)\s+table\b/i, "tables are changed by migrations only"],
];

/** Why a raw SQL statement is refused, or null. Exported for tests. */
export function rawSqlViolation(sql: string): string | null {
  const text = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  for (const [pattern, message] of PROTECTED_SQL) if (pattern.test(text)) return message;
  return null;
}

/** SQL text of a raw query's arguments (template tag → Sql object; *Unsafe → string first). */
function rawSqlText(args: unknown): string {
  if (typeof args === "string") return args;
  if (Array.isArray(args)) return rawSqlText(args[0]);
  if (args && typeof args === "object") {
    const sql = args as { sql?: unknown; strings?: unknown };
    if (typeof sql.sql === "string") return sql.sql;
    if (Array.isArray(sql.strings)) return sql.strings.join(" ? ");
  }
  return "";
}

function screenRaw(args: unknown): void {
  const violation = rawSqlViolation(rawSqlText(args));
  if (violation) throw new GuardError(`${violation} (raw SQL refused)`);
}

function deny(message: string) {
  return (): never => {
    throw new GuardError(message);
  };
}

type Data = Record<string, unknown>;

function dropCreatedAt(data: unknown): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) if (row && typeof row === "object") delete (row as Data).createdAt;
}

function hasKind(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && "kind" in (data as Data) && (data as Data).kind !== undefined);
}

/** A section id written as `<field>Id` or as `<relation>: { connect: { id } }`. */
function sectionRef(data: unknown, field: string, relation: string): string | null | undefined {
  if (!data || typeof data !== "object") return undefined;
  const row = data as Data;
  if (row[field] !== undefined) return row[field] as string | null;
  const rel = row[relation] as { connect?: { id?: string }; disconnect?: boolean } | undefined;
  if (rel?.connect?.id) return rel.connect.id;
  return undefined;
}

const APPEND_ONLY = "activity_log is append-only";
const KIND_FIXED = "section.kind cannot change";

/**
 * Kind of each given section id, read OUTSIDE the caller's transaction and
 * connection pool (src/server/db/client.ts). Using the same pool would deadlock
 * when every pooled connection is held by a transaction waiting for this check.
 */
export type SectionKindLookup = (ids: string[]) => Promise<Map<string, "KANAL" | "RUBRIK">>;

export function withGuards(client: PrismaClient, lookupKinds: SectionKindLookup): PrismaClient {
  /**
   * The referenced sections must have the expected kind. Kind never changes
   * (guard below), so reading it outside the caller's transaction is safe. A
   * section not visible yet (created in the same, uncommitted transaction —
   * only the seed does that) is left to the foreign key.
   */
  async function expectKinds(refs: Array<[id: string | null | undefined, kind: "KANAL" | "RUBRIK", message: string]>): Promise<void> {
    const wanted = refs.filter((r): r is [string, "KANAL" | "RUBRIK", string] => typeof r[0] === "string");
    if (!wanted.length) return;
    const kindOf = await lookupKinds([...new Set(wanted.map((r) => r[0]))]);
    for (const [id, kind, message] of wanted) {
      const actual = kindOf.get(id);
      if (actual !== undefined && actual !== kind) throw new GuardError(message);
    }
  }
  const KANAL = "article.kanal_id must reference an existing KANAL section";
  const RUBRIK = "article.rubrik_id must reference an existing RUBRIK section";
  const BAND = "homepage_rubric.section_id must reference an existing RUBRIK section";
  const articleKinds = (data: unknown) =>
    Promise.all(
      (Array.isArray(data) ? data : [data]).map((row) =>
        expectKinds([
          [sectionRef(row, "kanalId", "kanal"), "KANAL", KANAL],
          [sectionRef(row, "rubrikId", "rubrik"), "RUBRIK", RUBRIK],
        ]),
      ),
    );
  const bandKinds = (data: unknown) =>
    Promise.all((Array.isArray(data) ? data : [data]).map((row) => expectKinds([[sectionRef(row, "sectionId", "section"), "RUBRIK", BAND]])));

  const guarded = client.$extends({
    name: "sumenep-integrity-guards",
    query: {
      $queryRaw({ args, query }) {
        screenRaw(args);
        return query(args);
      },
      $executeRaw({ args, query }) {
        screenRaw(args);
        return query(args);
      },
      $queryRawUnsafe({ args, query }) {
        screenRaw(args);
        return query(args);
      },
      $executeRawUnsafe({ args, query }) {
        screenRaw(args);
        return query(args);
      },
      activityLog: {
        create({ args, query }) {
          dropCreatedAt(args.data);
          return query(args);
        },
        createMany({ args, query }) {
          dropCreatedAt(args.data);
          return query(args);
        },
        update: deny(`${APPEND_ONLY}: UPDATE is not allowed`),
        updateMany: deny(`${APPEND_ONLY}: UPDATE is not allowed`),
        upsert: deny(`${APPEND_ONLY}: UPSERT is not allowed`),
        delete: deny(`${APPEND_ONLY}: DELETE is not allowed`),
        deleteMany: deny(`${APPEND_ONLY}: DELETE is not allowed`),
      },
      adminUser: {
        delete: deny("admin_user cannot be deleted (single Admin account)"),
        deleteMany: deny("admin_user cannot be deleted (single Admin account)"),
      },
      homepageSettings: {
        delete: deny("homepage_settings is a singleton and cannot be deleted"),
        deleteMany: deny("homepage_settings is a singleton and cannot be deleted"),
      },
      siteSettings: {
        delete: deny("site_settings is a singleton and cannot be deleted"),
        deleteMany: deny("site_settings is a singleton and cannot be deleted"),
      },
      article: {
        async create({ args, query }) {
          await articleKinds(args.data);
          return query(args);
        },
        async createMany({ args, query }) {
          await articleKinds(args.data);
          return query(args);
        },
        async update({ args, query }) {
          await articleKinds(args.data);
          return query(args);
        },
        async updateMany({ args, query }) {
          await articleKinds(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          await articleKinds([args.create, args.update]);
          return query(args);
        },
      },
      homepageRubric: {
        async create({ args, query }) {
          await bandKinds(args.data);
          return query(args);
        },
        async createMany({ args, query }) {
          await bandKinds(args.data);
          return query(args);
        },
        async update({ args, query }) {
          await bandKinds(args.data);
          return query(args);
        },
        async updateMany({ args, query }) {
          await bandKinds(args.data);
          return query(args);
        },
        async upsert({ args, query }) {
          await bandKinds([args.create, args.update]);
          return query(args);
        },
      },
      section: {
        update({ args, query }) {
          if (hasKind(args.data)) throw new GuardError(KIND_FIXED);
          return query(args);
        },
        updateMany({ args, query }) {
          if (hasKind(args.data)) throw new GuardError(KIND_FIXED);
          return query(args);
        },
        upsert({ args, query }) {
          if (hasKind(args.update)) throw new GuardError(KIND_FIXED);
          return query(args);
        },
      },
    },
  });
  // Query extensions do not change any model or result type.
  return guarded as unknown as PrismaClient;
}
