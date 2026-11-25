import type { PrismaClient } from "@prisma/client";

import type { ArticleTemplate, Author, MediaAsset, Section } from "@/content/types";
import { resolvePublicAuthor } from "@/lib/author";
import type { ArticleView } from "@/lib/content";
import { publicWhere } from "@/server/articles/status";
import { toTags } from "@/server/articles/tags";
import { toMediaAsset, toMediaDto } from "@/server/media/service";

const AVATAR_SELECT = {
  id: true,
  storageKey: true,
  width: true,
  height: true,
  alt: true,
  caption: true,
  credit: true,
} as const;

const DEFAULT_ARCHIVE_HERO: MediaAsset = {
  src: "/demo/senja-perahu.webp",
  width: 1200,
  height: 750,
  alt: "Ilustrasi SUMENEP – Mata Madura",
};

type MediaSelectRow = Parameters<typeof toMediaDto>[0];

function mapAuthorRow(row: {
  slug: string;
  name: string;
  role: string;
  bio: string | null;
  avatar: MediaSelectRow | null;
}): Author {
  return resolvePublicAuthor({
    slug: row.slug,
    name: row.name,
    role: row.role,
    bio: row.bio ?? undefined,
    avatar: row.avatar ? toMediaAsset(toMediaDto(row.avatar)) : undefined,
  });
}

function toSection(s: { slug: string; kind: "KANAL" | "RUBRIK"; name: string; description: string } | null): Section | undefined {
  if (!s) return undefined;
  return {
    slug: s.slug,
    kind: s.kind === "KANAL" ? "kanal" : "rubrik",
    name: s.name,
    description: s.description,
  };
}

export async function publicAuthorBySlug(db: PrismaClient, slug: string, now = new Date()): Promise<Author | null> {
  const row = await db.author.findFirst({
    where: {
      slug,
      OR: [{ isActive: true }, { articles: { some: publicWhere(now) } }],
    },
    select: {
      slug: true,
      name: true,
      role: true,
      bio: true,
      avatar: { select: AVATAR_SELECT },
    },
  });
  return row ? mapAuthorRow(row) : null;
}

export async function publicAuthorsList(db: PrismaClient, now = new Date()): Promise<Author[]> {
  const rows = await db.author.findMany({
    where: {
      OR: [{ isActive: true }, { articles: { some: publicWhere(now) } }],
    },
    orderBy: [{ name: "asc" }],
    select: {
      slug: true,
      name: true,
      role: true,
      bio: true,
      avatar: { select: AVATAR_SELECT },
    },
  });
  return rows.map(mapAuthorRow);
}

export async function publicArticlesByAuthor(db: PrismaClient, authorSlug: string, now = new Date()): Promise<ArticleView[]> {
  const rows = await db.article.findMany({
    where: {
      AND: [publicWhere(now), { author: { slug: authorSlug } }],
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 240,
    select: {
      slug: true,
      title: true,
      standfirst: true,
      template: true,
      publishedAt: true,
      updatedAt: true,
      readingMinutes: true,
      tags: true,
      author: {
        select: {
          slug: true,
          name: true,
          role: true,
          bio: true,
          avatar: { select: AVATAR_SELECT },
        },
      },
      kanal: { select: { slug: true, kind: true, name: true, description: true } },
      rubrik: { select: { slug: true, kind: true, name: true, description: true } },
      heroMedia: { select: AVATAR_SELECT },
    },
  });

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    standfirst: r.standfirst,
    kanal: r.kanal?.slug,
    rubrik: r.rubrik?.slug,
    section: toSection(r.kanal ?? r.rubrik),
    author: mapAuthorRow(r.author),
    publishedAt: (r.publishedAt ?? r.updatedAt).toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    readingMinutes: r.readingMinutes,
    template: r.template.toLowerCase() as ArticleTemplate,
    hero: r.heroMedia ? toMediaAsset(toMediaDto(r.heroMedia)) : { ...DEFAULT_ARCHIVE_HERO, alt: r.title },
    body: [],
    tags: toTags(r.tags),
  }));
}
