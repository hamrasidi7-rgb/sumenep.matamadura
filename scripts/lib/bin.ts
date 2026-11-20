// Run the project's Prisma and tsx CLIs with the current Node binary — no
// shell, no npx — so arguments (connection strings) are never re-parsed by
// cmd.exe or sh, and the child gets exactly the environment we pass.
// npm runs scripts from the project root, so paths are relative to cwd.
import { spawnSync } from "node:child_process";
import path from "node:path";

const BINS = {
  prisma: "node_modules/prisma/build/index.js",
  tsx: "node_modules/tsx/dist/cli.mjs",
} as const;

/** Returns the exit status; output goes straight to the terminal. */
export function runBin(
  name: keyof typeof BINS,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): number {
  const result = spawnSync(process.execPath, [path.resolve(BINS[name]), ...args], {
    env: options.env ?? process.env,
    input: options.input,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
