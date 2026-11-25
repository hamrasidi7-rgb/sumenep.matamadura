import Link from "next/link";

import { sectionHref } from "@/content/sections";
import type { Section } from "@/content/types";
import { FOOTER_LINKS, SITE } from "@/lib/site";

export function SiteFooter({ sections }: { sections: Section[] }) {
  const year = new Date().getFullYear();
  const col = (title: string, links: { href: string; label: string }[], wide = false) => (
    <div className={wide ? "col-span-2 md:col-span-1" : undefined}>
      <h2 className="font-display text-[var(--color-primary)] text-xs font-semibold tracking-[0.04em] uppercase">{title}</h2>
      <ul className="mt-3 space-y-0.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="link-underline font-sans inline-flex min-h-10 items-center py-1 text-base leading-snug text-[var(--color-text-primary)] hover:text-[var(--color-primary)] md:min-h-9 md:text-[1.0625rem]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="border-t border-border bg-[var(--color-surface)]">
      <div className="container-site fab-clearance pt-10 md:pt-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:gap-y-10 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 xl:col-span-1">
            <Link href="/" className="group inline-block py-0.5" aria-label={`${SITE.name} — Beranda`}>
              <div data-footer-wordmark="" className="flex flex-col items-center text-center select-none">
                <span
                  data-footer-logo-title=""
                  className="font-display pl-[0.03em] text-[clamp(1.78125rem,3.3vw,2.4375rem)] leading-[0.95] font-normal tracking-[0.03em] text-[#171717] uppercase md:pl-[0.04em] md:tracking-[0.04em]"
                >
                  SUMENEP
                </span>
                <span
                  data-footer-logo-subtext=""
                  className="mt-0.5 inline-flex items-baseline justify-center font-sans text-[clamp(0.96875rem,1.6vw,1.25rem)] leading-none font-semibold tracking-[-0.01em] lowercase md:mt-1"
                >
                  <span className="text-[#171717]">mata</span>
                  <span className="text-[#A6192E]">madura</span>
                </span>
              </div>
            </Link>
            <p className="font-sans mt-3 max-w-xs text-[1.0625rem] leading-snug text-[var(--color-text-primary)]">{SITE.tagline}.</p>
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

        <div className="meta mt-10 flex flex-col gap-2 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {SITE.name}. Bagian dari jaringan{" "}
            <a href={SITE.parentSite.url} className="link-underline text-[var(--color-text-primary)]">
              {SITE.parentSite.name}
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
