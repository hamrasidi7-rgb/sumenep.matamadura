"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(/\/$/, "");

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .16 5.33.16 11.9c0 2.1.55 4.14 1.59 5.95L0 24l6.33-1.66a11.86 11.86 0 0 0 5.73 1.46h.01c6.56 0 11.9-5.34 11.9-11.9 0-3.18-1.24-6.17-3.45-8.42ZM12.07 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.22-3.76.99 1-3.66-.24-.38a9.86 9.86 0 0 1-1.51-5.25c0-5.46 4.44-9.9 9.91-9.9 2.65 0 5.14 1.03 7.01 2.91a9.83 9.83 0 0 1 2.9 7c0 5.46-4.44 9.9-9.9 9.9Zm5.43-7.41c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current">
      <path d="M13.5 22v-8.2h2.76l.41-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14c-.3-.04-1.31-.13-2.49-.13-2.47 0-4.16 1.51-4.16 4.27v2.32H7.34v3.2h2.8V22h3.36Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current">
      <path d="M18.24 2.25h3.31l-7.23 8.26L22.82 21.75h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current">
      <path d="M21.93 3.28a1.25 1.25 0 0 0-1.34-.19L2.48 10.22a1.2 1.2 0 0 0 .08 2.26l4.47 1.44 1.66 5.23a1.05 1.05 0 0 0 1.74.44l2.58-2.45 4.46 3.27a1.25 1.25 0 0 0 1.96-.75l2.84-15.13a1.25 1.25 0 0 0-.34-1.25ZM9.65 14.37l-.48 3.16-1.1-3.48 9.29-6.63-7.71 6.95Z" />
    </svg>
  );
}

/**
 * Bilah berbagi minimalis dalam satu baris horizontal:
 * WhatsApp, Facebook, X, Telegram, dan Salin Tautan.
 * Tinggi seragam (36px), label ringkas agar tidak turun baris di mobile maupun desktop.
 */
export function ShareArticle({
  path,
  title,
  compact = false,
  className = "",
}: {
  path: string;
  title: string;
  compact?: boolean;
  className?: string;
}) {
  const url = `${SITE_URL}${path}`;
  const [copied, setCopied] = useState(false);

  const enc = encodeURIComponent;
  const links = [
    {
      key: "whatsapp",
      aria: "Bagikan ke WhatsApp",
      short: "WA",
      full: "WhatsApp",
      href: `https://wa.me/?text=${enc(`${title} ${url}`)}`,
      icon: <WhatsAppIcon />,
    },
    {
      key: "facebook",
      aria: "Bagikan ke Facebook",
      short: "FB",
      full: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
      icon: <FacebookIcon />,
    },
    {
      key: "x",
      aria: "Bagikan ke X",
      short: "X",
      full: "X",
      href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}`,
      icon: <XIcon />,
    },
    {
      key: "telegram",
      aria: "Bagikan ke Telegram",
      short: "TG",
      full: "Telegram",
      href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`,
      icon: <TelegramIcon />,
    },
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

  const itemClass = compact
    ? "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-line bg-paper px-2 font-sans text-xs font-medium whitespace-nowrap text-[#3f3f46] transition-colors hover:border-[#292929] hover:bg-warm hover:text-[#171717]"
    : "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-paper px-2.5 font-sans text-xs font-medium whitespace-nowrap text-[#3f3f46] transition-colors hover:border-[#292929] hover:bg-warm hover:text-[#171717]";

  return (
    <div
      data-share-bar=""
      className={`flex max-w-full shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      role="group"
      aria-label="Bagikan artikel"
    >
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={itemClass}
          aria-label={l.aria}
          title={l.aria}
        >
          {l.icon}
          {compact ? (
            <span>{l.short}</span>
          ) : (
            <>
              <span className="sm:hidden">{l.short}</span>
              <span className="hidden sm:inline">{l.full}</span>
            </>
          )}
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        className={itemClass}
        aria-label={copied ? "Tautan disalin" : "Salin tautan artikel"}
        title={copied ? "Tautan disalin" : "Salin tautan"}
        aria-live="polite"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
        ) : (
          <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        {compact ? (
          <span>{copied ? "Disalin" : "Salin"}</span>
        ) : (
          <>
            <span className="sm:hidden">{copied ? "Disalin" : "Salin"}</span>
            <span className="hidden sm:inline">{copied ? "Disalin" : "Salin Tautan"}</span>
          </>
        )}
      </button>
    </div>
  );
}
