# Content Operating System — The Autonomous Content Engine
**Scope:** Daily content pipeline (draft → approve → schedule → post), brand voice system, hook frameworks, image + video gen, posting schedule, performance reviewer.
**Reads:** Brendan (approval + voice owner) + Claude (drafting agent) + automation glue
**Goal:** Brendan reviews 5–10 posts/day in <10 minutes. Voice stays his. Output is daily, consistent, on-brand.

---

## §0 — HOW TO USE THIS FILE

This is the playbook for Content Master. It runs both AGENCY content (Brendan's LinkedIn / X / Newsletter) and CLIENT content (when a client wants social as part of delivery). 50/50 weight.

**Reading order:**
- New content kickoff → §1 (pick surface) → §3 (load voice) → §4 (pick hook) → §6/§7 (assets) → §8 (approval flow)
- Daily generation → §2 (the pipeline)
- Performance question → §10 (reviewer trees)
- Voice drift / tone issue → §3 (voice system)
- Per-platform deep dive → §11 (sub-playbooks)
- Tool selection → §6 (image) or §7 (video)

**Three rules:**
1. **Voice over volume.** Better to post 3x/wk on-voice than 7x/wk off-voice. Voice flag (§8) is the kill switch.
2. **Hook is everything.** First 1.5s on video, first 1 line on LinkedIn. If the hook doesn't stop the scroll, the rest doesn't matter.
3. **Don't change pillars in <14 days.** Content perf is a lagging indicator. Test, hold, measure, then iterate.

**Cross-Master ownership:**
- Content Master owns this entire file
- `image` skill is SHARED with Build Master (Build owns site images, Content owns social/ad images)
- `video` skill is owned by Content
- Content FEEDS all 3 Ads Masters (creative for ads — see Contracts C7/C8 in agent-architecture.md)
- Content is FED BY Marketing (positioning + pillars) and Intelligence (trends + pain points)

---

## §1 — THE CONTENT SURFACES AT A GLANCE

| Surface | Best for | Cadence (agency) | Cadence (clients) | Format priority |
|---|---|---|---|---|
| **LinkedIn** | B2B authority, agency lead gen | 3–5/wk | 1–2/wk (when client wants) | Text > Carousel > Video > Image |
| **X / Twitter** | Authority, contrarian takes, network growth | 4/day | Skip for clients | Text > Image > Video |
| **Instagram** | Visual brand, behind-the-scenes | 3/wk | 3–4/wk for visual niches | Reels > Carousel > Story > Image |
| **TikTok** | Viral demonstration, before/after | 5–7/wk if testing | 3–5/wk for visual niches (carpet, cleaning, landscape) | Vertical video only |
| **YouTube Shorts** | Long-tail discovery, repurposed video | 3/wk | 2/wk | Vertical video only |
| **YouTube long-form** | Authority, deep tutorials | Defer (1/mo if any) | Defer | Horizontal video |
| **Newsletter** | Authority + lead nurture | 1/wk Sundays | TBD per client | Long-form email |
| **Threads / Bluesky** | Defer | Defer | Defer | n/a |

### When to use which (decision logic)

```
What's the goal?
│
├─ Agency lead gen / authority → LinkedIn (primary) + X (secondary)
├─ Visual niche client → Instagram + TikTok + YouTube Shorts
├─ Long-form thought leadership → Newsletter + LinkedIn
├─ B2B service ad creative → LinkedIn + Meta (cross to ads.md §5)
└─ Local awareness for non-visual niche → SKIP organic content; route to ads.md
```

### Cross-platform repurposing chain

The 1→5 rule: every long-form piece becomes 5 shorter derivatives.

```
1 long-form piece (LinkedIn long post / Newsletter / YouTube long)
   ↓
5 derivatives:
   1. X thread (5–10 tweets) — extract the framework
   2. LinkedIn carousel (5–10 slides) — extract the visuals
   3. 60-second Reel/TikTok — extract the punchiest 3 lines + visual
   4. 30-second YouTube Short — repurpose Reel
   5. 3 standalone tweets — extract 3 quotable lines
```

This is the ONLY content cadence that scales without burning the writer.

---

## §2 — THE DAILY CONTENT PIPELINE (AUTONOMOUS WORKFLOW)

> ⚠️ **SUPERSEDED (2026-06-11, Gate 5 build):** the Notion + Buffer + Make.com
> stack described in §2 and §8 was never built and is replaced by the shipped
> Gate 5 implementation: Discord emoji approval in #content-valdes
> (👍 approve / 👎 kill / 🔄 one rewrite with reply notes), a persistent
> posting queue on the Railway volume, and Composio direct posting (LinkedIn
> v1). Source of truth: `bot/src/features/approval.ts`, `scheduler.ts`,
> `bot/src/services/state.ts`, `composio.ts`. Read §2/§8 as design history.

The 4-stage flow. Designed for Brendan to spend <10 min/day on review.

```
                ┌──────────────────────────────────────────┐
                │  DAILY 6am: Claude job fires             │
                │  - Reads pillars (§5) + voice (§3)       │
                │  - Generates 5 posts across surfaces     │
                │  - Adds image/video assets per §6/§7     │
                │  - Pushes batch to approval queue        │
                └────────────────┬─────────────────────────┘
                                 ↓
                ┌────────────────────────────────────┐
                │  Brendan reviews (Notion or         │
                │  Discord channel)                   │
                │  Time budget: <10 min/day           │
                │  Actions per post:                  │
                │  - APPROVE → auto-schedule          │
                │  - EDIT → tweak then approve        │
                │  - REJECT → feedback loop to Claude │
                │  - DEFER → save for later batch     │
                └────────────────┬───────────────────┘
                                 ↓
                ┌────────────────────────────────┐
                │  Buffer / Hypefury / Typefully │
                │  picks up approved posts       │
                │  via Make.com webhook          │
                │  Schedules at optimal time §9  │
                └────────────────┬───────────────┘
                                 ↓
                ┌────────────────────────────────┐
                │  Scheduler posts at peak time  │
                │  Performance data flows back   │
                │  to GHL + analytics            │
                └────────────────┬───────────────┘
                                 ↓
                ┌────────────────────────────────┐
                │  Weekly: Performance Reviewer  │
                │  (§10) runs symptom trees      │
                │  Adjusts pillars/hooks/cadence │
                └────────────────────────────────┘
```

### Stage 1 — DRAFT (Claude generates daily batch)

**Trigger:** Daily at 6am (cron job — set up via CronCreate skill or serverless function)

**Inputs Claude pulls:**
- `skills/voice/{client}.md` for voice DNA (defaults to brendan.md)
- §5 of this file for active pillars
- §4 for hook patterns
- `skills/marketing.md` §10 for positioning
- Current performance data (last 7d engagement) from analytics
- Any rejected posts from yesterday's batch (learn from rejection)

**Output:** 5 posts/day across surfaces (default mix):
- 1× LinkedIn long post (300–600 words)
- 2× X tweets (single post, not threads — threads are weekly)
- 1× short-form video script (Reel/TikTok/Short)
- 1× Instagram carousel concept (3–5 slides)

**Format per post:**
```markdown
## Post #N — {{platform}}
**Pillar:** {{pillar}}
**Hook pattern:** {{pattern from §4}}
**Voice score:** {{0-10 — Claude self-scores against voice file}}
**Visual asset:** {{asset path or generation prompt}}
**Suggested time:** {{from §9 schedule}}

[Content body]

---
**Why this works:** {{1 sentence reasoning}}
**Approval action needed:** APPROVE / EDIT / REJECT / DEFER
```

### Stage 2 — APPROVE (Brendan reviews)

**Interface (recommended initial stack):** Notion approval queue.

Why Notion (vs alternatives in §8): already in stack potential, simple, mobile-friendly, lets Brendan tap APPROVE/EDIT/REJECT/DEFER without context-switching.

**Time budget:** 5–10 posts × ~1 min each = <10 min/day total.

**Per-post actions:**
- **APPROVE** → Notion property change → Make.com webhook → Buffer schedules
- **EDIT** → Brendan tweaks the post inline → marks APPROVE → flows to Buffer
- **REJECT** → Brendan adds 1-line reason → Claude logs feedback for next batch
- **DEFER** → moves to "Later" queue (re-enters tomorrow's batch)

**Voice-flag override:** If Claude self-scored a post <7 on voice match, it lands in approval queue with a 🚩 flag. Brendan rewrites or rejects; auto-feedback to Claude.

### Stage 3 — SCHEDULE (Buffer/Hypefury/Typefully)

**Recommended initial scheduler:** Buffer (cheapest, simplest, all platforms supported).

**Alternatives considered:**
- **Hypefury** — best for X power users (auto-retweet, evergreen recycling)
- **Typefully** — best for X + LinkedIn pair (clean UI, AI assist built-in)
- **Buffer** — most platforms, lowest friction, $15/mo
- **GHL native** — already in stack, but social tools are weaker than Buffer
- **Manual** — fallback for first 30 days while pipeline is being tested

**Setup:**
1. Buffer account connected to LinkedIn + X + IG + TikTok + YouTube
2. Make.com scenario: trigger = Notion property change to "APPROVED" → action = Buffer add post
3. Schedule slot picked from §9 schedule (Buffer auto-fills next available)

### Stage 4 — POST (scheduler fires)

Scheduler posts at the §9 optimal time. Performance data (likes, comments, impressions, profile visits) flows back via:
- Buffer analytics
- Native platform analytics
- Sumo metrics in GHL custom field (per-post performance log)
- Weekly aggregate to brain-dump.md for human review

### Failsafes

| Failsafe | Trigger | Action |
|---|---|---|
| **Voice flag** | Generated draft scores <7 on voice match | Drop into approval queue with 🚩 — requires Brendan rewrite or reject |
| **Kill switch** | Brendan types `/pause-content` in Discord | Make.com pauses → no auto-schedules until `/resume-content` |
| **Volume cap** | More than 7 approved posts in 24h | Buffer queues remainder for next day (prevents burst-posting) |
| **Bad performance auto-flag** | Last 5 posts averaged <30% of baseline engagement | §10 reviewer auto-runs Monday morning + alerts Brendan |
| **Post-mortem** | Weekly Sunday | Approved-vs-rejected ratio + top-performing post + voice-flag count → log to brain-dump.md |

### Time budget per stage (per day)

| Stage | Owner | Time/day |
|---|---|---|
| Draft (Claude) | Claude (autonomous) | 0 (Brendan time) |
| Approve | Brendan | <10 min |
| Schedule | Make.com (autonomous) | 0 |
| Post | Buffer (autonomous) | 0 |
| **Brendan total** | | **<10 min/day** |

---

## §3 — BRAND VOICE SYSTEM

Voice is the single biggest differentiator between content that converts and content that gets ignored. This system makes voice replicable + maintainable.

### Voice file structure

```
skills/voice/
  brendan.md          ← Brendan's voice guide (PRIMARY — created in this session)
  sonoview.md         ← if/when agency posts on SonoView's behalf
  trade-n-travel.md   ← when ready
  {future-client}.md  ← per future client adopting our content service
```

### Voice file template (frontmatter + 6 sections)

```markdown
---
name: {{owner_name}}
extracted_from: list of source samples (LinkedIn posts, podcast transcripts, etc.)
extracted_date: ISO
last_refresh: ISO
---

## Tone DNA
**Three adjectives that describe this voice:**
- adjective 1
- adjective 2
- adjective 3

**Three adjectives that DO NOT describe this voice:**
- avoid 1
- avoid 2
- avoid 3

## Vocabulary
**Words this person uses regularly:**
- ...

**Words this person never uses:**
- ...

**Slang / regionalisms / inside terms:**
- ...

## Sentence patterns
- Average sentence length: {{N words}}
- Common openers: ...
- Common closers: ...
- Punctuation tics: (em dash use, ellipsis, etc.)

## Topics they own
3–5 themes they speak to with authority:
- ...

## Anti-patterns
- Things they would never say
- Tones they avoid (corporate, salesy, AI-coded)

## Calibration examples
**On-voice example #1:** [paste]
**On-voice example #2:** [paste]
**On-voice example #3:** [paste]
**Off-voice example (and why):** [paste]
```

### Brendan's voice (pre-loaded from CLAUDE.md ROCCO rules)

The system creates `skills/voice/brendan.md` with these defaults pulled from CLAUDE.md:

**Tone DNA:**
- Direct
- Specific
- Confident

**NOT:**
- Corporate
- Apologetic
- Vague

**Vocabulary — uses regularly:**
- "legit"
- "the move"
- "next move"
- specific numbers as credibility ("3 booked out of 60 dials")
- niche-specific (pool guy, Vegas-only, etc.)

**Vocabulary — NEVER uses:**
- "Certainly!" / "Great question!" / "Absolutely!" / "Of course!"
- "leverage" / "utilize" / "actionable insights"
- "moving forward" / "circle back"
- "synergy" / "ecosystem" / "deep dive"

**Sentence patterns:**
- Avg sentence length: 8–14 words
- Short punchy sentences. Never essays.
- Common closer: ONE clear next move (per CLAUDE.md voice rules)

**Punctuation tics:**
- Em dash for impact
- Period not exclamation
- ALL CAPS for one word emphasis (rare)

**Anti-patterns:**
- Never start a response with "I" as the first word (per CLAUDE.md)
- No emojis unless the user asks (per CLAUDE.md)
- No essays — short punchy sentences
- No "let me know if you have questions" closers
- No hedging without immediately giving a recommendation

**Topics owned:**
1. Cold sales execution (sales.md)
2. Pool service marketing (Vegas niche)
3. Ad performance + CPL math
4. AI agency operations (multi-agent, autonomous workflows)
5. Building a one-person agency at 17

### Voice extraction SOP (for future client voice files)

When onboarding a client to social management:

1. **Collect samples** (request from client):
   - 5+ recent LinkedIn posts (or X if they're on X)
   - 1 podcast or video interview if available
   - 5 sample emails to friends/customers (informal)
   - Their bio/about page

2. **Run `voice-extractor` skill** (`.claude/skills/voice-extractor`)
   - Output: tone DNA, vocab, sentence patterns

3. **Write `skills/voice/{client}.md`** using the template above

4. **Calibration round:** generate 3 sample posts, send to client, ask "does this sound like you?" Iterate until 8/10 voice score.

5. **Lock the voice file.** Don't change unless client explicitly requests.

### Voice maintenance

**Drift detection:** If 3+ posts/week get flagged as off-voice OR the client/Brendan rejects 30%+ of drafts, voice file needs refresh:
- Pull last 14 days of approved posts
- Compare to original voice file
- Update sentence patterns / vocab / anti-patterns
- Re-run calibration

**Refresh cadence:**
- Brendan: every 90 days
- Clients: every 60 days for first 6 months, then 90 days

### Voice rules from CLAUDE.md (apply to ALL Brendan content)

These are non-negotiable — they live in CLAUDE.md and apply to everything:

1. Short punchy sentences. Never essays.
2. Never start with "I" as first word.
3. Never say "Certainly!" / "Great question!" / "Absolutely!" / "Of course!"
4. No corporate speak.
5. Hype wins loud and specific. Not "good job" — "3 booked out of 60 dials, 5% book rate, that's legit."
6. Problems get: honest assessment + the fix immediately. Never just drop a problem.
7. End every strategy answer with ONE clear next move.

These get applied automatically — every Brendan draft is checked against this list before voice scoring.

---

## §4 — HOOK FRAMEWORKS

The first 1–3 lines (or first 1.5s on video) decide whether anyone reads the rest. This section is the hook bank — patterns + 200+ ready-to-remix examples.

### LinkedIn hook patterns (8 patterns × 15 examples = 120 hooks)

#### Pattern 1: BOLD CLAIM
**Formula:** [Specific group] is [doing/missing] [counterintuitive thing]. [Number] [evidence].

**Examples (pool/agency context):**
1. Most pool service companies in Vegas are leaving 30% of their bookings on the table.
2. The best marketing agencies don't pitch new clients. They get pitched.
3. 90% of cold emails fail at the subject line. We fixed that with one variable.
4. Pool service is the most under-marketed local niche in Vegas. Here's why.
5. Agencies that promise "leads" lose. Agencies that promise systems win.
6. Tyler dialed 60 numbers yesterday. 14 connected. 3 booked. That's the agency.
7. The ONE word killing your cold call: "marketing."
8. Most agencies fire their first client by month 4. Here's how to not be that.
9. Pool clients don't care about ROAS. They care about "10 leads in 30 days."
10. Vegas runs pools year-round. Most agencies don't market off-season. We do.
11. Cold calling beats cold email for our agency. The math says so.
12. Your CPL doesn't matter. Your cost-per-booked does.
13. The best agency client is the one who's been burned twice before.
14. Stop optimizing your funnel. Start optimizing your call follow-up speed.
15. The Review Scraper hook is the only personalization that actually works at cold-email scale.

#### Pattern 2: VULNERABLE CONFESSION
**Formula:** I [did/failed at thing]. Here's what I learned.

**Examples:**
1. Closed $0 in my first 60 days running this agency. Here's what changed.
2. Wasted $1,500 testing TikTok ads for a pool service. Don't do this.
3. Got rejected 47 times before my first client said yes.
4. My first proposal was a 12-slide deck. The client never read it.
5. Tried to sell HVAC marketing in a pool service niche. Brutal lesson.
6. Lost a $1,500/mo client because I didn't follow up in 48 hours.
7. Tracked the wrong conversion event for 3 weeks. Burned $400.
8. My cold email reply rate was 0.3% before the Review Scraper. Now it's 8%.
9. Built a beautiful website. Forgot the phone number. Cost: 6 leads.
10. Promised "10 leads in 30 days" without the math. Almost backed myself into a corner.
11. Charged $800/mo for the first client. Fixed that fast.
12. Hired Tyler before I had product-market fit. Almost broke me.
13. Spent 3 hours on a Loom and the prospect ghosted. Won't do 30 minutes again.
14. Built a CRM before I had a customer. Don't do this.
15. Switched bid strategies on SonoView mid-week. Reset learning. $200 burn.

#### Pattern 3: QUESTION THAT PUNCHES
**Formula:** Why does [unexpected thing happen]? [The answer is] [specific].

**Examples:**
1. Why do most marketing agencies fail their first 5 clients?
2. Why does the Vegas pool market still pay $80 CPCs in 2026?
3. Why is "just send me info" the deal-killer no one talks about?
4. Why do I run cold calls instead of cold email for the agency?
5. Why does $20–35 CPL on Google Ads feel impossible to most agencies?
6. Why does Tyler's 60 dials beat my 60 emails?
7. Why are the best pool service owners the worst at marketing?
8. Why is "I get all my work from referrals" the most common deal-stopper?
9. Why is Vegas pool service a year-round market when other cities aren't?
10. Why do I refuse to lower my $1,500/mo retainer?
11. Why is the first 1.5s of a TikTok worth more than 95% of LinkedIn posts?
12. Why does the Review Scraper personalization beat anything ChatGPT generates?
13. Why does a single phone call beat a 12-slide deck?
14. Why does Henderson out-convert Summerlin for pool service ads?
15. Why is "year-round Vegas pool weather" the strongest hook in our niche?

#### Pattern 4: COUNTER-INTUITIVE LESSON
**Formula:** Everyone says [X]. We did [Y instead]. Here's the result.

**Examples:**
1. Everyone says cold calling is dead. We do it 60 times a day. It works.
2. Everyone says you need a fancy deck. We use a 5-min Loom. Closes faster.
3. Everyone says "scale your niches." We picked one. Pool service. Vegas only.
4. Everyone says "raise prices early." We held $1,500. Volume strategy works.
5. Everyone says "automate everything." We hand-dial 60/day. Speed-to-lead beats automation.
6. Everyone says "test 10 platforms." We picked Google. Only Google.
7. Everyone says "run a SaaS." We sell a service. Margins are better.
8. Everyone says "your team's your moat." We're a team of 2. Systems are the moat.
9. Everyone says "A/B test everything." We test ONE thing. Faster signal.
10. Everyone says "high-touch sells." We send a Loom + walk away. Easier close.
11. Everyone says "find your ICP." We picked it: 5–20 employee pool shops in Vegas.
12. Everyone says "ads or organic." We do both. Different jobs.
13. Everyone says "retain forever." We're month-to-month after 90 days. Better signal.
14. Everyone says "scale ads fast." We hold 14 days between changes. Learning phase math.
15. Everyone says "start with content." We started with cold dials. Easier feedback loop.

#### Pattern 5: SPECIFIC NUMBER + OUTCOME
**Formula:** [Number]. [What it represents]. [What it means].

**Examples:**
1. $20–35 CPL on Google Ads in a market where competitors pay $80. SonoView playbook.
2. 60 dials → 15 connects → 3 booked. Tyler's daily target.
3. 10 leads in 30 days or you don't pay month two. The guarantee that closes pool clients.
4. 5% reply rate on cold email — 8% with Review Scraper personalization.
5. $1,500/mo retainer × 12 = $18,000 first-year LTV. Why I won't drop the price.
6. 14-day learning phase rule on Google Ads. Touching it costs $200+ in burn.
7. $5 CPC cap on SonoView. Removed = doubled CPL within 48 hours.
8. 30 conversions / 30 days exits Google Search learning phase.
9. 50 conversions / 7 days exits Meta learning phase.
10. $30/day SonoView spend = 1 lead/day = 4-5 booked = mild profit at lead level.
11. 200 photos on a landscaping GBP = 30% lead increase (free fix).
12. 40-mile radius for Vegas pool service. Tighter = budget conservation, broader = wasted spend.
13. 8/10 voice score is the threshold for auto-approve. Below = manual review.
14. <10 minutes/day on content approval. The whole pipeline is built around this number.
15. 67 marketing skills installed at .claude/skills/. The 8 Masters orchestrate all of them.

#### Pattern 6: STORY OPEN
**Formula:** [Specific person did specific thing yesterday]. [What happened]. [What it means].

**Examples:**
1. Tyler dialed 60 numbers yesterday. 14 connected. 3 booked. That's a Tuesday.
2. A pool service owner in Henderson asked for "just info." We didn't send any. Got the meeting instead.
3. Watched my mom's SonoView Google Ads spike to $62 CPL last Wednesday. By Friday: $28. Here's what I changed.
4. Ran the Review Scraper on 50 Vegas pool prospects last weekend. 8 replies in 72 hours.
5. Closed a $1,500 retainer on a Loom and a one-pager. No deck. No back-and-forth. 6 days dial-to-close.
6. Got a "I'm not interested" reply yesterday. Asked one follow-up. They're booked for Friday.
7. A Summerlin homeowner DMd me on Facebook asking about a pool guy. Now there's a referral pipeline.
8. Tyler called a guy whose pool was green for 6 weeks. By the end of the call, he was scheduling.
9. Built the first ad creative for Trade N Travel last night. Uploaded. Didn't run it. Need positioning first.
10. SonoView CPL hit $34 last month. Right at the top of GOOD band. Held spend, didn't push.
11. Got a cold email reply from a pest control owner: "How'd you find my response rate?" Apify FTW.
12. Spent 47 minutes on Phase 1 marketing playbook last Sunday. Saved 50+ hours over the next 6 months.
13. Pool client #1 was supposed to onboard last week. Stalled on payment. Tyler's calling today.
14. SonoView's GBP got 14 new reviews last month. CPL dropped 18%. Reviews are an ad multiplier.
15. The 8th Master playbook just shipped. 6 of 8 are LIVE. The agency stack is real.

#### Pattern 7: MISTAKE CONFESSION (TACTICAL)
**Formula:** I did [thing]. It cost me [specific cost]. Here's the lesson.

**Examples:**
1. I changed bid strategy mid-week on SonoView. Reset learning. Burned $200.
2. I added a new audience to Meta during learning phase. Cost: 7 days of bad CPL.
3. I sent the Loom + 5 follow-up emails. Should've called once. Lost the deal.
4. I priced the first proposal at $800/mo. Set my anchor wrong for 6 weeks.
5. I let a "send me info" objection through. Never heard back. $0.
6. I increased Google budget by 50% without 14-day hold. Reset learning again.
7. I tried to A/B test 3 things at once on a campaign. Couldn't isolate the variable. Restarted.
8. I built a 12-slide deck. Owner watched the first 2 slides. Switched to Loom forever.
9. I forgot to add UTM to the cold email link. Lost attribution on 12 clicks.
10. I let a "we'll think about it" objection slide. Should've asked which part. Lost it.
11. I put a $300/day budget on a brand new account. Learning never converged. Cut to $50.
12. I responded to a cold email reply 9 hours later. They went with a competitor.
13. I didn't run the Review Scraper on my first cold batch. Reply rate: 1.2%.
14. I tried to sell HVAC before pool was proven. Spread thin, closed nothing.
15. I added a third Google Ad campaign before the first two had signal. Diluted budget. Both failed.

#### Pattern 8: TACTICAL PROMISE
**Formula:** Here's the [specific framework/system/method] that [specific outcome].

**Examples:**
1. Here's the 4-step Review Scraper workflow that got our cold email reply rate to 8%.
2. Here's the 5-touch cold email sequence Tyler runs every week.
3. Here's the CPL framework: $20–35 GOOD, $35–55 OK, $55+ FIX. Use it for every Google account.
4. Here's the 14-day rule for Google Ads optimization. It saves you from yourself.
5. Here's the 60–15–3 dial framework: 60 calls → 15 connects → 3 booked. Daily.
6. Here's the 8-Master architecture our agency runs on. Map your team to it.
7. Here's the daily content pipeline: draft → approve → schedule → post. Brendan time: <10 min.
8. Here's how we hand off a closed deal from Sales+Ops to Build: a JSON contract, not a Slack message.
9. Here's the niche profile template we use to pick the next vertical to expand into.
10. Here's the 5-symptom performance reviewer for ads. CPL high → trace through → fix in 2 min.
11. Here's the per-niche CPL target table — 8 niches, GOOD/OK/FIX bands, with reasoning.
12. Here's the Vegas zone targeting cheat sheet for service businesses. Income, density, niche fit.
13. Here's the 1→5 content repurposing chain. One long-form becomes 5 derivatives.
14. Here's the autonomous content pipeline architecture. 4 stages, automation glue, kill switch.
15. Here's the voice-file template every brand we onboard fills out. Drop-dead simple.

### X / Twitter hook patterns (8 × ≥10 examples)

X is shorter. Same patterns, tighter execution.

**Pattern 1 — One bold sentence:**
- "Most pool companies in Vegas are losing 30% of summer bookings to slow phone follow-up."
- "Cold calling crushed cold email for our agency. The math: 1 close per 20 dials vs 1 per 100 emails."
- "Vegas pool weather is year-round. Stop pausing campaigns in October."

**Pattern 2 — Numbered hot take:**
- "3 reasons your CPL is too high: bad keywords, bad landing page, bad bid strategy. In that order."
- "5 signs you should pick a niche: 1) you're spread thin, 2) your CAC is rising, 3) your message is fuzzy, 4) referrals are slow, 5) close rate is dropping."
- "8 things that kill Google Ads learning phase. None of them are 'wait.'"

**Pattern 3 — Mini story:**
- "Yesterday: 60 dials, 14 connects, 3 booked. Today: same target. The system is the lead source."
- "Owner answered the phone. Said 'I'm busy.' I asked when's better. Booked Friday at 10."
- "Pool ad CPL was $62. Pulled search terms. Found 4 junk keywords burning $40/day. CPL dropped to $32 in 5 days."

**Pattern 4 — Sharp question:**
- "Why do most agencies pitch services they've never sold?"
- "Why is your retainer based on what they can pay vs what they need?"
- "Why does 'send me info' kill more deals than any other objection?"

**Pattern 5 — Counter-intuitive:**
- "Don't lower your price. Lower your speed-to-lead."
- "Don't run more ads. Fix your landing page first."
- "Don't add another channel. Master the one that's already profitable."

**Pattern 6 — Mistake confession:**
- "Spent 4 hours building a deck. Should've spent 30 minutes on a Loom. Lost the deal anyway."
- "Cut my Google budget 40% in panic. Lost 2 weeks of learning. Rebuild cost > the savings."
- "Asked Tyler to email instead of call. Booked rate dropped 60%. Calls are calls."

**Pattern 7 — Tactical 1-liner:**
- "Cold email + Review Scraper = 8% reply rate. Cold email alone = 1%."
- "$20-35 CPL means 'push spend.' $55+ means 'don't touch — diagnose first.'"
- "Phrase match Google for 60 days minimum. Broad match bleeds budget on irrelevant terms."

**Pattern 8 — Bold framework:**
- "Sales: 5 stages, 5 metrics, 5 objection handles. That's the entire playbook."
- "Marketing: 11 niches, 1 wedge (pool), Vegas-only, $1.5k retainer. That's the entire ICP."
- "Ads: 3 platforms, 5 symptoms, 3 budget tiers. That's the entire ops manual."

### Short-form video hook patterns (6 × ≥10 examples)

Vertical 9:16, first 1.5s. Same patterns from ads.md §6 + expanded.

**Pattern 1 — Pattern interrupt:**
- "Don't pay for this. Watch first."
- "STOP scrolling — 8 seconds. Pool service owners only."
- "If you're a Vegas business owner, this changes everything."

**Pattern 2 — Dramatic visual (no spoken hook):**
- (Cut to green pool with dramatic music) [text overlay: "Why Vegas pools turn green every August"]
- (Phone ringing, cuts to "missed call" notification) [text overlay: "How much that just cost you"]
- (Stack of cash on desk) [text overlay: "What 60 dials/day actually pays"]

**Pattern 3 — Direct question:**
- "Vegas homeowners — when's the last time someone tested your pool chemistry?"
- "Pool service owners — when did you last fully book out?"
- "Anyone tired of paying for marketing that doesn't work?"

**Pattern 4 — Bold statement:**
- "I've cleaned 5,000 Vegas pools. Here's what I see every time."
- "Tyler made 60 calls today. 14 connected. 3 booked. Same as last Tuesday."
- "There are 300 pool service companies in Vegas. Only 8 are doing this."

**Pattern 5 — Social proof:**
- "This is the #1 reason 87% of Vegas pools turn green every August."
- "How my mom's $30/day Google Ads outperforms agencies spending $300."
- "Why a 17-year-old built the marketing system 50-year-old agencies can't replicate."

**Pattern 6 — Behind-the-scenes:**
- (Cut of pool tech opening filter, gross water) "Most pools look like this inside."
- (Tyler at desk dialing) "What 60 cold calls actually looks like."
- (Brendan reviewing Notion approval queue) "What autonomous content really means."

### Anti-patterns (NEVER open with these)

| Anti-pattern | Why it kills |
|---|---|
| "Hey guys" / "What's up" | Lazy, generic, screams "made this in 5 min" |
| Logo or brand splash for >0.5s | Wastes the precious first second |
| Slow zoom into your face | No information density, scrolls past |
| "In this post I'll explain..." | Meta-commentary delays the actual content |
| Question with obvious yes answer | "Want to make more money?" — eye roll |
| Generic emoji 🔥💯👀 | AI-coded vibes |
| "Let me know what you think" closer | Begging for engagement signals weakness |
| Trending audio with mismatched content | Reads as desperate |

---

## §5 — CONTENT PILLARS + CALENDAR

### Pillar selection framework

**Rule:** 3–5 pillars per surface. Fewer = repetitive. More = scattered.

**For each pillar, define:**
- The TOPIC (what it covers)
- The PROOF (why this person owns it)
- The PUNCH (what makes it worth reading)

### Brendan's 5 pillars (the agency authority play)

| Pillar | Topic | Proof | Punch |
|---|---|---|---|
| 1. **Agency lessons** | Building a one-person agency | Doing it now, public progress | Real numbers, real losses, real wins |
| 2. **Pool service insights** | Vegas pool service market | Direct cold dial + research data | Niche depth nobody else has |
| 3. **Vegas market** | Vegas service business landscape | Local, born-and-raised, knows zips | Hyperlocal beats remote-agency takes |
| 4. **Behind the build** | The 8-Master AI agency system | Building it on GitHub publicly | First-of-its-kind transparency |
| 5. **Contrarian takes** | Counter to common agency advice | First-principles thinking | Punchy, memorable, clip-able |

### Per-platform pillar weights

| Pillar | LinkedIn (5/wk) | X (28/wk) | IG (3/wk) | TikTok (5/wk) |
|---|---|---|---|---|
| 1. Agency lessons | 2 | 8 | 1 | 1 |
| 2. Pool service insights | 1 | 4 | 0 | 1 |
| 3. Vegas market | 1 | 4 | 1 | 1 |
| 4. Behind the build | 1 | 8 | 1 | 1 |
| 5. Contrarian takes | 0 | 4 | 0 | 1 |

X gets the contrarian takes (faster format, more risk-tolerance). LinkedIn gets the lessons (longer attention span, B2B). Skip pillar 5 on LinkedIn for now.

### Editorial calendar (rolling 30-day grid template)

Brendan keeps a rolling 30-day grid in Notion. Each cell:

```
| Day | LinkedIn | X (4) | IG | TikTok | YouTube Short |
|-----|----------|-------|----|----|---------------|
| M   | Lessons  | 1L 1B 1V 1C | — | Lessons | — |
| T   | Pool     | 1L 1P 1B 1B | Behind-the-build | Pool | Lessons |
| W   | Vegas    | 1L 1V 1B 1C | — | Vegas | — |
| Th  | Build    | 1L 1B 1V 1C | Pool | Build | Build |
| F   | Pool     | 1L 1B 1V 1C | — | Vegas | — |
| Sa  | —        | 1B 1V       | Vegas | Build | Build |
| Su  | Newsletter | 1L 1B    | — | — | — |
```
(L=Lessons, P=Pool, V=Vegas, B=Build, C=Contrarian)

### Per-client pillar adoption

When a client onboards content service:
1. Run voice extraction → write `skills/voice/{client}.md`
2. Pillar selection workshop with client (30 min call) → pick 3 pillars
3. Write client pillar grid (modified template above)
4. Generate first 7-day batch → client approves
5. Lock pillars for 30 days minimum, then review

### Repurposing matrix (1 long-form → 5 derivatives)

```
1 LinkedIn long post (400 words on "Why Vegas pool ads beat HVAC ads")
   ↓
   1. X thread (8 tweets) — extract the framework, one tweet per point
   2. LinkedIn carousel (5 slides) — extract the visual + each pillar point
   3. 60s Reel/TikTok — punchiest 3 lines + hook visual
   4. 30s YouTube Short — repurpose the Reel
   5. 3 standalone tweets — extract 3 quotable lines from the post
```

This is the ONLY content cadence that scales. Don't write 6 originals — write 1 long-form + 5 derivatives.

---

## §6 — IMAGE GENERATION RULES (FULL STACK)

### Tool selection decision tree

```
What kind of image do you need?
│
├─ Brand visual / hero / aesthetic-driven
│   └─ Midjourney v7 (--style raw, --ar 16:9 or 1:1, brand color refs in prompt)
│
├─ Photorealistic at speed
│   ├─ Speed-critical → Flux Schnell (4 steps, fast iteration)
│   └─ Quality-critical → Flux 1.1 Pro
│
├─ Needs literal prompt adherence (specific objects/scene)
│   └─ DALL-E 3 (via ChatGPT or API)
│
├─ Image with TEXT/typography
│   └─ Ideogram (only tool that does typography reliably)
│
├─ Production graphic with multi-variation needs
│   └─ Gemini Imagen 4 / GPT Image
│
├─ Final composition / brand template
│   └─ Canva (with brand kit + templates)
│
└─ Design file for site / Build Master
    └─ Figma → handoff via image-asset contract
```

### Per-tool deep dive

#### Midjourney v7
**Best for:** Brand visuals, hero images, aesthetic-driven (LinkedIn carousel covers, X profile banners, IG feed posts).

**Prompt pattern:**
```
[subject], [style descriptor], [composition], --style raw --ar 1:1 --v 7
```

**Example for Vegas pool service hero:**
```
luxury backyard pool at golden hour, Las Vegas residential, glass-edge infinity pool, palm trees in background, photorealistic, cinematic lighting, --style raw --ar 1:1 --v 7
```

**Tips:**
- Use `--style raw` for photorealism (less "MJ aesthetic")
- Aspect ratios: `--ar 1:1` for IG, `--ar 16:9` for LinkedIn cover, `--ar 9:16` for Reels stills
- Brand color reference: append `, color palette: [#hex] [#hex] [#hex]`

**Cost:** ~$10–30/mo Standard plan
**Speed:** ~60s per image (slower than Flux)

#### Flux 1.1 Pro / Flux Schnell
**Best for:** Photorealistic at scale. Schnell = fast iteration, Pro = final-quality.

**Prompt pattern:**
```
[subject in scene], [details], [lighting], photorealistic, [aspect ratio]
```

**Tips:**
- Schnell uses 4 steps — burst 20 variants in 2 min
- Pro uses 28 steps — single hero image
- Both excel at people, products, real-world scenes (Midjourney still better at "concept art")

**Cost:** Schnell ~$0.0027/image; Pro ~$0.055/image (via Replicate or similar)
**Speed:** Schnell <5s; Pro ~30s

#### DALL-E 3 (via ChatGPT/API)
**Best for:** When you need the model to FOLLOW the prompt literally (specific objects, scenes, layouts).

**Prompt pattern:** Just describe what you want in natural language. DALL-E understands prose better than tag-style.

**Tips:**
- Best for creative compositions where prompt adherence matters more than aesthetic
- Built into ChatGPT — fastest no-API workflow
- Limited aspect ratios (1024×1024, 1024×1792, 1792×1024)

**Cost:** ~$0.04/image (HD)
**Speed:** ~15s

#### Ideogram
**Best for:** **The only image tool that reliably handles TEXT in images.** Logos, posters, ads with copy, social cards with quotes.

**Prompt pattern:**
```
[scene] with text "[exact text]" in [font style], [colors], [composition]
```

**Example for X quote card:**
```
quote card on dark navy background with text "60 dials. 14 connects. 3 booked." in bold sans-serif white, minimalist composition, brand color accent #FF6B35
```

**Tips:**
- For quote cards, hooks, ads with copy — Ideogram > everything
- Magic prompt mode often improves output

**Cost:** ~$10/mo plan
**Speed:** ~10s

#### Gemini Imagen 4 / GPT Image
**Best for:** Production graphics needing many variations (A/B test ad creatives, multi-variant hero images).

**Tips:**
- Built into Gemini chat / GPT chat → no API setup needed
- Good for batch variation requests
- Style tends to be "clean corporate" — works for B2B, less so for "edgy"

**Cost:** Gemini Pro $20/mo or per-image API; GPT Image included with Plus
**Speed:** ~10–20s

#### Canva
**Best for:** Final composition. Brand templates. When you have generated assets and need to lay them out cleanly.

**Workflow:**
1. Generate raw images in MJ/Flux/DALL-E/Ideogram
2. Import to Canva
3. Apply brand kit (logo, color palette, fonts)
4. Compose with text overlays, frames, backgrounds
5. Export as final social asset

**Cost:** ~$13/mo Pro
**Speed:** Manual, ~5–15 min per asset

#### Figma
**Best for:** Design files for Build Master handoff (site mockups, hero section designs, component specs).

**Workflow:**
- Image gen → Figma frame → Build Master pulls into Lovable/code
- Use Figma when the deliverable is a website/landing page, not a social post

### Brand consistency rules

**Color palette (Valdes Agency baseline):**
- Primary: `#000000` (black)
- Secondary: `#FFFFFF` (white)
- Accent: `#FF6B35` (orange — Vegas warm)
- Neutral: `#F5F5F5` (light gray for backgrounds)

(Per-client palettes go in `skills/voice/{client}.md` extension or a separate brand kit doc.)

**Typography:**
- Headlines: bold sans-serif (Inter, Helvetica Now, or platform default)
- Body: clean sans-serif (same family, regular weight)
- NO script fonts. NO Comic Sans. NO over-stylized.

**Photography style:**
- Photorealistic > illustrated
- Vegas-coded (palm trees, desert, modern architecture)
- Owner-operator vibe (real people, real work, not stock)

### Format quick-reference

| Surface | Aspect ratio | Pixel dims | Notes |
|---|---|---|---|
| Instagram feed | 1:1 | 1080×1080 | Square is safest |
| Instagram Reel/Story | 9:16 | 1080×1920 | Vertical full |
| LinkedIn feed | 1.91:1 or 1:1 | 1200×627 or 1080×1080 | Square getting more reach |
| LinkedIn carousel | 1:1 | 1080×1080 | 5–10 slides |
| LinkedIn cover | 4:1 | 1584×396 | Wide profile banner |
| X feed image | 16:9 | 1600×900 | Crops to 16:9 in feed |
| X header | 3:1 | 1500×500 | Profile banner |
| TikTok | 9:16 | 1080×1920 | Vertical only |
| YouTube Short | 9:16 | 1080×1920 | Same as TikTok |
| YouTube thumbnail | 16:9 | 1280×720 | For long-form |

### Compression + delivery

- Format: **WebP** for web, **JPG** for social (most platforms re-encode anyway)
- Target file size: <500 KB for social images, <200 KB for web heroes
- Use TinyPNG / Squoosh for batch compression before upload
- Always test on mobile before publishing

---

## §7 — VIDEO GENERATION RULES (FULL STACK)

### Tool selection decision tree

```
What kind of video do you need?
│
├─ Photorealistic short clip (3-10s)
│   ├─ Quality-critical → Veo 3
│   └─ Iteration speed → Pika 2
│
├─ Text-to-video with motion / transitions
│   └─ Runway Gen-4
│
├─ Long-form (30s+) AI-generated
│   └─ Kling 2.0
│
├─ Animate a STILL image into video
│   └─ Higgsfield (per CLAUDE.md tool stack)
│
├─ Programmatic / templated video at scale
│   └─ Hyperframes
│
├─ Talking head / AI avatar
│   ├─ Best lip sync → HeyGen
│   └─ Corporate / formal → Synthesia
│
├─ React-coded video (data-driven)
│   └─ Remotion (per CLAUDE.md tool stack)
│
├─ Motion graphics / UI animations
│   ├─ Quick → Jitter (per CLAUDE.md)
│   └─ Premium templates → Motionsites (per CLAUDE.md)
│
└─ Final cut + captions + trim
    └─ CapCut (mobile-first, free, fast)
```

### Per-tool deep dive

#### Veo 3 (Google)
**Best for:** Photorealistic short clips with strong motion. Hero shots for ads. The current state-of-the-art for AI text-to-video photorealism.

**Prompt pattern:**
```
[scene], [camera movement], [lighting], [duration]
```

**Example for pool service ad:**
```
Las Vegas backyard pool at sunset, slow pan from waterline to palm trees, golden hour lighting, photorealistic, 8 seconds
```

**Tips:**
- Best at humans, water, nature, vehicles
- 8-second cap per clip (current limit)
- Motion is more reliable than Pika

**Cost:** Via Google AI Studio or API
**Speed:** ~1–3 min per clip

#### Runway Gen-4
**Best for:** Text-to-video with strong motion control + transitions. Editorial-style clips.

**Tips:**
- Camera control (pan, zoom, dolly)
- Image-to-video conversion
- Multi-shot sequences

**Cost:** $15/mo Standard plan up to $95/mo Unlimited
**Speed:** ~2–5 min per generation

#### Kling 2.0
**Best for:** Long-form (30s+) AI-generated video. Solid English support now (was China-only). Good for narrative pieces.

**Cost:** Subscription tiers; freemium available
**Speed:** Slower than Veo / Runway (~5+ min)

#### Pika 2
**Best for:** Fast iteration. Fun outputs. Quick variants. Lower quality than Veo but faster turnaround.

**Tips:**
- Use for quick A/B test variants of an ad concept
- Pika Lipsync for talking-head style (alternative to HeyGen)

**Cost:** Free tier + paid plans
**Speed:** ~1–2 min

#### Higgsfield (CLAUDE.md tool)
**Best for:** Animating STILL images into short hero clips. Image-to-video. Smooth motion on static brand assets.

**Workflow:**
1. Generate hero image in Midjourney/Flux
2. Upload to Higgsfield
3. Apply motion preset (camera movement, parallax, zoom)
4. Export as 5–10s clip for IG Reels / X video / LinkedIn

**Use case:** Turn the Midjourney pool hero into a 5s motion clip for the ad creative.

#### Hyperframes
**Best for:** Programmatic video at scale. Templated outputs. When you need 50 video variants of the same template with different data.

**Use case:** Per-niche ad creative variants. Per-client testimonial templates.

#### HeyGen
**Best for:** Talking head / AI avatar with the BEST lip sync available. Brendan-style avatar reading scripts.

**Workflow:**
1. Train an avatar of Brendan (one-time setup, requires video samples)
2. Write script in CLAUDE.md voice
3. Generate avatar video with lip sync
4. Export, add captions in CapCut, post

**Use case:** When Brendan doesn't have time to film himself but the post needs a face. Use sparingly (audience can detect AI avatar).

**Cost:** $24–89/mo
**Speed:** ~5–10 min per video

#### Synthesia
**Best for:** Corporate / formal AI avatars. Alternative to HeyGen, more "professional" presets.

**Use case:** Client deliverable for HVAC/pest with formal brand voice.

#### Remotion (CLAUDE.md tool)
**Best for:** React-coded video. Data-driven (e.g., automatically generate a client report video from CPL data). Programmatic at maximum flexibility.

**Use case:** Weekly automated client report video. SonoView CPL trend visualizations.

**Cost:** Free for personal, paid for commercial
**Setup:** Requires React dev (Brendan can do this)

#### Jitter (CLAUDE.md tool)
**Best for:** Motion graphics. UI animations. Quick title cards. Animated logos.

**Use case:** Animated logo intros for client testimonial videos. UI animation for "behind the build" content.

#### Motionsites (CLAUDE.md tool)
**Best for:** Premium animated website templates. When the deliverable is a high-end animated landing page.

**Use case:** Cross-Master with Build — when client wants a hero video on their site that's animated.

#### CapCut
**Best for:** Final cut + captions burn-in + trim. The mobile-first editor. Free.

**Always-use workflow:**
1. Generated video clip from any of the above
2. Open in CapCut
3. Add captions (auto-generate, then proofread)
4. Trim to target duration
5. Add music (CapCut has licensed library)
6. Export 1080×1920 for vertical, 1920×1080 for horizontal
7. Upload to scheduler

**Cost:** Free
**Speed:** ~5–15 min per edit

### Format rules

| Surface | Aspect | Duration sweet spot | Captions required? |
|---|---|---|---|
| Reels (Instagram) | 9:16 vertical | 7–30s | YES — always |
| TikTok | 9:16 vertical | 7–60s | YES — always |
| YouTube Short | 9:16 vertical | 15–60s | YES |
| LinkedIn native video | 1:1 or 16:9 | 30–90s | YES |
| X video | 1:1 or 16:9 | 30–60s | YES |
| YouTube long-form | 16:9 horizontal | 5–15 min | Auto-captions OK |

### Duration rules (the 1.5/5/30 framework)

```
0:00–0:01.5 — HOOK (the first 1.5 seconds)
   • Pattern interrupt or dramatic visual
   • If the viewer doesn't pause, you've lost them
   • Caption appears IMMEDIATELY (no fade-in)
   • Music starts on a hit

0:01.5–0:05 — SETUP (3.5 seconds of context)
   • What is this about?
   • Why should I keep watching?
   • Visual change every 1.5s

0:05–0:25 — STORY (the bulk of value)
   • Numbers, specifics, examples
   • Cuts every 2–3 seconds
   • Captions on every word

0:25–0:30 — PAYOFF + CTA
   • Punchline / reveal / lesson
   • One CTA: comment, follow, DM
```

### Captions burn-in (NON-NEGOTIABLE)

- 80% of social video is watched on mute
- Use CapCut auto-caption (proofread for typos)
- Bold, high-contrast (white with black stroke OR black with white background bar)
- 1–3 words per "card" / sync to speech
- Position: lower-third, never covering the speaker's face

### Hook bible for video

Already covered in §4 — short-form video patterns. Pull from there.

---

## §8 — APPROVAL WORKFLOW (THE AUTONOMOUS PART)

### The 4-stage system in detail

```
DRAFT → APPROVE → SCHEDULE → POST
```

### Stage 1 — DRAFT (Claude generates daily batch)

**Trigger:** Daily at 6am Pacific (Brendan's TZ).

**Mechanism:**
- Cron via CronCreate (Claude Code skill) OR serverless function (e.g., Vercel cron, Railway cron)
- Job calls Claude API with prompt:
```
Read skills/voice/brendan.md, skills/content.md §5 (pillars), §4 (hooks).
Generate today's batch:
- 1 LinkedIn long post (400 words)
- 2 X tweets
- 1 short-form video script (Reel/TikTok)
- 1 IG carousel concept (3-5 slides)

For each:
- Specify pillar, hook pattern, voice score (self-rated 0-10)
- Add visual asset reference (path or generation prompt)
- Format per skills/content.md §2 template

Push batch to Notion approval queue via Notion API.
```

**Output:** New row in Notion approval queue with all posts attached. Brendan gets one Discord notification: "5 posts ready for review."

### Stage 2 — APPROVE (Brendan reviews)

**Interface:** Notion approval queue — single page with 5 cards, mobile-friendly.

**Per-post UI:**
```
┌──────────────────────────────────────┐
│  Post #1 — LinkedIn                  │
│  Pillar: Agency lessons              │
│  Hook: Vulnerable confession         │
│  Voice score: 8.4                    │
│                                       │
│  [Body text — 400 words]             │
│                                       │
│  [Attached: image.png]               │
│                                       │
│  Suggested time: Tue 7:30am          │
│                                       │
│  [APPROVE] [EDIT] [REJECT] [DEFER]   │
└──────────────────────────────────────┘
```

**Time budget:** 5–10 posts × ~1 min each = <10 min/day total.

**Actions:**

- **APPROVE** — Notion property changes to "APPROVED" → Make.com webhook → Buffer adds to schedule. Post leaves the queue.
- **EDIT** — Brendan tweaks inline (Notion editor) → marks APPROVED. Same flow as APPROVE.
- **REJECT** — Brendan adds 1-line reason in Notion. Make.com webhook → posts the reason to a Claude feedback log. Tomorrow's batch reads this log to learn.
- **DEFER** — moves to "Later" queue (Notion view filter). Re-enters next batch automatically.

### Stage 3 — SCHEDULE (Buffer integration)

**Tool:** Buffer (recommended initial scheduler).

**Make.com scenario:**
- Trigger: Notion property "Status" changes to "APPROVED"
- Action 1: Buffer "Add Post" with body, images, target platform
- Action 2: Buffer auto-fills next available slot per §9 schedule
- Action 3: Notion property "Buffer status" set to "SCHEDULED"
- Action 4: Brendan gets Discord ping: "Scheduled for Tue 7:30am LinkedIn"

**Setup steps (one-time):**
1. Create Buffer account, connect LinkedIn + X + IG + TikTok + YouTube
2. Set up Notion approval queue database with the schema above
3. Create Make.com scenario with the trigger + actions
4. Test with 1 manual approval → verify it lands in Buffer

### Stage 4 — POST (Buffer fires)

Buffer posts at the §9 optimal time. Performance data flows back via:
- Buffer's native analytics
- Each platform's native analytics (LinkedIn / X / IG / TikTok / YouTube)
- GHL custom fields (per-post performance log) via Buffer webhook → Make.com → GHL
- Weekly aggregate to brain-dump.md

### Recommended initial stack (cheapest viable)

| Tool | Purpose | Cost |
|---|---|---|
| Notion | Approval queue | Free for personal |
| Buffer | Scheduler | $15/mo (Essentials plan) |
| Make.com | Webhook glue | Free tier (1k ops/mo enough) |
| Discord | Notifications + kill switch | Free |
| GHL | Performance log + custom fields | Already in stack |
| **Total NEW spend** | | **~$15/mo** |

### Alternative tools (if needed)

| Tool | When to consider |
|---|---|
| **Hypefury** | If X is the primary surface (auto-retweet, evergreen recycle) |
| **Typefully** | If X+LinkedIn pair (clean UI, AI assist built-in) |
| **GHL native social** | If consolidating tools (weaker than Buffer though) |
| **Manual posting** | First 30 days of pipeline testing |
| **Zapier** | Alternative to Make.com (more apps, more $$) |

### Failsafes (the safety net)

| Failsafe | Trigger | Action |
|---|---|---|
| **Voice flag** | Generated draft scores <7 on voice match | Drop into approval queue with 🚩 — requires Brendan rewrite or reject |
| **Kill switch** | Brendan types `/pause-content` in Discord | Make.com pauses → no auto-schedules until `/resume-content` |
| **Volume cap** | More than 7 approved posts in 24h | Buffer queues remainder for next day (prevents burst-posting) |
| **Bad performance auto-flag** | Last 5 posts averaged <30% of baseline engagement | §10 reviewer auto-runs Monday morning + alerts Brendan |
| **Drafted post conflict** | Same hook used in last 14 days | Claude rewrites with different angle before adding to batch |

### Post-mortem (weekly Sunday)

Every Sunday at noon:
- Pull last 7 days of approved-vs-rejected ratio (target: ≥70% approved)
- Pull top-performing post by engagement
- Pull voice-flag count (target: <2/week)
- Log to brain-dump.md
- If 30%+ rejected → trigger voice file refresh check (§3 maintenance)

---

## §9 — POSTING SCHEDULE

### Per-platform optimal times (all in Pacific Time — Brendan's TZ)

| Platform | Best slots | Cadence | Rationale |
|---|---|---|---|
| **LinkedIn** | Tue/Thu 7:30am + 12:00pm | 2/wk × 2 slots = 4 posts/wk | B2B audience: morning before work + lunch break. Tue/Thu are highest-engagement days. |
| **X / Twitter** | M-F 6am, 11am, 4pm, 8pm | 4/day × 5 days = 20/wk | Ramp cadence. X algorithm rewards consistency + volume. |
| **Instagram** | Tue/Thu/Sat 11am + 7pm | 3/wk × 2 = 6 posts/wk | Visual peak times: lunch + evening scroll. |
| **TikTok** | Daily 6am, 12pm, 8pm | 1/day baseline (push to 3/day during testing) | TikTok algo loves daily consistency. |
| **YouTube Shorts** | Tue/Thu/Sat 5pm | 3/wk | Longer dwell window post-work. |
| **Newsletter** | Sundays 9am | 1/wk | Week-ahead positioning. People plan their week Sunday morning. |
| **YouTube long-form** | Defer (1/mo if any) | Defer | Long-form requires production time we don't have yet. |

### Per-pillar cadence (within the platform mix)

For Brendan, each pillar gets a weekly minimum:

| Pillar | LinkedIn | X | IG | TikTok | Total/wk |
|---|---|---|---|---|---|
| 1. Agency lessons | 2 | 8 | 1 | 1 | 12 |
| 2. Pool service insights | 1 | 4 | 0 | 1 | 6 |
| 3. Vegas market | 1 | 4 | 1 | 1 | 7 |
| 4. Behind the build | 1 | 8 | 1 | 1 | 11 |
| 5. Contrarian takes | 0 | 4 | 0 | 1 | 5 |
| **Total** | **5** | **28** | **3** | **5** | **41/wk** |

### Agency vs client cadence differences

| Surface | Agency cadence | Client cadence | Notes |
|---|---|---|---|
| LinkedIn | 5/wk | 2/wk | Clients usually less B2B authority focused |
| X | 28/wk (4/day) | 0 | Most clients aren't on X — skip |
| Instagram | 3/wk | 3–4/wk | Clients in visual niches need this |
| TikTok | 5/wk | 3–5/wk | Only for visual-niche clients |
| YouTube Short | 3/wk | 2/wk | Optional |
| Newsletter | 1/wk | 0 | Defer for clients until established voice |

### Schedule rules

1. **Don't burst-post.** Max 1 post per platform per 4 hours. Buffer enforces.
2. **Don't skip a day on X.** X algo penalizes silence > 24h.
3. **Don't post LinkedIn on Mondays.** Engagement is lowest (per platform data).
4. **Saturday low-volume for B2B (LinkedIn/X), high for B2C (IG/TikTok).**
5. **Sunday newsletter only — no other surface posts (preserves attention).**

---

## §10 — PERFORMANCE REVIEWER (5-SYMPTOM DECISION TREES)

Same 5-symptom × per-platform pattern as `skills/ads.md` §7.

### The universal weekly review (10 minutes, every Monday)

```
1. Pull last 7 days of metrics per surface
2. Per surface, identify: engagement rate, reach, follower growth, DM/lead count, voice-flag count
3. If any symptom triggers → run the relevant tree below
4. Apply ONE fix. Wait 14 days. Re-evaluate.
5. Log decisions to brain-dump.md
```

**Total time: 10 minutes for all surfaces. Don't let it sprawl.**

### SYMPTOM 1 — Engagement rate too low

**Threshold:** Below platform baseline (LinkedIn <2%, X <1%, IG <3%, TikTok <5%)

```
Has it been 14+ days since last pillar/hook/cadence change?
├─ NO → wait. Don't optimize on noise.
└─ YES → continue
    ↓
    Which platform?
    │
    ├─ LinkedIn ↓
    │   Step 1: Check hook patterns (§4)
    │     • Are you using only 1–2 patterns? → diversify to 4+
    │   Step 2: Check pillar mix
    │     • Lessons-heavy? Add contrarian or story-open variety
    │   Step 3: Check post length
    │     • Posts >800 words? Trim to 400. LinkedIn rewards readable.
    │   Step 4: Check first 2 lines
    │     • Hook visible "above the fold"? If not, rewrite hook
    │   Step 5: Check visual
    │     • Adding image/carousel? Native video > images > text-only
    │
    ├─ X ↓
    │   Step 1: Check single-tweet vs thread mix
    │     • Threads weekly only — avoid daily threads (low completion)
    │   Step 2: Check time slots
    │     • Posting at 6am/11am/4pm/8pm? Test ±1hr offsets
    │   Step 3: Check hook punchiness
    │     • Tweet length: <140 chars often beats >200 chars
    │   Step 4: Check reply engagement
    │     • Replying to 3 large accounts/day? If no → start
    │   Step 5: Check pinning strategy
    │     • Pin best-performing tweet for the week
    │
    ├─ Instagram ↓
    │   Step 1: Check format priority
    │     • Reels > Carousel > Image > Story (for reach)
    │   Step 2: Check audio (Reels)
    │     • Trending audio? Mismatch with content kills engagement
    │   Step 3: Check first frame
    │     • Hook visual in first 0.5s?
    │   Step 4: Check caption first line
    │     • IG truncates at ~125 chars — front-load the hook
    │   Step 5: Check hashtags
    │     • 5–10 niche hashtags > 30 generic
    │
    └─ TikTok ↓
        Step 1: Check 1.5s hook retention
          • <50% drop-off? → swap creative angle
        Step 2: Check posting frequency
          • <1/day for last 7 days? Bump to daily
        Step 3: Check trending sound usage
          • Use trending sounds aligned with content
        Step 4: Check vertical aspect + captions
          • 9:16 + burned-in captions? If no → fix
        Step 5: Check duration
          • <7s or >60s? Sweet spot 15-30s
   ↓
   APPLY ONE FIX. Wait 14 days. Re-evaluate.
```

### SYMPTOM 2 — Reach / impressions too low

**Threshold:** Below 50% of last 30-day baseline reach.

```
   Step 1: Posting cadence holding?
     • Skipped >2 days on platform? Algo de-prioritizes silent accounts
     • Resume cadence first, wait 7 days, re-check
   Step 2: Hashtag / topic shift?
     • Switched topics? Algo needs ~14 days to re-learn audience
   Step 3: Account-level health?
     • LinkedIn: any post flagged for review?
     • X: any rate limiting / shadow ban indicators?
     • IG/TikTok: account standing OK?
   Step 4: Time-slot drift?
     • Buffer scheduling at off-hours? Reset to §9 optimal times
   Step 5: External factor?
     • Platform-wide algo change? Check industry chatter (don't optimize blindly)
```

### SYMPTOM 3 — Follower growth slow

**Threshold:** <2% follower growth per 30 days on growth surfaces (LinkedIn, X, TikTok).

```
   Step 1: Are posts going viral occasionally?
     • If yes → growth comes from hits, not consistency. Double down on hits' patterns.
     • If no → §10 Symptom 1 first (engagement is upstream of follower growth)
   Step 2: Are you commenting on others' posts?
     • LinkedIn: 10 thoughtful comments/day on bigger accounts
     • X: reply to 3 large accounts/day
     • If no → start. Comments drive profile visits → follows.
   Step 3: Profile bio + pinned post optimized?
     • Bio answers "who is this for + what's the offer"?
     • Pinned post is the #1 engagement piece this month?
   Step 4: Cross-platform funnel?
     • Mentioning Discord/Newsletter/LinkedIn from other surfaces?
     • Add CTA: "follow on [platform] for more"
   Step 5: Are you replying to your own comments?
     • LinkedIn rewards back-and-forth in comments → reach boost
     • Reply to first 5 comments on every post
```

### SYMPTOM 4 — DMs / leads too low (downstream)

**Threshold:** <3 inbound DMs/week related to agency or content.

```
   Step 1: Are CTAs in posts clear?
     • "DM me if X" specific or vague?
     • If vague → tighten: "DM me 'pool' if you're in Vegas pool service"
   Step 2: Profile clarity?
     • Bio says what you do + who you help?
     • Easy DM open (no barriers)?
   Step 3: Comment CTAs?
     • Replying to commenters with "DM me about this"?
   Step 4: Lead magnet?
     • Pinned post offers something (audit, guide, framework)?
   Step 5: Cross-Master route
     • If content-side is doing job (engagement, reach OK) but DMs low →
       This is a positioning issue, not a content issue.
       Route to Marketing Master (skills/marketing.md §10 positioning matrix)
```

### SYMPTOM 5 — Voice drift detected

**Threshold:** ≥3 posts/week flagged as off-voice OR Brendan rejects ≥30% of drafts.

```
   Step 1: When was voice file last refreshed?
     • >90 days → refresh now (§3 maintenance)
     • <90 days → continue
   Step 2: New context not in voice file?
     • New niche / new topic / new tone needed?
     • Add a calibration example to skills/voice/brendan.md
   Step 3: Claude pulling stale samples?
     • Check what samples Claude has access to
     • Add 5 recent on-voice posts as fresh samples
   Step 4: Anti-pattern slipping in?
     • Re-read CLAUDE.md voice rules
     • Add specific anti-pattern examples to voice file
   Step 5: Pillar drift?
     • Are pillars (§5) still aligned with what Brendan wants to talk about?
     • If not → run pillar selection workshop (refresh §5 for self)
```

### The "don't touch it" rule for content

Before any optimization, ask:
1. Has the post been live more than 7 days?
2. Has the cadence held for 14+ days?
3. Have you tested the same hook 3+ times?
4. Are you pulling from a 14-day average (not a single bad day)?

**If any answer is NO → don't optimize. Wait. Note the question that blocked you.**

---

## §11 — PER-SURFACE SUB-PLAYBOOKS

### Brendan personal — LINKEDIN PRIMARY PLAYBOOK

**Cadence:** 5 posts/week (Tue, Thu × 2 slots + Sat 1 slot)

**Pillar weights (per week):**
- 2× Agency lessons
- 1× Pool service insights
- 1× Vegas market
- 1× Behind the build

**Post structure (LinkedIn):**

```
HOOK (1-2 lines, must work above the fold)
↓
SETUP (2-3 sentences — what's this about?)
↓
STORY / FRAMEWORK (the meat — bullet list, numbered list, or narrative)
↓
LESSON / TAKEAWAY (1-2 sentences — what does it mean?)
↓
CTA (1 line — comment with X / DM me Y / share if Z)
```

**Length:** 300–600 words. >800 = trim. <200 = expand.

**Comment strategy:**
- 10 thoughtful comments/day on bigger Vegas/marketing/agency accounts
- Goal: 2-3 sentence value-add comment, not "great post!"
- Reply to first 5 comments on every Brendan post

**Pinned post strategy:**
- Pin the highest-engagement post of the month
- Update the 1st of each month
- Should be a clear authority piece (case study, framework, or contrarian take)

**LinkedIn-specific anti-patterns:**
- Don't open with "I" (per CLAUDE.md voice rules)
- No "Agree?" closers
- No "Thoughts?" closers
- No "Tag someone who needs this"
- No image-only posts (LinkedIn favors text)

### Brendan personal — X / TWITTER PLAYBOOK

**Cadence:** 4 posts/day, M-F (28 posts/week)

**Pillar weights (per week):**
- 8× Agency lessons
- 4× Pool service insights
- 4× Vegas market
- 8× Behind the build
- 4× Contrarian takes

**Post structure (X):**
- Default: single tweet (<280 chars)
- Threads: 1 thread/week (5–10 tweets)
- Replies: 3 to large accounts/day

**Thread structure:**
```
Tweet 1: HOOK (must stand alone if no one reads thread)
Tweet 2: SETUP / why this matters
Tweets 3-7: NUMBERED POINTS or NARRATIVE BEATS
Tweet 8 (last): RECAP + CTA (follow / DM / link to long-form)
```

**Reply strategy:**
- 3 thoughtful replies/day to accounts with 10k+ followers
- Add value or counterpoint, never agreement-chasing
- Don't @ unrelated accounts

**X-specific tips:**
- Use line breaks generously (X is visual)
- Numbers in tweets > vague descriptions
- ALL CAPS one word for emphasis (rare)
- No threads under 5 tweets (waste of format)

### Brendan personal — NEWSLETTER (TBD)

Defer until Brendan has a clear newsletter angle. When ready:
- Cadence: 1/wk Sundays 9am
- Format: long-form essay 800–1500 words
- Topic: weekly synthesis of agency lessons + market observations
- Distribution: Beehiiv / Substack / ConvertKit

### SonoView — Instagram organic (mom-driven, light agency support)

**Status:** Light support — Brendan's mom drives organic IG. Agency support = monthly review + occasional content help.

**Agency-side tasks:**
- Monthly: review IG insights, suggest 3 content angles aligned with Google Ads conversion themes
- Quarterly: refresh visual brand (template carousels in Canva)
- Ongoing: tag SonoView in any LinkedIn case study Brendan writes about CPL math

**Don't:** Take over the account. Mom owns the voice — agency provides systems support, not content production.

### Trade N Travel — pre-revenue, defer

Per `skills/marketing.md` §3 niche 10: pre-revenue, no ads yet, no content yet. When ready:
- Build positioning first (cross-Master with Marketing)
- Validate offer with first 10 organic users
- THEN start content (visual fit for travel content)

### Future pool clients — Reels delivery (light, included in $1.5k retainer)

When pool clients onboard content as part of delivery:

**Cadence:** 3 Reels/week + GBP photos refreshed weekly

**Pillar weights:**
- 2× Pool transformation (before/after)
- 1× Educational (chemistry tip, equipment tip, seasonal advice)

**Voice:** Use client's voice file (voice extraction at onboarding)

**Production:**
- Client provides raw footage (phone video of work)
- Agency edits in CapCut → captions → music
- Approve via same Notion queue (separate sub-page per client)
- Buffer schedules to client's IG + TikTok

**Pricing:** Included in standard $1.5k retainer (light scope). Heavier content production = $500-1000/mo upcharge.

### Future HVAC clients — LinkedIn ads case study videos (when Tier 3 budget)

When HVAC clients hit Tier 3 ad budget per `skills/ads.md` §9:
- Generate AI avatar testimonial via HeyGen (with client permission)
- Animated CPL trend graphic via Remotion (data-driven from client account)
- Run as LinkedIn ad targeting Vegas HVAC owner ICP
- Cross-Master with Ads Master + Marketing Master

---

## §12 — STATUS LEGEND + CROSS-REFERENCES + MAINTENANCE

**Status values:**
- 🔴 LIVE — pipeline running, posts going out daily
- 🟡 BUILDING — system documented, automation being set up
- 🟢 READY — playbook ready, awaiting first post
- ⚪ DEFERRED — waiting on prerequisite (e.g., Trade N Travel content waits on positioning)

**When to update this file:**
- New surface adopted → add row to §1 + section to §11
- Hook pattern proven → add to §4 bank with examples
- New tool added to stack → add to §6 (image) or §7 (video) deep dive
- Voice drift detected → run §3 maintenance + log to brain-dump.md
- New pillar added → §5 + per-surface weights
- Performance reviewer found a new symptom → add tree to §10
- Per-client voice file created → add path to §3 directory tree

**Cross-references:**
- `skills/sales.md` → execution layer (Tyler dialing, GHL ops)
- `skills/marketing.md` → niche profiles, positioning, voice rules source
- `skills/ads.md` → performance reviewer pattern (§7), creative format specs, image/video stack overlap
- `skills/agent-architecture.md` → Content Master block (§3 Master 6), Contracts C7/C8 for ad creative handoffs
- `CLAUDE.md` → ROCCO voice rules (verbatim source for §3), tool stack (Higgsfield, Remotion, Jitter, Motionsites)
- `.claude/skills/voice-extractor/` → reference for voice extraction SOP
- `.claude/skills/social-content/` → reference for social content patterns
- `.claude/skills/social-card-gen/` → reference for platform variant generation
- `.claude/skills/content-idea-generator/` → reference for ideation
- `.claude/skills/tweet-draft-reviewer/` → reference for X post quality scoring
- `.claude/skills/de-ai-ify/` → reference for human-voice preservation
- `.claude/skills/linkedin-authority-builder/` → reference for LinkedIn system
- `.claude/skills/video/` → reference for video production workflows
- `.claude/skills/image/` → reference for image generation workflows

**Memory hooks:**
- Save weekly post-mortem (approved/rejected ratio + top performer + voice-flag count) to MCP Knowledge Graph
- Log daily content batches to brain-dump.md (which posts shipped, which got engagement)

**To-do (for next session):**
- Create `skills/voice/brendan.md` from §3 template
- Set up Notion approval queue (one-time, ~30 min)
- Set up Buffer account + connect platforms (one-time, ~20 min)
- Set up Make.com glue (one-time, ~45 min)
- Set up daily Claude cron job (one-time, ~30 min)
- First batch run + review → ship by end of week

---

**End of Content OS.**
**Three-rule reminder:** Voice over volume. Hook is everything. Don't change pillars in <14 days.
