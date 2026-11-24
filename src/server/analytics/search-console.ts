import { createSign } from "node:crypto";
import { unstable_cache } from "next/cache";

// Integrasi opsional Google Search Console tanpa paket pihak ketiga (hanya node:crypto + fetch).
// Diadaptasi dari Busacare lib/search-console.ts, khusus untuk SUMENEP (tanpa ketergantungan GA4).
// Kredensial hanya dibaca di server lewat GSC_SITE_URL, GSC_CLIENT_EMAIL, dan GSC_PRIVATE_KEY.

export const GSC_CACHE_SECONDS = 1800;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SITES_URL = "https://www.googleapis.com/webmasters/v3/sites";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TIMEOUT_MS = 5000;
const DAYS_WINDOW = 28;

export interface SearchConsoleDateRange {
  start: string;
  end: string;
}

export interface SearchConsoleMetrics {
  impressions: number;
  clicks: number;
}

export type SearchConsoleStatus =
  | "available"
  | "empty"
  | "unconfigured"
  | "denied"
  | "failed";

export interface SearchConsoleDailyRow extends SearchConsoleMetrics {
  date: string;
}

export interface SearchConsoleBreakdown {
  status: SearchConsoleStatus;
  rows: (SearchConsoleMetrics & { text: string })[];
}

export interface SearchConsoleSummary {
  status: SearchConsoleStatus;
  siteUrl: string | null;
  fetchedAt: string;
  ranges: {
    current: SearchConsoleDateRange;
    previous: SearchConsoleDateRange;
  };
  current: SearchConsoleMetrics;
  previous: SearchConsoleMetrics;
  daily: SearchConsoleDailyRow[];
  queries: SearchConsoleBreakdown;
  pages: SearchConsoleBreakdown;
}

interface SearchConsoleConfig {
  siteUrl: string;
  clientEmail: string;
  privateKey: string;
}

export interface SearchConsoleApiRow {
  keys?: unknown;
  clicks?: unknown;
  impressions?: unknown;
}

class AccessDeniedError extends Error {}

function pacificDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function shiftIsoDate(isoDay: string, deltaDays: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays)).toISOString().slice(0, 10);
}

export function computeSearchConsoleRanges(now: Date): SearchConsoleSummary["ranges"] {
  const latestFinal = shiftIsoDate(pacificDate(now), -3);
  return {
    current: { start: shiftIsoDate(latestFinal, -(DAYS_WINDOW - 1)), end: latestFinal },
    previous: {
      start: shiftIsoDate(latestFinal, -(DAYS_WINDOW * 2 - 1)),
      end: shiftIsoDate(latestFinal, -DAYS_WINDOW),
    },
  };
}

function enumerateDays(range: SearchConsoleDateRange): string[] {
  return Array.from({ length: DAYS_WINDOW }, (_, idx) => shiftIsoDate(range.start, idx));
}

export function summarizeSearchConsoleRows(
  rows: SearchConsoleApiRow[],
  ranges: SearchConsoleSummary["ranges"],
): Pick<SearchConsoleSummary, "current" | "previous" | "daily"> {
  const currentDays = enumerateDays(ranges.current);
  const previousDays = enumerateDays(ranges.previous);
  const byDay = new Map<string, SearchConsoleMetrics>(
    [...previousDays, ...currentDays].map((d) => [d, { impressions: 0, clicks: 0 }]),
  );

  for (const row of rows) {
    const date = Array.isArray(row.keys) && row.keys.length === 1 ? row.keys[0] : null;
    const metric = typeof date === "string" ? byDay.get(date) : undefined;
    if (
      !metric ||
      typeof row.clicks !== "number" ||
      typeof row.impressions !== "number" ||
      !Number.isFinite(row.clicks) ||
      !Number.isFinite(row.impressions) ||
      row.clicks < 0 ||
      row.impressions < 0
    ) {
      throw new Error("Baris Search Console tidak valid");
    }
    metric.clicks += row.clicks;
    metric.impressions += row.impressions;
  }

  const sumRange = (days: string[]): SearchConsoleMetrics =>
    days.reduce(
      (acc, d) => {
        const m = byDay.get(d)!;
        acc.clicks += m.clicks;
        acc.impressions += m.impressions;
        return acc;
      },
      { impressions: 0, clicks: 0 },
    );

  return {
    current: sumRange(currentDays),
    previous: sumRange(previousDays),
    daily: currentDays.map((date) => ({ date, ...byDay.get(date)! })),
  };
}

function readGscConfig(): SearchConsoleConfig | null {
  const siteUrl = process.env.GSC_SITE_URL?.trim();
  const clientEmail = process.env.GSC_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!siteUrl || !clientEmail || !privateKey) return null;
  return { siteUrl, clientEmail, privateKey };
}

function signJwtAssertion(cfg: SearchConsoleConfig): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: cfg.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(cfg.privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

async function fetchAccessToken(cfg: SearchConsoleConfig): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signJwtAssertion(cfg),
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AccessDeniedError();
    throw new Error(`OAuth HTTP ${response.status}`);
  }
  const data = (await response.json()) as { access_token?: unknown };
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new Error("Respons OAuth tidak valid");
  }
  return data.access_token;
}

async function verifySiteAccess(siteUrl: string, token: string): Promise<void> {
  const response = await fetch(SITES_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AccessDeniedError();
    throw new Error(`Daftar properti HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    siteEntry?: { siteUrl?: unknown; permissionLevel?: unknown }[];
  };
  const allowed = Array.isArray(data.siteEntry) && data.siteEntry.some(
    (entry) =>
      entry?.siteUrl === siteUrl &&
      typeof entry.permissionLevel === "string" &&
      ["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(entry.permissionLevel),
  );
  if (!allowed) throw new AccessDeniedError();
}

async function querySearchAnalytics(
  siteUrl: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<SearchConsoleApiRow[]> {
  const response = await fetch(`${SITES_URL}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AccessDeniedError();
    throw new Error(`Search Analytics HTTP ${response.status}`);
  }
  const data = (await response.json()) as { rows?: unknown };
  if (data.rows !== undefined && !Array.isArray(data.rows)) {
    throw new Error("Format baris Search Analytics tidak valid");
  }
  return (data.rows as SearchConsoleApiRow[] | undefined) ?? [];
}

async function fetchBreakdown(
  siteUrl: string,
  token: string,
  range: SearchConsoleDateRange,
  dimension: "query" | "page",
): Promise<SearchConsoleBreakdown> {
  try {
    const raw = await querySearchAnalytics(siteUrl, token, {
      startDate: range.start,
      endDate: range.end,
      dimensions: [dimension],
      type: "web",
      aggregationType: dimension === "page" ? "auto" : "byProperty",
      dataState: "final",
      rowLimit: 10,
    });
    const rows = raw.map((row) => {
      const text = Array.isArray(row.keys) && row.keys.length === 1 ? row.keys[0] : null;
      if (
        typeof text !== "string" ||
        !text.trim() ||
        typeof row.clicks !== "number" ||
        typeof row.impressions !== "number" ||
        !Number.isFinite(row.clicks) ||
        !Number.isFinite(row.impressions) ||
        row.clicks < 0 ||
        row.impressions < 0
      ) {
        throw new Error("Baris rincian Search Console tidak valid");
      }
      return { text, clicks: row.clicks, impressions: row.impressions };
    });
    return { status: rows.length ? "available" : "empty", rows };
  } catch (error) {
    return { status: error instanceof AccessDeniedError ? "denied" : "failed", rows: [] };
  }
}

export async function getSearchConsoleSummary(): Promise<SearchConsoleSummary> {
  const now = new Date();
  const ranges = computeSearchConsoleRanges(now);
  const base: SearchConsoleSummary = {
    status: "unconfigured",
    siteUrl: process.env.GSC_SITE_URL?.trim() || null,
    fetchedAt: now.toISOString(),
    ranges,
    current: { impressions: 0, clicks: 0 },
    previous: { impressions: 0, clicks: 0 },
    daily: [],
    queries: { status: "unconfigured", rows: [] },
    pages: { status: "unconfigured", rows: [] },
  };

  const cfg = readGscConfig();
  if (!cfg) return base;

  try {
    const token = await fetchAccessToken(cfg);
    await verifySiteAccess(cfg.siteUrl, token);
    const dailyRows = await querySearchAnalytics(cfg.siteUrl, token, {
      startDate: ranges.previous.start,
      endDate: ranges.current.end,
      dimensions: ["date"],
      type: "web",
      aggregationType: "byProperty",
      dataState: "final",
      rowLimit: DAYS_WINDOW * 2,
    });
    const summarized = summarizeSearchConsoleRows(dailyRows, ranges);
    const [queries, pages] = await Promise.all([
      fetchBreakdown(cfg.siteUrl, token, ranges.current, "query"),
      fetchBreakdown(cfg.siteUrl, token, ranges.current, "page"),
    ]);
    const hasData =
      summarized.current.impressions > 0 ||
      summarized.current.clicks > 0 ||
      summarized.previous.impressions > 0 ||
      summarized.previous.clicks > 0;
    return { ...base, ...summarized, queries, pages, status: hasData ? "available" : "empty" };
  } catch (error) {
    const status: SearchConsoleStatus = error instanceof AccessDeniedError ? "denied" : "failed";
    return {
      ...base,
      status,
      queries: { status, rows: [] },
      pages: { status, rows: [] },
    };
  }
}

export const getSearchConsoleSummaryCached = unstable_cache(
  getSearchConsoleSummary,
  ["sumenep-search-console-v1", process.env.GSC_SITE_URL?.trim() ?? ""],
  { revalidate: GSC_CACHE_SECONDS },
);
