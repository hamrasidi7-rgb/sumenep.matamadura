// Shared helpers for the operator CLIs (scripts/admin/*, scripts/db/*).
// Nothing here prints a secret: passwords are only read, never echoed, and
// connection strings are reduced to host/database before display.
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "node:util";

import { ZodError } from "zod";

import { describeTarget } from "../../src/server/db/client";
import { firstIssue } from "../../src/server/validation/admin";

export const EXIT = { ok: 0, error: 1, refused: 2, invalid: 3 } as const;

/** Thrown for expected refusals (exit code 2), e.g. "an Admin already exists". */
export class Refusal extends Error {}

/**
 * --env-file <path> overrides the environment; otherwise .env fills in only
 * what is not already set (so a caller's DIRECT_URL always wins).
 */
export function loadEnv(envFile?: string): void {
  if (envFile) {
    if (!fs.existsSync(envFile)) throw new Error(`File env tidak ditemukan: ${envFile}`);
    Object.assign(process.env, parseEnv(fs.readFileSync(envFile, "utf8")));
    return;
  }
  if (fs.existsSync(".env")) {
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(".env", "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function targetLabel(url: string): string {
  const t = describeTarget(url);
  return `${t.host}/${t.database}${t.isLocal ? " (lokal)" : " (REMOTE)"}`;
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Typed input that is not echoed. Needs an interactive terminal. */
export function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.reject(new Refusal("Tidak ada terminal interaktif: gunakan --password-stdin atau --generate."));
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Refusal("Dibatalkan."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** The whole of stdin, minus one trailing newline. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

/** Remote databases need --yes or a typed "ya". */
export async function confirmTarget(url: string, action: string, yes: boolean): Promise<void> {
  const target = describeTarget(url);
  console.log(`Database: ${targetLabel(url)}`);
  if (target.isLocal || yes) return;
  if (!process.stdin.isTTY) throw new Refusal(`Database remote: tambahkan --yes untuk ${action}.`);
  const answer = await ask(`Lanjutkan ${action} pada database remote ini? Ketik "ya": `);
  if (answer.toLowerCase() !== "ya") throw new Refusal("Dibatalkan.");
}

/** Runs a CLI main(), maps errors to exit codes, never prints stack traces of secrets. */
export async function runCli(main: () => Promise<void>, cleanup?: () => Promise<void>): Promise<void> {
  let code: number = EXIT.ok;
  try {
    await main();
  } catch (error) {
    if (error instanceof ZodError) {
      console.error(`Input tidak valid: ${firstIssue(error)}`);
      code = EXIT.invalid;
    } else if (error instanceof Refusal || (error instanceof Error && /Exists|Missing/.test(error.name))) {
      console.error((error as Error).message);
      code = EXIT.refused;
    } else {
      console.error(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
      if (process.env.DEBUG) console.error(error);
      code = EXIT.error;
    }
  } finally {
    await cleanup?.();
  }
  process.exitCode = code;
}
