// Voice validation for ROCCO content drafts.
// ============================================================================
// Pure function. Zero side effects. Caller owns the regen loop.
//
// Seven check classes, evaluated in order:
//   1. banned_words           HARD  (regex word-boundary + context_exception window)
//   2. banned_structures      HARD  (regex match against compiled pattern)
//   3. dash_policy            HARD  (em-dash, en-dash, mid-sentence " - ")
//   4. max_sentence_words     HARD  (any sentence exceeding cap)
//   5. reading_level_max      HARD  (Flesch-Kincaid, only if config sets it)
//   6. required_per_post      SOFT  (specificity marker presence)
//   7. banned_scenarios       MIXED (regex_patterns HARD, keyword_triggers SOFT)
//
// Known v1 limitations:
//   - pos: "verb"/"noun" hints are NOT enforced via real POS tagging. Treated
//     as plain word match. Improving this is a v1.1 task.
//   - Syllable counting for Flesch-Kincaid is heuristic (vowel-group). Known
//     to be ~85% accurate against true syllable counts.
// ============================================================================

import type { z } from "zod";

// We import the type from brand-config.ts; if the type isn't exported there
// we'll fall back to a structural type.
type BannedWordCfg = {
  term: string;
  pos?: "verb" | "noun" | "any";
  context_exception?: string;
};

type BannedStructureCfg = {
  pattern_id: string;
  description: string;
  regex: string;
};

type BannedScenarioCfg = {
  scenario_id: string;
  description: string;
  regex_patterns: string[];
  keyword_triggers: string[];
  structural_checks: string[];
  permanent: boolean;
  rationale: string;
};

type VoiceCfg = {
  banned_words: BannedWordCfg[];
  banned_structures: BannedStructureCfg[];
  banned_scenarios?: BannedScenarioCfg[];
  max_sentence_words: number;
  reading_level_max?: number;
  required_per_post: string[];
  dash_policy: "none" | "allow";
};

export type BrandConfigForValidation = {
  voice: VoiceCfg;
};

export type ValidationFailure = {
  check: string;
  detail: string;
};

export type ValidationResult = {
  passed: boolean;
  hardFailures: ValidationFailure[];
  softWarnings: ValidationFailure[];
  regenFeedback: string;
};

export type ValidateDraftOpts = {
  regenAttempt?: number;
};

// ============================================================================
// Helpers
// ============================================================================

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(pattern: string, flags = "i"): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

// Split text into sentences. Splits on `[.!?]` optionally followed by closing
// quote, then whitespace. Newlines also break. Returns trimmed sentences with
// no empty entries.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]['"]?)\s+/)
    .flatMap((s) => s.split(/\n+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function countSyllables(word: string): number {
  // Heuristic: count groups of consecutive vowels.
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length === 0) return 0;
  const groups = lower.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  // Adjust: silent trailing "e" rarely counts as a syllable on its own.
  if (lower.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

function fleschKincaidGrade(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return 0;
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
}

function findContextWindow(text: string, term: string, windowChars: number): string[] {
  // Return all ~windowChars-character contexts surrounding each occurrence of term.
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const results: string[] = [];
  let from = 0;
  while (from < lower.length) {
    const idx = lower.indexOf(t, from);
    if (idx === -1) break;
    const start = Math.max(0, idx - windowChars);
    const end = Math.min(lower.length, idx + t.length + windowChars);
    results.push(text.slice(start, end));
    from = idx + t.length;
  }
  return results;
}

// Named industry / neighborhood markers used by required_per_post specificity check.
const SPECIFICITY_MARKERS: RegExp[] = [
  /\$\s?\d/, // dollar amount
  /\b\d+\s?%/, // percentage
  /\b(pool|pest|hvac|landscaping|carpet|garage|handyman|cleaning|plumbing|electrical|roofing)\b/i, // named industry
  /\b(Henderson|Summerlin|Vegas|Las Vegas|North Las Vegas|NLV|Boulder City|Pahrump|Mesquite|Reno|Sparks)\b/, // named neighborhood
];

function hasSpecificity(text: string): boolean {
  return SPECIFICITY_MARKERS.some((re) => re.test(text));
}

// ============================================================================
// Deterministic dash strip
// ============================================================================
// Rewrites every em-dash, en-dash, and mid-sentence spaced hyphen BEFORE
// validation runs, so dash_policy violations never burn a regen attempt.
// Hyphenated compounds ("follow-up") and numeric ranges ("2-3") are legal
// under dash_policy and are preserved. Callers apply this only when the
// brand's dash_policy is "none".
export function stripDashes(text: string): string {
  return (
    text
      // numeric ranges keep a plain hyphen: "2–3" / "20 — 30" → "2-3"
      .replace(/(\d)[ \t]*[—–][ \t]*(\d)/g, "$1-$2")
      .replace(/(\d)[ \t]+-[ \t]+(\d)/g, "$1-$2")
      // line-leading dash bullets become hyphen bullets
      .replace(/^([ \t]*)[—–][ \t]*/gm, "$1- ")
      // dash after sentence-ending punctuation: drop it, capitalize next word
      .replace(/([.!?])[ \t]*[—–][ \t]*([a-z])/g, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`)
      .replace(/([.!?])[ \t]+-[ \t]+([a-z])/g, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`)
      // dash after mid-sentence punctuation: drop it, keep one space
      .replace(/([.!?,:;])[ \t]*[—–][ \t]*/g, "$1 ")
      .replace(/([.!?,:;])[ \t]+-[ \t]+/g, "$1 ")
      // mid-sentence dash before a word: hard sentence break (brand voice)
      .replace(/[ \t]*[—–][ \t]*([a-zA-Z])/g, (_m, c: string) => `. ${c.toUpperCase()}`)
      .replace(/(\S)[ \t]+-[ \t]+([a-zA-Z])/g, (_m, p: string, c: string) => `${p}. ${c.toUpperCase()}`)
      // anything left (trailing dash, dash before $ or a digit-adjacent symbol)
      .replace(/[ \t]*[—–][ \t]*/g, ", ")
      .replace(/[ \t]{2,}/g, " ")
  );
}

// ============================================================================
// Scaffolding strip (deterministic, runs before voice-check)
// ============================================================================
// Removes chat-assistant chrome the model wraps around the deliverable:
// leading preamble lines ("Here's the post:"), markdown divider fences, and a
// trailing "Next move:" block addressed at the operator instead of the reader.
// Found in the wild 2026-06-11: an S7 draft shipped with all three.
export function stripScaffolding(text: string): string {
  let lines = text.split("\n");

  const fence = /^\s*[-_*]{3,}\s*$/;
  const preamble = /^(here'?s (the|your|a|an) .{0,40}[:.]?|sure[.!,]?|got it[.!,]?)$/i;

  // Leading preamble: drop blanks, fences, and intro lines until content.
  let start = 0;
  while (start < lines.length) {
    const l = (lines[start] ?? "").trim();
    if (l === "" || fence.test(l) || preamble.test(l)) {
      start++;
      continue;
    }
    break;
  }
  lines = lines.slice(start);

  // Trailing "Next move:" block: ROCCO's answer-format habit leaking into the
  // post body. Only strip when the marker sits in the tail (last 12 lines) so
  // a legitimate mid-post line never gets cut.
  const nextMove = /^(\*\*)?\s*next move\s*:?/i;
  const tailStart = Math.max(0, lines.length - 12);
  for (let i = lines.length - 1; i >= tailStart; i--) {
    if (nextMove.test((lines[i] ?? "").trim())) {
      lines = lines.slice(0, i);
      break;
    }
  }

  // Any divider fence left in the body is chrome, not post content.
  lines = lines.filter((l) => !fence.test(l));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================================
// Content sanity: date check + unverifiable-citation guard
// ============================================================================
// - A year within ±1 of the current year that isn't the current year is almost
//   always a stale-training-data error ("in 2025" written during 2026) → HARD,
//   regen fixes it. Older years can be deliberate rhetoric ("reads like 1998")
//   → SOFT flag for manual review.
// - Citation language pointing readers at studies/reports/data we can't
//   verify exists → HARD. Claims must come from our own source sheets.
export type SanityCheckResult = {
  hard: ValidationFailure[];
  soft: ValidationFailure[];
};

const CITATION_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(stud(?:y|ies)|report|survey|research)\s+(?:show|shows|showed|found|says|say|suggests?|proves?|confirms?)\b/i,
    "cites a study/report",
  ],
  [
    /\baccording to (?:a |the |one |recent )?(?:stud(?:y|ies)|reports?|surveys?|research|data|statistics)\b/i,
    "according-to citation",
  ],
  [
    /\bgoogle\s+["'“][^"'”]{3,}["'”]\s+and\b/i,
    "points readers at a search to find data",
  ],
  [/\b(?:the )?data (?:backs|shows|proves|confirms)\b/i, "vague data claim"],
];

export function checkContentSanity(
  text: string,
  currentYear: number,
): SanityCheckResult {
  const hard: ValidationFailure[] = [];
  const soft: ValidationFailure[] = [];

  const years = text.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  for (const y of new Set(years)) {
    const n = Number(y);
    if (n === currentYear) continue;
    const failure = {
      check: "date_sanity",
      detail: `year ${y} referenced (current year is ${currentYear})`,
    };
    if (Math.abs(n - currentYear) <= 1) hard.push(failure);
    else soft.push(failure);
  }

  for (const [re, label] of CITATION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      hard.push({
        check: "unverifiable_citation",
        detail: `${label}: "${m[0].slice(0, 60)}" — only claims from our own source sheets`,
      });
    }
  }

  return { hard, soft };
}

// ============================================================================
// Individual check classes
// ============================================================================

function checkBannedWords(text: string, cfg: VoiceCfg): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const entry of cfg.banned_words) {
    const re = compilePattern(`\\b${escapeRegExp(entry.term)}\\b`, "gi");
    if (!re) continue;
    const matches = text.match(re);
    if (!matches || matches.length === 0) continue;

    // Context exception check: skip if exception phrase is within ±50 chars of any match.
    if (entry.context_exception) {
      const ctxs = findContextWindow(text, entry.term, 50);
      const exceptionRe = compilePattern(escapeRegExp(entry.context_exception), "i");
      if (exceptionRe && ctxs.every((c) => exceptionRe.test(c))) {
        continue;
      }
    }

    failures.push({
      check: "banned_words",
      detail: `"${entry.term}" detected ${matches.length}x${entry.pos ? ` (pos hint: ${entry.pos})` : ""}`,
    });
  }
  return failures;
}

function checkBannedStructures(text: string, cfg: VoiceCfg): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const entry of cfg.banned_structures) {
    const re = compilePattern(entry.regex, "i");
    if (!re) continue;
    const match = text.match(re);
    if (match) {
      failures.push({
        check: "banned_structures",
        detail: `pattern_id="${entry.pattern_id}" matched: "${match[0].slice(0, 60)}"`,
      });
    }
  }
  return failures;
}

function checkDashPolicy(text: string, cfg: VoiceCfg): ValidationFailure[] {
  if (cfg.dash_policy !== "none") return [];
  const failures: ValidationFailure[] = [];

  if (text.includes("—")) {
    failures.push({ check: "dash_policy", detail: "em-dash (—) detected" });
  }
  if (text.includes("–")) {
    failures.push({ check: "dash_policy", detail: "en-dash (–) detected" });
  }
  // Mid-sentence space-hyphen-space (e.g. "word - word"). Excludes hyphenated
  // compounds ("follow-up") and numeric ranges ("2-3").
  const midSentenceHyphen = / [-] /;
  if (midSentenceHyphen.test(text)) {
    failures.push({ check: "dash_policy", detail: "mid-sentence ' - ' detected (use period or comma)" });
  }
  return failures;
}

function checkSentenceLength(text: string, cfg: VoiceCfg): ValidationFailure[] {
  const sentences = splitSentences(text);
  const failures: ValidationFailure[] = [];
  sentences.forEach((s, i) => {
    const wc = countWords(s);
    if (wc > cfg.max_sentence_words) {
      failures.push({
        check: "max_sentence_words",
        detail: `sentence ${i + 1} = ${wc} words (cap ${cfg.max_sentence_words}): "${s.slice(0, 60)}..."`,
      });
    }
  });
  return failures;
}

function checkReadingLevel(text: string, cfg: VoiceCfg): ValidationFailure[] {
  if (cfg.reading_level_max === undefined) return [];
  const grade = fleschKincaidGrade(text);
  if (grade > cfg.reading_level_max) {
    return [{
      check: "reading_level_max",
      detail: `Flesch-Kincaid grade ${grade.toFixed(1)} exceeds cap ${cfg.reading_level_max}`,
    }];
  }
  return [];
}

function checkSpecificity(text: string): ValidationFailure[] {
  if (hasSpecificity(text)) return [];
  return [{
    check: "required_per_post",
    detail: "no specificity marker found (dollar / %, named industry, or named neighborhood)",
  }];
}

type ScenarioCheckResult = {
  hard: ValidationFailure[];
  soft: ValidationFailure[];
};

function checkBannedScenarios(text: string, cfg: VoiceCfg): ScenarioCheckResult {
  const hard: ValidationFailure[] = [];
  const soft: ValidationFailure[] = [];

  if (!cfg.banned_scenarios) return { hard, soft };

  for (const scenario of cfg.banned_scenarios) {
    // Prong 1: regex_patterns hard fail
    for (const pattern of scenario.regex_patterns) {
      const re = compilePattern(pattern, "i");
      if (!re) continue;
      const match = text.match(re);
      if (match) {
        hard.push({
          check: "banned_scenarios",
          detail: `scenario_id="${scenario.scenario_id}" regex matched: "${match[0].slice(0, 60)}"`,
        });
      }
    }

    // Prong 2: keyword_triggers soft warn
    for (const kw of scenario.keyword_triggers) {
      const re = compilePattern(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (!re) continue;
      if (re.test(text)) {
        soft.push({
          check: "banned_scenarios",
          detail: `scenario_id="${scenario.scenario_id}" keyword_trigger="${kw}" found (manual review)`,
        });
      }
    }

    // Prong 3: structural_checks - flagged for manual review only (no regex)
    // Surface as warning so reviewer knows to look.
    if (scenario.structural_checks.length > 0) {
      // Heuristic structural detection: past-tense recap + present-tense win.
      if (scenario.structural_checks.includes("past_recap_present_win")) {
        const pastRecap = /\b(spent|made|been|tried|worked|grinded|grinding)\b.{0,80}\b(today|now|finally|just)\b/i;
        if (pastRecap.test(text)) {
          soft.push({
            check: "banned_scenarios",
            detail: `scenario_id="${scenario.scenario_id}" structural="past_recap_present_win" possibly matched (manual review)`,
          });
        }
      }
    }
  }

  return { hard, soft };
}

// ============================================================================
// Public entrypoint
// ============================================================================

export function validateDraft(
  brand: BrandConfigForValidation,
  text: string,
  opts: ValidateDraftOpts = {},
): ValidationResult {
  const cfg = brand.voice;
  const hardFailures: ValidationFailure[] = [];
  const softWarnings: ValidationFailure[] = [];

  hardFailures.push(...checkBannedWords(text, cfg));
  hardFailures.push(...checkBannedStructures(text, cfg));
  hardFailures.push(...checkDashPolicy(text, cfg));
  hardFailures.push(...checkSentenceLength(text, cfg));
  hardFailures.push(...checkReadingLevel(text, cfg));
  softWarnings.push(...checkSpecificity(text));

  const scenarioResult = checkBannedScenarios(text, cfg);
  hardFailures.push(...scenarioResult.hard);
  softWarnings.push(...scenarioResult.soft);

  const passed = hardFailures.length === 0;

  const attempt = opts.regenAttempt ?? 0;
  const regenFeedback = passed
    ? ""
    : formatRegenFeedback(hardFailures, softWarnings, attempt);

  return { passed, hardFailures, softWarnings, regenFeedback };
}

function formatRegenFeedback(
  hard: ValidationFailure[],
  soft: ValidationFailure[],
  attempt: number,
): string {
  const lines: string[] = [];
  lines.push(`Draft voice-check FAILED on attempt ${attempt + 1}. Issues:`);
  if (hard.length > 0) {
    lines.push("");
    lines.push("Hard failures (must fix):");
    for (const f of hard) lines.push(`- [${f.check}] ${f.detail}`);
  }
  if (soft.length > 0) {
    lines.push("");
    lines.push("Soft warnings (review):");
    for (const f of soft) lines.push(`- [${f.check}] ${f.detail}`);
  }
  lines.push("");
  lines.push("Regenerate the draft to address all hard failures. Preserve voice, specificity, and the");
  lines.push("scenario pattern. Do NOT introduce banned words/structures to fix one issue.");
  return lines.join("\n");
}

// keep zod import lint-clean (some build configs flag unused type-only imports)
void (null as unknown as z.ZodType<unknown>);
