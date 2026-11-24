import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildDailySeries28d, formatPeriodDelta, toWibDateKey } from "@/server/analytics/editorial";
import {
  computeSearchConsoleRanges,
  getSearchConsoleSummary,
  summarizeSearchConsoleRows,
} from "@/server/analytics/search-console";

describe("editorial analytics & Search Console helpers (Fase 8)", () => {
  test("buildDailySeries28d partitions WIB instants across 28d current and 28d previous", () => {
    const now = new Date("2026-11-25T10:00:00Z"); // 2026-11-25 17:00 WIB
    const instants = [
      new Date("2026-11-25T16:30:00+07:00"), // hari ini (hari ke-28)
      new Date("2026-11-24T20:00:00+07:00"), // kemarin
      new Date("2026-10-20T09:00:00+07:00"), // jendela 28 hari sebelumnya
    ];

    assert.equal(toWibDateKey(new Date("2026-11-25T17:30:00Z")), "2026-11-26");

    const { series, currentTotal, previousTotal } = buildDailySeries28d(instants, now);
    assert.equal(series.length, 28);
    assert.equal(currentTotal, 2);
    assert.equal(previousTotal, 1);
    assert.equal(series[series.length - 1]?.date, "2026-11-25");
    assert.equal(series[series.length - 1]?.current, 1);
  });

  test("formatPeriodDelta handles zero baseline, positive growth, decline, and flat", () => {
    assert.equal(formatPeriodDelta(5, 0), "Baru pada periode ini");
    assert.equal(formatPeriodDelta(0, 0), "Sama dengan periode sebelumnya");
    assert.equal(formatPeriodDelta(15, 10), "Naik 50% dari 28 hari sebelumnya");
    assert.equal(formatPeriodDelta(5, 10), "Turun 50% dari 28 hari sebelumnya");
  });

  test("Search Console ranges and row aggregation stay pure without env credentials", async () => {
    const ranges = computeSearchConsoleRanges(new Date("2026-11-25T12:00:00Z"));
    assert.equal(ranges.current.end, "2026-11-22");
    assert.equal(ranges.previous.end < ranges.current.start, true);

    const summary = summarizeSearchConsoleRows(
      [
        { keys: [ranges.current.start], clicks: 12, impressions: 250 },
        { keys: [ranges.previous.start], clicks: 4, impressions: 100 },
      ],
      ranges,
    );
    assert.equal(summary.current.clicks, 12);
    assert.equal(summary.previous.clicks, 4);
    assert.equal(summary.daily.length, 28);

    const prevEnv = process.env.GSC_SITE_URL;
    delete process.env.GSC_SITE_URL;
    const unconfigured = await getSearchConsoleSummary();
    if (prevEnv !== undefined) process.env.GSC_SITE_URL = prevEnv;
    assert.equal(unconfigured.status, "unconfigured");
  });
});
