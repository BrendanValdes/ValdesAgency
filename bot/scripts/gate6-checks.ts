// Gate 6 unit checks — run with: STATE_DIR=$(mktemp -d) npx tsx scripts/gate6-checks.ts
// Grows per phase (A: state round-trip; B: cards; D: dispatch/slots; E: parser).
// Pattern mirrors the Gate 5 check suite: plain assertions, exit 1 on any fail.

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStateDir } from "../src/services/state.js";
import {
  allFatesResolved,
  findWeekPostByReactMessageId,
  getWeekState,
  initWeekStateStore,
  mutateWeekState,
  type WeekPlan,
  type WeekPost,
} from "../src/services/week-state.js";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`❌ ${name}: ${String(err)}`);
  }
}

function samplePost(over: Partial<WeekPost> = {}): WeekPost {
  return {
    id: "wk-20260615-test-mon-linkedin",
    day: "2026-06-15",
    weekday: "monday",
    theme: "framework",
    platform: "linkedin",
    scenarioId: 7,
    body: "Sample body.",
    headline: "Sample headline",
    passed: true,
    attempts: 1,
    failures: [],
    seeds: [{ city: "Henderson", tier: "top", diagnosis: "Yahoo email on a 62-review shop" }],
    fate: "pending",
    regenCount: 0,
    messageIds: [],
    ...over,
  };
}

function sampleWeek(posts: WeekPost[]): WeekPlan {
  return {
    id: "wk-20260615-test",
    brandKey: "valdes",
    startDate: "2026-06-15",
    cycleWeeks: 1,
    phase: "text_review",
    posts,
    createdAt: "2026-06-12T00:00:00.000Z",
    phaseDeadline: "2026-06-15T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Phase A — week-state round-trip
// ---------------------------------------------------------------------------

async function phaseA(): Promise<void> {
  await initWeekStateStore();

  await check("A1 fresh state has no active week", () => {
    assert.equal(getWeekState().activeWeek, null);
    assert.equal(getWeekState().lastCycleStart, null);
  });

  await check("A2 mutate + persist writes the file", async () => {
    await mutateWeekState((s) => {
      s.activeWeek = sampleWeek([samplePost({ reactMessageId: "msg-1" })]);
      s.lastCycleStart = "2026-06-15";
    });
    const raw = await readFile(join(resolveStateDir(), "gate6-state.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.activeWeek.id, "wk-20260615-test");
    assert.equal(parsed.activeWeek.posts.length, 1);
  });

  await check("A3 selector finds post by reactMessageId", () => {
    assert.equal(findWeekPostByReactMessageId("msg-1")?.id, "wk-20260615-test-mon-linkedin");
    assert.equal(findWeekPostByReactMessageId("msg-none"), undefined);
  });

  await check("A4 concurrent mutations serialize without corruption", async () => {
    const writes = Array.from({ length: 25 }, (_, i) =>
      mutateWeekState((s) => {
        s.activeWeek?.posts.push(samplePost({ id: `p-${i}`, reactMessageId: `m-${i}` }));
      }),
    );
    await Promise.all(writes);
    const raw = await readFile(join(resolveStateDir(), "gate6-state.json"), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.activeWeek.posts.length, 26); // 1 + 25
  });

  await check("A5 allFatesResolved logic", () => {
    const week = sampleWeek([
      samplePost({ fate: "approved" }),
      samplePost({ id: "p2", fate: "killed" }),
    ]);
    assert.equal(allFatesResolved(week), true);
    week.posts.push(samplePost({ id: "p3", fate: "pending" }));
    assert.equal(allFatesResolved(week), false);
    week.posts[2].fate = "awaiting_regen_comment";
    assert.equal(allFatesResolved(week), false);
  });
}

// ---------------------------------------------------------------------------
// Phase B — image cards
// ---------------------------------------------------------------------------

async function phaseB(): Promise<void> {
  const jpeg = (await import("jpeg-js")).default;
  const { renderCard } = await import("../src/services/image-cards.js");
  const { getBrand } = await import("../src/services/brand-config.js");
  const brand = await getBrand("valdes");
  assert.ok(brand, "valdes brand config required for card checks");

  await check("B1 IG card is a 1080×1080 JPEG", async () => {
    const buf = await renderCard({
      brand,
      template: "statement",
      headline: "62 Yelp reviews. A Yahoo email.",
      size: "ig",
    });
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
    const decoded = jpeg.decode(buf, { useTArray: true });
    assert.equal(decoded.width, 1080);
    assert.equal(decoded.height, 1080);
  });

  await check("B2 FB card is a 1200×630 JPEG under 1MB", async () => {
    const buf = await renderCard({
      brand,
      template: "framework",
      headline: "The 4-point trust check every pool company fails",
      size: "fb",
    });
    const decoded = jpeg.decode(buf, { useTArray: true });
    assert.equal(decoded.width, 1200);
    assert.equal(decoded.height, 630);
    assert.ok(buf.length < 1024 * 1024, `too large: ${buf.length}`);
  });

  await check("B3 long headline renders without throwing", async () => {
    const buf = await renderCard({
      brand,
      template: "roundup",
      headline:
        "A homeowner in Henderson checks four things before calling and most pool companies fail at least three of them",
      size: "ig",
    });
    assert.ok(buf.length > 10_000);
  });

  await check("B4 image filename is base64url token + .jpg", async () => {
    const { newImageFilename } = await import("../src/services/image-cards.js");
    for (let i = 0; i < 20; i++) {
      assert.match(newImageFilename(), /^[A-Za-z0-9_-]{20,24}\.jpg$/);
    }
  });
}

await phaseA();
await phaseB();

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
