import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assessFeaturedImage,
  clampFocal,
  computeCoverCrop,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_WIDTH,
} from "@/lib/media-crop";

describe("featured image 1200×750 (16:10) crop & assessment helpers", () => {
  test("clampFocal normalizes numbers, strings, out-of-bounds, and invalid values", () => {
    assert.equal(clampFocal(50), 50);
    assert.equal(clampFocal("25.6"), 26);
    assert.equal(clampFocal(-10), 0);
    assert.equal(clampFocal(150), 100);
    assert.equal(clampFocal(""), 50);
    assert.equal(clampFocal("abc", 30), 30);
  });

  test("computeCoverCrop centers and shifts crop window cleanly for wide, tall, and exact 16:10 images", () => {
    // 16:9 wide image (1600×900) cropped to 16:10 -> 1440×900
    assert.deepEqual(computeCoverCrop(1600, 900, 1200, 750, 50, 50), { left: 80, top: 0, width: 1440, height: 900 });
    assert.deepEqual(computeCoverCrop(1600, 900, 1200, 750, 0, 50), { left: 0, top: 0, width: 1440, height: 900 });
    assert.deepEqual(computeCoverCrop(1600, 900, 1200, 750, 100, 50), { left: 160, top: 0, width: 1440, height: 900 });

    // 1:1 square image (1000×1000) cropped to 16:10 -> 1000×625
    assert.deepEqual(computeCoverCrop(1000, 1000, 1200, 750, 50, 50), { left: 0, top: 188, width: 1000, height: 625 });
    assert.deepEqual(computeCoverCrop(1000, 1000, 1200, 750, 50, 0), { left: 0, top: 0, width: 1000, height: 625 });
    assert.deepEqual(computeCoverCrop(1000, 1000, 1200, 750, 50, 100), { left: 0, top: 375, width: 1000, height: 625 });

    // Already exact 1200×750
    assert.deepEqual(computeCoverCrop(FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT), {
      left: 0,
      top: 0,
      width: 1200,
      height: 750,
    });
  });

  test("assessFeaturedImage distinguishes optimal 1200×750, ratio mismatch, and low resolution", () => {
    const optimal = assessFeaturedImage(1200, 750);
    assert.equal(optimal.status, "optimal");
    assert.equal(optimal.matchesRatio, true);
    assert.equal(optimal.meetsRecommendedSize, true);

    const mismatch = assessFeaturedImage(1600, 900);
    assert.equal(mismatch.status, "ratio-mismatch");
    assert.equal(mismatch.matchesRatio, false);

    const small = assessFeaturedImage(600, 375);
    assert.equal(small.status, "low-resolution");
    assert.equal(small.meetsMinimumWidth, false);
  });
});
