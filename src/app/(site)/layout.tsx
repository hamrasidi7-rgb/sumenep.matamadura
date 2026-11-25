import type { Metadata, Viewport } from "next";
import { Inter, Lora, Newsreader, Source_Serif_4, Teko } from "next/font/google";

import { ChatorWidget } from "@/components/chator/ChatorWidget";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getSections } from "@/lib/content";
import { IS_PRODUCTION_SITE, SITE } from "@/lib/site";

import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal"],
  variable: "--font-source-serif-4",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const teko = Teko({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-wordmark",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} · ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: { card: "summary_large_image" },
  // Staging (default) is never indexed. Only NEXT_PUBLIC_SITE_ENV=production lifts this.
  robots: IS_PRODUCTION_SITE ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const sections = await getSections();
  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${newsreader.variable} ${lora.variable} ${sourceSerif4.variable} ${inter.variable} ${teko.variable}`}>
      <body>
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-paper focus:px-4 focus:py-2 focus:shadow"
        >
          Lewati ke konten
        </a>
        <SiteHeader sections={sections} />
        <main id="konten">{children}</main>
        <SiteFooter sections={sections} />
        <ChatorWidget />
      </body>
    </html>
  );
}
