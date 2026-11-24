import { execSync } from "node:child_process";

import type { NextConfig } from "next";

/** "<commit> <build time>" shown on /api/status, to tell from outside which build is live. */
function buildLabel(): string {
  const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  try {
    return `${execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()} ${at}`;
  } catch {
    return `? ${at}`;
  }
}

function r2RemotePattern(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.R2_PUBLIC_URL?.trim();
  if (!raw) return [];
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
    const basePath = parsed.pathname.replace(/\/+$/, "");
    return [
      {
        protocol: parsed.protocol === "https:" ? "https" : "http",
        hostname: parsed.hostname,
        ...(parsed.port ? { port: parsed.port } : {}),
        pathname: `${basePath}/**`,
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { SUMENEP_BUILD: process.env.SUMENEP_BUILD || buildLabel() },
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.prisma/**/*",
      "./node_modules/.prisma/client/query_compiler_bg.wasm",
      "./node_modules/prisma/**/*",
      "./node_modules/@prisma/**/*",
      "./node_modules/c12/**/*",
      "./node_modules/chokidar/**/*",
      "./node_modules/citty/**/*",
      "./node_modules/confbox/**/*",
      "./node_modules/consola/**/*",
      "./node_modules/deepmerge-ts/**/*",
      "./node_modules/defu/**/*",
      "./node_modules/destr/**/*",
      "./node_modules/dotenv/**/*",
      "./node_modules/effect/**/*",
      "./node_modules/empathic/**/*",
      "./node_modules/exsolve/**/*",
      "./node_modules/fast-check/**/*",
      "./node_modules/giget/**/*",
      "./node_modules/jiti/**/*",
      "./node_modules/node-fetch-native/**/*",
      "./node_modules/nypm/**/*",
      "./node_modules/ohash/**/*",
      "./node_modules/pathe/**/*",
      "./node_modules/perfect-debounce/**/*",
      "./node_modules/pkg-types/**/*",
      "./node_modules/pure-rand/**/*",
      "./node_modules/rc9/**/*",
      "./node_modules/readdirp/**/*",
      "./node_modules/tinyexec/**/*",
      "./node_modules/@standard-schema/**/*",
      "./prisma/schema.prisma",
      "./prisma/migrations/**/*",
    ],
  },
  experimental: {
    // Requests matched by src/proxy.ts (/admin, /api/admin, /pratinjau) are
    // buffered by Next.js up to this size; the default 10 MB cut photo uploads
    // between 10 and 15 MB short (400 instead of the documented 15 MB limit).
    // 15 MB file + multipart overhead; /api/admin/media still refuses anything
    // larger with 413, and checks the Content-Length before reading the body.
    proxyClientMaxBodySize: "16mb",
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    remotePatterns: r2RemotePattern(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
