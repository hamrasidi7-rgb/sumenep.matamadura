import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { activityLabel, articleStatusLabel, loginReasonLabel } from "@/components/admin/format";
import {
  buildActivityHref,
  buildActivityWhere,
  parseActivityQuery,
  resolveEntityHref,
} from "@/server/activity/queries";

describe("activity & security audit helpers (Fase 7)", () => {
  test("parseActivityQuery validates actor, category, WIB date, and pagination", () => {
    assert.deepEqual(parseActivityQuery({}), {
      q: "",
      actor: "semua",
      kategori: "semua",
      dari: "",
      sampai: "",
      page: 1,
    });

    assert.deepEqual(
      parseActivityQuery({
        q: "  article.publish ",
        actor: "ADMIN",
        kategori: "auth",
        dari: "2026-11-01",
        sampai: "2026-11-25",
        halaman: "2",
      }),
      {
        q: "article.publish",
        actor: "ADMIN",
        kategori: "auth",
        dari: "2026-11-01",
        sampai: "2026-11-25",
        page: 2,
      },
    );

    assert.deepEqual(
      parseActivityQuery({
        actor: "HACKER",
        kategori: "invalid",
        dari: "2026-99-99",
        halaman: "-2",
      }),
      {
        q: "",
        actor: "semua",
        kategori: "semua",
        dari: "",
        sampai: "",
        page: 1,
      },
    );
  });

  test("buildActivityHref & buildActivityWhere map filters safely", () => {
    assert.equal(
      buildActivityHref({ q: "", actor: "semua", kategori: "semua", dari: "", sampai: "", page: 1 }),
      "/admin/aktivitas",
    );
    assert.equal(
      buildActivityHref({ q: "garam", actor: "CLI", kategori: "auth", dari: "2026-11-01", sampai: "", page: 3 }),
      "/admin/aktivitas?q=garam&actor=CLI&kategori=auth&dari=2026-11-01&halaman=3",
    );

    const authWhere = buildActivityWhere({
      q: "login",
      actor: "ADMIN",
      kategori: "auth",
      dari: "2026-11-01",
      sampai: "2026-11-02",
    });
    assert.ok(Array.isArray(authWhere.AND) && authWhere.AND.length === 4);
  });

  test("resolveEntityHref & Indonesian security/status formatters", () => {
    assert.equal(resolveEntityHref("article", "abc", "article.publish"), "/admin/artikel/abc");
    assert.equal(resolveEntityHref("article", "abc", "article.delete"), null);
    assert.equal(resolveEntityHref("author", "a1", "author.update"), "/admin/penulis");
    assert.equal(resolveEntityHref("media", "m1", "media.upload"), "/admin/media");
    assert.equal(resolveEntityHref("site_settings", "1", "site.settings_update"), "/admin/pengaturan");
    assert.equal(resolveEntityHref("admin_session", "s1", "auth.session_revoked"), "/admin/akun");

    assert.equal(loginReasonLabel("bad_credentials"), "Kredensial salah");
    assert.equal(articleStatusLabel("SCHEDULED"), "Terjadwal");
    assert.equal(activityLabel("site.settings_update"), "Pengaturan situs diperbarui");
  });
});
