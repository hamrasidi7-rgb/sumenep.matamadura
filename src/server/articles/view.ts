import type { Prisma, PrismaClient } from "@prisma/client";

import type { ArticleTemplate, MediaAsset, Section } from "@/content/types";
import { docMediaIds, type DocNode } from "@/lib/article-doc";
import type { ArticleView } from "@/lib/content";
import { mediaByIds, toMediaAsset, toMediaDto } from "@/server/media/service";

import { docToBlocks } from "./blocks";
import { publicWhere } from "./status";
import { toTags } from "./tags";

// Database article → ArticleView, the exact shape the SUMENEP article
// templates already render. This is the adapter that lets the CMS feed the
// existing frontend without changing a single template component.

const include = {
  author: { include: { avatar: true } },
  kanal: true,
  rubrik: true,
  heroMedia: true,
  ogMedia: true,
} satisfies Prisma.ArticleInclude;

type FullArticle = Prisma.ArticleGetPayload<{ include: typeof include }>;

/** Shown in previews when no hero image has been chosen yet (public articles always have one). */
const PLACEHOLDER_HERO: MediaAsset = {
  src: "/og-default.png",
  width: 1200,
  height: 630,
  alt: "Gambar utama belum dipilih",
  caption: "Gambar utama belum dipilih.",
};

const TEMPLATE: Record<string, ArticleTemplate> = { STANDARD: "standard", FEATURE: "feature", SPOTLIGHT: "spotlight" };

function section(s: FullArticle["kanal"]): Section | undefined {
  return s ? { slug: s.slug, kind: s.kind === "KANAL" ? "kanal" : "rubrik", name: s.name, description: s.description } : undefined;
}

async function toView(db: PrismaClient, a: FullArticle, now: Date): Promise<ArticleView> {
  const body = (a.body ?? { type: "doc", content: [] }) as unknown as DocNode;
  const ids = docMediaIds(body);
  const media = await mediaByIds(db, [...ids.body, ...ids.gallery]);
  const blocks = docToBlocks(body, (id, override) => {
    const m = media.get(id);
    return m ? toMediaAsset(m, override) : null;
  });
  const hero = a.heroMedia ? toMediaAsset(toMediaDto(a.heroMedia)) : PLACEHOLDER_HERO;
  const og = a.ogMedia ? toMediaAsset(toMediaDto(a.ogMedia)) : undefined;
  return {
    slug: a.slug,
    title: a.title,
    standfirst: a.standfirst,
    ...(a.kanal ? { kanal: a.kanal.slug } : {}),
    ...(a.rubrik ? { rubrik: a.rubrik.slug } : {}),
    author: {
      slug: a.author.slug,
      name: a.author.name,
      role: a.author.role,
      ...(a.author.bio ? { bio: a.author.bio } : {}),
      ...(a.author.avatar ? { avatar: toMediaAsset(toMediaDto(a.author.avatar)) } : {}),
    },
    section: section(a.rubrik) ?? section(a.kanal),
    publishedAt: (a.publishedAt ?? now).toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    readingMinutes: a.readingMinutes,
    template: TEMPLATE[a.template] ?? "standard",
    hero,
    body: blocks,
    tags: toTags(a.tags),
    seo: {
      ...(a.seoTitle ? { title: a.seoTitle } : {}),
      ...(a.seoDescription ? { description: a.seoDescription } : {}),
      ...(a.canonicalUrl ? { canonicalUrl: a.canonicalUrl } : {}),
      ...(og ? { ogImage: og } : {}),
    },
    isDemo: a.isDemo,
  };
}

/** Any article, any state — for the Admin preview only. */
export async function articleViewForPreview(db: PrismaClient, id: string, now = new Date()) {
  const a = await db.article.findUnique({ where: { id }, include });
  return a ? { view: await toView(db, a, now), article: a } : null;
}

/** Published, publish time reached, not archived, not in the trash. */
export async function publicArticleView(db: PrismaClient, slug: string, now = new Date()): Promise<ArticleView | null> {
  const a = await db.article.findFirst({ where: { AND: [publicWhere(now), { slug }] }, include });
  return a ? toView(db, a, now) : null;
}

/** Old slug → current slug, only when that article is public now. */
export async function publicRedirectTarget(db: PrismaClient, slug: string, now = new Date()): Promise<string | null> {
  const old = await db.articleSlugHistory.findUnique({ where: { slug }, select: { article: { select: { slug: true, status: true, publishedAt: true, deletedAt: true } } } });
  const a = old?.article;
  if (!a || a.deletedAt || a.status !== "PUBLISHED" || !a.publishedAt || a.publishedAt > now) return null;
  return a.slug === slug ? null : a.slug;
}

/** Up to `limit` other public articles: same kanal, then same rubrik, then newest. */
export async function publicRelatedViews(
  db: PrismaClient,
  article: { slug: string; kanal?: string; rubrik?: string },
  limit = 3,
  now = new Date(),
): Promise<ArticleView[]> {
  const rows = await db.article.findMany({
    where: {
      AND: [
        publicWhere(now),
        { slug: { not: article.slug } },
        ...(article.kanal || article.rubrik
          ? [{ OR: [...(article.kanal ? [{ kanal: { slug: article.kanal } }] : []), ...(article.rubrik ? [{ rubrik: { slug: article.rubrik } }] : [])] }]
          : []),
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
    include,
  });
  return Promise.all(rows.map((a) => toView(db, a, now)));
}
