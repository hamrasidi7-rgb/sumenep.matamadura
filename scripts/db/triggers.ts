// Installs the optional guard triggers (prisma/sql/guard-triggers.sql) with the
// owner user (DIRECT_URL). They duplicate, at database level, the rules that the
// app-level guards (src/server/db/guards.ts) always enforce.
//
// On shared hosting MariaDB usually refuses CREATE TRIGGER for a user without
// SUPER while binary logging is on (error 1419), or the user lacks the TRIGGER
// privilege (1142/1227/1044). That is reported, not treated as a failure: the
// CMS works the same, only without the extra database layer.
//
//   npm run db:triggers [-- --env-file <path>] [-- --yes]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { requireEnv } from "../../src/server/db/client";
import { confirmTarget, loadEnv, runCli } from "../lib/cli";
import { withConnection } from "../lib/mariadb";

export const TRIGGER_FILE = path.join("prisma", "sql", "guard-triggers.sql");

/** Statements of the trigger file, split on lines "-- ;;". */
export function triggerStatements(file = TRIGGER_FILE): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split(/^-- ;;\s*$/m)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/** Trigger names the file creates. */
export function expectedTriggers(file = TRIGGER_FILE): string[] {
  return triggerStatements(file)
    .map((sql) => /^CREATE TRIGGER `([A-Za-z0-9_]+)`/.exec(sql)?.[1])
    .filter((name): name is string => Boolean(name))
    .sort();
}

const NOT_PERMITTED = new Set([1419, 1142, 1227, 1044, 1370]);

export type TriggerResult = { installed: true; count: number } | { installed: false; reason: string };

/** Host parts of a definer that stay valid wherever the app connects from. */
const STABLE_DEFINER_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "%"]);

export async function installGuardTriggers(directUrl: string, options: { allowRemoteDefiner?: boolean } = {}): Promise<TriggerResult> {
  const statements = triggerStatements();
  return withConnection(directUrl, async (conn) => {
    // A trigger runs as its DEFINER (the account that created it). Created over
    // Remote MySQL, the definer is e.g. 'u123_sumenep'@'203.0.113.7'; when that
    // remote-access entry is removed later, every INSERT/UPDATE the trigger
    // guards fails ("definer does not exist"). Install them from the server
    // itself (SSH/phpMyAdmin) instead.
    const [me] = (await conn.query("SELECT CURRENT_USER() AS who")) as Array<{ who: string }>;
    const host = me.who.slice(me.who.lastIndexOf("@") + 1);
    if (!STABLE_DEFINER_HOSTS.has(host) && !options.allowRemoteDefiner) {
      return { installed: false, reason: `koneksi remote (definer ${me.who.replace(/^[^@]*/, "<user>")}); pasang trigger dari server (SSH/phpMyAdmin) agar definer tidak bergantung pada IP` };
    }
    try {
      for (const sql of statements) await conn.query(sql);
    } catch (error) {
      const err = error as { errno?: number; sqlMessage?: string; message?: string };
      if (err.errno && NOT_PERMITTED.has(err.errno)) {
        // Leave no half-installed set behind (DROP needs the same privilege; ignore failures).
        for (const name of expectedTriggers()) await conn.query(`DROP TRIGGER IF EXISTS \`${name}\``).catch(() => undefined);
        return { installed: false, reason: `host menolak trigger (MariaDB ${err.errno}: ${err.sqlMessage ?? err.message})` };
      }
      throw error;
    }
    return { installed: true, count: expectedTriggers().length };
  });
}

export function describeTriggerResult(result: TriggerResult): string {
  return result.installed
    ? `Trigger penjaga terpasang (${result.count}).`
    : `Trigger penjaga TIDAK terpasang: ${result.reason}. Aturan tetap ditegakkan oleh guard aplikasi (src/server/db/guards.ts).`;
}

const isMain = process.argv[1] && /triggers\.ts$/.test(process.argv[1]);
if (isMain) {
  const { values } = parseArgs({
    options: { "env-file": { type: "string" }, yes: { type: "boolean", default: false } },
  });
  void runCli(async () => {
    loadEnv(values["env-file"]);
    const directUrl = requireEnv("DIRECT_URL");
    await confirmTarget(directUrl, "memasang trigger penjaga", values.yes);
    console.log(describeTriggerResult(await installGuardTriggers(directUrl)));
  });
}
