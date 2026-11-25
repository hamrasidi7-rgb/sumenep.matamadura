import Link from "next/link";
import { Fragment } from "react";

import type { Inline } from "@/content/types";

const SIZE_CLASS: Record<"sm" | "lg" | "xl", string> = {
  sm: "text-[0.89em]",
  lg: "text-[1.14em]",
  xl: "text-[1.28em] leading-[1.35]",
};

/** Renders inline runs. Text is always escaped by React; colors/highlights/hrefs are pre-validated. */
export function RichInline({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((c, i) => {
        if ("lineBreak" in c) return <br key={i} />;
        let node: React.ReactNode = c.text;
        if (c.code) node = <code className="rounded bg-warm px-1 py-0.5 font-mono text-[0.88em]">{node}</code>;
        if (c.bold) node = <strong className="font-bold">{node}</strong>;
        if (c.italic) node = <em>{node}</em>;
        if (c.underline) node = <u>{node}</u>;
        if (c.strike) node = <s>{node}</s>;
        if (c.highlight) {
          node = (
            <mark className="rounded-[2px] px-1 py-0.5 text-[#252525]" style={{ backgroundColor: c.highlight }}>
              {node}
            </mark>
          );
        }
        if (c.color || c.fontSize) {
          node = (
            <span className={c.fontSize ? SIZE_CLASS[c.fontSize] : undefined} style={c.color ? { color: c.color } : undefined}>
              {node}
            </span>
          );
        }
        if (c.href) {
          node =
            c.href.startsWith("/") || c.href.startsWith("#") ? (
              <Link href={c.href} className="article-link">
                {node}
              </Link>
            ) : (
              <a
                href={c.href}
                className="article-link"
                {...(c.newTab ? { target: "_blank", rel: "noopener noreferrer" } : { rel: "noopener" })}
              >
                {node}
              </a>
            );
        }
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}
