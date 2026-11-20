"use client";

import { ArrowUp, Bot, ExternalLink, FileText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CHATOR_MAX_QUESTION, type ChatorResponse, type ChatorSource } from "@/lib/chator";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; sources: ChatorSource[] }
  | { id: number; role: "notice"; text: string };

/** Message without its id, kept as a discriminated union. */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
type NewMessage = WithoutId<Message>;

const SUGGESTIONS = [
  "Apa saja rubrik di SUMENEP – Mata Madura?",
  "Bagaimana layanan kesehatan di wilayah kepulauan?",
  "Ringkas arah pembangunan Sumenep.",
];

const STATUS_TEXT: Record<Exclude<ChatorResponse["status"], "ok">, string> = {
  not_configured:
    "Chator AI belum tersambung ke basis pengetahuan MataGen.ai di lingkungan ini, jadi pertanyaan belum bisa dijawab. Kami tidak menampilkan jawaban buatan tanpa sumber.",
  busy: "Layanan Chator AI sedang sibuk. Silakan coba beberapa saat lagi.",
  error: "Terjadi gangguan saat menghubungi Chator AI. Silakan coba lagi.",
  rate_limited: "Terlalu banyak pertanyaan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.",
  invalid: "Pertanyaan tidak dapat diproses. Pastikan pertanyaan tidak kosong dan tidak terlalu panjang.",
};

function formatSourceDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function SourceList({ sources }: { sources: ChatorSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">Sumber rujukan</p>
      <ol className="mt-2 space-y-2.5">
        {sources.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.75} />
            <div className="min-w-0 font-sans text-[0.8125rem] leading-snug">
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2">
                  {s.title ?? `Sumber ${i + 1}`}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              ) : (
                <span className="font-medium text-ink">{s.title ?? `Cuplikan dokumen ${i + 1}`}</span>
              )}
              <span className="block text-muted">
                {s.date ? `Tanggal data: ${formatSourceDate(s.date)}` : "Tanggal data tidak tersedia"}
              </span>
              {s.snippet && <span className="mt-0.5 line-clamp-2 block text-muted italic">“{s.snippet}”</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function ChatorPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    let alive = true;
    fetch("/api/chator", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean }) => alive && setConfigured(Boolean(j.configured)))
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const push = (m: NewMessage) => setMessages((prev) => [...prev, { ...m, id: nextId.current++ } as Message]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    push({ role: "user", text: q });
    setDraft("");
    if (configured === false) {
      // Known not connected: answer honestly without a pointless request.
      push({ role: "notice", text: STATUS_TEXT.not_configured });
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/chator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as ChatorResponse;
      if (data.status === "ok" && data.answer) {
        push({ role: "assistant", text: data.answer, sources: data.sources ?? [] });
      } else {
        const key = data.status === "ok" ? "error" : data.status;
        push({ role: "notice", text: data.message ?? STATUS_TEXT[key] ?? STATUS_TEXT.error });
      }
    } catch {
      push({ role: "notice", text: STATUS_TEXT.error });
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="chator-title"
      className="sheet chator"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full flex-col bg-paper">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line py-2.5 pr-2 pl-4 pt-[calc(0.625rem+env(safe-area-inset-top))] lg:pt-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <Bot aria-hidden className="size-5" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="chator-title" className="font-display text-[1.1875rem] leading-tight font-bold text-ink">
              Chator AI
            </h2>
            <p className="font-sans text-xs text-muted">Powered by MataGen.ai</p>
          </div>
          <button type="button" onClick={onClose} className="tap rounded-full text-ink hover:text-brand" aria-label="Tutup Chator AI">
            <X aria-hidden className="size-6" strokeWidth={2} />
          </button>
        </div>

        {/* Conversation */}
        <div ref={log} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite">
          <div className="rounded-xl bg-warm p-4">
            <p className="font-display text-[1.0625rem] leading-snug text-ink">
              Halo, saya <strong>Chator AI</strong>, asisten pengetahuan tentang Sumenep.
            </p>
            <p className="mt-2 font-sans text-[0.875rem] leading-relaxed text-muted">
              Saya menjawab hanya dari sumber yang tersedia (artikel SUMENEP, dokumen resmi, dan data terverifikasi), lalu
              menampilkan rujukan serta tanggal datanya. Bila sumbernya tidak ada, saya akan mengatakannya.
            </p>
          </div>

          {configured === false && (
            <p role="status" className="mt-3 rounded-lg border border-line px-3.5 py-2.5 font-sans text-[0.8125rem] leading-snug text-muted">
              <span className="font-semibold text-brand">Belum tersambung.</span> Basis pengetahuan MataGen.ai untuk SUMENEP
              belum diaktifkan di lingkungan ini.
            </p>
          )}

          {messages.length === 0 && (
            <div className="mt-5">
              <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-muted uppercase">Coba tanyakan</p>
              <ul className="mt-2 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="min-h-11 w-full rounded-lg border border-line px-3.5 py-2 text-left font-sans text-[0.875rem] leading-snug text-ink transition-colors hover:border-brand hover:text-brand"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="mt-4 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex"}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 font-sans text-[0.9375rem] leading-snug whitespace-pre-wrap text-white">
                    {m.text}
                  </p>
                ) : m.role === "assistant" ? (
                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line px-3.5 py-3">
                    <p className="font-serif text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">{m.text}</p>
                    <SourceList sources={m.sources} />
                  </div>
                ) : (
                  <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-blush px-3.5 py-2.5 font-sans text-[0.875rem] leading-snug text-ink">
                    {m.text}
                  </p>
                )}
              </li>
            ))}
            {pending && (
              <li className="flex" aria-label="Chator AI sedang mencari sumber">
                <span className="inline-flex gap-1 rounded-2xl border border-line px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </li>
            )}
          </ol>
        </div>

        {/* Composer */}
        <form
          className="border-t border-line bg-paper px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-paper py-1.5 pr-1.5 pl-3.5 focus-within:border-ink">
            <label htmlFor="chator-input" className="sr-only">
              Pertanyaan untuk Chator AI
            </label>
            <textarea
              id="chator-input"
              ref={input}
              rows={1}
              value={draft}
              maxLength={CHATOR_MAX_QUESTION}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              placeholder="Tanyakan tentang Sumenep…"
              className="max-h-[7.5rem] min-h-11 flex-1 resize-none bg-transparent py-2.5 font-sans text-base leading-snug text-ink outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending}
              aria-label="Kirim pertanyaan"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-colors hover:bg-brand-deep disabled:bg-line disabled:text-muted"
            >
              <ArrowUp aria-hidden className="size-5" strokeWidth={2.25} />
            </button>
          </div>
          <p className="mt-2 px-1 text-center font-sans text-[0.6875rem] leading-snug text-muted">
            Jawaban AI dapat keliru. Selalu periksa sumber rujukan.
          </p>
        </form>
      </div>
    </dialog>
  );
}
