"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(/\/$/, "");

/**
 * Share links (plain URLs — no third-party scripts), copy link, and the native
 * share sheet where the browser supports it.
 */
export function ShareArticle({ path, title, compact = false, className = "" }: { path: string; title: string; compact?: boolean; className?: string }) {
  const url = `${SITE_URL}${path}`;
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const enc = encodeURIComponent;
  const links = [
    { label: "WhatsApp", href: `https://wa.me/?text=${enc(`${title} ${url}`)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { label: "X", href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Salin tautan artikel:", url);
    }
  }

  const pill =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 font-sans text-[0.8125rem] font-medium text-ink transition-colors hover:border-ink";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {!compact && <span className="mr-1 font-sans text-[0.8125rem] font-semibold text-muted">Bagikan:</span>}
      {canShare && (
        <button type="button" onClick={() => navigator.share({ title, url }).catch(() => {})} className={pill}>
          <Share2 aria-hidden className="size-4" /> Bagikan
        </button>
      )}
      {(!compact || !canShare) &&
        links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={pill} aria-label={`Bagikan ke ${l.label}`}>
            {l.label}
          </a>
        ))}
      <button type="button" onClick={copy} className={pill} aria-live="polite">
        {copied ? <Check aria-hidden className="size-4 text-brand" /> : <Link2 aria-hidden className="size-4" />}
        {copied ? "Tautan disalin" : "Salin tautan"}
      </button>
    </div>
  );
}
