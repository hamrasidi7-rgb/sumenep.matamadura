import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma Client on the pure-JS `pg` driver (engineType = "client" in
// schema.prisma): no native query engine has to match the server's OS.
//
// Two connection strings, two roles:
//   DATABASE_URL  runtime role (DML only)        → the web app, getDb()
//   DIRECT_URL    owner role (migrations, CLI)   → scripts/admin/*, scripts/db/*

export interface ClientOptions {
  /** Max pooled connections. Keep small: managed Postgres plans cap connections. */
  max?: number;
}

/** `?schema=` is a Prisma parameter, not a `pg` one: pass it to the adapter instead. */
export function splitSchema(url: string): { connectionString: string; schema?: string } {
  const parsed = new URL(url);
  const schema = parsed.searchParams.get("schema") ?? undefined;
  parsed.searchParams.delete("schema");
  return { connectionString: parsed.toString(), schema };
}

export function createPrismaClient(url: string, options: ClientOptions = {}): PrismaClient {
  const { connectionString, schema } = splitSchema(url);
  const adapter = new PrismaPg(
    { connectionString, max: options.max ?? 5 },
    {
      schema,
      // A dropped idle connection (database restart, serverless suspend, network)
      // is replaced on the next query; log it instead of failing silently.
      onPoolError: (error) => console.warn(`[db] koneksi idle terputus: ${error.message}`),
      onConnectionError: (error) => console.warn(`[db] koneksi transaksi bermasalah: ${error.message}`),
    },
  );
  return new PrismaClient({ adapter });
}

export function requireEnv(name: "DATABASE_URL" | "DIRECT_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example and docs/05-backend-fondasi.md)`);
  return value;
}

/** host/database of a connection string, for messages. Never includes credentials. */
export function describeTarget(url: string): { host: string; database: string; isLocal: boolean } {
  const parsed = new URL(url);
  const host = parsed.hostname;
  return {
    host: parsed.port ? `${host}:${parsed.port}` : host,
    database: parsed.pathname.replace(/^\//, ""),
    isLocal: host === "127.0.0.1" || host === "localhost" || host === "::1",
  };
}
