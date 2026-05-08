# Lessons Learned — The Mistake Ledger
**Scope:** Every mistake, near-miss, and reversal that cost time, money, or quality. The institutional memory that keeps us from re-learning what already burned us.
**Reads:** ROCCO every session start (§4 cheat scan, mandatory). Brendan when stuck or about to repeat a pattern. Every Master before reversing a prior decision.
**Goal:** Zero repeat mistakes. Each lesson = a forward rule + the cost that earned it. If we're debating something already in this file, the debate is over — read the entry first, then challenge with new evidence.

---

## §0 — HOW TO USE THIS FILE

This is the only document in `skills/` that's purely backward-looking. Everything else tells you how to execute. This tells you what NOT to do, and why.

**Reading order:**
- Every session start → §4 anti-pattern cheat scan (60 seconds, 14 lines)
- About to reverse a prior decision → §1 table → jump to relevant L-NNN entry in §2
- Just made a mistake → §3 logging template, append within 24 hours
- New Master onboarding → read §2 sections relevant to your domain in full

**Three rules (LOCKED — do not modify without approval):**
1. **Every lesson has a cost.** Time, money, or quality. No "I think we should." If you can't name what it cost, it's an opinion, not a lesson.
2. **Every lesson has a forward rule.** Imperative voice, one sentence. Not "we learned X" — "Do Y" or "Don't Z."
3. **Log within 24 hours.** Memory degrades fast. Vague lessons logged a week late are worthless.

**When to log a new lesson:**
- Any decision that got reversed mid-build
- Any voice/tone correction
- Any tool or repo that turned out broken/dead/unreliable
- Any assumption that broke under contact with reality
- Any architectural pivot
- Any client-specific gotcha that nearly bit us

**When NOT to log:**
- One-off bugs that got fixed (those go in commit messages)
- Design preferences with no cost attached
- Theoretical "we should probably" thoughts (those go in `memory/brain-dump.md`)

**Cross-Master ownership:** every Master must read §2 sections relevant to their domain. Build Master reads §2.3 + §2.4. All Ads Masters read §2.4 + §2.5. Marketing Master reads §2.5 + §2.6. Content Master reads §2.2 + §2.4.

---

## §1 — LESSONS AT A GLANCE

Sorted most-recent first. Status legend: **LIVE** = rule actively enforced | **RESOLVED** = fixed in code/process, kept for historical context | **MONITORING** = rule applied but watching for regression.

| ID | Date | Category | Lesson (one-line) | Cost | Status |
|---|---|---|---|---|---|
| L-017 | 2026-05-08 | Tools | Skip Smithery CLI — direct npm or git clone instead | ~1.5 hrs failed installs | LIVE |
| L-016 | 2026-05-08 | Tools | Skip "generic language killer" repo — private/dead | ~30 min | RESOLVED |
| L-015 | 2026-05-08 | Tools | Skip banana-claude repo — broken; use Flux via Replicate + Higgsfield | ~2 hrs | RESOLVED |
| L-014 | 2026-05-08 | Tools | Always fetch official docs before MCP/API config — never guess syntax | ~2 hrs/incident | LIVE |
| L-013 | 2026-05-08 | Process | Claude Code reinstalls on Codespace restart — startup checklist required | 10 min/restart | LIVE |
| L-012 | 2026-05-08 | Process | Commit frequently in Codespace — disconnects = lost work | 30+ min/incident | LIVE |
| L-011 | 2026-05-07 | Client | Preserve SonoView in protected sub-playbook — don't generalize into pool templates | Revenue risk (existing client) | LIVE |
| L-010 | 2026-05-07 | Niche | Handyman doesn't pencil at $1.5k retainer — AVOID-FOR-NOW | Prevents repeat 2-3 hr debates | LIVE |
| L-009 | 2026-05-07 | Process | Playbook index in CLAUDE.md must update same-day as new playbook ships | Active confusion (current) | MONITORING |
| L-008 | 2026-05-06 | Client | Review Scraper hook required on first cold touch — no hook = spam | Trust + reply rate | LIVE |
| L-007 | 2026-05-06 | Architecture | Skill routing without architecture is guesswork — 67+ skills need a router | Wasted skill invocations | LIVE |
| L-006 | 2026-05-06 | Tactics | Never block geo terms in ads (reno/sparks/nevada = gold) | $200+ SonoView spend | LIVE |
| L-005 | 2026-05-05 | Process | Content pipeline can't be deferred — build parallel to client work | 7 days of compounding lost | RESOLVED |
| L-004 | 2026-05-05 | Process | Stage 0 design brief is non-negotiable on every site | 2-3 days/site iteration | LIVE |
| L-003 | 2026-05-04 | Voice | Strip "Certainly!", "Great question!", "Absolutely!" — sycophancy ban | Voice integrity | LIVE |
| L-002 | 2026-05-04 | Architecture | Consolidate ads platforms into one playbook — don't silo Google/Meta/TikTok | ~400 lines duplication / 2 hrs rework | RESOLVED |
| L-001 | 2026-05-04 | Architecture | Extract persona (CLAUDE.md) from orchestration (agent-architecture.md) | 3 hrs refactor + future debt | RESOLVED |

---

## §2 — LESSONS BY CATEGORY

Each entry follows the same shape: **What happened** (2 sentences max) → **Why it cost us** (1 sentence) → **The rule going forward** (1 sentence, imperative). Cross-links point at the playbook section where the rule is also embedded.

---

### §2.1 ARCHITECTURE

#### L-001 — Extract persona from orchestration
**Date:** 2026-05-04 | **Category:** Architecture | **Cost:** 3 hrs refactor + future architectural debt | **Status:** RESOLVED
**What happened:** CLAUDE.md tried to define everything in one file — persona, voice, playbook routing, Master org chart, tool stack, contracts. The file got dense and the routing logic competed with the persona instructions for attention.
**Why it cost us:** Mixed concerns mean every change risks breaking something else, and Masters had no clear "where do I look for what" map.
**The rule going forward:** CLAUDE.md owns WHO ROCCO is (persona, voice, frameworks). agent-architecture.md owns WHICH MASTER and HOW they hand off. skills/*.md owns HOW to execute. Three tiers, one concern each.
**Lives also at:** `skills/agent-architecture.md` §1 (the three-tier stack)

#### L-002 — Consolidate, don't silo (ads playbooks)
**Date:** 2026-05-04 | **Category:** Architecture | **Cost:** ~400 lines duplication avoided + 2 hrs rework | **Status:** RESOLVED
**What happened:** Started with separate google-ads.md, meta-ads.md, tiktok-ads.md. Quickly discovered all three needed the same CPL framework, learning phase rules, and performance-reviewer decision tree.
**Why it cost us:** Three files = three sources of truth for the same diagnostics. When the rule changes, you have to remember to update three places.
**The rule going forward:** When 3+ playbooks share core logic, merge into one playbook with platform-specific sub-sections. One source of truth, platform-branched where actually different.
**Lives also at:** `skills/ads.md` §0 (one file, three platforms, one performance reviewer)

#### L-007 — Skill routing without architecture is guesswork
**Date:** 2026-05-06 | **Category:** Architecture | **Cost:** Wasted skill invocations + cross-Master collisions | **Status:** LIVE
**What happened:** Installed 67+ sub-agents at `.claude/skills/` with no routing layer. ROCCO had no declared way to pick the right skill for a multi-Master task (e.g., "close → build → launch → nurture").
**Why it cost us:** Without routing, every cross-division task became improvisation. Wrong skills got called. Sequences ran out of order.
**The rule going forward:** Every sub-agent must belong to exactly one Master. Cross-Master tasks follow the contracts in agent-architecture.md §6. If a task triggers more than one keyword, follow the multi-Master detection patterns in §5.
**Lives also at:** `skills/agent-architecture.md` §4, §5 (routing triggers)

---

### §2.2 VOICE & TONE

#### L-003 — Strip "Certainly!" — sycophancy ban
**Date:** 2026-05-04 | **Category:** Voice | **Cost:** Voice integrity (compounds over time) | **Status:** LIVE
**What happened:** Early ROCCO drafts opened with "Certainly!", "Great question!", "Absolutely!", "Of course!" — generic AI cheerleading. Voice felt like every other assistant, not like a sharp operator.
**Why it cost us:** Sycophancy in the opener telegraphs that the rest of the response will be hedged and corporate. Brendan noticed immediately.
**The rule going forward:** Never open a response with "Certainly!", "Great question!", "Absolutely!", "Of course!" Never start with "I" as the first word. Give a real committed answer. Strip AI-sounding language. (See L99 — No sycophancy in CLAUDE.md.)
**Lives also at:** `CLAUDE.md` (Voice — non-negotiable section), `CLAUDE.md` (L99 rule)

---

### §2.3 PROCESS & ENVIRONMENT

#### L-004 — Stage 0 design brief is non-negotiable
**Date:** 2026-05-05 | **Category:** Process | **Cost:** 2-3 days per site without it | **Status:** LIVE
**What happened:** Built early websites without forcing a Stage 0 design brief upfront. Lovable iterations ran without direction — generic results, lots of rework.
**Why it cost us:** No brief = no shared target. Every iteration is a guess. Two to three days lost per site to back-and-forth that a 30-minute brief would prevent.
**The rule going forward:** Every site build starts with Stage 0 design brief. No exceptions, even on tight timelines. If the client won't do it, ROCCO drafts it from discovery notes and gets approval before touching Lovable.
**Lives also at:** `skills/website.md` Stage 0 (design brief), `skills/trade-n-travel.md` governance rules

#### L-005 — Content pipeline can't be deferred
**Date:** 2026-05-05 | **Category:** Process | **Cost:** 7 days of compounding distribution lost | **Status:** RESOLVED
**What happened:** Had marketing, ads, sales playbooks built but zero system for Brendan's own content (LinkedIn, X, founder distribution). Content was treated as "phase 2."
**Why it cost us:** Authority compounds. Every day without content is a day Brendan isn't building inbound demand for a sales motion that's still cold-call-only.
**The rule going forward:** Any system that compounds (content, SEO, community, reviews) must be built parallel to client work, not after. If you defer compounding work, you're deferring future leverage.
**Lives also at:** `skills/content.md` (autonomous content pipeline, <10 min/day Brendan)

#### L-009 — Playbook index must update same-day
**Date:** 2026-05-07 | **Category:** Process | **Cost:** Active confusion (CLAUDE.md still marks shipped playbooks as `[future]` as of today) | **Status:** MONITORING
**What happened:** Shipped agent-architecture.md, marketing.md, ads.md, content.md, website.md as LIVE playbooks but CLAUDE.md's PLAYBOOK INDEX section still pointed to old stubs. New Masters reading CLAUDE.md couldn't tell what was actually executable.
**Why it cost us:** Stale index = trust damage on the master doc. If CLAUDE.md says a playbook is "future" and it's actually live, every other claim in CLAUDE.md becomes suspect.
**The rule going forward:** When a new playbook ships, update CLAUDE.md PLAYBOOK INDEX in the same commit. No exceptions. Index status (LIVE/PARTIAL/PLANNED) must match reality at all times.
**Lives also at:** `CLAUDE.md` THE PLAYBOOK INDEX section (currently has stale `[future]` markers — open follow-up)

#### L-012 — Commit frequently in Codespace
**Date:** 2026-05-08 | **Category:** Process | **Cost:** 30+ min lost per disconnect | **Status:** LIVE
**What happened:** Codespace can go slow and disconnect mid-build. Long uncommitted work gets nuked when the connection drops or the container restarts.
**Why it cost us:** Lost work isn't just the time to retype — it's the loss of the train of thought, the in-context decisions, the half-finished structure.
**The rule going forward:** Commit every meaningful checkpoint (every ~15-30 min of work, every completed section, every passing test). Never go 30+ minutes uncommitted. Treat every commit as cheap insurance.
**Lives also at:** (no playbook section yet — candidate for future `skills/dev-environment.md`)

#### L-013 — Codespace startup checklist required
**Date:** 2026-05-08 | **Category:** Process | **Cost:** 10 min of confusion per Codespace restart | **Status:** LIVE
**What happened:** Claude Code doesn't persist across Codespace restarts — it has to be reinstalled every time. Without a checklist, you waste 10 minutes figuring out why nothing works.
**Why it cost us:** Friction at startup kills momentum. The first 10 minutes after a restart should be productive, not "why is claude not found."
**The rule going forward:** Every Codespace restart runs a startup checklist: (1) reinstall Claude Code, (2) verify MCP servers connected, (3) verify GitNexus index fresh, (4) `git status` for uncommitted work from last session. Document the exact commands somewhere reachable.
**Lives also at:** (no playbook section yet — candidate for future `skills/dev-environment.md`)

---

### §2.4 TOOLS & TACTICS

#### L-006 — Never block geo terms in ads
**Date:** 2026-05-06 | **Category:** Tactics | **Cost:** $200+ wasted SonoView spend | **Status:** LIVE
**What happened:** SonoView CPL initially spiked because we added negative keywords that accidentally blocked geo terms (reno, sparks, nevada). High-intent local searchers got filtered out.
**Why it cost us:** Geo terms ARE the buying signal for local services. Blocking them is blocking the highest-intent traffic. $200+ in spend trying to optimize before catching the issue.
**The rule going forward:** Never add city, county, or state names as negative keywords. Geo terms are gold. Audit every negative keyword list against this rule before pushing.
**Lives also at:** `skills/ads.md` §3 (learning phase rules), `skills/ads.md` §4 (SonoView sub-playbook), `CLAUDE.md` (SonoView client section)

#### L-014 — Always fetch official docs before MCP/API config
**Date:** 2026-05-08 | **Category:** Tools | **Cost:** ~2 hrs per misconfigured MCP/API | **Status:** LIVE
**What happened:** Tried configuring MCP servers and API connections by guessing at command syntax and config field names. Result: silent failures, mysterious errors, time spent debugging guessed-at config.
**Why it cost us:** Every MCP/API has a real spec. Guessing means you debug your guess instead of debugging the actual integration.
**The rule going forward:** Before configuring any MCP, API, or third-party integration, fetch the official docs first (WebFetch the official URL or Brave Search "[tool name] official docs"). Never guess at command flags or config schemas. Read first, configure second.
**Lives also at:** (no playbook section yet — candidate for future `skills/dev-environment.md` or `skills/tooling.md`)

#### L-015 — Skip banana-claude repo
**Date:** 2026-05-08 | **Category:** Tools | **Cost:** ~2 hrs evaluating a broken tool | **Status:** RESOLVED
**What happened:** Evaluated banana-claude repo for image generation. Repo is broken — install fails, examples don't run.
**Why it cost us:** Two hours digging into setup issues that turned out to be repo-level brokenness, not user error.
**The rule going forward:** Don't waste time on banana-claude. For image generation use Flux via Replicate (programmatic) or Higgsfield (animation/hero). Both work, both documented.
**Lives also at:** `skills/content.md` (image+video tool stack)

#### L-016 — Skip "generic language killer" repo
**Date:** 2026-05-08 | **Category:** Tools | **Cost:** ~30 min on a dead repo | **Status:** RESOLVED
**What happened:** "Generic language killer" skill repo was either private or abandoned. No usable code, no docs.
**Why it cost us:** Time spent investigating a dead asset.
**The rule going forward:** Don't waste time on "generic language killer." For voice/de-AI work use the `de-ai-ify` skill or the `voice-extractor` skill that are already installed. Cross-reference `skills/content.md` brand voice section.
**Lives also at:** `skills/content.md` (brand voice system)

#### L-017 — Skip Smithery CLI for installs
**Date:** 2026-05-08 | **Category:** Tools | **Cost:** ~1.5 hrs on failed installs | **Status:** LIVE
**What happened:** Tried installing MCP servers and skills via Smithery CLI. Install commands fail, error messages unclear, success rate too low to trust.
**Why it cost us:** Every failed install is debugging time. When the installer itself is unreliable, you can't tell if the issue is the installer or the package.
**The rule going forward:** Don't use Smithery CLI for installs. Use direct `npm install` (for npm packages) or `git clone` (for repos). Manual is slower per-install but reliable per-install — net faster.
**Lives also at:** (no playbook section yet — candidate for future `skills/dev-environment.md`)

---

### §2.5 CLIENT-SPECIFIC

#### L-008 — Review Scraper hook required on first touch
**Date:** 2026-05-06 | **Category:** Client / Marketing | **Cost:** Trust damage on first impression + lower reply rate | **Status:** LIVE
**What happened:** Cold outreach without personalization (their star rating + review count from GBP) reads as spam. Reply rates collapse when the first touch is generic.
**Why it cost us:** First touch sets the entire sequence. If touch #1 reads as spam, touches #2-5 don't get opened.
**The rule going forward:** Don't deploy any cold sequence without the Review Scraper SOP wired in. First touch must reference their actual star rating, review count, and at least one specific review observation. No exceptions.
**Lives also at:** `skills/marketing.md` §6, §7 (Review Scraper SOP)

#### L-011 — Preserve SonoView in protected sub-playbook
**Date:** 2026-05-07 | **Category:** Client | **Cost:** Revenue risk on the only paying client | **Status:** LIVE
**What happened:** SonoView has bespoke voice ("See your baby smile," emotional angle), unique CPL bands ($20-35 GOOD), strict geo rules, and a verification fact-check layer. None of that applies to pool. Tried to generalize it into pool templates and immediately broke the SonoView-specific logic.
**Why it cost us:** SonoView is the paying client and the proof asset for selling pool. Breaking it to scale faster is a self-own.
**The rule going forward:** SonoView lives in protected sub-playbooks (`skills/ads.md` §4, `skills/content.md` §11). Never generalize SonoView rules into base templates. When pool playbooks need bespoke logic, build a parallel pool sub-playbook — don't merge.
**Lives also at:** `skills/ads.md` §4 (SonoView sub-playbook), `skills/content.md` §11 (per-surface playbooks), `skills/sonoview.md` (full client doc)

---

### §2.6 NICHE & POSITIONING

#### L-010 — Handyman math doesn't pencil at $1.5k retainer
**Date:** 2026-05-07 | **Category:** Niche | **Cost:** Prevents repeat 2-3 hr "should we pitch handyman" debates | **Status:** LIVE
**What happened:** Ran handyman through Council LCM (5 lenses: Marketing, Revenue, Operations, Strategy, Finance). Handyman AOV is $100-150 per job. At $1.5k/mo retainer + ad spend, the math requires 30+ booked jobs/mo just for the client to break even, before they pay us.
**Why it cost us:** Time spent re-debating a niche we already eliminated. Risk of pitching a service the client can't afford to keep.
**The rule going forward:** Handyman is AVOID-FOR-NOW. Don't pitch it. Don't re-debate it without new pricing leverage (e.g., $5k+ AOV handyman positioning, or sub-$500 retainer model). When a niche is eliminated via Council LCM, mark it in `skills/marketing.md` §1 niche table — don't re-evaluate without new evidence.
**Lives also at:** `skills/marketing.md` §11 (Council LCM handyman example), `skills/marketing.md` §1 (niche status table)

---

## §3 — LOGGING TEMPLATE (copy-paste to append)

When you make a mistake or reverse a decision, copy this block and fill it in. Add the row to §1 and the entry to the right §2 sub-section. Cross-link from the relevant playbook if the rule is also embedded there.

```markdown
#### L-NNN — [Title — start with imperative or short noun phrase]
**Date:** 2026-MM-DD | **Category:** [Architecture | Voice | Process | Tools | Tactics | Client | Niche] | **Cost:** [time / money / quality estimate — required, no "TBD"] | **Status:** LIVE
**What happened:** [2 sentences max — what we did, what went wrong]
**Why it cost us:** [1 sentence — the actual damage, not the abstract concept]
**The rule going forward:** [1 sentence, imperative voice — "Do X" or "Don't Y"]
**Lives also at:** [cross-references to playbook sections — e.g., `skills/ads.md` §3 — or "(no playbook section yet)"]
```

**Required steps after appending the entry:**
1. Add a one-line row to §1 LESSONS AT A GLANCE table (top of table — most recent first)
2. If the rule belongs in a playbook, add a one-line note in that playbook with a back-link to L-NNN
3. If the rule is a session-zero anti-pattern, add it to §4 ANTI-PATTERN QUICK SCAN
4. Commit with message: `lessons: L-NNN [title]`

**ID convention:** Strict numeric increment. Next ID after L-017 is L-018. Never reuse, never skip.

**Status options:**
- **LIVE** — rule is actively enforced, watch for it daily
- **RESOLVED** — fixed in code/process; kept here for historical context
- **MONITORING** — rule applied, watching for regression

---

## §4 — ANTI-PATTERN QUICK SCAN

**This is the section ROCCO reads every session start.** 60 seconds. 14 lines. Keeps the most expensive mistakes top-of-mind.

- Don't open with "Certainly!", "Great question!", "Absolutely!", "Of course!" (L-003)
- Don't ship playbooks without updating CLAUDE.md PLAYBOOK INDEX same day (L-009)
- Don't deploy cold sequences without Review Scraper personalization on touch #1 (L-008)
- Don't pitch handyman at $1.5k retainer pricing — AVOID-FOR-NOW (L-010)
- Don't block geo terms (city/county/state names) in ads — geo = gold (L-006)
- Don't skip Stage 0 design brief on websites — even on tight timelines (L-004)
- Don't generalize SonoView rules into pool/base templates — protected sub-playbook (L-011)
- Don't silo ads platforms — one playbook, platform-branched where different (L-002)
- Don't guess at MCP/API config — fetch official docs first (L-014)
- Don't use Smithery CLI for installs — direct npm or git clone (L-017)
- Don't waste time on banana-claude (broken) or generic-language-killer (dead) (L-015, L-016)
- Don't skip Codespace startup checklist — Claude Code reinstalls every restart (L-013)
- Don't go 30+ minutes uncommitted in Codespace — disconnects lose work (L-012)
- Don't re-debate decisions logged in §2 — read the entry first, then challenge with new evidence
