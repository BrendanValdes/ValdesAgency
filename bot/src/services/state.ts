// Gate 5 persistent state — single JSON file on STATE_DIR.
// ============================================================================
// Railway's filesystem is ephemeral; STATE_DIR points at a mounted volume
// (/data) in production and ./state locally. Everything Gate 5 must not lose
// across restarts lives here: pending approvals (Discord messageId → draft),
// the posting queue, and the shoot list.
//
// Write discipline:
// - All mutations go through mutateState(). Writes are serialized on a promise
//   chain and persisted atomically (write .tmp → rename), so a crash can never
//   leave a half-written state file.
// - Each pending draft is persisted IMMEDIATELY after its Discord message
//   sends (per draft, not per batch) — the gap between "Brendan can react" and
//   "mapping on disk" is milliseconds.
// ============================================================================

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { env } from "../env.js";
import { log } from "../logger.js";

// Mirrors content-sources DiagnosisSeed so regen round-trips losslessly.
export type DraftSeed = { city: string; tier: string; diagnosis: string };

export type PendingDraft = {
  id: string; // `${yyyymmdd}-S${scenarioId}-${random6}`
  channelId: string;
  messageIds: string[]; // every chunk of the draft message
  reactMessageId: string; // LAST chunk — reaction target + lookup key
  scenarioId: number;
  format: "text" | "video";
  body: string;
  seeds: DraftSeed[]; // persisted cluster so regen reuses the same raw material
  passed: boolean;
  failures: Array<{ check: string; detail: string }>;
  createdAt: string; // ISO
  regenCount: 0 | 1; // hard max ONE rewrite per draft
  status: "pending" | "awaiting_regen_comment";
  regenPromptMessageId?: string;
};

export type PostPlatform = "linkedin" | "instagram" | "facebook";

export type QueueEntry = {
  id: string; // carried from PendingDraft.id (Gate 5) or WeekPost.id (Gate 6)
  scenarioId: number;
  body: string;
  platform: PostPlatform;
  slotAt: string; // ISO instant of the assigned slot
  status: "queued" | "held" | "posted" | "failed";
  attempts: number;
  lastError?: string;
  postedAt?: string;
  postUrl?: string;
  approvedAt: string;
  imageFile?: string; // token filename under STATE_DIR/images (IG/FB posts)
  // IG publishes in two calls (container → publish). The container id is
  // persisted here so a publish-side failure retries publish-only instead of
  // re-creating the container.
  igCreationId?: string;
};

export type ShootItem = {
  id: string;
  scenarioId: number;
  body: string;
  cities: string[];
  approvedAt: string;
};

export type Gate5State = {
  schemaVersion: 1;
  pending: PendingDraft[];
  queue: QueueEntry[];
  shootList: ShootItem[];
  linkedinAuthorUrn?: string; // cached from LINKEDIN_GET_MY_INFO at first post
  igUserId?: string; // cached from INSTAGRAM_GET_USER_INFO at first post
  fbPageId?: string; // cached from FACEBOOK_GET_USER_PAGES at first post
  lastBatchDate: string | null; // "YYYY-MM-DD" LA-date — generation idempotency
};

const STATE_FILE = "gate5-state.json";

function freshState(): Gate5State {
  return {
    schemaVersion: 1,
    pending: [],
    queue: [],
    shootList: [],
    lastBatchDate: null,
  };
}

let state: Gate5State | null = null;
let lastWrite: Promise<void> = Promise.resolve();

export function resolveStateDir(): string {
  const dir = env.paths.stateDir;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/** mkdir + write-probe + load-or-create. Throws loudly on an unwritable dir —
 *  a Gate 5 bot that can't persist must not boot quietly. */
export async function initStateStore(): Promise<void> {
  const dir = resolveStateDir();
  await mkdir(dir, { recursive: true });

  const probe = join(dir, ".write-probe");
  await writeFile(probe, "ok", "utf8");

  const path = join(dir, STATE_FILE);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Gate5State;
    if (parsed.schemaVersion !== 1) {
      throw new Error(`Unsupported gate5-state schemaVersion: ${parsed.schemaVersion}`);
    }
    state = parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    state = freshState();
    await persist();
  }

  log.info("gate5_state_loaded", {
    dir,
    pending: state.pending.length,
    queue: state.queue.length,
    shoot: state.shootList.length,
  });
}

function requireState(): Gate5State {
  if (!state) throw new Error("Gate 5 state not initialized — call initStateStore() first");
  return state;
}

/** Read-only view of the in-memory state. Do not mutate the result —
 *  all writes go through mutateState(). */
export function getState(): Gate5State {
  return requireState();
}

async function persist(): Promise<void> {
  const dir = resolveStateDir();
  const path = join(dir, STATE_FILE);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(requireState(), null, 2), "utf8");
  await rename(tmp, path);
}

/** Apply a mutation and persist. Writes are serialized: concurrent callers
 *  queue behind each other on the promise chain, so no interleaved renames. */
export function mutateState(fn: (s: Gate5State) => void): Promise<void> {
  const s = requireState();
  fn(s);
  lastWrite = lastWrite.then(() => persist());
  return lastWrite;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function findPendingByReactMessageId(messageId: string): PendingDraft | undefined {
  return requireState().pending.find((p) => p.reactMessageId === messageId);
}

export function findPendingByRegenPrompt(messageId: string): PendingDraft | undefined {
  return requireState().pending.find((p) => p.regenPromptMessageId === messageId);
}

export function unapprovedCount(): number {
  return requireState().pending.length;
}

// ---------------------------------------------------------------------------
// Drafts archive (volume copy)
// ---------------------------------------------------------------------------
// On Railway the repo's memory/content/ is excluded (.railwayignore) — the
// deployed bot archives to the volume instead. The repo archive remains the
// human-curated canon, written only from the codespace.

export function laDate(now = new Date()): string {
  // en-CA gives YYYY-MM-DD directly.
  return now.toLocaleDateString("en-CA", { timeZone: env.timezone });
}

export async function appendArchive(brandKey: string, entry: string): Promise<void> {
  const dir = join(resolveStateDir(), "archive");
  await mkdir(dir, { recursive: true });
  const date = laDate();
  const path = join(dir, `${brandKey}-drafts-${date}.md`);

  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const header = existing === "" ? `# ${brandKey} — Gate 5 draft archive ${date}\n` : existing;
  await writeFile(path, `${header}\n---\n\n${entry.trim()}\n`, "utf8");
}
