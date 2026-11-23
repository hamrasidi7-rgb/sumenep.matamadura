import type { PrismaClient } from "@prisma/client";

import { AUTHORS } from "@/content/seed";
import { SECTIONS } from "@/content/sections";
import { logActivity } from "@/server/activity-log";
import { sectionInputSchema } from "@/server/validation/common";

// Initial data: the 5 kanal + 5 rubrik from src/content/sections.ts and the
// Catatan Sumenep homepage band. Idempotent: it only creates what is missing
// and never overwrites what the Admin has edited in the CMS.

const KIND = { kanal: "KANAL", rubrik: "RUBRIK" } as const;
const CATATAN_SLUG = "catatan-sumenep";
/** Same as HOMEPAGE.catatanCount in the redesigned homepage. */
const CATATAN_ITEMS = 3;

export interface SeedResult {
  sectionsCreated: number;
  homepageRubricCreated: boolean;
  authorsCreated: number;
}

export async function seedInitialData(db: PrismaClient): Promise<SeedResult> {
  const order = { kanal: 0, rubrik: 0 };
  const sections = SECTIONS.map((section) =>
    sectionInputSchema.parse({
      kind: KIND[section.kind],
      slug: section.slug,
      name: section.name,
      description: section.description,
      sortOrder: order[section.kind]++,
    }),
  );

  return db.$transaction(async (tx) => {
    let sectionsCreated = 0;
    let catatanId: string | null = null;
    for (const section of sections) {
      const existing = await tx.section.findUnique({
        where: { kind_slug: { kind: section.kind, slug: section.slug } },
        select: { id: true },
      });
      if (!existing) {
        const created = await tx.section.create({ data: section, select: { id: true } });
        sectionsCreated++;
        if (section.kind === "RUBRIK" && section.slug === CATATAN_SLUG) catatanId = created.id;
      }
    }

    // The band is part of the first initialisation only (when this run created
    // the Catatan Sumenep rubrik): later CMS changes to the bands always stick.
    let homepageRubricCreated = false;
    if (catatanId && (await tx.homepageRubric.count()) === 0) {
      await tx.homepageRubric.create({ data: { sectionId: catatanId, position: 0, itemCount: CATATAN_ITEMS } });
      homepageRubricCreated = true;
    }

    // Editorial author profiles of the current site (Fase 4: at least "Redaksi",
    // so the article editor always has a byline to choose). Never login accounts.
    let authorsCreated = 0;
    for (const author of AUTHORS) {
      const exists = await tx.author.findUnique({ where: { slug: author.slug }, select: { id: true } });
      if (!exists) {
        await tx.author.create({ data: { slug: author.slug, name: author.name, role: author.role, bio: author.bio ?? null } });
        authorsCreated++;
      }
    }

    // Normally created by the integrity_rules migration; kept here for safety.
    await tx.homepageSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    await tx.siteSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    if (sectionsCreated > 0 || homepageRubricCreated || authorsCreated > 0) {
      await logActivity(tx, {
        actor: "SYSTEM",
        action: "system.seed",
        entityType: "section",
        summary: `Data awal: ${sectionsCreated} kanal/rubrik dibuat.`,
        meta: { sectionsCreated, homepageRubricCreated, authorsCreated },
      });
    }
    return { sectionsCreated, homepageRubricCreated, authorsCreated };
  });
}
