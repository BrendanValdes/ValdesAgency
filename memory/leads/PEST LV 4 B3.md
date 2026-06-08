# Vegas Pest Leads — Batch 3 B3 (additive, phone-required)

**Generated:** 2026-05-31  
**Source:** NV Dept of Agriculture 2026 Licensed-Operator registry (283 statewide → Clark-County ICP filter) + 2013/2016 Southern Nevada PCO company directories (owner/address backfill) + Brightdata/Firecrawl Yelp, GBP, Facebook & site enrichment for **current-phone verification**.  
**Funnel:** 283 statewide licensees → 195 after chain/non-ICP filter → 135 after dedup vs all 83 mined → ~49 prioritized Clark-County indies → phone-verified in 3 waves → **16 final, every one with a confirmed current phone.**  
**Additive:** net-new beyond ALL 83 already mined (`PEST 1 B1` 30 + `PEST 2/ROB` 26 + `PEST 3 B2` 30). `PEST 3 B2` left untouched.

## Honest Yield Ceiling (the answer to Brendan's question)
- Pre-build estimate was **~15–25 genuinely-ICP with a current phone**. Delivered **16** — squarely in range.
- **Quality crater confirmed at ~16–18.** In the final wave, 7 of 11 candidates dropped: stale-only phones (Mercury, Metro Bee, GBM, South Valley, No Mercy — last verifiable number was 2013–2016) or non-local (Panda = AZ/CA, Stryker = unconfirmed). The dialable, ICP-qualified well is now effectively dry.
- **There is no clean 'next 50.'** Combined across all batches you now hold **~99 unique Vegas pest companies**. Pushing further means stale phones (fail your hard rule) or micro-shells. **Recommendation stands: this is the last pest pull — pivot to Phoenix pool** (≈4× TAM, same playbook).

## Hard Rules Honored
- **Phone required:** 16/16 carry a confirmed current phone (verified against a live Yelp/GBP/website listing, not a stale directory). Zero un-dialable leads. Dropped every candidate whose only number was a 2013–2016 record.
- **Dedup:** normalized name + phone-last-10 vs all 83 mined + 7 off-limits. **Zero collisions, zero internal dups.** (GHL live layer deferred — token still 401/no contacts scope; pest ~0-enrolled so risk is low. Re-run `/tmp/pest3` dedup once scope is fixed.)
- **ICP:** independent owner-op Vegas only. National chains + multi-state expansions (Orkin/Terminix/Rentokil/Bulwark/Aptive/AIMVO/Panda etc.) and non-pest (tree/lawn/weed/fertilizer/structural-only) filtered out.
- **No collision with pool or garage-door:** tags `vegas-pest-2026-05,batch-3-b3` + `niche=pest`; GHL gatekeeper to enter the sequence is `pest control email campaign`. (No garage-door lead files exist.)

## Geo Distribution
- Las Vegas: 14
- Henderson: 1
- Overton: 1

## Score Distribution
- 7.5 (2)
- 7.0 (2)
- 6.5 (3)
- 6.0 (5)
- 5.5 (3)
- 5.0 (1)

**Tiers:** top-priority 2 · mid-priority 5 · probe-first 8 · filler 1

## Email Verification
- 2/16 emails (footer/GBP only; Apollo deferred = free-tier). Dial-first list — owner name is the asset; open with the name.

## GHL Import — L-019 Mitigation (2-pass)
- Header `Business Name` (wizard may alias to 'Company Name' — same field). Pass 1 full CSV → Pass 2 Company-Name patch keyed on research-CSV E.164 phone.
- After import: open 5 random → **SCROLL to General Info** (not header) → confirm Business Name populated.
- **All 16 have a phone**, so all are Pass-2 Update-matchable — no manual-fix orphans this batch.
- Apply gatekeeper tag `pest control email campaign` (+ A/B `pest control list a`/`b`) to enter the sequence.

## Leads Table

| # | Company | Owner | Phone | Score | Tier | City | Hook |
|---|---|---|---|---|---|---|---|
| 1 | Mojave Pest Control | Tony Merlino | (702) 240-9006 | 7.5 | top-priority | Las Vegas | Tony, NW-Vegas customers stick with Mojave for years and rave about yo... |
| 2 | Rebel Pest Control | Fred Habibian | (702) 597-0707 | 7.5 | top-priority | Las Vegas | Fred, 36 years serving Vegas since 1990 is a pedigree almost nobody in... |
| 3 | Valley View Pest Control | Daniel Stewart | (702) 635-8008 | 7.0 | mid-priority | Las Vegas | Daniel, Valley View has real range — pigeon, bee, and bed-bug work — p... |
| 4 | Pitbull Pest Control | Francis Toth III | (702) 400-1946 | 7.0 | mid-priority | Las Vegas | Francis, 75 reviews + 41 photos + billing yourself as the largest fumi... |
| 5 | Tuffy's Pest Control | Wesley French | (702) 984-8456 | 6.5 | mid-priority | Las Vegas | Wesley, Tuffy's is family-owned, covers the whole valley, and has a li... |
| 6 | Niko's Pest Control | Michael Docu III | (702) 339-1527 | 6.5 | mid-priority | Las Vegas | Michael, Niko's does the right things — family-owned, real IPM backgro... |
| 7 | Opti-Guard Pest + Termite Control | Davon Spears | (702) 612-6104 | 6.5 | mid-priority | Las Vegas | Davon, Opti-Guard has 487 Facebook followers and a real termite specia... |
| 8 | Mission Pest Control | Jose Soto | (702) 340-7786 | 6.0 | probe-first | Las Vegas | Jose, Mission is a licensed SE-Vegas shop with a clean, trustworthy na... |
| 9 | Defend Pest Control | William Shurts | (702) 763-7887 | 6.0 | probe-first | Las Vegas | William, Defend has loyal Centennial-area customers calling you 'true ... |
| 10 | Assassin Pest Control | — | (702) 641-7003 | 6.0 | probe-first | Las Vegas | Assassin is a brand that sticks — and you're sitting at 5.0 on Angi wi... |
| 11 | Atlas Pest Control | Raymond Fester | (725) 529-2857 | 6.0 | probe-first | Henderson | Raymond, Atlas earns 5.0 and 'recommended by the neighbors app' in Hen... |
| 12 | Vanish Pest Control IPM | Salvador Papa | (702) 457-1011 | 6.0 | probe-first | Las Vegas | Salvador, Vanish has a real IPM positioning, a site, and multi-propert... |
| 13 | Mesa Pest Control | David Bates | (702) 355-7536 | 5.5 | probe-first | Las Vegas | David, Mesa is a licensed Vegas shop (SE valley, 89044) that's been ar... |
| 14 | Freedom Pest Control | Cody Newman | (725) 307-6218 | 5.5 | probe-first | Las Vegas | Cody, Freedom is early but clean — 5.0 across your first handful of re... |
| 15 | Squish Pest Control | James Oliver | (702) 396-6569 | 5.5 | probe-first | Las Vegas | James, Squish has a fun, sticky brand and a site (squishlv.com) — and ... |
| 16 | On Target Pest Control | Matthew Hopkins | (702) 397-2371 | 5.0 | filler | Overton | Matthew, On Target covers the Overton/Logandale outer market — the lea... |

## Top 5 — Dial Day 1
**#1. Mojave Pest Control** — 7.5/10 — Owner: Tony Merlino — (702) 240-9006 — Las Vegas, NV  
**#2. Rebel Pest Control** — 7.5/10 — Owner: Fred Habibian — (702) 597-0707 — Las Vegas, NV  
**#3. Valley View Pest Control** — 7.0/10 — Owner: Daniel Stewart — (702) 635-8008 — Las Vegas, NV  
**#4. Pitbull Pest Control** — 7.0/10 — Owner: Francis Toth III — (702) 400-1946 — Las Vegas, NV  
**#5. Tuffy's Pest Control** — 6.5/10 — Owner: Wesley French — (702) 984-8456 — Las Vegas, NV  

## Recommended Dial Order
- **TOP (≥7.5):** Mojave (Tony) + Rebel (Fred, 36yr) — confirmed owners, strong reputations stranded behind thin web. Open with the name + the exact gap.
- **MID (6.5–7.0):** Valley View, Pitbull, Tuffy's, Niko's, Opti-Guard — real shops, named weakness (review gap, no niche landing page, dated site).
- **PROBE (5.5–6.0):** Mission, Defend, Assassin, Mesa, Atlas, Vanish, Freedom, Squish — licensed, dialable, low visibility = the pitch writes itself.
- **FILLER (≤5.0):** On Target (Overton, unclaimed Yelp) — outer-market, free 7-day fix.

## Per-Lead Detail

### 1. Mojave Pest Control — 7.5/10 (top-priority)
**Owner:** Tony Merlino · **Phone:** (702) 240-9006 · **City:** Las Vegas, NV · **Web:** mojavepestcontrol.com
**Reviews:** 5.0★ / 15

> Tony, NW-Vegas customers stick with Mojave for years and rave about your scorpion work at a clean 5.0 — that loyalty is the hard part, and you've got it. But it's stranded: 15 Yelp reviews and a single Facebook review for a 5.0 shop means anyone filtering for 25+ reviews never sees you, and the site doesn't rank for 'scorpion control Las Vegas' (your #1 search). 21-day fix: a review-request text after every service to break 30+ in 90 days + a scorpion-control landing page = the reputation you already earned finally pulls the searches it deserves.

### 2. Rebel Pest Control — 7.5/10 (top-priority)
**Owner:** Fred Habibian · **Phone:** (702) 597-0707 · **City:** Las Vegas, NV · **Web:** rebelpestcontrol.com
**Reviews:** ?★ / 14

> Fred, 36 years serving Vegas since 1990 is a pedigree almost nobody in this market can touch. But your site shows it nowhere — no '36 years' in the hero, and just 14 Google reviews for three-plus decades of work means a 2-year-old competitor with 80 reviews outranks you. 14-day fix: rebuild the hero around 'Family-owned, protecting Vegas since 1990' + a review-request automation to convert your decades of customers into visible proof = 36 years finally working FOR you in the map pack instead of hiding.

### 3. Valley View Pest Control — 7.0/10 (mid-priority)
**Owner:** Daniel Stewart · **Phone:** (702) 635-8008 · **City:** Las Vegas, NV
**Reviews:** 4.5★ / 22

> Daniel, Valley View has real range — pigeon, bee, and bed-bug work — plus 22 reviews, which is a foundation most indies wish they had. But 4.5 stars (not 4.9) and a thin website mean you're leaving the high-ticket pigeon/bee searches on the table. 30-day fix: service-specific landing pages for pigeon + bee removal (the $300-600 jobs) + a review push to lift 4.5 toward 4.8 = capture the premium searches your competitors don't even target.

### 4. Pitbull Pest Control — 7.0/10 (mid-priority)
**Owner:** Francis Toth III · **Phone:** (702) 400-1946 · **City:** Las Vegas, NV · **Web:** pitbullpestcontrol.com
**Reviews:** ?★ / 75

> Francis, 75 reviews + 41 photos + billing yourself as the largest fumigation outfit in Nevada is a genuine edge — fumigation is high-ticket, low-competition work. But your site is generic 'we do all pests' with no fumigation landing page, so the one thing you dominate isn't capturing search. 30-day fix: a 'whole-home fumigation Las Vegas' page that owns the term + a commercial/property-manager page = lead with the niche you already win instead of blending into every other pest site.

### 5. Tuffy's Pest Control — 6.5/10 (mid-priority)
**Owner:** Wesley French · **Phone:** (702) 984-8456 · **City:** Las Vegas, NV · **Web:** tuffpestcontrol.com
**Reviews:** ?★ / 13

> Wesley, Tuffy's is family-owned, covers the whole valley, and has a likable brand people remember. But the site footer still says 2020, you've got 13 reviews, and there's no recurring-plan pricing — every quarterly contract you don't pitch upfront is $400-1,200/yr per customer in lost lifetime value. 21-day fix: refresh the site + a quarterly/monthly plan pricing page + review automation = turn one-time calls into the recurring book that actually builds enterprise value.

### 6. Niko's Pest Control — 6.5/10 (mid-priority)
**Owner:** Michael Docu III · **Phone:** (702) 339-1527 · **City:** Las Vegas, NV · **Web:** nikospestcontrol.com

> Michael, Niko's does the right things — family-owned, real IPM background, a site with click-to-text. But you're nearly invisible: ~90 Facebook likes, almost no Google reviews, low search presence. The IPM/eco angle is a differentiator you're not pressing. 30-day fix: a 'family-owned eco-friendly IPM' hero + aggressive review collection from your existing base + GBP optimization = make the quality of your work visible to people who can't currently find you.

### 7. Opti-Guard Pest + Termite Control — 6.5/10 (mid-priority)
**Owner:** Davon Spears · **Phone:** (702) 612-6104 · **City:** Las Vegas, NV

> Davon, Opti-Guard has 487 Facebook followers and a real termite specialty across LV and Pahrump — termite/WDO is high-intent, real-estate-driven money. But there's no termite-inspection landing page, and splitting LV + Pahrump with one number muddies your local search in both. 30-day fix: a 'termite inspection Las Vegas' page (realtor/escrow intent) + separate GBP service areas for LV and Pahrump = own the termite searches in two markets instead of half-ranking in each.

### 8. Mission Pest Control — 6.0/10 (probe-first)
**Owner:** Jose Soto · **Phone:** (702) 340-7786 · **City:** Las Vegas, NV

> Jose, Mission is a licensed SE-Vegas shop with a clean, trustworthy name. But the footprint is thin — a Yelp listing and little else, no reviews surfacing, no site that ranks. 30-day fix: claim and build the GBP + a one-page site + a review-request text after each job = a licensed operator that actually shows up when SE-valley homeowners search, instead of only when referred.

### 9. Defend Pest Control — 6.0/10 (probe-first)
**Owner:** William Shurts · **Phone:** (702) 763-7887 · **City:** Las Vegas, NV

> William, Defend has loyal Centennial-area customers calling you 'true professionals' year after year — that retention is gold. But it's invisible online: almost no reviews, no ranking site, so all that goodwill dies with each referral instead of compounding. 21-day fix: GBP claim + review automation to surface the loyalty you already have + a simple site = turn word-of-mouth into searchable proof in the NW valley.

### 10. Assassin Pest Control — 6.0/10 (probe-first)
**Owner:** (owner not surfaced) · **Phone:** (702) 641-7003 · **City:** Las Vegas, NV
**Reviews:** 5.0★ / ?

> Assassin is a brand that sticks — and you're sitting at 5.0 on Angi with a contract-light reputation in SE Vegas. But there's no website and barely any Google reviews, so the memorable name isn't capturing the searches it should. 21-day fix: a one-page site that ranks for the brand + GBP with reviews + lead with 'no lock-in contracts' (homeowners love it) = make the name work as the marketing asset it already is.

### 11. Atlas Pest Control — 6.0/10 (probe-first)
**Owner:** Raymond Fester · **Phone:** (725) 529-2857 · **City:** Henderson, NV · **Email:** atlaspestcontrol702@gmail.com
**Reviews:** 5.0★ / ?

> Raymond, Atlas earns 5.0 and 'recommended by the neighbors app' in Henderson — real organic trust. But the contact email is atlaspestcontrol702@gmail.com and there's no website, which reads 'side gig' to homeowners checking before they book. 21-day fix: a branded domain + raymond@ email + a GBP with your 5.0 reviews pulled forward = match the professional service to a professional first impression.

### 12. Vanish Pest Control IPM — 6.0/10 (probe-first)
**Owner:** Salvador Papa · **Phone:** (702) 457-1011 · **City:** Las Vegas, NV · **Web:** vanishpestcontrollv.com · **Email:** Mpapa@vanishpestcontrollv.com

> Salvador, Vanish has a real IPM positioning, a site, and multi-property/commercial clients praising your clean, friendly crews. But the IPM angle is buried and reviews are thin for a 12-year operator. 30-day fix: a hero that explains 'IPM = fewer chemicals, longer-lasting results' in homeowner language + a property-manager landing page + review collection = turn the technical edge into a reason people choose you over the spray-and-pray crowd.

### 13. Mesa Pest Control — 5.5/10 (probe-first)
**Owner:** David Bates · **Phone:** (702) 355-7536 · **City:** Las Vegas, NV

> David, Mesa is a licensed Vegas shop (SE valley, 89044) that's been around — but online you're a phone number and not much more: no reviews, no findable site. For a decade-old operator that's pure lost ground. 30-day fix: claim GBP + a one-pager + start collecting reviews from your existing customers = stop being invisible to everyone who didn't already get your number from a neighbor.

### 14. Freedom Pest Control — 5.5/10 (probe-first)
**Owner:** Cody Newman · **Phone:** (725) 307-6218 · **City:** Las Vegas, NV
**Reviews:** 5.0★ / 5

> Cody, Freedom is early but clean — 5.0 across your first handful of reviews in the NW valley. That's the moment to build the digital foundation right, before you're fighting 100-review incumbents. 30-day fix: GBP fully built + push every happy customer for a review now (get to 25 fast) + a one-page site with a quote form = compound the head start instead of staying a hidden 5.0.

### 15. Squish Pest Control — 5.5/10 (probe-first)
**Owner:** James Oliver · **Phone:** (702) 396-6569 · **City:** Las Vegas, NV · **Web:** squishlv.com
**Reviews:** ?★ / 3

> James, Squish has a fun, sticky brand and a site (squishlv.com) — and you've been at it since 2015. But 3 reviews in 11 years means you're effectively invisible in search and leaning entirely on Facebook. 21-day fix: a review-request text after every job (you have a decade of customers to ask) + GBP optimization = a memorable brand that finally gets found by more than your existing circle.

### 16. On Target Pest Control — 5.0/10 (filler)
**Owner:** Matthew Hopkins · **Phone:** (702) 397-2371 · **City:** Overton, NV

> Matthew, On Target covers the Overton/Logandale outer market — the least-competitive corner of Clark County — and has run since 2018. But your Yelp is UNCLAIMED, which means Yelp runs competitors' ads on your listing and you can't respond to a single review. 7-day fix (free): claim the Yelp + Google profiles, add hours/photos/service area, turn on review requests = own the outer-market searches no big company bothers to chase.

## Format Notes
- Same dual-CSV pattern as prior batches: research (14-col, E.164, full angle) canonical; GHL-ready (11-col, display phone, brief Notes). No BOM; col counts verified; phone-required gate enforced by script (build fails on any empty phone).