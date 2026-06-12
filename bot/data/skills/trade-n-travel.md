# Trade N Travel Operating System — Partner Project (BUILDING)
**Scope:** Trade N Travel — AI travel planning product, 50/50 partnership with Les
**Owners:** Brendan + Les — 50/50 equity partners
**Reads:** Brendan + Les (when shared) — cross-reference from any TNT-touching session
**Goal:** Ship the beautiful, useful AI travel planner. Protect the partnership. Document every operational lever as it comes online.
**Status:** 🟡 BUILDING — system started, paused until ROCCO is complete

---

## §0 — HOW TO USE THIS FILE

### Reading order
- **New to TNT?** §1 (at-a-glance) → §2.5 (partnership structure) → §3 (current state). Stop there until you have a specific task.
- **Working on the build?** §13 (tech stack) → §8 (app + landing page) → `skills/website.md` design standards.
- **Money question?** §2.5 partnership splits + §4 unit economics.
- **Channel / launch question?** §5 channel plan.
- **Positioning, copy, brand voice?** §2 + §6 — and don't move without Les sign-off (§2.5 governance).

### Three universal rules (LOCKED — do not change without Brendan + Les conversation logged)
1. **Revenue split is LOCKED.** 50/50 online. 90/10 seller-rewards in-person (closer keeps 90%, partner gets 10%). Symmetric — applies whether Brendan or Les is the closer. Don't renegotiate over chat or in passing — schedule the conversation, log the change.
2. **Build resumes only after ROCCO is complete.** No premature kickoff. ROCCO completion is the trigger. Anything else (excitement, a partner pitch, a calendar gap) is not the trigger.
3. **Beautiful UI is non-negotiable.** This is the product's edge against Expedia / Kayak / Booking. Performance + design quality are first-class concerns, not polish-at-the-end. If a build decision is "fast OR beautiful," beautiful wins — find a way to do both.

### Cross-Master ownership (when build resumes)
- **Build Master** owns app build (frontend + backend + AI itinerary engine)
- **Marketing Master** owns positioning + Meta launch + ICP validation
- **Content Master** owns Reels/TikTok pre-launch awareness + founder-narrative LinkedIn
- **Ads Master** owns paid ramp post-validation (Meta first, Google search second, in that order)
- **Sales Master** does NOT own TNT — there's no cold-call motion here. In-person sales are Les + Brendan direct, no Tyler.

### What this file is NOT
- It's not a client playbook. TNT is a partner project. Mentions of "client" anywhere in this repo that point at TNT are stale and need cleanup (see Appendix B).
- It's not an ads campaign brief. TNT is a product build first, marketing campaign second. Channel work happens after offer validation.

---

## §1 — TNT AT A GLANCE

| Field | Value |
|---|---|
| Project name | Trade N Travel |
| Partners | Brendan Valdes + Les — 50/50 equity |
| Roles | Brendan = builder + operator. Les = original business idea + in-person outreach. |
| Product | AI travel planner — input budget + preferences → AI-generated itinerary → in-app booking |
| Primary ICP | **B2B** — owner-operated travel agencies + independent travel advisors who want to offer AI-powered itinerary planning to their clients |
| Secondary ICP | **B2C** — direct-to-consumer travelers wanting personalized trip planning on a budget |
| Revenue model | B2B subscription / license (primary) + B2C affiliate commissions on bookings (secondary). Specific pricing TBD. |
| Online revenue split | **50/50** across the board |
| In-person revenue split | **90/10 seller-rewards** — closer keeps 90%, non-selling partner gets 10% (symmetric) |
| Status | 🟡 BUILDING — system started, paused, resumes post-ROCCO |
| Current users | 0 (pre-launch) |
| Current revenue | [TBD — confirm if Les has any in-person activity producing revenue today] |
| Domain | [TBD — confirm if registered] |
| Email | tradentravel1@gmail.com |
| First Meta ad creative | Built, uploaded, NOT running (per `skills/content.md` line 500 — "needs positioning first") |
| Build dependency | ROCCO completion |
| Build phase trigger | Brendan signals "ROCCO is done" → kickoff §8 build phase |
| Marketing trigger | First 10 organic users validate offer → §5 paid channel work begins |

---

## §2 — THE PRODUCT

### §2.1 What it does
User opens the app → enters trip budget + preferences (destination type, dates, vibe, group size) → AI generates a personalized itinerary → user books flights / hotels / activities **inside the app**, not via a redirect.

The booking flow inside the app is the differentiator. Most travel tools (Expedia, Kayak, Booking) are comparison engines — they push you to a partner site. TNT keeps the experience inside one beautiful app.

### §2.2 What makes it different
1. **AI-curated, not search-result-dumped.** Most travel sites give you 200 hotels and ask you to choose. TNT picks the right 3 based on your preferences and tells you why.
2. **Beautiful UI.** Travel apps look like spreadsheets. TNT looks like an editorial magazine.
3. **In-app booking.** No redirect. No "now go to expedia.com to actually book." End-to-end inside one experience.
4. **Founder-built.** Brendan + Les give the product a specific point of view. Big travel brands are committee-built. TNT isn't.

### §2.3 ICP — Primary (B2B) + Secondary (B2C)

**This is a two-audience product, not one.** Primary is B2B — TNT is the tool that travel pros offer their own clients. Secondary is B2C — direct consumers using the app self-serve.

**Primary ICP — owner-operated travel agencies + independent travel advisors:**
- Solo or small (1–10 person) travel businesses
- Already serving clients but want to differentiate or scale beyond manual planning
- Want to offer AI-powered itinerary planning without building it themselves
- Likely currently use Travefy, Tern, or hand-built docs — TNT is the upgrade
- Pain: clients expect more personalized recommendations than the agent has time to research one-by-one
- Decision-maker: the owner (single signer, fast sales cycle)
- Higher ACV (subscription / license), smaller TAM, faster validation per deal

**Secondary ICP — direct-to-consumer travelers (budget-aware):**
- Travelers who want personalized planning but can't afford a private travel advisor
- Self-serve consumers using the app directly, no agency intermediary
- Original B2C hypothesis carries: 30–50, time-poor, has used ChatGPT, books 2+ trips/year
- Lower revenue per user (affiliate commissions), bigger TAM, slower per-user validation but compounds with brand

**Why two audiences:** the B2B side gets us paid customers fast (agencies say yes or no inside one demo). The B2C side gets us scale + brand + reusable content. Build B2B first to validate revenue. Layer B2C on the same product surface once the engine is proven.

**Validation plan:** still TBD — early stage. Need to define:
- B2B: how many agency demos book per outreach attempt? Demo → paid conversion target? First-30-agency cohort?
- B2C: landing page form-fill rate, free preview → booking conversion, email open rates

Captured in Appendix A item 8 — needs Brendan + Les sync to lock the validation plan before build kicks off.

**⚠ Downstream implications — flagged for follow-up review (Appendix A items 16–18):**
- **§5 channel plan** is currently written B2C-first (Meta Ads, content, email nurture). Primary B2B ICP needs a different channel mix — LinkedIn outbound, cold email to agency owners, travel-industry conferences (Virtuoso, ASTA, Travel Weekly), partnership-led growth via existing agency networks. Revise §5 when revisited.
- **§4 unit economics** needs two columns — B2B (subscription / license fees, lower volume / higher ACV) and B2C (affiliate commissions, higher volume / lower per-user). Different metrics, different breakeven math.
- **§13 tech stack** likely needs **multi-tenancy** — each agency wants their own branded view (their logo, their colors, possibly their domain). Decide architecture before build resumes (white-label-via-subdomain vs full-tenant model).

### §2.4 Customer journeys (planned — two paths)

**B2B (primary) — travel agency / advisor signs up:**
```
Discovery (LinkedIn outbound, cold email, conference, partner referral, Les's network)
   ↓
Demo (live or async — show the agency how it works for THEIR clients)
   ↓
Trial (free trial period OR paid pilot)
   ↓
Activation (agency creates first itinerary for a real client)
   ↓
Subscription / license fee captured (recurring)
   ↓
Renewal + agency-to-agency referral
```

**B2C (secondary) — consumer signs up directly:**
```
Discovery (content / ad / Les's network)
   ↓
Landing page (waitlist OR app preview)
   ↓
Form-fill (budget + prefs) → email capture
   ↓
AI generates free preview itinerary
   ↓
"Unlock booking" prompt → upgrade OR proceed to in-app booking
   ↓
Affiliate commission captured per booking
   ↓
Post-trip nurture (§9) → repeat booking
```

The two paths share the same underlying product (AI itinerary engine) but different acquisition motions, different revenue models, and likely different surface area (B2B sees an admin dashboard + branded client view; B2C sees the consumer app directly).

### §2.5 Voice + positioning
**TBD — set during pre-launch positioning sprint with Les.**

Defaults to challenge during that sprint:
- Tone candidates: editorial / playful / aspirational / no-bullshit-practical
- Brand reference candidates: Airbnb editorial, Away (luggage), Tripadvisor (anti-reference — what NOT to be)
- Voice extraction: if Les writes copy, run `voice-extractor` skill against Les's writing samples to capture his DNA before any agency-style content gets written

---

## §2.5 — PARTNERSHIP STRUCTURE

### Roles
- **Brendan — builder + operator.** Owns: app build, tech stack decisions, marketing/ads ops, analytics, day-to-day execution. The hands on the product.
- **Les — original business idea + in-person outreach.** Owns: the founding concept, in-person sales motion, network and relationship work, partner outreach (travel agencies, hotels, activities). The hands on the deals.
- The **50/50 equity** reflects equal ownership of the company. The **role split** reflects who does what day-to-day. Neither partner does the other's job by default — but both have visibility into both halves.

### Equity
**50/50 — Brendan + Les.** No earlier-stage advisor stake, no fractional founder. Two-person shop.

### Online revenue split: 50/50
Every digital dollar — ad-driven booking, organic SEO booking, affiliate commission, future SaaS subscription, anything that flows through the app — splits 50/50 between Brendan and Les. No carve-outs by channel.

### In-person revenue split: 90/10 seller-rewards
**Whoever closes the in-person sale gets 90%. The non-selling partner gets 10%.**

This is symmetric:
- Les closes an in-person sale → Les gets 90%, Brendan gets 10%
- Brendan closes an in-person sale → Brendan gets 90%, Les gets 10%

The 10% is not a tax — it's a partner stake that says "you're still in the game even when I'm doing the hustle." The 90% is the hustle reward.

**Why this design:** In-person sales (events, local meetups, direct pitches) take real time and energy. A 50/50 split disincentivizes that work — why hustle if your partner gets half? A 100/0 split disincentivizes the partnership — why have a partner if you eat the whole sale? 90/10 hits the middle: rewards the closer, keeps both partners with skin in every deal.

### Decision authority

**General default:** Les usually has final say. Brendan has authority over how the system runs and everything online. Conflicts → talk it through to agreement.

| Domain | Lead | Final say |
|---|---|---|
| System / build / tech stack / engineering | Brendan | Brendan |
| Online ops (ads, analytics, app, anything digital) | Brendan | Brendan |
| In-person ops + sales motion | Les | Les solo for day-to-day; joint sign-off on new partner categories or major commitments |
| Brand + positioning + visual identity | Joint | Les usually final, conflicts → joint agreement |
| Major spend (>$X/mo, X TBD) | Joint | Joint |
| Partner deals (travel agencies, hotel chains, B2B sales) | Les | Les; joint sign-off on new categories |
| Hiring (when applicable) | Joint | Joint |
| All other strategic calls | — | Les usually final, conflicts → talk to agreement |

### Conflict resolution

**Operating default:** when Brendan and Les disagree, they talk it out and come to an agreement. No formal tie-breaker, no coin flip, no advisor. Partnership-trust model.

**Why this works (for now):**
- Two-person shop with high alignment + history
- Clear domain ownership (Brendan = system / online final, Les = general final say + in-person) means most decisions don't surface conflict in the first place
- Most disagreements live at the brand / positioning layer, where joint sign-off is the norm anyway

**Still recommended to document before scale:**
- **Exit clauses** — what if one partner wants out? Right of first refusal? Buyout formula based on TTM revenue?
- **IP ownership** — codebase + brand are joint assets, write it down
- **Deadlock fallback** — 50/50 means deadlock is theoretically possible; the operating default ("Les final say on most things, Brendan final on system / online") essentially is the tiebreaker, but make it explicit before scale

**Trigger to formalize:** before any external money flows in (investor capital, large prepay > $X from a customer, partner contract worth > $X). Don't wait until there's a problem.

### Revenue logging
Every revenue event gets logged with:
- Date
- Source (digital channel OR in-person event)
- Amount
- Seller-of-record (digital → "platform"; in-person → which partner)
- Split applied (50/50 or 90/10 with direction)

Default tooling: shared Google Sheet for first 50 transactions, Supabase ledger table once volume justifies. Cross-Master with Build Master when promoting to ledger table.

---

## §3 — CURRENT STATE

### Build
- **Status:** 🟡 PAUSED — started, on hold until ROCCO is complete
- **What's already in place:** [TBD — capture in next solo session: domain bought? landing page sketched in Lovable? brand assets? logo? positioning doc? Slack/Discord workspace?]
- **What's NOT in place:** the actual app, the AI itinerary engine, the booking flow, partner agreements, anything user-facing
- **Resume trigger:** Brendan signals "ROCCO is done" — file this signal in a memory entry so the moment is logged

### Users
- 0
- Pre-launch waitlist count: [TBD — confirm if a waitlist already exists]

### Revenue
- Digital: $0
- In-person: [TBD — confirm with Les if any current in-person activity is generating revenue today]
- If revenue is moving today: log it per §2.5 logging convention immediately, even if informal

### Marketing
- **None active.** Per `skills/content.md` §11.3, deferred until offer is validated.
- **First Meta ad creative built but not running** (per `skills/content.md` line 500 — "Built the first ad creative for Trade N Travel last night. Uploaded. Didn't run it. Need positioning first.").
- Hold the defer rule. **Do not run that ad creative until §2.5 positioning + §1 ICP are validated.**

### Ads
- None active. Per `skills/ads.md` §8, defer until offer validated.

### Partner agreements
- None signed. Travel agency / hotel chain / activity provider outreach is post-launch (§6.3).

---

## §4 — UNIT ECONOMICS FRAMEWORK (placeholder until live)

**Status:** Empty until first 30 users + 10 bookings provide real data. Below is the framework for what gets filled in.

### §4.1 Affiliate margin per booking type
| Booking type | Industry avg commission | TNT target | Source |
|---|---|---|---|
| Hotel | 5–15% | TBD | TBD partner agreements |
| Flight | 1–3% | TBD | TBD partner agreements |
| Activity | 8–20% | TBD | TBD partner agreements |
| Package (bundle) | 10–18% | TBD | TBD partner agreements |

### §4.2 Target AOV
**TBD.** Estimate at planning: $800–1,500 per trip (mid-tier traveler). Validate post-launch.

### §4.3 Breakeven CPA
**Calculated post-launch from real conversion data.** Formula:
```
Breakeven CPA = AOV × blended affiliate margin × first-trip conversion rate
```
Example placeholder math (replace with real numbers):
- AOV $1,000 × 8% margin = $80 commission per booking
- If we accept paid spend at 50% of first-trip commission → max CPA = $40
- Breakeven CPA = $80

### §4.4 LTV assumptions (validate at 30-user mark)
- Trips per year per active user: 2+ (per §2.3 ICP)
- Months until repeat booking: ≤6
- Year-1 LTV per user: 2 × $80 commission = $160 (if AOV/margin holds)

Validate every assumption with first 30 users. **Do not increase paid spend until LTV assumptions are validated.**

### §4.5 Margin gates
- **Pre-validation:** $0 paid spend.
- **Post-validation (10+ bookings):** accept paid CPA below 50% of first-trip commission. Above that = pause and revisit.
- **Post-LTV proof (90+ days of repeat data):** accept paid CPA up to 100% of first-trip commission if 6-month LTV math works.

---

## §5 — CHANNEL PLAN (replaces Google Ads playbook for TNT)

> **⚠ HEADS UP — needs revision (Appendix A item 16):** This section was drafted when TNT was framed as B2C-first. Primary ICP is now **B2B (travel agencies + advisors)**. The B2B motion is LinkedIn outbound + cold email + industry conferences + partnership-led growth — not Meta Ads. The plan below is the **B2C secondary motion**. A B2B channel plan needs to be added before launch. Until then, treat §5 as the B2C surface only.

### §5.1 Pre-launch (today through soft launch)
**No traffic, no spend.** What we do:
- Landing page with email capture (waitlist)
- Brendan's LinkedIn — document the build journey (cross-link `skills/content.md` Brendan personal brand pillar)
- Les's network — direct outreach, in-person events
- Founder narrative content (no product launch yet)

### §5.2 Soft launch (first 100 users)
**Content + email + zero paid.** What we do:
- Reels / TikTok — destination spotlights, "AI-built itinerary in 60 seconds" demos
- LinkedIn threads — build journey, founder lessons
- Email nurture sequence to waitlist → drip the first preview itineraries to opt-ins
- Word-of-mouth + Les's network for first 100

**Goal:** 10 organic users → 30 organic users → 100 organic users. Each milestone is a checkpoint to validate the offer is real.

### §5.3 Validation (100–500 users)
**Meta Ads test at $30/day starter** (per `skills/ads.md` §9 Tier 1 budget). Why Meta first:
- Travel is visual — Meta's ad surface is built for visuals
- Audience targeting is strong (travel intent + income segmenting)
- $30/day is the agency's proven starter for new accounts (per ads playbook)

Continue content cadence — paid doesn't replace organic, it stacks on it.

### §5.4 Scale (500+ users + GOOD-band CPA)
**Add Google search + retargeting.** Why second:
- Search captures high-intent ("trip to Bali Q3") that Meta misses
- Retargeting closes the loop on warm Meta traffic that didn't convert first time

### §5.5 Channel-by-channel notes
- **Meta first** because travel is visual and audience targeting is strong
- **Google search second** because intent volume is huge and high-intent converts well — but only after we know what queries to bid on (post-validation)
- **TikTok organic third** because young + visual + viral hook potential — runs alongside Meta from soft-launch onward, light effort
- **LinkedIn (Brendan)** runs from day one — founder narrative is its own channel
- **Email nurture** runs from waitlist onward — see §6.2

### §5.6 What we DON'T do (locked)
- No paid spend before validation (§4.5 margin gates)
- No Google search before Meta validation (sequencing matters — learn the customer first)
- No display / Performance Max ever (visual + intent context-loss = waste)
- No TikTok ads in the first 12 months (organic only on TikTok — paid TikTok is a different beast)

---

## §6 — FREE CHANNELS

### §6.1 Content pillars (TBD — sketch during positioning sprint)
Working hypothesis:
1. **Destination spotlights** — short-form video, 30s "Why [destination] is underrated for [type of traveler]"
2. **AI-built itinerary demos** — show the product working, before product is even live
3. **Founder narrative** — Brendan + Les building in public (LinkedIn for Brendan, TBD for Les)
4. **Partner travel-agent tips** — leverage future partner relationships for content (cross-Master with content)

Refine with Content Master during positioning sprint.

### §6.2 Email list
- **Capture from landing page** pre-launch (waitlist hook + beta-access promise)
- **Weekly nurture once 100+ subscribers** — destination ideas, build progress updates, beta invites
- **First-100 are gold** — direct relationship, founder-to-user, no automation. Brendan or Les replies personally.

### §6.3 Partner outreach
**Post-launch only.** Categories:
- Travel agencies (referral relationships, white-label opportunities)
- Hotel chains (direct affiliate deals — better margins than aggregators)
- Activity providers (GetYourGuide, Viator, direct partnerships)
- Influencers (travel bloggers, niche community leaders)

**Lead:** likely Les (in-person + relationship work suits the seller-rewards structure).
**Tooling:** `apollo.io` (already on Brendan's stack per CLAUDE.md) for list-building, `apify` for scraping if needed.

### §6.4 Founder LinkedIn (Brendan)
- Brendan documents the build journey from day one — this is content.md Brendan personal brand pillar territory
- Tag TNT in any case study about AI / product / partnership lessons
- Don't pitch the product on LinkedIn until launch — narrative is the asset, not the funnel

### What we don't have
- **No GBP** — TNT has no physical location. Skip the GBP playbook entirely.
- **No local SEO** — TNT is geo-agnostic. Skip the city-page playbook in `skills/website.md`.
- **No reviews flywheel** until first 30 users — too early.

---

## §7 — GHL WORKFLOWS (scaffold)

**Pre-launch needs:** lead capture from landing page → email nurture sequence → "first booking" trigger → post-trip nurture.

**Smaller surface area than SonoView's 9 workflows** — TNT is pre-launch, fewer triggers.

### Scaffold table — fill at launch

| # | Name | Trigger | Steps | Status | Last verified |
|---|------|---------|-------|--------|---------------|
| 1 | [TBD — Waitlist capture] | Landing page form submit | Welcome email + tag `tnt-waitlist` | [TBD] | [TBD] |
| 2 | [TBD — Beta access] | Beta invite send | Email + tag + access link | [TBD] | [TBD] |
| 3 | [TBD — Itinerary preview] | Free itinerary generated | Email itinerary + nurture sequence start | [TBD] | [TBD] |
| 4 | [TBD — Booking confirmation] | In-app booking complete | Confirmation + tag `tnt-customer` + commission log | [TBD] | [TBD] |
| 5 | [TBD — Pre-trip + trip-day + post-trip] | Booking date triggers | Multi-step nurture (see §9) | [TBD] | [TBD] |

Expand to 7–9 workflows as the product surface grows.

### Tagging convention
- `tnt-waitlist` → captured pre-launch
- `tnt-beta` → received beta access
- `tnt-customer` → booked at least once
- `tnt-repeat` → booked 2+ times
- `tnt-churn` → 12+ months since last booking, dormant

---

## §8 — APP + LANDING PAGE CHECKLIST

### §8.1 Landing page (pre-launch waitlist)
**Above the fold:**
- [ ] Hook headline — emotional, not feature-list (e.g., "Travel curated for you. Booked in one app.")
- [ ] Email capture form, single field (just email — minimize friction)
- [ ] Beta-access promise ("First 500 get free premium tier for life" or similar — set with Les)
- [ ] Hero visual: video or animated still of the product mockup (use Higgsfield.AI to animate destination photo)

**Below the fold:**
- [ ] How it works (3 steps with icons)
- [ ] Founder story (Brendan + Les) — the partnership is part of the brand
- [ ] Partner logos (when secured — placeholder before)
- [ ] FAQ — covers: when does it launch, how does pricing work, what destinations, who's it for
- [ ] Final email capture repeat

**Performance gates:**
- LCP < 2.5s mobile
- Mobile-first, tested at 375px
- All tap targets minimum 44px

### §8.2 App UX gates (when build resumes)
**"Beautiful UI" definition — not vibes, specific gates:**
- [ ] Input → preview transition uses BlurText / SplitText (per `skills/website.md` ReactBits standards)
- [ ] AnimatedBackground subtle gradient on hero (Magic UI)
- [ ] Number Ticker on any stat displays (trip count, savings, ratings)
- [ ] Itinerary preview reads like an editorial magazine — not a wall of text or a spreadsheet
- [ ] Booking CTA visible without scroll on every itinerary page
- [ ] Mobile + web parity from day one — same animations, same transitions, same density
- [ ] No skeleton loaders that linger more than 800ms — if data isn't ready, the design has to feel intentional
- [ ] Microinteractions on every input (haptic mobile / subtle scale on web)

### §8.3 Design system inheritance
Pull from `skills/website.md` design standards:
- Color palette: TBD during brand sprint, max 3 colors, CSS variables
- Typography: from approved list (Cabinet Grotesk / Plus Jakarta Sans display, DM Sans body — never Inter / Roboto / Arial)
- Spacing: 96px desktop / 56px mobile section padding
- Animations: from the "USE" list, never from the "AVOID" list

Don't duplicate `skills/website.md` rules here. Inherit them. TNT's specific palette and typography choices live in this file once decided.

---

## §9 — BOOKING FLOW + POST-TRIP NURTURE

### §9.1 In-app booking flow
**Decision point — defer until partner agreements signed:** affiliate redirect (user clicks → partner site → books → we get commission) vs in-app checkout (user books inside TNT → we handle payment → we book on partner backend).

**Default until decided:** affiliate redirect. Faster to ship, lower legal complexity, lets us validate the funnel before building checkout. Migrate to in-app checkout post-validation if margin and UX justify it.

### §9.2 Post-booking sequence (planned)
| Trigger time | Channel | Content | Goal |
|---|---|---|---|
| Immediate | Email + in-app | Booking confirmation | Confirm + reduce buyer's remorse |
| 1 week before trip | Email | Destination tips + packing list (curated, not generic) | Re-engage + add value |
| Trip day | SMS | "Have a great trip" + emergency contact | Brand presence on the moment |
| Day +3 (return) | Email | Review request + photo prompt | Capture review for future social proof |
| Month +1 | Email | "Where's next?" + featured destinations based on prior preferences | Repeat booking nurture |

### §9.3 Seller-rewards 10% mechanic (operational)
Every in-person sale logged with:
- Seller-of-record (Brendan or Les)
- Amount
- Auto-calc: 90% to seller, 10% to non-seller
- Stored in shared sheet → migrated to Supabase ledger post-launch

**Trust mechanism:** both partners can audit the ledger any time. Logging is the partnership's transparency layer — non-negotiable.

---

## §10 — PERFORMANCE REVIEWER (placeholder framework)

**Pre-launch:** N/A. No data to review.

**Post-launch (first 30 users) — track:**
| Metric | Target | Bad-band trigger |
|---|---|---|
| Landing page form-fill rate | 5–10% | <3% → revisit hook + headline |
| Email open rate (nurture) | 25%+ | <15% → revisit subject lines, list health |
| First-time booking conversion | 5% of email subscribers | <2% → revisit free preview + upgrade flow |
| Repeat booking rate | 30% within 6 months | <15% → revisit post-trip nurture sequence |
| Affiliate commission per booking | TBD per type | < projected → renegotiate partner deals |

**Post-launch decision trees** — fill in with real CPA / LTV data, mirror `skills/sonoview.md` §10 pattern:
- §10.1 — Form-fill rate < 3%
- §10.2 — 100+ form-fills, zero bookings
- §10.3 — Email open rate < 15%
- §10.4 — Booking conversion drops sudden
- §10.5 — Margin per booking falls below breakeven

---

## §11 — PROOF POINTS

**Empty until 30+ users / 10+ bookings.**

### Explicit rule
**Do not use TNT in cold sales pitches yet.** SonoView is the proof point until TNT has real numbers (per `skills/sonoview.md` §11). Mentioning TNT prematurely teaches the market we have a thing before we have a thing.

### When TNT is ready (post-30-users / post-10-bookings)
This section gets filled with:
- 3 stats Brendan/Les can drop verbatim (e.g., "X bookings, $Y AOV, $Z CPA from $30/day Meta")
- Anonymization defaults (named at scale, anonymous in early days unless partner consents)
- The "we built this in [N] months as a 50/50 partnership" founder narrative (LinkedIn fuel, not sales)

### What we never share — ever
- Les's personal financial details
- Specific user data from the app
- Internal seller-rewards ledger (the 90/10 splits stay private)

---

## §12 — STATUS LEGEND, CROSS-REFERENCES, CHANGE LOG

### Emoji legend (consistent across all skill files)
- 🟢 LIVE — running in production
- 🔴 PROTECT — existing revenue, lock in place
- 🟡 BUILDING / PAUSED / PLANNED — not currently running
- ⚪ DEFER or AVOID — explicitly out of scope for now

### Cross-reference index
| File | Section | What's there |
|---|---|---|
| `skills/marketing.md` | §3 row 10 | Niche table — defers here for ground truth |
| `skills/marketing.md` | §10 | Full TNT profile — defers here for ground truth |
| `skills/ads.md` | §8 | TNT pre-revenue defer block — points here |
| `skills/content.md` | §11.3 | TNT pre-revenue defer block — points here |
| `skills/content.md` | line 500 | First Meta ad creative built (not running) — operational note |
| `skills/sonoview.md` | §11 | Proof-point handoff rule — TNT defers to SonoView until live |
| `skills/website.md` | All design standards | Inherited (color palette, typography, animations, performance gates) |
| `skills/agent-architecture.md` | TBD | Add TNT to file index when ROCCO is live |
| `CLAUDE.md` | TNT mention | Slim profile — this file is the deep version |

### Change log
| Date | Section | Who | What | Why |
|---|---|---|---|---|
| [YYYY-MM-DD] | INIT | Brendan + ROCCO | File created — consolidates 6 fragmented sources, locks 50/50 + 90/10 partnership splits | Reframe TNT from misclassified "client" to canonical 50/50 partner project |

### Last updated
- **Date:** [fill on first edit after creation]
- **By:** Brendan
- **Lock notes:** §0 universal rules (revenue split, ROCCO trigger, beautiful UI) are LOCKED. All other sections updateable in normal cadence.

---

## §13 — APP TECH STACK

TNT is a product build, not a marketing campaign. This section captures the planned stack — every tool already on Brendan's CLAUDE.md stack. **No new dependencies introduced for TNT.**

### Frontend
- **Lovable** — initial scaffold + iteration (proven on SonoView, agency websites)
- **React + TypeScript** — Lovable output
- **21st.dev** — premium component library (select "Lovable" prompt type, paste into chat)
- **Magic UI** — animated components (Shimmer Buttons, Border Beams, Number Tickers, Animated Gradients, Marquees)
- **ReactBits** — advanced animations via Codespaces (BlurText, CountUp, AnimatedBackground, TiltedCard, GradualSpacing)
- **Framer Motion** — page transitions, scroll reveals, stagger effects, parallax

### Hosting + DNS
- **Vercel** — deployment, custom domain, edge functions
- **GHL or Namecheap** — domain registrar (defer to whichever holds existing TNT domain if registered)

### Backend
- **Supabase** — Postgres database, auth handoff, real-time itinerary updates, partner relationship records, revenue ledger (post-volume)
- **Supabase Edge Functions** — AI itinerary generation (calls to Claude API), partner API integrations
- **Brave Search API** — live destination research for itinerary AI

### Auth
- **Clerk** — user accounts, login, account management
- Magic link or social login default — minimize friction for travel-app onboarding

### AI / data
- **Claude API** — itinerary generation engine (Sonnet 4.6 default for cost efficiency, Opus 4.7 for premium tier if pricing allows)
- **NotebookLM** — research verification fact-check layer (validate destination tips before pushing to users)

### Media
- **Higgsfield.AI** — animate destination photos into hero videos for landing + in-app
- **Remotion** — programmatic video for "trip recap" content (auto-generated post-trip share-out, future feature)
- **Rotato** — iPhone + MacBook mockups for marketing collateral
- **Jitter.Video** — UI animations and transitions

### Monitoring
- **Sentry** — error tracking (catch booking flow failures fast — losing a booking is losing real revenue)
- **PostHog** — analytics (track funnel: budget input → preview → upgrade → booking → repeat)

### Lead-gen / outreach (post-launch)
- **Apollo.io** — partner outreach lead lists
- **Apify** — influencer scraping if needed

### Communication / ops
- **GHL** — email + SMS sequences (waitlist, nurture, post-trip)
- **Discord** — Brendan + Les internal comms (cross-link CLAUDE.md tool stack)
- **Google Workspace** — shared docs, partner agreement drafts, ledger sheet

### What we DON'T add
- No new SaaS subscriptions just for TNT — every tool above is paid for and integrated
- No backend framework outside Supabase Edge — keeps complexity low
- No mobile-native build day-one — responsive PWA on Vercel hits 90% of mobile use case at 10% of cost

### Dev workflow when build resumes
1. Brendan signals "ROCCO is done" → kickoff
2. Open Lovable → connect to GitHub repo → iterate scaffold
3. Codespaces for ReactBits / advanced components / Supabase migrations
4. IterationX for Les feedback on visual polish (per `skills/website.md` §5)
5. Sentry + PostHog wired before first user touch — never launch blind

---

## APPENDIX A — OPEN ITEMS / TODOs

These are explicit gaps. Each one has an owner and a trigger.

| # | Item | Owner | Trigger to resolve |
|---|------|-------|---------------------|
| 1 | ✅ RESOLVED — Les: original idea + in-person outreach. Brendan: builder + operator. | — | — |
| 2 | ✅ RESOLVED — Brendan: system / online final say. Les: general final say. Conflicts → talk to agreement. | — | — |
| 3 | ✅ RESOLVED (operating default) — partnership-trust model, talk to agreement. **Still need to formalize:** exit clause, IP ownership, deadlock fallback before any external money flows. | Brendan + Les | Before external money / large contracts |
| 4 | Domain + landing page status (registered? sketched?) | Brendan | Next solo work session |
| 5 | What's already built (paused state inventory) | Brendan | Next solo work session |
| 6 | B2B subscription pricing + B2C affiliate margin numbers | Brendan + Les | Pre-launch |
| 7 | Target ACV (B2B) + Target AOV (B2C) | Brendan + Les | Pre-launch |
| 8 | ICP validation plan — **ICP itself ✅ DEFINED** (primary B2B agencies, secondary B2C consumers); validation **plan still TBD** (demos-per-outreach? close rate? cohort size?) | Brendan + Les | Pre-launch |
| 9 | Brand voice + positioning (extract Les voice if Les writes copy) | Brendan + Les | Pre-launch |
| 10 | Partner outreach list (B2B target agencies + B2C affiliate partners) | Les (likely) | Post soft-launch |
| 11 | Pre-launch waitlist count (if any) | Brendan | Next solo work session |
| 12 | Whether the existing Meta ad creative (per content.md line 500) is the right hook — likely B2C-only; B2B needs its own creative | Brendan + Les | During positioning sprint |
| 13 | Color palette + typography for the brand | Brendan + Les | During brand sprint |
| 14 | Logo + visual identity status | Brendan + Les | During brand sprint |
| 15 | Revenue model split — B2B subscription vs license vs freemium; B2C affiliate vs paid premium tier | Brendan + Les | Pre-launch |
| 16 | **§5 channel plan revision for B2B primary** — LinkedIn outbound, cold email to agency owners, travel-industry conferences (Virtuoso, ASTA, Travel Weekly), partnership-led growth | Brendan + Les | Before launch — current §5 is B2C-only |
| 17 | **§4 unit economics dual-column** — B2B (sub / license, lower volume / higher ACV) + B2C (affiliate, higher volume / lower per-user) with separate breakeven math | Brendan + Les | Post-validation |
| 18 | **§13 tech stack multi-tenancy decision** — white-label via subdomain vs full-tenant model (each agency branded view). Decide before build resumes. | Brendan | Before build resumes |

When the remaining 15 items (1–3 resolved, 4–18 outstanding) are knocked out, this file is **operationally complete and ready for build kickoff**.

---

## APPENDIX B — CLEANUP TASKS FOR OTHER FILES

These are NOT part of the initial trade-n-travel.md build. Track separately and ship in a follow-up session. TNT is currently mislabeled across 6+ files — every reference needs to defer to this canonical file.

1. **CLAUDE.md** — update line 42 from "Trade N Travel — Affiliate travel, setup phase, no ads yet." → "Trade N Travel — 50/50 partnership with Les. AI travel planner. 🟡 BUILDING (paused, resumes post-ROCCO). See `skills/trade-n-travel.md`." Add to playbook index.

2. **`skills/marketing.md`** §3 row 10 — change "Existing client" → "50/50 partnership" + add `→ skills/trade-n-travel.md` defer pointer.

3. **`skills/marketing.md`** §10 — full TNT profile gets a `→ canonical: skills/trade-n-travel.md` defer pointer at top + replace "Brendan's affiliate travel project" with "Brendan + Les's 50/50 partner project."

4. **`skills/ads.md`** §8 — TNT pre-revenue block: defer pointer at top, no other changes (the defer logic is already correct).

5. **`skills/content.md`** §11.3 — TNT defer block: add canonical pointer, update "Brendan's affiliate travel project" wording, keep "deferred until offer validation" rule.

6. **`skills/agent-architecture.md`** — add `skills/trade-n-travel.md` to file index when build resumes; flag partner status (not client).

7. **`MEMORY.md`** index — add new entry: `- [Trade N Travel partner playbook (skills/trade-n-travel.md)](trade_n_travel_playbook.md) — 50/50 partnership with Les, AI travel planner, 🟡 BUILDING (paused post-ROCCO), 50/50 online + 90/10 in-person seller-rewards split`

8. **`memory/marketing_playbook.md`** — fix "existing client" framing for TNT to "50/50 partner."

9. **`memory/trade_n_travel_playbook.md`** — save individual memory file with frontmatter (name, description, type=project) capturing partnership splits + build sequence + ROCCO dependency.

When Appendix B is done across all files, TNT is fully canonicalized as a partner project and every reference in the repo points back here.
