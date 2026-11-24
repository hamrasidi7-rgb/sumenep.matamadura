"use client";

import { Check, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatWhatsappChannelText } from "@/lib/whatsapp-channel";

// Tombol salin ringkasan + URL UTM untuk Saluran WhatsApp.
// Diadaptasi dari Busacare components/admin/salin-saluran-whatsapp.tsx.
export function WhatsappChannelCopy({
  title,
  standfirst,
  slug,
  siteUrl,
}: {
  title: string;
  standfirst?: string | null;
  slug: string;
  siteUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    const text = formatWhatsappChannelText({ title, standfirst, slug }, siteUrl);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Salin teks ini lalu tempel di Saluran WhatsApp:", text);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
    >
      {copied ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Tersalin — tempel di WA" : "Salin Saluran WA"}</span>
    </button>
  );
}
