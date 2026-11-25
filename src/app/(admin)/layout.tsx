import type { Metadata, Viewport } from "next";
import { Inter, Lora, Newsreader } from "next/font/google";

import "./admin.css";

// Root layout of the CMS (/admin). Separate from the public site's layout: no
// site header, footer or Chator, and never indexed.

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const lora = Lora({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-lora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CMS SUMENEP – Mata Madura", template: "%s · CMS SUMENEP" },
  robots: { index: false, follow: false, nocache: true },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${newsreader.variable} ${lora.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
