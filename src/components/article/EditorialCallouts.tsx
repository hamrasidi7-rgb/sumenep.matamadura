import type { BoxTone, DividerVariant, FactBoxTone, LargeStatementTone } from "@/lib/editorial-tokens";

export function LargeStatement({
  headline,
  description,
  source,
  tone = "brand",
}: {
  headline: string;
  description?: string;
  source?: string;
  tone?: LargeStatementTone;
}) {
  const wrap =
    tone === "cream"
      ? "rounded-lg border border-[#E6DFD3] bg-[#FAF6F0] px-6 py-8 md:px-8 md:py-10"
      : "border-y border-[#DEDAD4] py-7 md:py-9";
  const accent = tone === "ink" ? "text-[#171717]" : "text-[#A61B2B]";

  return (
    <aside className={`clear-both my-10 text-center ${wrap}`} data-block="large-statement">
      <p className={`font-serif text-[2.25rem] leading-[1.08] font-bold tracking-[-0.02em] text-balance md:text-[3.125rem] ${accent}`}>
        {headline}
      </p>
      {description && (
        <p className="mx-auto mt-3 max-w-[38rem] font-serif text-[1.0625rem] leading-[1.55] text-[#252525] md:text-[1.1875rem]">
          {description}
        </p>
      )}
      {source && (
        <p className="mt-3 font-sans text-xs font-medium tracking-[0.06em] text-[#62666D] uppercase">
          {source}
        </p>
      )}
    </aside>
  );
}

const FACT_TONES: Record<FactBoxTone, string> = {
  cream: "border-[#E6DFD3] border-l-[#A61B2B] bg-[#FAF6F0]",
  mist: "border-[#E5E7EB] border-l-[#171717] bg-[#F4F5F6]",
  blush: "border-[#EBD5CE] border-l-[#A61B2B] bg-[#F8EFEC]",
};

export function FactBox({
  title,
  items,
  source,
  tone = "cream",
}: {
  title: string;
  items: string[];
  source?: string;
  tone?: FactBoxTone;
}) {
  return (
    <aside className={`clear-both my-9 rounded-r-lg border border-l-4 p-5 md:p-6 ${FACT_TONES[tone]}`} data-block="fact-box">
      <p className="font-sans text-[0.75rem] font-bold tracking-[0.11em] text-[#A61B2B] uppercase">
        Kotak Fakta
      </p>
      <h3 className="mt-1 font-serif text-[1.25rem] leading-snug font-bold text-[#252525] md:text-[1.375rem]">
        {title}
      </h3>
      {items.length > 0 && (
        <ul className="mt-3.5 space-y-2 border-t border-black/10 pt-3.5 font-sans text-[0.9375rem] leading-[1.55] text-[#252525] md:text-[1rem]">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#A61B2B]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {source && (
        <p className="mt-3.5 font-sans text-xs text-[#62666D]">
          Sumber: {source}
        </p>
      )}
    </aside>
  );
}

const CALLOUT_TONES: Record<BoxTone, { box: string; label: string; title: string; body: string }> = {
  cream: {
    box: "border-[#E6DFD3] border-l-[#A61B2B] bg-[#FAF6F0]",
    label: "text-[#A61B2B]",
    title: "text-[#252525]",
    body: "text-[#252525]",
  },
  blush: {
    box: "border-[#EBD5CE] border-l-[#A61B2B] bg-[#F8EFEC]",
    label: "text-[#8A1523]",
    title: "text-[#252525]",
    body: "text-[#252525]",
  },
  mist: {
    box: "border-[#E5E7EB] border-l-[#62666D] bg-[#F4F5F6]",
    label: "text-[#62666D]",
    title: "text-[#252525]",
    body: "text-[#252525]",
  },
  dark: {
    box: "border-[#171717] border-l-[#A61B2B] bg-[#171717]",
    label: "text-[#F8C4BD]",
    title: "text-white",
    body: "text-white/90",
  },
};

export function CalloutBox({
  label,
  title,
  body,
  tone = "cream",
}: {
  label?: string;
  title?: string;
  body: string;
  tone?: BoxTone;
}) {
  const theme = CALLOUT_TONES[tone];
  return (
    <aside className={`clear-both my-9 rounded-r-lg border border-l-4 p-5 md:p-6 ${theme.box}`} data-block="callout">
      {label && (
        <p className={`mb-1 font-sans text-[0.75rem] font-bold tracking-[0.11em] uppercase ${theme.label}`}>
          {label}
        </p>
      )}
      {title && (
        <h3 className={`font-serif text-[1.2rem] leading-snug font-bold md:text-[1.35rem] ${theme.title}`}>
          {title}
        </h3>
      )}
      {body && (
        <p className={`${title ? "mt-2" : ""} whitespace-pre-line font-serif text-[1rem] leading-[1.6] md:text-[1.0625rem] ${theme.body}`}>
          {body}
        </p>
      )}
    </aside>
  );
}

export function EditorialDivider({ variant = "editorial" }: { variant?: DividerVariant }) {
  if (variant === "dots") {
    return (
      <div className="clear-both my-10 text-center font-serif text-lg tracking-[0.65em] text-[#A61B2B]" role="separator" aria-hidden>
        •••
      </div>
    );
  }
  if (variant === "subtle") {
    return <hr className="clear-both my-10 border-0 border-t border-[#DEDAD4]" />;
  }
  return <hr className="clear-both mx-auto my-10 w-24 border-0 border-t-2 border-[#A61B2B]/65" />;
}
