import Link from "next/link";

import { Logo } from "@/components/brand/Logo";
import { sectionHref } from "@/content/sections";
import type { Section } from "@/content/types";
import { CONTENT_SOURCE } from "@/lib/content";
import { FOOTER_LINKS, SITE } from "@/lib/site";

export function SiteFooter({ sections }: { sections: Section[] }) {
  const year = new Date().getFullYear();
  const col = (title: string, links: { href: string; label: string }[], wide = false) => (
    <div className={wide ? "col-span-2 md:col-span-1" : undefined}>
      <h2 className="font-sans text-xs font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
      <ul className="mt-3 space-y-0.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="link-underline font-display inline-flex min-h-10 items-center py-1 text-base leading-snug text-ink hover:text-brand md:min-h-9 md:text-[1.0625rem]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="border-t border-line bg-warm">
      <div className="container-site fab-clearance pt-10 md:pt-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:gap-y-10 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 xl:col-span-1">
            <Link href="/" className="inline-block" aria-label={`${SITE.name} — Beranda`}>
              <Logo alt="" className="h-auto w-[10.5rem]" />
            </Link>
            <p className="font-display mt-3 max-w-xs text-[1.0625rem] leading-snug text-ink">{SITE.tagline}.</p>
          </div>
          {col(
            "Kanal",
            sections.filter((s) => s.kind === "kanal").map((s) => ({ href: sectionHref(s), label: s.name })),
          )}
          {col(
            "Rubrik",
            sections.filter((s) => s.kind === "rubrik").map((s) => ({ href: sectionHref(s), label: s.name })),
          )}
          {col("Redaksi", [...FOOTER_LINKS], true)}
        </div>

        <div className="meta mt-10 flex flex-col gap-2 border-t border-line pt-6 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {SITE.name}. Bagian dari jaringan{" "}
            <a href={SITE.parentSite.url} className="link-underline text-ink">
              {SITE.parentSite.name}
            </a>
            .
          </p>
          {CONTENT_SOURCE === "seed" && (
            <p>Pratinjau desain: artikel yang tampil adalah konten contoh, bukan berita faktual.</p>
          )}
        </div>
      </div>
    </footer>
  );
}
