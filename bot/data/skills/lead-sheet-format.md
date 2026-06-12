# Lead-Sheet Format — STANDARD (all niches: pool, pest, garage, future)

**Standard reset 2026-05-31 (Brendan): the canonical layout is now `PEST 4 B3.md`.** Every lead batch `.md` matches that structure exactly. Reference example: `memory/leads/PEST 4 B3.md`.

Each batch still produces THREE files (unchanged):
1. `<NICHE> B<n> Research.csv` — 14-col source of truth: `first_name,last_name,company_name,phone,email,website,google_rating,review_count,years_in_business,employee_count_estimate,city,outreach_angle,score,niche`.
2. `<NICHE> B<n>.csv` — 11-col GHL-ready import.
3. `<NICHE> B<n>.md` — **the dial sheet, in the PEST 4 structure below.**

Keep each file's existing niche + batch number in the H1.

---

## The .md layout (top → bottom) — match PEST 4 B3 exactly

### 1. Header
- H1 title (niche + batch).
- `**Generated:**`, `**Format:**`, `**Leads:**` lines.
- `**Geo:**` (city counts) and `**Tiers:**` (tier counts) one-liners.

### 2. Leads Table — the headline
`| # | Company | Owner | Phone | Score | Tier | City | Hook |`
- Sorted by **score descending** (stable). `#` is the global dial rank (1..N) reused everywhere below.
- **Owner** = real name, else `—`. **Phone** = `(702) XXX-XXXX` (leave blank only if the source data has none — never fabricate). **Hook** = the angle truncated to ~72 chars + `...`.

### 3. Top 5 — Dial Day 1
Five bold lines, highest score first:
`**#1. <Company>** — <score>/10 — Owner: <name or (ask for owner)> — <phone> — <City>, NV`

### 4. Recommended Dial Order — grouped by tier
One bullet per tier present, in order: `**TOP (≥7.5):**`, `**MID (6.5–7.4):**`, `**PROBE (5.5–6.4):**`, `**FILLER (≤5.4):**` → comma-list of companies (owner first-name in parens where known).

### 5. Per-Lead Detail — one numbered block per lead
Numbered to match the table. Each block:
```
### <#>. <Company> — <score>/10 (<tier>)
**Owner:** <name or (owner not surfaced)> · **Phone:** <phone> · **City:** <City>, NV[ · **Web:** <site>][ · **Email:** <email>]
[**Reviews:** <rating>★ / <count>]   ← only if rating or count exists

> <owner-name angle>
```
**Angle blockquote shape:** open with the owner's name → acknowledge the real strength → name the specific gap → `[X]-day fix: [deliverable] = [outcome]`, tied to that niche's pains. (Carried verbatim from the Research CSV `outreach_angle` — do not invent facts.)

---

## Tier bands (derived from score — PEST 4's own mapping)
`≥7.5` top-priority · `6.5–7.4` mid-priority · `5.5–6.4` probe-first · `≤5.4` filler.

## Niche pain frameworks (for writing angles)
- **Pool** (from `vegas-pool-scripts-v3-painfirst.md`): A follow-up speed · B referral dependence · C website not converting · D reviews low · E seasonal swings · F can't compete w/ bigger guys · G burnt by past marketing.
- **Pest** (no script yet — seed library, see `PEST 5.md`): A no real website · B solo/invisible · C low/no reviews · D licensed-but-unfindable · E referral-dependent/no ads · F gmail/generic email · G renting leads/directories.
- **Garage** (from `GARAGE DOOR 1 B4`): A dated site · B no website · C low/no reviews · D tenure-but-invisible · E referral/no ads · F gmail/"just a guy" · G renting leads/directories.

## Cross-list allocation (global best-first — standing rule, 2026-05-31)
See [[feedback-lead-allocation]]. Rank the entire qualified pool globally by fit/score and serve best-first ACROSS lists: list 1 = the best in the market, list 2 = next-best, etc. **Quality steps down only between lists, never within one.** Every list is uniformly the best available at pull time — no strong-top/weak-bottom gradient inside a list (don't dump a 9.5→5.0 spread into one list; keep each list in a tight band, ideally 1–2 adjacent tiers). **No padding** — if only X qualify at the current level, ship X and start the next list at the watermark just below. Record the watermark in the batch notes. Size follows quality, not a fixed count. Existing lists are grandfathered as-is — do not retro-apply.

## Hard rules carried into every batch
- **Phone required** on net-new sourcing (no phone → not a lead). On reformat-only jobs, leave a missing phone blank — never fabricate.
- **Owner attached where findable**; else `—` / `(owner not surfaced)` / `(ask for owner)`.
- **Dedup** normalized-name + phone-last-10 vs ALL prior batches (cross-niche too).
- **Tier honestly; never pad.** Dial-first / free-tier enrichment. Honors no-Tyler + money-constraints rules.

## Reformat tooling
The deterministic rebuilder (Research CSV → PEST 4 .md) lives at `/tmp/reformat.py` — regenerate/adapt it to re-emit any batch in this format.
