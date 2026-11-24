import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  articleEditUrl,
  articleListUrl,
  clampPage,
  DEFAULT_PER_PAGE,
  ELLIPSIS,
  hasActiveListFilters,
  nextArticleListState,
  pageNumbers,
  pageRange,
  parseArticleListState,
  parsePerPage,
  parseSort,
  totalPages,
} from "@/lib/admin-pagination";
import { formatWhatsappChannelText, shortSummary, whatsappChannelUrl } from "@/lib/whatsapp-channel";
import { allowedListTransitions } from "@/server/articles/status";

describe("admin pagination and article list URL helpers", () => {
  test("parsePerPage whitelists 10, 20, 50 and refuses oversized values", () => {
    assert.equal(parsePerPage(10), 10);
    assert.equal(parsePerPage("20"), 20);
    assert.equal(parsePerPage(" 50 "), 50);
    assert.equal(parsePerPage("100000"), DEFAULT_PER_PAGE);
    assert.equal(parsePerPage("5"), DEFAULT_PER_PAGE);
    assert.equal(parsePerPage("-10"), DEFAULT_PER_PAGE);
    assert.equal(parsePerPage("abc"), DEFAULT_PER_PAGE);
    assert.equal(parsePerPage(null), DEFAULT_PER_PAGE);
  });

  test("parseSort validates ubah, terbit, jadwal", () => {
    assert.equal(parseSort("ubah"), "ubah");
    assert.equal(parseSort("terbit"), "terbit");
    assert.equal(parseSort("jadwal"), "jadwal");
    assert.equal(parseSort("unknown"), "ubah");
    assert.equal(parseSort(undefined), "ubah");
  });

  test("totalPages, clampPage, pageRange and pageNumbers with ellipsis", () => {
    assert.equal(totalPages(0, 20), 1);
    assert.equal(totalPages(45, 20), 3);
    assert.equal(clampPage("999", 3), 3);
    assert.equal(clampPage("0", 3), 1);
    assert.equal(clampPage("abc", 3), 1);
    assert.deepEqual(pageRange(1, 20, 0), { from: 0, to: 0 });
    assert.deepEqual(pageRange(2, 20, 45), { from: 21, to: 40 });
    assert.deepEqual(pageRange(3, 20, 45), { from: 41, to: 45 });
    assert.deepEqual(pageNumbers(1, 0), []);
    assert.deepEqual(pageNumbers(1, 1), [1]);
    assert.deepEqual(pageNumbers(3, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageNumbers(1, 10), [1, 2, ELLIPSIS, 10]);
    assert.deepEqual(pageNumbers(5, 10), [1, ELLIPSIS, 4, 5, 6, ELLIPSIS, 10]);
  });

  test("canonical list and edit URLs drop defaults and sanitize untrusted query params", () => {
    const clean = parseArticleListState({});
    assert.equal(hasActiveListFilters(clean), false);
    assert.equal(articleListUrl(clean), "/admin/artikel");

    const filtered = parseArticleListState({
      q: "  garam ",
      status: "terjadwal",
      kanal: "ekonomi",
      rubrik: "catatan-sumenep",
      penulis: "redaksi",
      dari: "2026-11-01",
      sampai: "2026-11-30",
      urut: "jadwal",
      per: "10",
      halaman: "3",
    });
    assert.equal(hasActiveListFilters(filtered), true);
    assert.equal(
      articleListUrl(filtered),
      "/admin/artikel?q=garam&status=terjadwal&kanal=ekonomi&rubrik=catatan-sumenep&penulis=redaksi&dari=2026-11-01&sampai=2026-11-30&urut=jadwal&per=10&halaman=3",
    );
    assert.equal(
      articleEditUrl("11111111-1111-4111-8111-111111111111", filtered),
      "/admin/artikel/11111111-1111-4111-8111-111111111111?q=garam&status=terjadwal&kanal=ekonomi&rubrik=catatan-sumenep&penulis=redaksi&dari=2026-11-01&sampai=2026-11-30&urut=jadwal&per=10&halaman=3",
    );

    // Mengubah filter apa pun mereset halaman ke 1.
    const nextTab = nextArticleListState(filtered, { status: "terbit" });
    assert.equal(nextTab.halaman, 1);
    assert.equal(nextTab.status, "terbit");

    // Proteksi open-redirect & sanitasi masukan liar pada URL kembali.
    const hostile = parseArticleListState({
      kanal: "../etc/passwd",
      dari: "not-a-date",
      status: "admin",
      per: "99999",
      kembali: "https://evil.example",
    });
    assert.equal(articleListUrl(hostile), "/admin/artikel");
  });
});

describe("WhatsApp channel formatter", () => {
  test("formats bold title, truncated standfirst, and UTM article URL", () => {
    assert.equal(
      whatsappChannelUrl("garam-kalianget", "https://sumenep.matamaduranews.com/"),
      "https://sumenep.matamaduranews.com/artikel/garam-kalianget?utm_source=whatsapp&utm_medium=saluran",
    );

    const longText = `${"Petani garam di Kalianget menunggu cuaca kemarau panjang agar panen berjalan lancar. ".repeat(4)}`;
    const summary = shortSummary(longText, 220);
    assert.ok(summary.endsWith("…"));
    assert.ok(summary.length <= 221);

    const msg = formatWhatsappChannelText(
      {
        title: "Harga *Garam* Kalianget Stabil",
        standfirst: "Ringkasan berita dari pesisir Sumenep.",
        slug: "harga-garam-kalianget",
      },
      "https://sumenep.matamaduranews.com",
    );
    assert.equal(
      msg,
      "*Harga Garam Kalianget Stabil*\n\nRingkasan berita dari pesisir Sumenep.\n\nBaca selengkapnya: https://sumenep.matamaduranews.com/artikel/harga-garam-kalianget?utm_source=whatsapp&utm_medium=saluran",
    );
  });
});

describe("allowedListTransitions (Subfase 3B)", () => {
  test("each article state exposes only valid non-destructive or trash-gated transitions", () => {
    assert.deepEqual(allowedListTransitions("terbit"), ["unpublish", "archive", "trash"]);
    assert.deepEqual(allowedListTransitions("terjadwal"), ["unpublish", "archive", "trash"]);
    assert.deepEqual(allowedListTransitions("draf"), ["archive", "trash"]);
    assert.deepEqual(allowedListTransitions("arsip"), ["unarchive", "trash"]);
    assert.deepEqual(allowedListTransitions("sampah"), ["restore"]);
  });
});
