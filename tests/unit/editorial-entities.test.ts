import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { countWords } from "@/components/admin/WordCounter";
import { authorFormSchema } from "@/server/authors/service";
import { sectionCreateFormSchema, sectionUpdateFormSchema } from "@/server/sections/service";

describe("author and section validation schemas (Fase 4)", () => {
  test("authorFormSchema validates required name and normalizes optional fields", () => {
    assert.equal(authorFormSchema.safeParse({ name: "   " }).success, false);
    const parsed = authorFormSchema.parse({
      name: "  Ahmad Fauzi  ",
      role: " Kontributor Kepulauan ",
      bio: "  ",
      avatarId: "",
      isActive: false,
    });
    assert.deepEqual(parsed, {
      name: "Ahmad Fauzi",
      slug: "",
      role: "Kontributor Kepulauan",
      bio: null,
      avatarId: null,
      isActive: false,
    });
    assert.equal(authorFormSchema.safeParse({ name: "Fauzi", avatarId: "bukan-uuid" }).success, false);
  });

  test("sectionCreateFormSchema and sectionUpdateFormSchema handle sortOrder and immutable kind", () => {
    const created = sectionCreateFormSchema.parse({
      kind: "KANAL",
      name: " Wisata Bahari ",
      sortOrder: "5",
    });
    assert.deepEqual(created, {
      kind: "KANAL",
      name: "Wisata Bahari",
      slug: "",
      description: "",
      sortOrder: 5,
      isActive: true,
    });
    assert.equal(sectionCreateFormSchema.safeParse({ kind: "KANAL", name: "X", sortOrder: 1000 }).success, false);

    // sectionUpdateFormSchema tidak menerima atau menyebarkan field kind.
    const updated = sectionUpdateFormSchema.parse({
      kind: "RUBRIK",
      name: "Ekonomi Rakyat",
      sortOrder: 2,
      isActive: true,
    } as Record<string, unknown>);
    assert.equal("kind" in updated, false);
  });

  test("countWords counts Indonesian words reliably", () => {
    assert.equal(countWords(""), 0);
    assert.equal(countWords("   \n\t "), 0);
    assert.equal(countWords("Jurnalis pesisir di Kabupaten Sumenep."), 5);
  });
});
