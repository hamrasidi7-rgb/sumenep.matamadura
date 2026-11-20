import { AUTH } from "./config";

// In-process limits that protect the server itself. The database limits
// (per-IP failures, account lockout) are the real brute-force defence; these
// only stop a burst of parallel requests from exhausting CPU and memory with
// scrypt (about 128 MiB each). Hostinger runs one Node process, so in-memory
// state is enough here.

export class BusyError extends Error {
  constructor() {
    super("Server sibuk memproses login.");
    this.name = "BusyError";
  }
}

export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiting.length >= this.maxQueue) throw new BusyError();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // hand the slot over directly
      else this.active--;
    }
  }

  get stats() {
    return { active: this.active, waiting: this.waiting.length };
  }
}

const state = globalThis as unknown as { sumenepHashLimiter?: Semaphore; sumenepInFlight?: Map<string, number> };

/** Every scrypt verification during login and password change goes through this. */
export const hashLimiter = (state.sumenepHashLimiter ??= new Semaphore(AUTH.maxConcurrentHashes, AUTH.maxQueuedHashes));

const inFlight = (state.sumenepInFlight ??= new Map<string, number>());

/** Reserve a login slot for this IP; returns a release function, or null when the IP is busy. */
export function enterIp(ip: string, max: number = AUTH.ipMaxInFlight): (() => void) | null {
  const current = inFlight.get(ip) ?? 0;
  if (current >= max) return null;
  inFlight.set(ip, current + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (inFlight.get(ip) ?? 1) - 1;
    if (left <= 0) inFlight.delete(ip);
    else inFlight.set(ip, left);
  };
}
