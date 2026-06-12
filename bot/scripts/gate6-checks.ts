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

// ---------------------------------------------------------------------------
// Phase D — dispatch helpers: isIgMediaNotReady, publicImageUrl, assignSlot
// ---------------------------------------------------------------------------

async function phaseD(): Promise<void> {
  const { isIgMediaNotReady } = await import("../src/services/composio.js");
  const { publicImageUrl } = await import("../src/services/image-cards.js");
  const { assignSlot, laInstant } = await import("../src/features/scheduler.js");

  await check("D1 isIgMediaNotReady — true for known IG processing error patterns", () => {
    assert.equal(isIgMediaNotReady(new Error("media not available yet")), true);
    assert.equal(isIgMediaNotReady(new Error("media not ready")), true);
    assert.equal(isIgMediaNotReady(new Error("media not finished")), true);
    assert.equal(isIgMediaNotReady(new Error("error code: 2207027")), true);
    assert.equal(isIgMediaNotReady(new Error("media is still processing")), true);
  });

  await check("D2 isIgMediaNotReady — false for unrelated errors", () => {
    assert.equal(isIgMediaNotReady(new Error("Invalid container ID")), false);
    assert.equal(isIgMediaNotReady(new Error("rate limit exceeded")), false);
    assert.equal(isIgMediaNotReady(new Error("unknown error")), false);
    assert.equal(isIgMediaNotReady(null), false);
    assert.equal(isIgMediaNotReady("plain string error"), false);
  });

  await check("D3 publicImageUrl — correct shape (no double slash, /i/ path)", () => {
    assert.equal(
      publicImageUrl("https://bot.railway.app", "abc123.jpg"),
      "https://bot.railway.app/i/abc123.jpg",
    );
    // trailing slash in base should not produce double slash
    assert.equal(
      publicImageUrl("https://bot.railway.app/", "abc123.jpg"),
      "https://bot.railway.app/i/abc123.jpg",
    );
  });

  await check("D4 assignSlot — skips Sundays when skipSundays=true", () => {
    // Build a 'now' that is a Saturday 23:59 LA time (UTC+8=Sunday morning in UTC,
    // but LA is UTC-7/8 so a Sun 08:00 UTC is still Sat 00:00–01:00 LA).
    // Simplest: use a Monday so d=0 is Mon, d=6 would be Sun. We assert slot d=6 is skipped.
    // Use a known Monday noon LA (Mon 12:00 PDT = Mon 19:00 UTC):
    const monNoon = laInstant("2026-06-15", "12:00"); // 2026-06-15 is a Monday
    const result = assignSlot({
      platform: "instagram",
      slotTimes: ["11:00"],
      takenSlots: [],
      now: monNoon,
      skipSundays: true,
    });
    // Expect Mon–Sat slots only (6 days then Sat, then skip Sun, then Mon).
    // First 6 days from Mon are Mon(today—past 11am)→Tue→Wed→Thu→Fri→Sat.
    // Mon 11am is before 12pm now, so first valid slot = Tue 11am.
    const slotDay = new Date(result).toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
    });
    // Tue is expected; if the Sunday skip logic were broken the algo could pick Sun.
    // Walk through 7 slots and confirm none is Sunday.
    const takenSoFar: string[] = [];
    for (let i = 0; i < 8; i++) {
      const s = assignSlot({
        platform: "instagram",
        slotTimes: ["11:00"],
        takenSlots: takenSoFar,
        now: monNoon,
        skipSundays: true,
      });
      const wd = new Date(s).toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
      });
      assert.notEqual(wd, "Sun", `slot ${i} fell on Sunday: ${s}`);
      takenSoFar.push(s);
    }
  });

  await check("D5 assignSlot — skips taken slots", () => {
    const base = laInstant("2026-06-15", "08:00"); // Mon 08:00 LA — before all slots
    const firstSlot = assignSlot({
      platform: "linkedin",
      slotTimes: ["09:00", "13:00"],
      takenSlots: [],
      now: base,
      skipSundays: true,
    });
    // First slot should be 09:00 that day.
    const hm = new Date(firstSlot).toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    assert.equal(hm, "09:00");
    // Take it — next slot should be 13:00 same day.
    const second = assignSlot({
      platform: "linkedin",
      slotTimes: ["09:00", "13:00"],
      takenSlots: [firstSlot],
      now: base,
      skipSundays: true,
    });
    const hm2 = new Date(second).toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    assert.equal(hm2, "13:00");
  });
}

await phaseA();
await phaseB();
await phaseD();

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);
