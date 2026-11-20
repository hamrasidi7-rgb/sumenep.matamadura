import { NextResponse, type NextRequest } from "next/server";

import { CHATOR_MAX_QUESTION, type ChatorResponse, type ChatorSource } from "@/lib/chator";

// Server-side proxy to the MataGen.ai engine. The API key never reaches the
// browser. When MATAGEN_CHAT_URL / MATAGEN_CHAT_API_KEY are not set, it answers
// `not_configured` — it never generates an answer of its own.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_URL = process.env.MATAGEN_CHAT_URL?.trim() ?? "";
const UPSTREAM_KEY = process.env.MATAGEN_CHAT_API_KEY?.trim() ?? "";
const configured = () => Boolean(UPSTREAM_URL && UPSTREAM_KEY);

// Best-effort, per-instance rate limit (8 questions / minute / IP). A shared
// store (e.g. Redis) replaces this before production — see docs.
const WINDOW_MS = 60_000;
const LIMIT = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > LIMIT;
}

const reply = (body: ChatorResponse, status = 200) => NextResponse.json(body, { status });

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Accepts the current console-matagen-ai shape and the enriched one proposed for Tahap 6. */
function normalizeSource(raw: unknown): ChatorSource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const url = str(s.url) ?? str(s.source_url);
  return {
    title: str(s.title) ?? str(s.document_title) ?? str(s.source_title),
    url: url && /^https?:\/\//i.test(url) ? url : null,
    date: str(s.data_date) ?? str(s.date) ?? str(s.published_at),
    snippet: (str(s.snippet) ?? "").slice(0, 280),
  };
}

export async function GET() {
  return NextResponse.json({ configured: configured(), provider: "MataGen.ai" });
}

export async function POST(req: NextRequest) {
  let question: unknown;
  try {
    question = ((await req.json()) as { question?: unknown }).question;
  } catch {
    return reply({ status: "invalid", answer: null, sources: [] }, 400);
  }
  if (typeof question !== "string" || !question.trim() || question.length > CHATOR_MAX_QUESTION) {
    return reply({ status: "invalid", answer: null, sources: [] }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (rateLimited(ip)) return reply({ status: "rate_limited", answer: null, sources: [] }, 429);

  if (!configured()) return reply({ status: "not_configured", answer: null, sources: [] }, 503);

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": UPSTREAM_KEY },
      body: JSON.stringify({ question: question.trim() }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    if (!upstream.ok) return reply({ status: upstream.status === 429 ? "busy" : "error", answer: null, sources: [] }, 502);

    const data = (await upstream.json()) as { status?: string; answer?: unknown; sources?: unknown };
    const answer = str(data.answer);
    if (data.status !== "ok" || !answer) {
      return reply({ status: data.status === "busy" ? "busy" : "error", answer: null, sources: [] }, 502);
    }
    const sources = (Array.isArray(data.sources) ? data.sources : [])
      .map(normalizeSource)
      .filter((s): s is ChatorSource => s !== null)
      .slice(0, 6);
    return reply({ status: "ok", answer, sources });
  } catch (err) {
    console.error("[chator] upstream error", err instanceof Error ? err.message : err);
    return reply({ status: "error", answer: null, sources: [] }, 502);
  }
}
