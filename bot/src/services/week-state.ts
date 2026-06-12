// Gate 6 persistent state — weekly content cycle, single JSON file on STATE_DIR.
// ============================================================================
// Separate file from gate5-state.json on purpose:
// - state.ts hard-throws on an unknown schemaVersion, so extending the Gate 5
//   file would brick the daily flow on a rollback to an older build.
// - The weekly review pool must be exempt from the daily flow's
//   UNAPPROVED_CAP and 48h lapse sweep (both iterate Gate5State.pending);
//   a separate store gets that exemption structurally.
// The posting queue is NOT duplicated here — on final confirm, week posts
// enter Gate5State.queue and the one scheduler tick serves both flows.
//
// Write discipline mirrors state.ts: all mutations through mutateWeekState(),
// serialized on a promise chain, atomic tmp+rename. Every fate/phase change
// persists immediately.
// ============================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../logger.js";
import { type DraftSeed, type PostPlatform, resolveStateDir } from "./state.js";

export type WeekPostFate = "pending" | "approved" | "killed" | "awaiting_regen_comment";

export type WeekPhase =
  | "drafting"
  | "text_review"
  | "image_gen"
  | "final_review"
  | "scheduled"
  | "cancelled"
  | "lapsed";

export type WeekPost = {
  id: string; // `${weekId}-${weekday3}-${platform}` e.g. wk-20260615-x4f2-mon-instagram
  day: string; // "YYYY-MM-DD" LA calendar date this post publishes
  weekday: string; // "monday" ... "saturday"
  theme: string; // weekly_pattern value for the day
  platform: PostPlatform;
  scenarioId: number; // base tone scenario (1 or 7) — archive + queue compat
  body: string;
  headline: string; // model-emitted ≤10 words — drives the image card (IG/FB)
  passed: boolean;
  attempts: number;
  failures: Array<{ check: string; detail: string }>;
  seeds: DraftSeed[]; // the day cluster, persisted so regen reuses raw material
  fate: WeekPostFate;
  regenCount: 0 | 1; // hard max ONE rewrite per post, same as Gate 5
  messageIds: string[]; // every chunk of the round-1 Discord message
  reactMessageId?: string; // LAST chunk — reaction target + lookup key
  regenPromptMessageId?: string;
  imageFile?: string; // token filename under STATE_DIR/images, set in image_gen
};

export type WeekPlan = {
  id: string; // `wk-${startYmdCompact}-${random4}`
  brandKey: string;
  startDate: string; // Monday "YYYY-MM-DD" (LA)
  cycleWeeks: number; // copied from brand config at creation time
  phase: WeekPhase;
  posts: WeekPost[];
  createdAt: string; // ISO
  // Review-phase lapse deadline (ISO). Set on entering text_review and
  // final_review. The scheduler tick reminds at deadline-24h and lapses the
  // week at the deadline. Per-phase, not per-draft: one slow day must not
  // kill drafts reviewed on day one.
  phaseDeadline: string;
  reminderSentAt?: string;
  finalReviewMessageId?: string;
};

export type Gate6State = {
  schemaVersion: 1;
  activeWeek: WeekPlan | null; // exactly one cycle in flight at a time
  // Start date of the last cycle the cron kicked off — idempotency. The cron
  // only fires a new cycle when nextMonday >= lastCycleStart + cycleWeeks*7d.
  lastCycleStart: string | null;
};

const STATE_FILE = "gate6-state.json";

function freshState(): Gate6State {
  return { schemaVersion: 1, activeWeek: null, lastCycleStart: null };
}

let state: Gate6State | null = null;
let lastWrite: Promise<void> = Promise.resolve();

/** Load-or-create. resolveStateDir() is shared with Gate 5, which already
 *  mkdir'd and write-probed the dir — initStateStore() must run first. */
export async function initWeekStateStore(): Promise<void> {
  const dir = resolveStateDir();
  await mkdir(dir, { recursive: true });

  const path = join(dir, STATE_FILE);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Gate6State;
    if (parsed.schemaVersion !== 1) {
      throw new Error(`Unsupported gate6-state schemaVersion: ${parsed.schemaVersion}`);
    }
    state = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    state = freshState();
    await persist();
  }

  log.info("gate6_state_loaded", {
    dir,
    activeWeek: state.activeWeek?.id ?? null,
    phase: state.activeWeek?.phase ?? null,
    posts: state.activeWeek?.posts.length ?? 0,
  });
}

function requireState(): Gate6State {
  if (!state) throw new Error("Gate 6 state not initialized — call initWeekStateStore() first");
  return state;
}

/** Read-only view. Do not mutate the result — writes go through mutateWeekState(). */
export function getWeekState(): Gate6State {
  return requireState();
}

async function persist(): Promise<void> {
  const dir = resolveStateDir();
  const path = join(dir, STATE_FILE);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(requireState(), null, 2), "utf8");
  await rename(tmp, path);
}

/** Apply a mutation and persist. Serialized on the promise chain. */
export function mutateWeekState(fn: (s: Gate6State) => void): Promise<void> {
  const s = requireState();
  fn(s);
  lastWrite = lastWrite.then(() => persist());
  return lastWrite;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function getActiveWeek(): WeekPlan | null {
  return requireState().activeWeek;
}

export function findWeekPostByReactMessageId(messageId: string): WeekPost | undefined {
  return requireState().activeWeek?.posts.find((p) => p.reactMessageId === messageId);
}

export function findWeekPostByRegenPrompt(messageId: string): WeekPost | undefined {
  return requireState().activeWeek?.posts.find((p) => p.regenPromptMessageId === messageId);
}

/** True when every post has left the review states — the week can advance. */
export function allFatesResolved(week: WeekPlan): boolean {
  return week.posts.every((p) => p.fate === "approved" || p.fate === "killed");
}
