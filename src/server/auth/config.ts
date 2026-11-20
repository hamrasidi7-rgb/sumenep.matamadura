// Authentication policy for the single Admin account. One place for every
// number, so docs, tests and code agree. Changing a value here needs approval.

export const AUTH = {
  /** A session ends 8 hours after the last valid activity (DB CHECK enforces the maximum). */
  sessionIdleHours: 8,
  /** Activity extends the session at most once per 5 minutes (fewer database writes). */
  extendAfterMinutes: 5,
  /** Consecutive wrong passwords before the account is locked… */
  lockoutThreshold: 5,
  /** …for this long. */
  lockoutMinutes: 15,
  /** Per-IP limit: this many failed attempts within the window blocks the IP. */
  ipMaxFailures: 10,
  ipWindowMinutes: 15,
  /** At most this many logins from one IP are processed at the same time. */
  ipMaxInFlight: 2,
  /** scrypt uses ~128 MiB per hash: cap concurrent hashes and the queue behind them. */
  maxConcurrentHashes: 2,
  maxQueuedHashes: 20,
  /** login_attempt rows and ended sessions are kept this long. */
  retentionDays: 30,
} as const;

export const SESSION_TTL_MS = AUTH.sessionIdleHours * 3600_000;
export const EXTEND_AFTER_MS = AUTH.extendAfterMinutes * 60_000;
export const LOCKOUT_MS = AUTH.lockoutMinutes * 60_000;
export const IP_WINDOW_MS = AUTH.ipWindowMinutes * 60_000;
