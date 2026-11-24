import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ADMIN_NAV, isNavGroup, isNavLinkActive, type AdminNavLink } from "@/components/admin/admin-nav";

function allLinks(): AdminNavLink[] {
  return ADMIN_NAV.flatMap((entry) => (isNavGroup(entry) ? [...entry.children] : [entry]));
}

describe("admin sidebar navigation", () => {
  test("contains expected CMS routes without multi-user or health modules", () => {
    const hrefs = allLinks().map((l) => l.href);
    assert.deepEqual(hrefs, [
      "/admin",
      "/admin/artikel/baru",
      "/admin/artikel",
      "/admin/seksi",
      "/admin/penulis",
      "/admin/akun",
    ]);
    assert.equal(hrefs.includes("/admin/pengguna"), false);
  });

  test("exact match keeps Dashboard active only on /admin", () => {
    const dashboard = allLinks().find((l) => l.href === "/admin")!;
    assert.equal(isNavLinkActive("/admin", dashboard), true);
    assert.equal(isNavLinkActive("/admin/", dashboard), true);
    assert.equal(isNavLinkActive("/admin/artikel", dashboard), false);
    assert.equal(isNavLinkActive("/admin/akun", dashboard), false);
  });

  test("Berita group separates Tulis Artikel from Semua Artikel and editing by UUID", () => {
    const write = allLinks().find((l) => l.href === "/admin/artikel/baru")!;
    const list = allLinks().find((l) => l.href === "/admin/artikel")!;

    assert.equal(isNavLinkActive("/admin/artikel", list), true);
    assert.equal(isNavLinkActive("/admin/artikel", write), false);

    assert.equal(isNavLinkActive("/admin/artikel/baru", write), true);
    assert.equal(isNavLinkActive("/admin/artikel/baru", list), false);

    // Editing an existing article highlights "Semua Artikel", not "Tulis Artikel".
    const editPath = "/admin/artikel/11111111-1111-4111-8111-111111111111";
    assert.equal(isNavLinkActive(editPath, list), true);
    assert.equal(isNavLinkActive(editPath, write), false);

    // Query string or trailing slash does not break matching, and segment boundaries are respected.
    assert.equal(isNavLinkActive("/admin/artikel/?status=terbit", list), true);
    assert.equal(isNavLinkActive("/admin/artikel-arsip", list), false);
  });

  test("Akun & Keamanan matches its route and nested paths only", () => {
    const account = allLinks().find((l) => l.href === "/admin/akun")!;
    assert.equal(isNavLinkActive("/admin/akun", account), true);
    assert.equal(isNavLinkActive("/admin/akun/", account), true);
    assert.equal(isNavLinkActive("/admin/akun/sesi", account), true);
    assert.equal(isNavLinkActive("/admin/akuntansi", account), false);
  });

  test("only one link is active at a time across every CMS route", () => {
    const links = allLinks();
    for (const path of [
      "/admin",
      "/admin/artikel",
      "/admin/artikel/baru",
      "/admin/artikel/11111111-1111-4111-8111-111111111111",
      "/admin/seksi",
      "/admin/penulis",
      "/admin/akun",
    ]) {
      const active = links.filter((l) => isNavLinkActive(path, l));
      assert.equal(active.length, 1, `expected exactly one active link for ${path}, got ${active.map((a) => a.href).join(", ")}`);
    }
  });
});
