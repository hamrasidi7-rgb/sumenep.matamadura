import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { SITE } from "@/lib/site";

import { makeMedia } from "../helpers/fixtures";
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

  test("homepage, article detail, search, and admin expose expected robots and canonical tags without demo content", async () => {
    const stamp = Date.now().toString(36);
    const slug = `seo-cms-article-${stamp}`;
    const kanal = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "politik-pemerintahan" } });
    const media = await makeMedia(owner, `seo-hero-${stamp}`);
    const author =
      (await owner.author.findFirst({ where: { isActive: true } })) ??
      (await owner.author.create({ data: { slug: `penulis-seo-${stamp}`, name: "Redaksi SEO", role: "Redaksi" } }));

    const created = await owner.article.create({
      data: {
        slug,
        title: `Laporan SEO CMS ${stamp}`,
        standfirst: "Artikel uji SEO dari database CMS.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: media.id,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - 60_000),
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi laporan." }] }] },
      },
    });

    try {
      const home = await http("/");
      assert.equal(home.status, 200);
      const homeHtml = await home.text();
      assert.match(homeHtml, /<meta name="robots" content="noindex, nofollow"/);
      assert.match(homeHtml, new RegExp(`<link rel="canonical" href="${SITE.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?"`));
      assert.equal(homeHtml.includes("Pratinjau desain"), false, "demo footer disclaimer must be removed");
      assert.equal(homeHtml.includes("Sumenep, Cerita yang Tumbuh di Ujung Kepulauan"), false, "demo seed hero must be removed");

      const article = await http(`/artikel/${slug}`);
      assert.equal(article.status, 200);
      const articleHtml = await article.text();
      assert.match(articleHtml, /<meta name="robots" content="noindex, nofollow"/);
      assert.ok(articleHtml.includes(`<link rel="canonical" href="${SITE.url}/artikel/${slug}"`));

      // Old demo slug must no longer be served
      const oldDemo = await http("/artikel/membaca-arah-pembangunan-sumenep");
      assert.equal(oldDemo.status, 404);

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
    } finally {
      await owner.article.delete({ where: { id: created.id } });
    }
  });

  test("/sitemap.xml serves valid XML with public routes & published CMS articles only (no demo slugs or private paths)", async () => {
    const stamp = Date.now().toString(36);
    const slug = `sitemap-cms-${stamp}`;
    const kanal = await owner.section.findFirstOrThrow({ where: { kind: "KANAL", slug: "politik-pemerintahan" } });
    const media = await makeMedia(owner, `sitemap-hero-${stamp}`);
    const author =
      (await owner.author.findFirst({ where: { isActive: true } })) ??
      (await owner.author.create({ data: { slug: `penulis-sm-${stamp}`, name: "Redaksi Sitemap", role: "Redaksi" } }));

    const created = await owner.article.create({
      data: {
        slug,
        title: `Sitemap CMS ${stamp}`,
        standfirst: "Artikel uji sitemap.",
        kanalId: kanal.id,
        authorId: author.id,
        heroMediaId: media.id,
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - 60_000),
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Isi sitemap." }] }] },
      },
    });

    try {
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
      assert.ok(xml.includes(`<loc>${SITE.url}/artikel/${slug}</loc>`), `missing CMS article ${slug} in sitemap`);
      assert.equal(xml.includes("/artikel/membaca-arah-pembangunan-sumenep"), false, "demo slug must not appear in sitemap");

      for (const forbidden of ["/admin", "/api/", "/pratinjau", "/cari"]) {
        assert.ok(!xml.includes(forbidden), `private route leaked in sitemap.xml: ${forbidden}`);
      }
    } finally {
      await owner.article.delete({ where: { id: created.id } });
    }
  });
});
