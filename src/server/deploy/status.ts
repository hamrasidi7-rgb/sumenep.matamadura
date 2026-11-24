// Result of the start-up setup (./auto-setup.ts). Kept on globalThis because
// instrumentation and route handlers are separate bundles in one Node process.
// Coarse, value-free notes only: /api/status shows them publicly.

export type StepState = "ok" | "skipped" | "error";

export interface SetupStep {
  name: string;
  state: StepState;
  note: string;
}

export interface SetupStatus {
  state: "not-run" | "running" | "ok" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  steps: SetupStep[];
}

const store = globalThis as unknown as { __sumenepSetup?: SetupStatus };

export function setupStatus(): SetupStatus {
  store.__sumenepSetup ??= { state: "not-run", startedAt: null, finishedAt: null, steps: [] };
  return store.__sumenepSetup;
}
