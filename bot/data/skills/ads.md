# Ads Operating System — Google + Meta + TikTok
**Scope:** Every paid acquisition channel for clients + agency. Account structure, learning phase rules, CPL framework, performance diagnostics, per-niche strategy, budget tiers.
**Reads:** Brendan (strategy + execution) + future Account Manager
**Goal:** When CPL spikes at 11pm, this doc tells you what to do in 2 minutes — without panic, without guessing, without breaking learning phase.

---

## §0 — HOW TO USE THIS FILE

This is the playbook for all 3 Ads Masters (Google, Meta, TikTok). One file, three platforms, one performance reviewer.

**Reading order:**
- New campaign kickoff → §1 (pick platform) → §4/5/6 (build it) → §9 (set budget)
- CPL going wrong → §7 (performance reviewer first) → §3 (learning phase check) → §2 (CPL band)
- New niche question → §8 (per-niche strategy) → cross to `skills/marketing.md` §3 for positioning
- "Should we run ads on Valdes Agency?" → §11
- "How do we structure tracking?" → §4 (Google) / §5 (Meta) / §6 (TikTok) sub-sections

**Three rules:**
1. Don't optimize an account in learning phase (§3). Touching it resets the timer.
2. Change ONE variable at a time. Wait 14 days. Then change the next.
3. Never block geo terms (lesson from SonoView — see §4 + §8).

**Cross-Master ownership:**
- Google Ads Master uses §1, §2, §3, §4, §7 (Google branches), §8, §9, §10
- Meta Ads Master uses §1, §2, §3, §5, §7 (Meta branches), §8, §9, §10
- TikTok Ads Master uses §1, §2, §3, §6, §7 (TikTok branches), §8, §9, §10
- All Masters share §11 (agency self-marketing)

---

## §1 — THE 3 ADS SURFACES AT A GLANCE

| Platform | Best for | Worst for | Min budget | Min learning | Default for our 8 niches |
|---|---|---|---|---|---|
| **Google Search** | High-intent local services, repair urgency | Awareness, brand building | $30/day | 30 conv / 30d | **Default platform #1** |
| **Google LSA** | Trust-driven services (HVAC, garage, plumbing) | Niche/specialty offers | Pay-per-lead | n/a | Add-on once Search proven |
| **Google PMax** | Established accounts with good signal | New accounts, narrow geos | $50/day | 50 conv / 30d | Defer until 60d post-launch |
| **Meta Lead Ads** | Local awareness + lead capture | High-intent emergency repairs | $40/day | 50 conv / 7d | Platform #2 after Google profitable |
| **Meta Conversions** | Retargeting + offer campaigns | Cold acquisition for low-AOV niches | $50/day | 50 conv / 7d | Use after Pixel has 100+ events |
| **TikTok Spark Ads** | Viral demonstration content (rare for our niches) | Local service businesses (mostly) | $50/day | 50 conv / 7d | **Defer for all 8 niches by default** |

**Decision tree — which platform first:**

```
Is the niche "high-intent search" (people Google "[service] near me")?
├─ YES → Google Search FIRST
│   ├─ HVAC / Garage Door / Plumbing-style → add Google LSA in week 2
│   └─ Pool / Pest / Landscaping → Google Search alone for first 30d
└─ NO  → re-evaluate niche fit (most of our 8 niches ARE high-intent search)

Once Google is profitable (CPL in GOOD band, 30+ conversions):
├─ Want lead volume → add Meta Lead Ads (week 5+)
├─ Want LTV / repeat → add Meta Retargeting (after Pixel signal)
└─ Niche is visual + has TikTok-native audience → consider TikTok
```

**For our 8 local-service niches, the default mix is: Google Search + GBP optimization first. Meta only after Google is profitable. TikTok almost never.**

---

## §2 — THE UNIVERSAL CPL FRAMEWORK

Every campaign has a CPL band. The band determines what you do next.

### The 3 bands (from CLAUDE.md SonoView baseline)

```
GOOD 🟢       $20–35    Push spend. Tighten optimization. Scale carefully.
                         If you're here, you've earned the right to add budget.

ACCEPTABLE 🟡  $35–55   Hold spend. Diagnose. Tweak ONE variable.
                         You're not winning, you're not losing. Find the leak.

FIX 🔴        $55+      DON'T add spend. Run §7 diagnostic before any change.
                         Something is broken. Find it before you spend more.
```

These are the SonoView bands and they're a useful default — but each niche has its own thresholds. Use the table below.

### Per-niche CPL targets

These are starting estimates. Replace each row with real data after the first 30d of a live campaign.

| Niche | GOOD 🟢 | OK 🟡 | FIX 🔴 | Reasoning |
|---|---|---|---|---|
| Pool Service (Vegas) | $25–45 | $45–70 | $70+ | Year-round market, mid-intent search, pool-specific landing pages convert ~5% |
| Pest Control | $20–40 | $40–60 | $60+ | High urgency (scorpions), low CPC opportunity, fast close |
| Garage Door | $15–35 | $35–55 | $55+ | Highest intent, narrowest funnel, repair = same-day close |
| HVAC (repair) | $30–60 | $60–90 | $90+ | Crowded auction in Vegas, expensive CPCs ($50+) |
| HVAC (install) | $80–150 | $150–250 | $250+ | High ticket = higher CPL acceptable, install = $5k+ AOV |
| Landscaping (maintenance) | $25–50 | $50–80 | $80+ | Mixed maintenance vs project intent |
| Landscaping (design-build) | $60–120 | $120–200 | $200+ | Higher AOV ($5k–25k), longer sales cycle |
| Carpet Cleaning | $15–30 | $30–50 | $50+ | Volume game, low ticket ($150–400) |
| House Cleaning | $20–40 | $40–60 | $60+ | Recurring potential softens CPL math |
| Handyman | $10–25 | $25–40 | $40+ | Low ticket, hard to scale, retainer math doesn't work above $40 CPL |
| **SonoView (LIVE)** | **$20–35** | **$35–55** | **$55+** | **Verbatim CLAUDE.md bands. Don't change without Brendan approval.** |
| Trade N Travel | n/a | n/a | n/a | Pre-revenue, no ads yet (per `skills/marketing.md` §3) |
| Valdes Agency | n/a | n/a | n/a | No paid acquisition until cold has 5+ paying clients (per §11) |

### The CPL → CAC → LTV → ROAS math

Every CPL target has to make business sense. Use this to validate.

```
CPL                 = cost to get ONE lead (form submit, call, etc.)
                       ↓
Lead → Booked rate  = % of leads that close (varies by niche; pool service ~25-35%)
                       ↓
Cost per Booked     = CPL ÷ (Lead → Booked rate)
                       ↓
First-purchase AOV  = $ on first transaction
                       ↓
Margin              = % of AOV after costs
                       ↓
ROAS (first-purch)  = AOV ÷ Cost per Booked
                       ↓
LTV (12-month)      = AOV + recurring revenue × retention rate
                       ↓
LTV/CAC ratio       = LTV ÷ Cost per Booked  (target: 3:1 or better)
```

**Example — pool service @ $40 CPL:**
- $40 CPL ÷ 30% close rate = $133 cost per booked
- $200/mo recurring × 12 = $2,400 LTV
- LTV/CAC = $2,400 ÷ $133 = **18:1** ← strong, push spend

**Example — handyman @ $40 CPL:**
- $40 CPL ÷ 50% close rate = $80 cost per booked
- $300 one-time AOV × 1.5 repeat = $450 LTV
- LTV/CAC = $450 ÷ $80 = **5.6:1** ← acceptable but tight, watch closely

### How to set CPL targets when no data exists

When launching a new niche with zero data:
1. Start with the per-niche table above as the GOOD band
2. Multiply by 1.5 for OK band cap
3. Multiply by 2.5 for FIX band threshold
4. Run for 30 days at lowest tier budget (§9)
5. Replace the table row with real data after 30d

---

## §3 — THE LEARNING PHASE BIBLE

**Why learning phase exists:** Every paid platform's algorithm needs signal (conversions) to figure out who to show your ads to. Until it has enough signal, performance is volatile and unreliable. Touching the campaign during this phase resets the algorithm — wasting your money.

### Conversion thresholds (per platform)

| Platform | Threshold to exit learning | Window |
|---|---|---|
| **Google Search** | 30 conversions per ad group | 30 days |
| **Google PMax** | 50 conversions per asset group | 30 days |
| **Google LSA** | n/a (no learning phase) | n/a |
| **Meta** | 50 conversions per ad set | 7 days |
| **TikTok** | 50 conversions per ad group | 7 days |

### What KILLS learning phase (don't do these things)

| Action | Effect |
|---|---|
| Budget change > 20% in 24h | Resets learning |
| Audience swap (Meta) | Resets ad set |
| Creative swap inside ad | Reset (use NEW ads instead) |
| Geo expansion/contraction | Resets |
| Bid strategy change | Resets |
| Pause + restart > 6 hours | Resets |
| Conversion event change | Resets EVERYTHING |

### What's SAFE during learning phase

- Adding NEW ads (don't pause existing ones)
- Adding NEW negative keywords (Google)
- Adding NEW interest stacks as separate ad sets (Meta)
- Reading reports
- Talking about it in Discord

### The "don't touch it" rule

If you're tempted to optimize a campaign and the answer to ANY of these is YES, walk away:

1. Has it been live less than 7 days?
2. Are conversions still under the platform's threshold?
3. Has the budget been adjusted in the last 14 days?
4. Has the bid strategy been changed in the last 14 days?

If any YES → wait. Set a calendar reminder for when the rule expires.

### Weekly diagnostic — am I in learning?

```
Open Ads Manager → look at "Delivery" column or "Learning Status"
├─ "Learning" → leave it alone. Do nothing this week. Re-check next Monday.
├─ "Learning Limited" → conversions too sparse. Either:
│    • Increase budget by exactly 20% (the safe amount), OR
│    • Broaden audience/keywords by ONE small step
│    Then wait 14 days.
└─ "Active / Out of Learning" → §7 performance reviewer applies. Optimize away.
```

### The exception: emergency stops

If something is genuinely broken — wrong landing page, wrong phone number, completely wrong audience — pause immediately. Learning phase reset is acceptable when the cost of not pausing is wasted spend on broken delivery.

---

## §4 — GOOGLE ADS MASTER PLAYBOOK

This is the deepest section because Google is the default platform for our 8 local-service niches. SonoView is also Google-only.

### Account hierarchy

```
Account (1 per client)
  └─ Campaign (1 per service / location / objective)
       └─ Ad Group (1 per tight keyword theme)
            ├─ Keywords (5-15 per ad group max)
            ├─ Ads (RSA × 2-3 per ad group minimum)
            └─ Negative keywords (campaign + account level)
```

**Rule:** narrow ad groups beat broad ad groups. If your keyword list spans 3 different intents, that's 3 ad groups, not 1.

### Campaign types decision tree

```
Are you running for a local service business?
├─ YES → Google Search FIRST
│        Then add Google LSA (Local Service Ads) in week 2 if niche supports it
│        (HVAC, garage door, plumbing, electrician, locksmith, pest = LSA-eligible)
│
├─ Is the offer visual + brand-driven?
│   └─ Display (rare for us — defer)
│
├─ Has the account been live 60+ days with strong signal?
│   └─ Add PMax (uses existing conversion signal)
│
└─ Does the client have a YouTube channel + video?
    └─ YouTube TrueView (rare for us — defer)
```

**Default for all 8 niches: Search + LSA (where eligible) + GBP optimization. Skip PMax/Display/YouTube until proven Search baseline.**

### Pool-service-specific campaign skeleton (the default kickoff)

```
Account: [Client Name] — Google Ads
│
├─ Campaign 1: Pool Service — Vegas Search (Max Conv → tCPA after 30 conv)
│   │ Geo: Las Vegas + Henderson + Summerlin + Enterprise (15-mile radius default)
│   │ Schedule: 6am–9pm Mon-Sat (off Sundays unless owner says otherwise)
│   │ Daily budget: $30-50 (Tier 1 — see §9)
│   │
│   ├─ Ad Group 1: Pool Cleaning (high-intent)
│   │   • Keywords (phrase/exact match):
│   │     "pool cleaning service [city]"
│   │     "pool service near me"
│   │     "weekly pool maintenance"
│   │     "pool tech vegas"
│   │   • Ads: 2x RSA (15 headlines, 4 descriptions, sitelinks, callouts, structured)
│   │
│   ├─ Ad Group 2: Pool Repair (urgency)
│   │   • Keywords:
│   │     "pool repair vegas"
│   │     "green pool fix"
│   │     "pool pump replacement"
│   │     "pool heater repair"
│   │   • Ads: 2x RSA
│   │
│   └─ Ad Group 3: New Pool / Equipment Install
│       • Keywords:
│         "pool equipment install"
│         "pool heater install las vegas"
│         "salt cell replacement"
│       • Ads: 2x RSA
│
└─ Campaign 2: Pool Service — Vegas LSA (Local Service Ads)
    │ (Note: Pool service eligibility for LSA varies by region — check first)
    │ Budget: pay-per-lead, set weekly cap at $200-400 starting

Negatives (account level — applies to ALL campaigns):
- "diy"
- "free"
- "how to"
- "youtube"
- "salary"
- "job"
- "for sale"
- "parts only"
- "wholesale"
- (add more after first 14 days of search-term review)
```

### SonoView LIVE account playbook

Pull this section verbatim during any SonoView session.

**Account state (current):**
- Daily budget: **$30/day**
- CPC cap: **$5**
- Bid strategy: Manual CPC (per CLAUDE.md — DO NOT change without Brendan approval)
- Geo: Reno + Sparks + Nevada (broader Nevada reach)
- Schedule: full-time (7 days, all hours)

**CPL bands (CLAUDE.md verbatim):**
- $20–35 GOOD 🟢
- $35–55 OK 🟡
- $55+ FIX 🔴

**Critical rules (per CLAUDE.md):**
- **Geo terms (reno / sparks / nevada) are GOLD** — never block, never add as negatives
- $5 CPC cap is a guardrail; don't raise without explicit approval
- $30/day budget is the ceiling for now; don't increase without 30d of GOOD CPL data

**Weekly cadence (every Monday):**
1. Pull last 7 days of CPL — what band?
2. Pull search terms report — any wasted spend?
3. Pull top converting keywords — are they getting enough impression share?
4. Check landing page conversion rate (if drops below 4%, route to Build Master)
5. Log results in brain-dump.md

**Monthly cadence (1st of month):**
- Refresh ad creative if CTR dropped below 30-day baseline by >15%
- Add new RSA assets (don't replace — add)
- Review extension/asset performance

**Quarterly cadence (every 90 days):**
- Reassess pricing tiers + offer mix (cross-Master with Marketing)
- Test new ad angle (different hook for top of search results)
- Review negative keyword list

**Math (current state):**
- $30/day × 30d = $900/mo lead spend
- At $30 CPL → 30 leads/mo
- At ~30% close rate → 9 booked sessions
- At $150 blended AOV → $1,350/mo revenue from paid leads
- Net result: small profit at lead level, big profit when LTV (referrals + repeat) factored

### Keyword research SOP

**Step 1: Build the seed list**
- Brain dump: what would a customer type to find this service?
- Tools: Google Keyword Planner (in Ads), Brave Search (autocomplete suggestions), competitor analysis (look at their ads via Google Ad Library / Meta Ad Library)
- Target: 20–40 seed keywords per niche

**Step 2: Bucket by intent**

| Intent bucket | Match type | Example |
|---|---|---|
| Buyer ("[service] near me") | Phrase + Exact | "pool service vegas" |
| Comparison ("best [service]") | Phrase | "best pool company near me" |
| Problem ("my [thing] is [broken]") | Phrase | "green pool fix" |
| Brand (competitor names) | Exact (rarely Broad) | "[competitor name] reviews" |
| Informational ("how to") | NEGATIVE | "how to clean pool" |

**Step 3: Match type policy**
- Default: **Phrase match** for everything
- Use Exact match only for proven high-converters
- AVOID Broad match for first 60 days of any account (it bleeds budget on irrelevant terms)
- Negative match: aggressive use, weekly review

**Step 4: Negative keyword library (account-level baseline)**

Universal (all clients, every niche):
```
diy, free, how to, youtube, video, tutorial, course, training, school,
salary, job, jobs, hiring, careers, resume,
for sale, parts only, wholesale, manufacturer,
amazon, alibaba, ebay, walmart,
craigslist, facebook marketplace,
"do it yourself", "instructions", "guide", "tips"
```

Per-niche additions (review and add to this list as you launch each):
- Pool: "above ground", "intex", "kiddie", "inflatable" (unless client services these)
- Pest: "diy spray", "home depot ant", "raid"
- Garage: "Home Depot", "Lowes", "garage door opener replace battery"
- HVAC: "diagnosis", "filter", "thermostat install" (low-margin work)

**Step 5: Search terms review (weekly during first 60d)**
- Pull search terms report
- Any term that spent $5+ with 0 conversions → add as negative
- Any new high-converting term not in your keyword list → add as Phrase keyword in the right ad group
- Any "junk" intent (recruitment, DIY, parts) → add as negative

### Geo targeting

Default for Vegas-area clients (per `skills/marketing.md` §4):
- **Pool / HVAC / Landscape / Carpet / House Cleaning:** Summerlin + Henderson + Enterprise + Mountains Edge + Centennial Hills (15-mile radius from client HQ; tighter for higher-LTV niches)
- **Pest Control:** ALL zones year-round (scorpions everywhere)
- **Garage Door:** ALL zones (every house has a garage)
- **Handyman:** mid-density zones (Spring Valley, Enterprise, NLV) where DIY isn't always feasible

**Use radius targeting by default. Switch to zip targeting only when client wants to exclude a specific low-LTV area (e.g., apartment-heavy 89169).**

**Schedule:**
- Default: 6am–9pm Mon–Sat (most service-business calls)
- Pool: extend to 7 days if client takes weekend calls
- HVAC: 24/7 during summer, 6am–9pm rest of year (emergency repair = night calls)
- Pest: 7am–8pm 7 days

### Bidding strategy ladder

Pick the rung based on conversion volume.

```
Rung 1: Manual CPC (NEW account, < 10 conversions)
        ↓ once you hit 10+ conversions in 30 days
Rung 2: Maximize Conversions (10-30 conv / 30d)
        ↓ once you hit 30+ conversions in 30 days
Rung 3: Target CPA (30+ conv / 30d, stable signal)
        ↓ once profitable AND want ROAS > 3x
Rung 4: Target ROAS (only when conversion VALUE is tracked, not just count)
```

**Brendan's default for new accounts:** start at Manual CPC for first 14 days (to learn the auction), then move to Max Conversions for the next 30 days, then tCPA at the GOOD band CPL.

**SonoView is Manual CPC — do NOT promote to auto bidding without explicit approval. The $5 CPC cap is the entire safety mechanism.**

### Conversion tracking stack

```
User Action (form submit / phone call / book button)
   ↓
GTM (Google Tag Manager) fires
   ├─ GA4 event
   └─ Google Ads conversion
   ↓
GHL webhook receives lead data
   ↓
GHL contact created with source=google-ads, campaign={{utm_campaign}}
   ↓
Stripe (if purchase) → revenue back into Ads via Enhanced Conversions
```

**Setup checklist (every new account):**
- [ ] GA4 property created + linked to Google Ads
- [ ] GTM container installed on landing page (cross-Master with Build)
- [ ] Conversion events: form_submit, phone_click (call extension), book_appointment
- [ ] Enhanced Conversions enabled (hashed email/phone passed to Google)
- [ ] GHL webhook tested with form submit
- [ ] All conversions marked as "Primary" in Ads → "Goals" → "Primary"

### RSA (Responsive Search Ad) structure

**Per ad group, every RSA needs:**
- 15 headlines (Google rotates 3 at a time)
- 4 descriptions (Google rotates 2 at a time)
- All extensions populated:
  - Sitelinks (4 minimum)
  - Callouts (6 minimum, e.g. "Same-Day Service", "Licensed & Insured", "Vegas-Owned")
  - Structured snippets (Service categories)
  - Call extension (the client's number, mobile-only)
  - Location extension (linked to client's GBP)
  - Image extension (1 hero image of work site)
  - Lead form extension (optional — test after 30d)

**Headline pinning rules:**
- Pin position 1: brand or top-converting keyword theme
- Pin position 2 + 3: leave unpinned for Google to rotate
- Pin sparingly — every pinned position reduces rotation tests

**Headline bank — pool service (15 examples):**
```
"Vegas Pool Service Pros"
"Weekly Pool Maintenance"
"Pool Repair — Same Day"
"Licensed Pool Techs"
"Free Pool Quote in 24 Hrs"
"Year-Round Pool Care"
"Locally Owned Vegas"
"Green Pool? We Fix It"
"Top-Rated Pool Service"
"Pump & Filter Repair"
"Salt Cell Replacement"
"Heater Install & Service"
"5-Star Vegas Pool Service"
"Family Pool Service"
"Book Online — 24/7"
```

**Description bank — pool service (4 examples):**
```
"Locally owned Vegas pool service. Weekly maintenance, repairs, equipment install. Same-day service available."
"From green pools to broken heaters — we fix it fast. Free quotes, licensed techs, 5-star reviews."
"Stop chasing referrals. Get reliable weekly pool service from a team that answers the phone."
"Year-round Vegas pool care. Maintenance plans starting at $X/mo. Call for free quote today."
```

### Daily / Weekly / Monthly review cadence

**Daily (5 min, every weekday):**
- Open Ads dashboard
- Check yesterday: CPL, conversions, spend
- Spike or crash? Note in brain-dump.md
- Don't optimize. Just observe.

**Weekly (30 min, every Monday):**
- Pull last 7 days for every active campaign
- Identify CPL band (§2)
- Search terms review → add negatives
- Performance reviewer (§7) IF in OK or FIX band
- Update client report (cross-Master with Sales+Ops)

**Monthly (90 min, 1st of month):**
- 30-day full report (CPL, CPA, conversions, ROAS, top keywords, top ads)
- Refresh creative (RSA assets, image extension)
- Reassess geo / schedule / bid strategy
- Council LCM if recommending major change ($300+ budget shift, platform add)

---

## §5 — META ADS MASTER PLAYBOOK

Meta is platform #2 for our 8 local-service niches — added once Google is profitable (30+ conv, GOOD band CPL).

### Campaign objectives ladder

| Objective | When to use | Don't use for |
|---|---|---|
| **Lead Generation (Lead Form)** | Cold local service awareness, instant lead capture | High-trust services (HVAC install) where customers want to talk first |
| **Sales (Conversions)** | After Pixel has 100+ conversion events | Cold accounts with no Pixel signal |
| **Traffic** | Top of funnel only — drives clicks but not always quality | Anything goal-oriented (use Conversions instead) |
| **Awareness** | Brand-building (rare for our niches) | Direct response — not for us |
| **Engagement** | Building remarketing audiences (rare) | Direct response |
| **Catalog Sales** | E-commerce (n/a for service businesses) | All our niches |

**Default for our 8 niches: Lead Generation (Lead Form) for cold acquisition. Switch to Sales (Conversions) once Pixel has signal.**

### CBO vs ABO decision

```
Are you in scaling mode (proven CPL, want more volume)?
├─ YES → CBO (Campaign Budget Optimization)
│        Single campaign budget, Meta distributes across ad sets
│        Best for 3+ proven ad sets
│
└─ NO  → ABO (Ad Set Budget Optimization)
         Each ad set has its own budget
         Best for testing — control individual variables
         Default for first 30 days of any new account
```

### Audience strategy (the layered cake)

Build 3 audience tiers per account. Run them as separate ad sets initially.

**Tier 1 — Cold (interest-based):**
- Local service interest stacks
  - Pool: "Pool ownership," "Backyard pool," "Pool maintenance"
  - HVAC: "Air conditioning," "Home improvement," "HVAC contractor"
  - Pest: "Pest control," "Home maintenance"
- Geo radius: 10-mile from client HQ
- Demographics: 30+, household income top 50% (refine after 30d)
- Exclude: existing customers (uploaded list), recent leads

**Tier 2 — Warm (lookalike):**
- Source: 1% lookalike of past 90 days closed-won customers (uploaded from GHL)
- OR: 1% lookalike of past 60 days lead form submitters
- Geo: same 10-mile radius
- Don't run until you have 100+ source customers

**Tier 3 — Hot (retargeting):**
- Website visitors (via Pixel) past 30 days
- Excluded converters (don't waste spend on existing leads)
- Lead form openers who didn't submit (last 14 days)
- Use this for offer/discount pushes, not cold pitch

### Creative testing protocol

**Minimum viable test:**
- 3 angles × 3 formats (image / video / carousel) = 9 creatives per campaign launch
- Run for 7 days (or until 50 conv per ad set, whichever first)
- Pause bottom 50% by CPL after 7d
- Re-test winners with new variations

**Pool service example — 3 angles:**
1. **Pain angle:** "Your pool is green again? You're not alone. Here's the fix." (problem-aware)
2. **Authority angle:** "5,000+ Vegas pools serviced. Your weekly maintenance, locked in." (proof-driven)
3. **Offer angle:** "$X off your first month of weekly service. Same-day quotes." (offer-driven)

Format: video > carousel > image (in performance order for service businesses; YMMV).

### Pixel + CAPI setup checklist

Every Meta account needs both Pixel (browser-side) AND CAPI (server-side).

- [ ] Meta Pixel installed on all pages (via GTM)
- [ ] Standard events: PageView, Lead, ViewContent
- [ ] Custom events: form_submit (matches Google), phone_click
- [ ] CAPI configured via GHL webhook OR Zapier OR direct server-side
- [ ] Match quality score: target > 7 (Meta shows this in Events Manager)
- [ ] Domain verified in Business Manager
- [ ] Aggregated Event Measurement events prioritized (Lead = #1)

### Pool service Meta angles

Local awareness lead form campaign (default for first 30d):

```
Campaign: Pool Service — Vegas Lead Gen (Lead Form objective, ABO)
│
├─ Ad Set 1: Cold Interest (Tier 1)
│   • Geo: 10mi radius from client HQ
│   • Age: 35-65
│   • Gender: All
│   • Income: top 50% household
│   • Interests: "Pool ownership", "Backyard", "Home improvement"
│   • Exclusions: lookalike of customers (negative)
│   • Budget: $20/day
│   • Placements: Auto (default)
│
├─ Ad Set 2: Lookalike (Tier 2 — only if 100+ customer list)
│   • Source: 1% LAL of past customers
│   • Geo: 10mi radius
│   • Budget: $20/day
│
└─ Ad Set 3: Retargeting (Tier 3 — only after 30d Pixel signal)
    • Audience: website visitors past 30d, exclude converters
    • Budget: $10/day

Lead Form: 4 fields max (first name, phone, address, "When do you need service?")
```

### Daily / Weekly / Monthly review cadence

Same structure as Google (§4 above) — adjust:
- Daily: check Pixel match quality + ad set delivery
- Weekly: creative refresh decision (every 14d Meta needs new creative; ad fatigue is real)
- Monthly: audience refresh (LAL recompute, exclusion list update)

---

## §6 — TIKTOK ADS MASTER PLAYBOOK

**Default verdict for our 8 niches: defer.** TikTok is not the right primary channel for local service businesses. This section exists for completeness and for the future first non-pool client where TikTok makes sense.

### When TikTok IS the right call

Use TikTok ads when ALL of these are true:
- Client has a TikTok handle with 1k+ organic followers (or willing to build)
- Niche is visually demonstrable (before/after, transformation, "satisfying" content)
- Budget is $50/day minimum (TikTok learning needs volume)
- Customer demographics skew 18-44 (older skews don't convert on TikTok)

For our 8 niches, the realistic TikTok candidates are:
- Carpet Cleaning (before/after is GOLD on TikTok)
- House Cleaning (transformation content)
- Landscaping (design-build before/after)
- Pool Service (green pool → blue pool transformations)

The non-candidates: HVAC, Pest, Garage Door, Handyman (TikTok audience won't book these from a video).

### Spark Ads vs cold-cut creative

**ALWAYS use Spark Ads when the client has an organic TikTok handle.**

Spark Ads = boost an existing organic post as an ad. Two reasons:
1. Spark Ads inherit the post's organic engagement signal → Meta-style algorithm boost
2. The video already passed the "does this work organically" test

**Cold-cut creative** = ad-only video, no organic post. Use only when:
- Client doesn't have a TikTok presence
- You're testing a new angle the organic feed hasn't seen

### Spark Ads handle approval flow

1. Client must enable "Allow others to create ads with my videos" in TikTok app settings
2. Get the post code from the original post's URL
3. In TikTok Ads Manager → Identity → Spark Ads → Apply with code
4. Wait for client approval (notification on their phone)
5. Once approved, the post is ad-eligible

### Hook bible (first 1.5 seconds)

TikTok lives or dies in the first 1.5 seconds. Every ad opens with one of these patterns:

| Pattern | Example (pool service) |
|---|---|
| Pattern interrupt | "DON'T pay for this. Watch first." |
| Dramatic visual | (cut to green pool with dramatic music) |
| Direct question | "Vegas homeowners — when's the last time someone tested your pool chemistry?" |
| Bold statement | "I've cleaned 5,000 Vegas pools. Here's what I see every time." |
| Social proof | "This is the #1 reason 87% of Vegas pools turn green every August." |
| Behind-the-scenes | (cut of pool tech opening filter, gross water) "Most pools look like this inside." |

**Anti-pattern: never open with a logo, "hey guys," or a slow zoom into your face.**

### Hashtag + interest targeting

- Hashtag targeting: 5–10 relevant niche tags (TikTok Ads Manager surfaces these)
  - Pool: #poolservice #vegaspool #poolclean #poollife
  - HVAC: #hvactech #hvaclife #airconditioning
  - Pest: #pestcontrol #scorpions #vegasliving
- Interest targeting: pick top 3-5 categories that overlap with your customer
- Don't go too narrow on first launch — TikTok's algo needs broad signal to start

### Pixel setup

- Install TikTok Pixel via GTM (same approach as Meta + Google)
- Standard events: PageView, SubmitForm
- Custom events: phone_click
- Server-side via Events API (recommended) — uses GHL webhook

### When to use TikTok (final answer)

For the agency's CURRENT client roster (SonoView, future pool clients):
- **SonoView:** TBD — could work for elective ultrasound (visual, expectant moms 28-40 are on TikTok). Test with $30/day Spark Ads if SonoView's TikTok grows past 1k followers.
- **First pool client:** No. Start Google + (Meta after profitable). Add TikTok only at Tier 3 budget (§9).
- **Future non-pool clients:** Carpet Cleaning + House Cleaning are the most likely first real TikTok plays.

---

## §7 — THE PERFORMANCE REVIEWER (DIAGNOSTIC DECISION TREES)

This is the section you load when something's wrong. Don't optimize from gut — run the trees.

### The universal weekly review (10 minutes, every Monday)

```
1. Open Ads dashboard for every active account
2. For each campaign:
   a. Pull last 7-day CPL
   b. Identify CPL band (§2)
   c. Are we in learning phase? (§3)
3. If in learning → DO NOTHING. Note status, move on.
4. If out of learning AND in GOOD band → push spend per §9 ladder.
5. If out of learning AND in OK band → run Symptom 1 tree below.
6. If out of learning AND in FIX band → run Symptom 1 tree IMMEDIATELY.
7. Log all decisions in brain-dump.md.
```

**Total time: 10 minutes for up to 3 active accounts. Don't let it sprawl.**

### SYMPTOM 1 — CPL is too high

```
SYMPTOM: CPL above niche's GOOD band (per §2 table)
   ↓
   In learning phase? (Check platform's Learning column)
   ├─ YES → STOP. Wait for exit. Re-check next Monday.
   └─ NO  → continue
       ↓
       Which platform?
       │
       ├─ GOOGLE branch ────────────────────────────────────
       │  Step 1: Pull search terms report (last 14d)
       │     • Are >10% of search terms irrelevant? → add negatives, wait 14d
       │     • Are top spenders converting? → if NO, pause those keywords
       │
       │  Step 2: Check landing page conversion rate
       │     • If LP conv rate < 3% → route to Build Master (page issue, not ads)
       │     • If LP conv rate ≥ 3% → ads issue, continue
       │
       │  Step 3: Check ad strength + CTR
       │     • CTR < 5% → refresh RSA (add new headlines, don't replace)
       │     • Ad Strength "Poor" → improve assets
       │
       │  Step 4: Check geo + schedule
       │     • Spending in zones with low LTV? → exclude
       │     • Running outside business hours with no answer? → tighten schedule
       │
       │  Step 5: Bid strategy check
       │     • On Manual CPC with 30+ conv? → promote to Max Conv (one change)
       │     • On Max Conv with consistent CPL? → promote to tCPA at GOOD band
       │     • On tCPA with target above market? → lower target by 10%
       │
       │  Step 6: Last resort — pause + re-launch
       │     • If all 5 above don't move CPL after 14d each → pause, restructure
       │
       ├─ META branch ──────────────────────────────────────
       │  Step 1: Check ad fatigue
       │     • Frequency > 4? → swap creative (don't pause ads, ADD new ones)
       │
       │  Step 2: Check audience overlap
       │     • Multiple ad sets serving same audience? → consolidate or exclude
       │
       │  Step 3: Check Pixel signal
       │     • Match quality < 6? → fix CAPI / Pixel install
       │     • Conv events < 50/wk? → may need higher budget for signal
       │
       │  Step 4: Check creative performance
       │     • CTR < 1.5% → refresh creative (new angles)
       │     • CTR ≥ 1.5% but low conv → landing page issue (route to Build)
       │
       │  Step 5: Check audience freshness
       │     • Lookalike older than 30d → recompute LAL with fresh customer list
       │
       │  Step 6: Bid + budget
       │     • CBO underperforming? → switch to ABO to control spend per ad set
       │     • Budget too low for learning? → bump 20% (max), wait 14d
       │
       └─ TIKTOK branch ────────────────────────────────────
          Step 1: Check hook performance
             • Hook retention < 50% at 1.5s? → swap creative
          Step 2: Check Spark Ads vs cold creative
             • Cold creative? → switch to Spark Ads from organic
          Step 3: Check audience + hashtag
             • Targeting too narrow? → broaden hashtag stack
          Step 4: Check landing page
             • LP not mobile-optimized? → route to Build (TikTok = mobile-only)
          Step 5: Check spend
             • Below $50/day? → not enough signal for learning
          Step 6: Pause + re-evaluate niche fit
             • If TikTok genuinely doesn't work for niche → kill, allocate to Meta/Google
   ↓
   APPLY ONE FIX. Wait 14 days. Re-evaluate. Don't stack changes.
```

### SYMPTOM 2 — Conversion volume too low

```
SYMPTOM: < 30 conversions / 30d on Google OR < 50 / 7d on Meta/TikTok
   ↓
   CPL is acceptable but volume is starving the algorithm
   ↓
   Step 1: Is budget below platform minimum? (See §1 table)
   ├─ YES → Increase budget by 20% (max), wait 14d
   └─ NO  → continue
       ↓
   Step 2: Is conversion event too restrictive?
   ├─ Is it tracking the right action? (form_submit vs purchase)
   │  • If goal is leads → use Lead form / Form Submit / Phone Click
   │  • If goal is bookings → use Book / Schedule (need product)
   ├─ Multiple events firing? → set ONE primary
   └─ Continue
       ↓
   Step 3: Audience too narrow?
   • Google: ad groups targeting too few keywords → broaden Phrase match
   • Meta: ad set audience size < 500k → broaden interest stack OR add lookalike
   • TikTok: too few hashtags → broaden
       ↓
   Step 4: Landing page conversion rate low?
   • If LP conv rate < 5% → route to Build Master
   • Most volume-low issues are page issues, not ad issues
       ↓
   Step 5: Niche fit
   • If after Steps 1-4 still starving → niche may not have enough search/audience
   • Validate volume data via Google Keyword Planner / Meta Audience Insights
```

### SYMPTOM 3 — CTR / engagement bad

```
SYMPTOM: Google CTR < 5% OR Meta CTR < 1.2% OR TikTok 1.5s retention < 50%
   ↓
   Step 1: Is the offer clear?
   • Does the ad state EXACTLY what you're offering?
   • Pool: "Free pool quote in 24h" not "Pool services available"
       ↓
   Step 2: Is the ad relevant to the keyword/audience?
   • Google: search term → headline match (use Dynamic Keyword Insertion sparingly)
   • Meta: audience interest → creative angle match
   • TikTok: hook → audience pain match
       ↓
   Step 3: Is the creative fresh?
   • Google: when was last RSA asset added?
   • Meta: when was last creative refresh?
   • TikTok: every 7 days you need new hooks
       ↓
   Step 4: Is the creative quality high enough?
   • Image extension on Google? (single biggest CTR boost)
   • Meta: video > carousel > image (test in this order)
   • TikTok: vertical 9:16, captions burned in, hook in first 1.5s
       ↓
   Step 5: Is the audience the right size?
   • Too narrow → low frequency, but low conversion
   • Too broad → high impressions, low CTR
   • Sweet spot: Meta 500k–2M, TikTok 1M+
```

### SYMPTOM 4 — Cost per booked is too high (downstream issue)

```
SYMPTOM: CPL is in GOOD band, but cost per BOOKED appointment is too high
   ↓
   This is a sales / qualification issue, not an ads issue.
   ↓
   Step 1: What's the lead → booked rate?
   • If < 20% → leads are unqualified
       • Tighten ad targeting (less broad)
       • Add qualification questions to lead form (Meta)
       • Add pre-qualifying language to ad copy ("$X minimum project size")
   • If ≥ 30% → ads doing their job, sales process needs work
       ↓
   Step 2: Tyler's call follow-up speed?
   • If > 4hr response time → fix the speed (sales.md §1)
   • Speed-to-lead is the #1 lead → booked driver
       ↓
   Step 3: Is the lead source notes captured?
   • Tyler should know which campaign / ad / keyword the lead came from
   • Mismatch = poor handoff (see Contract C2 in agent-architecture.md)
       ↓
   Step 4: Reroute to Sales+Ops
   • This symptom is a Sales+Ops Master issue. Hand off to skills/sales.md.
```

### SYMPTOM 5 — Spend pacing wrong

```
SYMPTOM: Spending too fast (running out of daily budget by noon) OR too slow (under-pacing)
   ↓
   FAST PACING (eating budget early):
   • Google: too many high-CPC keywords concentrated in one ad group
       → split into more ad groups OR add negatives
   • Meta: bid cap too high OR audience too small
       → set bid cap closer to target CPL OR broaden audience
   • TikTok: same as Meta
   ↓
   SLOW PACING (under-spending):
   • Google: too many negatives, audience starved
       → review negative list, remove anything blocking conversions
   • Google: Quality Score too low → ads not winning auctions
       → improve ad relevance / landing page experience
   • Meta: ad set frequency too low → audience saturation OR audience too large
       → tighten audience OR boost bid cap
   • TikTok: not enough creative variety
       → add 3 more Spark Ads variants
```

### The "don't touch it" rule

Before any optimization, ask:
1. Has the campaign been live more than 7 days?
2. Has it exited learning phase?
3. Has it been 14+ days since the last change?
4. Are conversions above the platform's minimum threshold?

**If any answer is NO → don't optimize. Wait. Note the question that blocked you and set a calendar reminder.**

---

## §8 — PER-NICHE AD STRATEGY

Cross-reference: `skills/marketing.md` §3 for full niche profiles (ICP, pain points, AOV math). This section covers the AD-SPECIFIC strategy.

### Pool Service (Vegas) — DEFAULT PLAYBOOK

**Recommended platforms (in order):**
1. Google Search (default — week 1 launch)
2. Google LSA (week 2 if eligible)
3. GBP optimization (cross-Master with Marketing for organic strategy)
4. Meta Lead Ads (week 5+ once Google in GOOD band)
5. Skip TikTok unless client has 1k+ TikTok organic

**Key ad angles:**
- Year-round Vegas pool service ("Most companies pause in winter — we don't")
- Same-day quote / response speed
- Local family-owned (vs. national chains)
- "10 leads in 30 days" guarantee for the offer (per CLAUDE.md)

**CPL targets:** $25–45 GOOD / $45–70 OK / $70+ FIX (per §2)

**Geo:** Summerlin + Henderson + Enterprise + Mountains Edge (15-mile radius)

**Schedule:** 6am–9pm Mon–Sat (extend to Sunday if owner takes weekend calls)

**Budget tier 1 starter:** $30–50/day Google Search + $0 Meta first 30d

**Watch for:** seasonality dips Oct–Feb (CPL may rise as overall demand drops). Don't panic. Hold spend, don't cut.

### Pest Control — URGENCY PLAYBOOK

**Recommended platforms:**
1. Google Search (always #1 — pest is search-intent)
2. Google LSA (eligible category)
3. GBP optimization
4. Skip Meta cold (low intent for emergency pest)
5. Skip TikTok

**Key ad angles:**
- "Vegas scorpion exterminator — same day"
- Termite season urgency (Mar–May)
- Recurring quarterly plans (the LTV play)
- Locally licensed + insured (pest = trust play)

**CPL targets:** $20–40 GOOD / $40–60 OK / $60+ FIX

**Geo:** ALL Vegas zones (scorpions everywhere)

**Schedule:** 7am–8pm 7 days

**Budget tier 1 starter:** $30/day Google + $20/day LSA cap

**Watch for:** seasonality SPIKE May–Sep (scorpions). Push spend up 30% during peak.

### Garage Door — LSA-FIRST PLAYBOOK

**Recommended platforms:**
1. Google LSA (always #1 — garage door is THE LSA category)
2. Google Search (#2 — fills gaps where LSA doesn't reach)
3. GBP optimization
4. Skip Meta cold (low intent)
5. Skip TikTok

**Key ad angles:**
- Same-day repair urgency
- Spring + opener brands (Genie, LiftMaster, Chamberlain)
- 24/7 emergency
- Lifetime warranty on parts (if client offers)

**CPL targets:** $15–35 GOOD / $35–55 OK / $55+ FIX

**Geo:** ALL Vegas zones

**Schedule:** 24/7 (emergency repair = night calls)

**Budget tier 1 starter:** LSA $200/wk cap + $20/day Google Search backup

**Watch for:** national chains (A1, Precision) running $80+ CPCs. Don't get into bidding war on broad terms — own the LSA + local-modified terms ("garage door repair Henderson")

### HVAC — $2K+ TIER PLAYBOOK

**Recommended platforms:**
1. Google LSA (always #1 — HVAC is THE prime LSA category)
2. Google Search (always #2 — repair + install)
3. GBP optimization (must be 4.5+ to compete in Vegas)
4. Meta Lead Ads for maintenance plan funnel (week 5+)
5. Skip TikTok

**Key ad angles:**
- 24/7 emergency repair
- Free system install quotes
- Maintenance plan upsell (the LTV play — $200-400/yr recurring)
- Vegas-licensed, NATE-certified

**CPL targets:**
- Repair: $30–60 GOOD / $60–90 OK / $90+ FIX
- Install: $80–150 GOOD / $150–250 OK / $250+ FIX

**Geo:** ALL Vegas zones (HVAC has universal demand)

**Schedule:** 24/7 (May–Sep), 6am–9pm rest of year

**Budget tier:** **$2k+ retainer requires $100+/day ad spend minimum.** HVAC is the only niche where Tier 1 starter ($30/day) is too low.

**Watch for:** auction crowding (CPCs $50+). Defend with local-modified keywords + LSA + tight negatives.

### Landscaping — DUAL-INTENT PLAYBOOK

**Recommended platforms:**
1. Google Search (split campaigns: maintenance vs design-build)
2. GBP with photo optimization (CRITICAL — landscaping is visual)
3. Meta Lead Ads for design-build (visual sells design work)
4. Skip TikTok unless before/after content is strong
5. Skip LSA (not a strong landscaping category)

**Key ad angles:**
- Design-build (high margin): "Vegas backyard transformation" + photo carousel
- Maintenance: "Weekly lawn + landscape care, locked in"
- Drought-tolerant Vegas-specific (xeriscape angle)

**CPL targets:**
- Maintenance: $25–50 GOOD / $50–80 OK / $80+ FIX
- Design-build: $60–120 GOOD / $120–200 OK / $200+ FIX

**Watch for:** seasonality opposite of pool — busy Mar–May + Sep–Nov.

### Carpet Cleaning — VOLUME PLAYBOOK

**Recommended platforms:**
1. Google Search (urgency-driven)
2. GBP with before/after photos
3. Skip Meta cold (low intent)
4. **TikTok = optional candidate** (before/after content works)

**Key ad angles:**
- Same-day service
- 3-room special (loss-leader to get in the door)
- Pet stain specialist
- Truck-mount (if client has one — premium positioning)

**CPL targets:** $15–30 GOOD / $30–50 OK / $50+ FIX

**Watch for:** $1.5k retainer math is borderline (per `skills/marketing.md`). Volume must be 5+ jobs/day to support spend.

### House Cleaning — RECURRING PLAYBOOK

**Recommended platforms:**
1. Google Search (recurring intent)
2. GBP
3. Meta Lead Ads (bi-weekly recurring offer)
4. **TikTok = optional candidate** (transformation content)
5. NextDoor (offline channel — important for this niche but not paid ads)

**Key ad angles:**
- Recurring weekly/bi-weekly (the LTV play)
- Move-in / move-out cleans (high-ticket entry)
- Airbnb host services (sub-segment opportunity)
- Bonded + insured + background checked

**CPL targets:** $20–40 GOOD / $40–60 OK / $60+ FIX

**Watch for:** churn after deep clean → recurring conversion is the funnel that needs work, not the ads.

### Handyman — MINIMAL PLAYBOOK

**Recommended platforms:**
- NextDoor (offline) is #1 for this niche, not paid ads
- Google Search if running ads at all (small budget)
- Skip Meta + TikTok

**Key ad angles:**
- Local + insured
- Specific services listed (tile, drywall, plumbing repairs)
- Same-day availability

**CPL targets:** $10–25 GOOD / $25–40 OK / $40+ FIX

**Watch for:** retainer math doesn't work above $40 CPL. Handyman is borderline for $1.5k retainer (per `skills/marketing.md`). Consider value-add packages instead of full retainer for this niche.

### SonoView (LIVE) — PROTECTED ACCOUNT

(Sub-playbook in §4 above — pull verbatim during sessions.)

**Quick reference:**
- Platform: Google Search ONLY (no Meta, no TikTok)
- Budget: $30/day, $5 CPC cap
- CPL bands: $20–35 / $35–55 / $55+ (per CLAUDE.md)
- Geo terms (reno / sparks / nevada) → NEVER block
- Don't change bid strategy without Brendan approval

### Trade N Travel — PRE-REVENUE

Defer ads. Per `skills/marketing.md` §3:
- Build offer + landing page first (Build Master)
- Validate with first 10 organic users
- THEN test Meta (visual fit for travel content)

### Valdes Agency itself — see §11

---

## §9 — BUDGET ALLOCATION FRAMEWORK

### The 3 budget tiers

```
TIER 1 — STARTER ($30–50/day)
  • First 30 days of any new account
  • Goal: hit learning phase exit (30 conv on Google, 50 on Meta)
  • Default platform: Google Search only
  • Why low: every dollar wasted on a misconfigured campaign hurts the agency margin
  • Exit criteria: 30 conv + CPL in OK or GOOD band → graduate to Tier 2

TIER 2 — GROWTH ($100–150/day)
  • Day 31+ once Tier 1 exit criteria met
  • Goal: scale conversion volume + add second platform
  • Platforms: Google + Meta (both running, ABO on Meta to control)
  • Watch closely for first 30d of Tier 2 — CPL often rises 10–20% during scaling
  • Exit criteria: 90+ conv/mo + GOOD band CPL → Tier 3 (rare for our clients)

TIER 3 — SCALE ($300+/day)
  • Day 60+ of Tier 2 with strong CPL
  • Goal: maximum profitable spend
  • Platforms: Google + Meta + (TikTok if niche fits)
  • CBO on Meta, tCPA or tROAS on Google
  • Requires daily attention — not a "set and forget" tier
```

### Per-niche minimum spend

Some niches need MORE than Tier 1 to get out of learning. Adjust starter budget accordingly:

| Niche | Tier 1 min | Reasoning |
|---|---|---|
| Pool Service | $30/day | Standard |
| Pest Control | $30/day | Standard |
| Garage Door | $40/day | LSA + Search needs both running |
| HVAC | $100/day | Crowded auction, expensive CPCs require volume to learn |
| Landscaping | $30/day | Standard |
| Carpet Cleaning | $25/day | Lower CPC niche |
| House Cleaning | $30/day | Standard |
| Handyman | $20/day | Low CPL niche, but learning needs minimum |
| SonoView | $30/day | LOCKED — per CLAUDE.md (don't change without approval) |

### When to add platform #2 (Google → Meta)

Trigger conditions (ALL must be true):
1. Google has been live 30+ days
2. Google CPL in GOOD or OK band
3. Conversion volume ≥ 30/mo
4. Pixel is installed and firing on landing page (verified)
5. Client has a Meta business page
6. Budget can support Meta minimum ($40/day) IN ADDITION to Google

If all 6 → add Meta with $40/day starter at Tier 2 budget level.

### Brendan's spend-change rule

> "Never increase or decrease spend by more than 20% without a 14-day hold-and-watch."

Rationale: bigger changes break learning phase. 20% is the max safe change per platform documentation.

Example:
- Currently spending $50/day on Google → max single change is to $60/day
- Want to scale to $100/day? → $50 → $60 → wait 14d → $72 → wait 14d → $86 → wait 14d → $100. Takes ~6 weeks but preserves learning.

**The exception:** if you're CUTTING spend due to a FIX-band CPL or a wasted-spend issue, you can drop sharply. Just know it'll likely reset learning.

---

## §10 — CREATIVE LIBRARY STRATEGY

Creative is the #1 lever for ad performance once targeting + bidding are dialed. Each platform has its own creative format requirements + refresh cadence.

### Google — RSA assets

**Requirements per RSA:**
- 15 headlines (30 char max each)
- 4 descriptions (90 char max each)
- All extensions populated (sitelinks, callouts, structured snippets, images, location, call)

**Refresh cadence:** Add 2 new headlines + 1 new description every 30 days. Don't replace high-performers.

**Source:** Content Master generates in batches of 10 per niche when requested. Cross-ref `skills/content.md` (TBD).

### Meta — image / video / carousel weights

**Format priority for our niches:**
1. **Video** (15-60s) — best for cold acquisition, shows transformation/proof
2. **Carousel** (3-5 cards) — good for showcasing multiple services or before/after sequences
3. **Single image** — easiest to produce but lowest performance for service businesses

**Refresh cadence:** Every 14 days, ad fatigue kicks in. New creative needed.

**Per ad set rule:** 3 angles × 3 formats = 9 creatives at launch. Pause bottom 50% by CPL after 7 days. Refill with new variations.

**Source:** Content Master + Build Master (for image extensions). Cross-ref `skills/content.md` (TBD).

### TikTok — Spark Ads vs UGC raw

**Always Spark Ads when client has organic handle.** Cold-cut creative is fallback only.

**Refresh cadence:** Every 7 days TikTok needs new hooks. Faster fatigue than any other platform.

**Source:** Content Master + client's own organic content (Spark Ads inherit organic posts).

### Refresh cadence summary

| Platform | Add new creative every | Reason |
|---|---|---|
| Google | 30 days (+2 headlines, +1 description) | RSA combinatorics absorb fatigue slower |
| Meta | 14 days (3 new ads minimum) | Frequency cap = fatigue |
| TikTok | 7 days (3 new hooks minimum) | Algorithm wants fresh content |

### Creative request handoff

When ads need new creative, the request goes to Content Master (TBD: `skills/content.md`). The handoff is **Contract C7 / C8** in `skills/agent-architecture.md` §5:
- C7: `Content → Meta Ads :: creative-to-ad-variants`
- C8: `Content → TikTok Ads :: script-to-tiktok-creative`

(Future contract C14 will cover `Content → Google Ads :: rsa-asset-batch` once Content Master playbook ships.)

---

## §11 — VALDES AGENCY SELF-MARKETING (ADS-SIDE)

**Default verdict: Don't run paid ads on Valdes Agency until cold has produced 5+ paying clients.**

### The reasoning (Council LCM applied)

**M (Marketing):** Cold dial + email (per `skills/marketing.md`) is the most direct path for the agency. Paid ads diffuse the message without proof yet.

**R (Revenue):** Every $1 spent on agency-self ads is $1 not spent on client delivery improvements. Until cold is producing, agency ads don't math.

**O (Operations):** Brendan can't manage ads for himself AND clients while still doing cold + delivery. Capacity constraint.

**S (Strategy):** Agency self-marketing should validate niche depth (Vegas pool) BEFORE diversifying channels. Cold proves the niche; ads scale a proven niche.

**F (Finance):** $1.5k client retainer × 5 clients = $7,500/mo MRR. Until that exists, agency ads spend is pre-revenue.

**Verdict: All 5 lenses say wait.** Revisit when cold has 5+ paying clients.

### When the criteria are met (5+ paying clients), the platform order

For B2B service businesses (which the agency is), the platform priority differs from local-service clients:

```
1. LinkedIn Ads
   • Why: B2B owner targeting (job title: Owner / Founder / President of [niche])
   • Format: single image + video (case study testimonials work well)
   • Budget: $50/day starter
   • Note: LinkedIn is expensive ($8-15 CPC) but has the best B2B targeting

2. Meta Ads (Lookalike of agency customers)
   • Why: cheaper than LinkedIn, can use detailed targeting + lookalikes
   • Format: video case studies, before/after CPL screenshots
   • Budget: $30/day starter
   • Note: requires uploaded customer list (5+ clients = 5+ seed records, marginal)

3. Google Search (defensive + brand)
   • Why: bid on "Vegas marketing agency" + "[competitor agency name]"
   • Format: RSA with case study headlines
   • Budget: $20/day cap
   • Note: low volume, mainly for capturing branded search

4. TikTok / Reels
   • Why: long-tail, low priority for B2B
   • Defer until LinkedIn + Meta proven
```

### Budget cap for agency self-marketing

**Hard cap: 10% of agency MRR.**

If MRR is $7,500 → max self-marketing spend = $750/mo = ~$25/day total across platforms.

If MRR grows to $15,000 → max = $1,500/mo = ~$50/day.

**Why the cap:** prevents the agency from over-marketing itself before delivery is bulletproof.

### Performance reviewer for agency self-ads

Same §7 trees apply. Just substitute:
- Niche = "B2B service business owners (Vegas)"
- CPL target = TBD (set after first 30d of self-ads data)
- LTV = $18,000 first-year per client (at $1.5k/mo × 12)

---

## §12 — STATUS LEGEND + CROSS-REFERENCES + MAINTENANCE

**Status values:**
- 🔴 LIVE — active in production (e.g., SonoView Google Ads)
- 🟡 READY — playbook ready, awaiting first client launch (Pool Service Google + Meta)
- 🟢 STAGED — section written, no near-term execution (TikTok)
- ⚪ DEFERRED — explicitly waiting (agency self-marketing — until 5+ paying clients)

**When to update this file:**
- New campaign launched → add notes to relevant niche section in §8
- New niche CPL data after 30d → update §2 table
- Performance reviewer found a new symptom → add tree to §7
- Platform algorithm change → update §3 (learning phase) or §4/5/6 (platform playbook)
- New creative format proven → add to §10
- Agency hits 5+ paying clients → activate §11 self-marketing tier
- New Master playbook ships (e.g., `skills/content.md`) → add cross-references

**Cross-references:**
- `skills/sales.md` → execution layer (cold dial → close → GHL ops)
- `skills/marketing.md` → niche profiles (§3), Vegas geo (§4), positioning (§10)
- `skills/agent-architecture.md` → 3 Ads Master blocks (§3 Masters 2, 3, 4), Contracts C2/C3/C4/C7/C8/C9/C12, Build Order
- `CLAUDE.md` → ROCCO voice, SonoView CPL bands (verbatim source), pool Vegas advantage
- `.claude/skills/paid-ads/` → reference for paid ads framework
- `.claude/skills/ad-creative/` → reference for ad copy generation
- `.claude/skills/ab-test-setup/` → reference for experiment design
- `.claude/skills/analytics-tracking/` → reference for GA4 / GTM / event setup

**Memory hooks:**
- Save campaign launches + CPL milestones to MCP Knowledge Graph at session end
- Use `/workspaces/ValdesAgency/memory/brain-dump.md` for daily ad observations + spike notes

---

**End of Ads OS.**
**Three-rule reminder:** Don't optimize an account in learning phase. Change ONE variable at a time, wait 14 days. Never block geo terms.
