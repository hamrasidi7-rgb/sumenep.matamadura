"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

// Seksi pengaturan yang dapat dibuka-tutup (adaptasi Busacare SeksiPengaturan).
// Nilai awal state selalu false (kecuali defaultOpen) agar cocok dengan SSR,
// lalu bukaDiDesktop membuka otomatis pada viewport >= 1024px setelah mount.
export function SettingsSection({
  id,
  title,
  summary,
  openOnDesktop = false,
  defaultOpen = false,
  openSignal = 0,
  children,
}: {
  id?: string;
  title: string;
  summary?: string;
  openOnDesktop?: boolean;
  defaultOpen?: boolean;
  openSignal?: number;
  children: ReactNode;
}) {
  const panelId = useId();
  const headingId = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!openOnDesktop) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(min-width: 1024px)").matches) setOpen(true);
  }, [openOnDesktop]);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  return (
    <section id={id} aria-labelledby={headingId} className="admin-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-warm/50"
      >
        <span className="min-w-0">
          <span id={headingId} className="font-display block text-lg font-semibold leading-snug text-ink">
            {title}
          </span>
          {summary && <span className="mt-0.5 block truncate text-xs text-muted">{summary}</span>}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}
