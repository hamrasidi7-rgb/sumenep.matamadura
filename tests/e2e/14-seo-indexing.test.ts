import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { SITE } from "@/lib/site";

import { closeAll, http, mintSession, owner } from "./helpers";

after(closeAll);

describe("SEO indexing guard, canonical, robots, and sitemap (staging build default)", () => {
  test("/robots.txt stays fail-closed (Disallow: /) unless built in production mode", async () => {
    const res = await http("/robots.txt");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/i);
    const body = await res.text();
    assert.match(body, /User-Agent:\s*\*/i);
    assert.match(body, /^Disallow:\s*\/\s*$/m);
    assert.doesNotMatch(body, /^Allow:\s*\/\s*$/m);
  });

  test("/api/status reports indexing mode and presence of NEXT_PUBLIC_SITE_* variables without secrets", async () => {
    const res = await http("/api/status");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    const json = (await res.json()) as {
      indexing?: { mode?: string; robots?: string; siteUrl?: string };
      variabel?: Record<string, unknown>;
    };
    assert.equal(json.indexing?.mode, "staging");
    assert.equal(json.indexing?.robots, "disallow-all");
    assert.equal(json.indexing?.siteUrl, SITE.url);
    assert.ok(["ada", "kosong", "tidak ada"].includes(String(json.variabel?.NEXT_PUBLIC_SITE_ENV)));
    assert.ok(["ada", "kosong", "tidak ada"].includes(String(json.variabel?.NEXT_PUBLIC_SITE_URL)));
  });

  test("homepage, article detail, search, and admin expose expected robots and canonical tags", async () => {
    const home = await http("/");
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /<meta name="robots" content="noindex, nofollow"/);
    assert.match(homeHtml, new RegExp(`<link rel="canonical" href="${SITE.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?"`));

    const article = await http("/artikel/membaca-arah-pembangunan-sumenep");
    assert.equal(article.status, 200);
    const articleHtml = await article.text();
    assert.match(articleHtml, /<meta name="robots" content="noindex, nofollow"/);
    assert.ok(articleHtml.includes(`<link rel="canonical" href="${SITE.url}/artikel/membaca-arah-pembangunan-sumenep"`));

    const search = await http("/cari?q=sumenep");
    assert.equal(search.status, 200);
    const searchHtml = await search.text();
    assert.match(searchHtml, /<meta name="robots" content="noindex, follow"/);

    const previewAnon = await http("/pratinjau/tidak-ada");
    assert.equal(previewAnon.status, 307);
    assert.match(previewAnon.headers.get("location") ?? "", /\/admin\/login/);

    const session = await mintSession();
    const previewAuth = await http("/pratinjau/tidak-ada", { session });
    assert.equal(previewAuth.status, 404);
    assert.match(previewAuth.headers.get("x-robots-tag") ?? "", /noindex,\s*nofollow/);

    const login = await http("/admin/login");
    assert.equal(login.status, 200);
    assert.match(login.headers.get("x-robots-tag") ?? "", /noindex,\s*nofollow/);
  });

  test("/sitemap.xml serves valid XML with public routes, seed & published CMS articles, and no private paths", async () => {
    const res = await http("/sitemap.xml");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /xml/i);
    const xml = await res.text();

    assert.match(xml, /<urlset\b/);
    assert.ok(xml.includes(`<loc>${SITE.url}/</loc>`));
    assert.ok(xml.includes(`<loc>${SITE.url}/terbaru</loc>`));
    assert.ok(xml.includes(`<loc>${SITE.url}/pilihan</loc>`));
    assert.ok(xml.includes(`<loc>${SITE.url}/kanal/politik-pemerintahan</loc>`));
    assert.ok(xml.includes(`<loc>${SITE.url}/rubrik/catatan-sumenep</loc>`));
    assert.ok(xml.includes(`<loc>${SITE.url}/artikel/membaca-arah-pembangunan-sumenep</loc>`));

    const publishedCms = await owner.article.findMany({
      where: { status: "PUBLISHED", archivedAt: null, deletedAt: null },
      select: { slug: true },
      take: 5,
    });
    for (const item of publishedCms) {
      assert.ok(xml.includes(`<loc>${SITE.url}/artikel/${item.slug}</loc>`), `missing CMS article ${item.slug} in sitemap`);
    }

    for (const forbidden of ["/admin", "/api/", "/pratinjau", "/cari"]) {
      assert.ok(!xml.includes(forbidden), `private route leaked in sitemap.xml: ${forbidden}`);
    }
  });
});
