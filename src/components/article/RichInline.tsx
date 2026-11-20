import Link from "next/link";
import { Fragment } from "react";

import type { Inline } from "@/content/types";

/** Renders inline runs. Text is always escaped by React; hrefs are pre-validated. */
export function RichInline({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((c, i) => {
        if ("lineBreak" in c) return <br key={i} />;
        let node: React.ReactNode = c.text;
        if (c.code) node = <code className="rounded bg-warm px-1 py-0.5 font-mono text-[0.88em]">{node}</code>;
        if (c.bold) node = <strong className="font-semibold">{node}</strong>;
        if (c.italic) node = <em>{node}</em>;
        if (c.underline) node = <u>{node}</u>;
        if (c.strike) node = <s>{node}</s>;
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
