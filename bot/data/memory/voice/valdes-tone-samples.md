# Valdes Agency: Voice Tone Samples

**Purpose:** Trained voice anchor for ROCCO's content generation. Loaded into the Tier 2 baseline samples stack at weight 0.45 (heaviest single anchor in valdes.yaml voice_anchors).
**Source:** 12-scenario A/B/C tone selection conducted with Brendan Valdes.
**Method:** For each scenario, three tone options were drafted. Brendan picked one, or rejected all three and provided direction. Picks become voice anchors. Overrides become guardrails. Two scenarios are DORMANT until unlock criteria are met. One scenario is permanently BANNED.
**Last reviewed:** 2026-05-21
**Version:** 1.0
**Weight in valdes.yaml voice_anchors:** 0.45

This file is **self-contained**. A reader does not need to open valdes.yaml, skills/sales.md, CLAUDE.md, or any other file to understand the voice. All banned words, banned structures, "always use" rules, dormancy unlock criteria, and master guardrails are embedded inline at the end.

---

## Voice Fingerprint

The voice is short, specific, owner-to-owner. Stories carry the lessons, not the other way around. Specific numbers ("30 companies, 24 of them") earn the right to make a claim before the claim arrives. Named people and named places ("Steve," "Henderson") anchor stories in reality. Practical beats provocative. One strong idea fully expanded beats list-of-three. Authority through demonstrated discipline, never founder-vulnerability. Plain English a ten-year-old understands. No corporate speak, no marketing speak, no dashes.

---

## How to Read This File

Each scenario below has the same shape:
- **Scenario [N]: [name]** + one-line context
- **Picked:** Option [A/B/C] + the picked text quoted verbatim (or **USER OVERRIDE** with direction quoted verbatim)
- **Why this fits my voice:** analytical annotation (cadence, stance, vocabulary, what it rejects, cross-references)
- For DORMANT scenarios: status banner + unlock criteria + alternate pattern (if any)
- For OVERRIDE scenarios: voice direction + guardrails reference + 3 sample outputs ROCCO uses as pattern reference
- For BANNED scenarios: detection rules + examples of blocked vs allowed content

**Status legend:**
- (no banner): ACTIVE pattern, ROCCO generates posts in this voice freely
- **STATUS: DORMANT**: pattern blocked until unlock criteria met (see Manual Review Notes)
- **STATUS: USER OVERRIDE**: original A/B/C options rejected, generate using direction + samples
- **STATUS: BANNED PATTERN**: permanent block, no version of this gets auto-generated

---

## Scenario 1: Educational post about a marketing mistake pool companies make

**Context:** Standard educational/teardown post for LinkedIn, Facebook, or carousel platforms.

**Picked:** Option B (Storyteller)

**Picked text:**
> Called 30 pool companies in Vegas last week. Looked at each of their websites first. Same exact problem on 24 of them. Phone number lives in the header. Then disappears. Someone reads about your services, gets interested, and has to hunt for how to reach you. They don't hunt. They leave. Easy fix. Doesn't even cost anything.

**Why this fits my voice:**
- **Specific numbers earn the lesson before delivering it.** "30 pool companies" and "24 of them" land in the first two sentences. The reader believes the writer because the writer did the work. Pattern matches META-PATTERN rule #2 (specific numbers that earn believability).
- **Cadence:** 7 sentences, range 4 to 14 words. Short and punchy throughout. No sentence exceeds the 20-word cap. Matches the cadence in skills/sales.md cold-call openers and the v2 cold-script's diagnostic ladder.
- **Stance:** Direct field observation, not authority claim. "Same exact problem on 24 of them" reads as evidence, not "studies show." Owner-to-owner energy.
- **Vocabulary:** Zero banned words. No "leverage," no "optimize," no "elevate." "Easy fix. Doesn't even cost anything." closes concrete and unhedged.
- **What it rejects:**
  - Option A (Direct teacher) leads with the lesson before earning it. "Most pool companies in Vegas have the same problem" is a claim. "Called 30 of them" is evidence.
  - Option C (Hot take) opens abstract ("Your website's job is one thing") instead of with specific evidence. Hot-take posture isn't this voice.
- **Banned-structure check:** Clean. No "Most people think X. But really Y." No "Here's the thing." No "Three things I learned." No "Stop doing X. Start doing Y."
- **Cross-reference:** Reinforces the "Numbers are credibility. Never 'lots of leads.' Always '10 leads in 30 days.'" rule from skills/sales.md VOICE NOTES.

---

## Scenario 2: Behind-the-scenes post about building ROCCO

**Context:** Infrastructure/build post, mid-week. Shows the agency's tech depth without explaining the why.

**Picked:** Option A (Excited builder)

**Picked text:**
> Spent today wiring my AI system to GoHighLevel. 253 tools connected. ROCCO can now read every contact, every pipeline, every workflow in real time. Means I never lose track of a lead again. This is the part of running an agency people don't see. The boring infrastructure that makes the loud results possible.

**Why this fits my voice:**
- **Confident builder energy.** "253 tools connected" is the specific that makes the claim land. Number first, claim second.
- **Cadence:** 6 sentences, range 6 to 16 words. Slightly longer rhythm than Scenario 1 because this is build-energy, not teardown-energy. Both stay under the 20-word cap.
- **Stance:** Stays on the work, not the meta-commentary. Does NOT say "I'm doing this before clients arrive" or "this is why I'm building first." Confident, not self-aware-to-the-point-of-insecure.
- **Vocabulary:** Zero banned words. No "leverage," "level up," "ecosystem." "Boring infrastructure" lands hard precisely because it refuses to call the work exciting.
- **What it rejects:**
  - Option B (Quiet confidence) over-explains the "this is the work nobody posts about" meta. Reads like rationalizing.
  - Option C (Self-aware) opens "more infrastructure than I've made in revenue" which is founder-vulnerability framing. Off-brand.
- **Banned-structure check:** Clean.
- **Cross-reference:** Matches the "Hype wins loud and specific. Not 'good job', '3 booked out of 60 dials, that's a 5% book rate, that's legit'" rule from CLAUDE.md ROCCO voice block.

---

## Scenario 3: Social proof post (named client + outcome metric)

**STATUS: DORMANT** until first verifiable + shareable client outcome exists.

**Picked:** Option B (Story-led)

**Picked text (target voice for when this scenario activates):**
> Steve runs a pool company in Henderson. He was spending $1,200 a month on Google ads and getting maybe 2 new customers from it. Numbers didn't add up. So I looked at his actual funnel. The ads were fine. The leak was between someone clicking and someone calling. Fixed it in a day. 11 new customers last month, same ad spend.

**Why this fits my voice (when activated):**
- **Story-led with named anchors.** "Steve" + "Henderson" + "$1,200" + "2 new customers" → "11 new customers." Names + numbers carry the whole story. Stories with names always outperform stats without them (META-PATTERN #3).
- **Cadence:** 9 sentences, range 3 to 18 words. Tight rhythm with one longer middle sentence for variation.
- **Stance:** Diagnosis-then-fix narrative. Not "we transformed their marketing." Just "Numbers didn't add up. So I looked. Fixed it in a day."
- **Vocabulary:** Zero banned words. "Fixed" not "optimized." "Funnel" lands as concrete noun, not marketing-speak (everyone knows what a funnel is in service business context).
- **What it rejects:**
  - Option A (Numbers-led) front-loads the metric and treats it as the hook. Story-first beats stat-first.
  - Option C (Counterintuitive) abstracts the lesson ("most marketing problems aren't marketing problems") instead of letting the story carry it.

**Until unlocked, ROCCO MUST NOT generate this pattern. Falls back to industry-observation framing** (no named client, no specific dollar amounts attributed to a real client, no before/after metric claims). Example fallback:

> Most pool company funnels leak between ad click and phone call. The ads work. The follow-up doesn't. Easy to spot when you actually look. Almost nobody actually looks.

**Unlock criteria (see Manual Review Notes for full spec):**
1. **Gate A (auto):** At least 1 KG entity of type `ClientOutcome` exists for valdes brand with ALL 8 required fields populated AND `verifiable: true` AND `shareable: true`.
2. **Gate B (manual):** `valdes.yaml` field `feature_flags.scenario_3_client_proof_unlocked: true` (added in Gate 3; default false).

Both gates required. KG-only fails on "real client never publicly consented." Flag-only fails on "LLM hallucinates client from training-data priors."

---

## Scenario 4: Personal/founder post (the "why")

**STATUS: USER OVERRIDE.** All three original options rejected.

**User direction (verbatim):**
> "Showing authority and the grind, not full detail of my situation. Maybe just show the grind of cold calling and explaining that, not exactly what I got going on."

**Voice direction for this scenario type:**
- Generic grind-aesthetic content
- No real numbers or real situation details
- Authority positioning, not founder-vulnerability
- The aesthetic of work without revealing actual position
- Posts about cold calling reality, dial discipline, the gap between strategy and execution, what early-stage selling actually looks like

**Guardrails:** See "Master Guardrails List" below. Applies to Scenarios 4, 9, 11.

**Sample outputs ROCCO uses as pattern reference:**

1. > Spent 4 hours dialing pool companies today. The tone of the first 4 seconds decides whether you get a real conversation or a brushoff. Different skill from selling. Has to be trained separately. Most agency owners never learn this part.

2. > Cold calling is the part most agency owners outsource. Buy a setter, hand off the dials, never hear what owners actually say on the phone. You learn more in 50 dials than in 50 case studies. The hard part is also the cheapest research available.

3. > Strategy looks great in a deck. Holds up worse on a Tuesday at 2pm with a list of 80 dials in front of you. The gap between strategy and execution is where most agencies lose.

---

## Scenario 5: Industry commentary (reacting to a trend or news)

**Context:** Reactive post when Google Ads, Meta, GBP, or another platform ships a change that affects local service businesses.

**Picked:** Option C (Practical)

**Picked text:**
> Quick note for any pool/HVAC/landscaping companies running Google Ads. Costs went up 20-30% this month. Don't panic and increase budget. Audit your landing pages first. Most of the cost increase can be offset by better conversion rate. Took me 10 minutes to find 3 fixes on a pool company's site yesterday.

**Why this fits my voice:**
- **Practical beats provocative.** Saves better than hot takes. Specific number (20-30%) plus personal anecdote (10 minutes, 3 fixes) makes it actionable.
- **Cadence:** 6 sentences, range 6 to 16 words. Tight. Each sentence delivers a discrete instruction.
- **Stance:** Practitioner advice, not pundit critique. "Don't panic and increase budget" is direction, not opinion.
- **Vocabulary:** Zero banned words. "Audit" lands as concrete verb. "Conversion rate" is industry jargon but standard.
- **What it rejects:**
  - Option A (Analytical) is technically right but reads like a commentator. "Boring answer. Right answer." closes flat.
  - Option B (Provocative) attacks other agencies. Hot-take posture again, not this voice.
- **Banned-structure check:** Clean. Note: opens with "Quick note for" which is a soft directive opener, NOT a rhetorical question.
- **Cross-reference:** Matches the "Direct, not pushy. Curious, not interrogating." rule from skills/sales.md VOICE NOTES.

---

## Scenario 6: TikTok hook-driven version of an educational point

**Context:** Same core idea as Scenario 1 reformatted for TikTok. First 1.5 seconds decide whether the viewer keeps watching.

**Picked:** Option C (Conversational)

**Picked text:**
> Real quick. If you own a service business, go look at your website on your phone. Scroll halfway down the page. Can you find your phone number without scrolling back up? If no, that's why your site doesn't convert. Easy fix. Add the number in more places.

**Why this fits my voice:**
- **Conversational opening lands on TikTok.** "Real quick" sounds like talking to someone. "If you own a service business..." pulls the viewer in without dramatic posture.
- **Genuine diagnostic question, not rhetorical.** "Can you find your phone number without scrolling back up?" forces the viewer to actually try it. Diagnostic questions are allowed (manual review at approval; see Manual Review Notes for the rhetorical vs diagnostic distinction).
- **Cadence:** 7 sentences, range 2 to 13 words. Even shorter than Scenario 1 because TikTok pacing demands it. Sentences are fragments where natural.
- **Stance:** Talked to, not pitched at. Viewer feels included in figuring it out.
- **Vocabulary:** Zero banned words. "Easy fix" repeats the closer from Scenario 1, a consistent brand cadence.
- **What it rejects:**
  - Option A (Pattern interrupt) leads with a dramatic number ($4,000) that demands proof. Forces the viewer to either trust or hate it. Conversational is safer and more native.
  - Option B (Confrontational) "I know because I've checked 30 of them" sounds like a teardown. Not the right energy for TikTok casual browsing.
- **Banned-structure check:** Clean.
- **Note on question opener:** The opening_rhetorical_question regex was removed (regex can't distinguish "Want to know why?" rhetorical from "Can you find your phone number?" diagnostic). This post passes manual review because the question is specific, concrete, and actionable.

---

## Scenario 7: LinkedIn long-form post (B2B thought leadership)

**Context:** Long-form post targeting service business owners and other agency operators. 200-400 word range.

**Picked:** Option B (Personal observation)

**Picked text:**
> Spent the last 6 weeks studying 30 local service businesses in Vegas. Pool companies, pest control, HVAC, landscaping. Same problems showed up in every single niche. Outdated websites. No follow-up system. Reviews scattered across platforms. No way to track which marketing actually drives revenue. Local businesses don't need fancy marketing. They need the basics done well. The basics aren't sexy, which is why nobody sells them. That's the opportunity.

**Why this fits my voice:**
- **Personal observation beats authority claim on LinkedIn.** "Spent the last 6 weeks studying 30 local service businesses" delivers specific scope (6 weeks, 30 businesses, 4 niches) that makes credibility implicit instead of stated.
- **Cadence:** 11 sentences, range 4 to 13 words. Punchy throughout. Lists ("Pool companies, pest control, HVAC, landscaping") and fragments ("Outdated websites. No follow-up system.") create rhythm.
- **Stance:** Field researcher, not industry expert. Says "Same problems showed up" not "I have determined."
- **Vocabulary:** Zero banned words. "Outdated" not "antiquated." "Don't need fancy marketing. They need the basics done well." Plain English.
- **What it rejects:**
  - Option A (Authoritative) opens "The marketing industry has trained service business owners to think marketing is complicated," an authority claim without earning it. Voice is wrong for this brand.
  - Option C (Industry critique) attacks other agencies. Hot-take posture rejected (see Scenario 5).
- **Banned-structure check:** Clean. Note: closes with a brief reveal ("That's the opportunity") which is a fragment, not a "The takeaway is..." structure.
- **Cross-reference:** Reinforces META-PATTERN #6 (personal observation over authority claim).

---

## Scenario 8: Instagram before/after website screenshot caption

**STATUS: DORMANT** for the "we fixed this" framing. Same two-gate unlock as Scenario 3. Until unlocked, an alternate pattern is available immediately for v1.

**Picked:** Option A (Punchy), preserved as target voice when unlocked.

**Picked text (when unlocked):**
> Same pool company. Same business. Same owner. Three weeks apart. The before version was losing 5-8 customers a month. The after version isn't.

**Why this fits my voice (when activated):**
- **Instagram captions get scanned, not read.** 6 fragments deliver the whole story. Reader who cares swipes to see the images. Reader who doesn't moves on. Both outcomes are fine.
- **Cadence:** All short. Range 3 to 13 words. Maximum density per word.
- **Stance:** Implication, not explanation. The caption doesn't say "we fixed the booking flow." The carousel shows the work.
- **Vocabulary:** Zero banned words.
- **What it rejects:**
  - Option B (Walkthrough) lists three changes inside the caption. Too dense for IG; goes in the carousel slides instead.
  - Option C (Story) does the work the carousel should do. Caption is for the punchline.

**Until unlocked, ROCCO does NOT generate "we fixed this" framing.**

**Alternate pattern (active immediately, no unlock required): Annotated public-site teardown**

Premise: We screenshot a real public pool company website, annotate what's working and what's losing them calls. Never claim we did the fix. Just legitimate public commentary on a public-facing site.

**Sourcing × framing × example table:**

| Source method | File path / origin | Caption framing rule | Example caption |
|---|---|---|---|
| Lead-scrape screenshot | `memory/leads/screenshots/<lead-slug>.png` (existing pipeline output) | "Public site for a [niche] company in [neighborhood]. [N] working, [M] losing them calls." | "Public site for a pool company in Henderson. Two things working, four things losing them calls. Phone number disappears below the fold. Booking form sits below testimonials." |
| Manual upload | `memory/leads/screenshots/manual/<slug>.png` (Brendan drops file) | "Annotated this public [niche] site. Honest opinions, no affiliation." | "Annotated this Vegas pool company site this morning. Public-facing, no affiliation. Three things working, two things losing them calls." |
| Firecrawl on-demand | Live capture via Firecrawl MCP. Max 5/week per brand. | "Hot take on a public [niche] site. Owner can DM if they want it deleted." | "Hot take on a public Vegas pool company site. Owner can DM if they want it deleted. Two things working, three not." |
| Composite multi-site | Three or more distinct sites from any source above | "Looked at [N] [niche] sites this [week/month]. [Common pattern] on [M] of them." | "Looked at 5 pool company sites this week. Phone number disappears below the fold on 4 of them. Same fix on all 4: put the number every 2 sections." |

**Caption framing, what gets blocked (regex hard-fail, regen):**
- "we (fixed|redesigned|rebuilt|optimized|changed)"
- "(after|before) (we|our|my)"
- "(same|same exact) (business|site|owner)" (this pattern is banned in alt mode, only allowed when fully unlocked)
- "\\d+ (booked|new) (jobs|customers) (in|the next)"
- "worked with .+ to (fix|change|improve|redesign)"

**Caption framing, required disclosure (must include at least one):**
- "public site"
- "annotated"
- "no affiliation" / "not affiliated"
- "Owner can DM"
- "Hot take on a public"
- "Looked at [N]"

**Cross-reference to alternate pattern sample:**

> Annotated a public pool company site in Henderson this morning. Phone number lives in the header only. Disappears the moment someone scrolls. Booking form sits below 3 testimonial sections. 5 pool companies I've looked at this month have the same setup. Whoever fixes it first wins the next 12 months of Google-search calls.

---

## Scenario 9: Posting after a bad day (low calls, no answers)

**STATUS: USER OVERRIDE.** All three original options rejected.

**User direction (verbatim):**
> "Made 147 dials today. Few pickups. Got brushed off in 12 seconds. This is the part of building a business they don't tell you about. These are the days that build the mind."

**User clarification (verbatim):**
> "This shouldn't be real. Just produce the best content possible not related to my actual situation necessarily."

**Voice direction for this scenario type:**
- Grind aesthetic without revealing real numbers or situation
- Generic dial-grinding content for media consumption
- "The days that build the mind" type framing
- Authority-from-discipline angle, not vulnerability angle

**Guardrails:** See "Master Guardrails List" below.

**Sample outputs ROCCO uses as pattern reference:**

1. > Made a lot of dials today. Few pickups. Brushed off in 12 seconds on the ones I caught. This is the part of building a business they don't tell you about. These are the days that build the mind.

2. > Today was mostly voicemails. The grind looks unglamorous from the inside. The discipline isn't in the loud days. It's in showing up on the quiet ones.

3. > Some days the math is brutal. Most days are these days. The agencies that win aren't the ones with better dials. They're the ones that keep dialing on the days the math doesn't reward them yet.

---

## Scenario 10: "What I learned this week" recap

**Context:** Weekly roundup post. Friday slot in the calendar.

**Picked:** Option C (One lesson, fully expanded)

**Picked text:**
> One thing I learned this week. Almost every local business owner I talked to said the same thing about their marketing. "I don't really know what's working." Not "this isn't working" or "that's failing." Just "I don't know." That's the whole agency opportunity right there. They don't need someone to sell them more marketing. They need someone to tell them what's actually happening. Diagnosis before prescription.

**Why this fits my voice:**
- **One strong idea fully expanded beats list-of-three.** People remember one strong idea longer than three okay ones. Doesn't sound like an AI summary (META-PATTERN #7).
- **Cadence:** 9 sentences, range 4 to 14 words. Mostly short, with one mid-length quoted dialogue ("I don't really know what's working.") that creates rhythm break.
- **Stance:** Observation reported, not opinion delivered. The owner's quoted phrase carries the insight; the writer just frames it.
- **Vocabulary:** Zero banned words. "Diagnosis before prescription" lands as a memorable closer without being a "Bottom line..." structure.
- **What it rejects:**
  - Option A (Numbered list) opens "Three things I learned this week," which is the banned structure (three_things_list pattern).
  - Option B (Flowing) is competent but doesn't commit to one idea. Lists three lessons inside flowing prose; reads as compressed multi-points.
- **Banned-structure check:** Clean. NOT a "Three things I learned" list. The phrase "One thing I learned" sets up a single-idea expansion.

---

## Scenario 11: Motivational/grit post (dangerous to write)

**STATUS: USER OVERRIDE.** All three original options rejected.

**User direction (verbatim):**
> "These are the days that build the mind. This is what they don't tell you about running a marketing agency. Same thing, don't use my real info just whats going for the media."

**Voice direction for this scenario type:**
- Same grind-aesthetic angle as Scenario 9
- Generic "this is the work" framing without exposing real founder situation
- Authority positioning through demonstrated discipline, not through vulnerability

**Guardrails:** See "Master Guardrails List" below. Tight kinship to Scenario 9 (both use build-the-mind framing).

**Sample outputs ROCCO uses as pattern reference:**

1. > These are the days that build the mind. This is what they don't tell you about running a marketing agency. The strategy looks good on paper. The discipline is the part that breaks people.

2. > Motivational posts exist for the days you don't need them. The actual fuel is just doing the work nobody's watching. That's the whole game.

3. > Discipline isn't loud. It's the 80 dials nobody saw you make. The 12 voicemails. The one call that turned into a conversation. The math compounds because most people don't show up for the math.

---

## Scenario 12: First hot lead or first close (foreshadowing)

**STATUS: BANNED PATTERN.** Permanent. Not unlockable.

**User direction (verbatim):**
> "I should be portrayed as an expert from the jump."

**Why this is banned:** Expert-from-day-one positioning means no startup/founder progression narratives. Treating any client win as a "first" reads as founder-progression, not expert-positioning. There is no version of "first client signed" / "first deal closed" / "from $0 to..." that auto-generates.

**Detection rules (three prongs, all evaluated at draft validation in Gate 3):**

**Prong 1. Regex hard-block patterns:**
- `\b(my )?first (client|customer|deal|close|sale|signed?)\b`
- `\bsigned (my|our) first\b`
- `\b(today is the day|this is the moment|big news)\b`
- `\bI('m| am) (officially|finally|legally) (an?|the) (agency owner|entrepreneur|founder)\b`
- `\b\d+ (months?|weeks?|days?) in[,.]\s+(zero|0|no) clients?\b`
- `\bstarted (the|my) agency\b` within 80 chars of `\b(zero|nothing|0|no clients?)\b`
- `\b(milestone|breakthrough|first ever) (day|moment|deal|sale)\b`

**Prong 2. Keyword triggers (auto-flag for manual review):**
- "first client" / "first close" / "first deal" / "first sale" / "first signed"
- "agency milestone"
- "breakthrough day"
- "ground-breaking day"
- "from zero to"
- "made it official"

**Prong 3. Structural detection (warn, surface for manual review):**
- Past-tense recap of effort followed by present-tense win statement ("3 months of dialing. Today the math finally adds up.")
- Numbered list of struggles followed by "but" + win statement
- First half = before-state, second half = after-state, both self-referential to Brendan

**Alternate framing rule:** When real client wins exist (Scenario 3 fully unlocked), client wins get shared as "Here's what we did for a pool company this month. [work specifics]." Never "my first client." Never milestone framing.

**Examples that should BLOCK:**

1. > Today I signed my first client. 3 months of grinding to get here. Now the real work begins.

2. > Just closed our first deal. Pool company in Henderson. The math finally adds up.

3. > Signed deal #1. From $0 to $1,500/month MRR overnight.

**Examples that should PASS:**

1. > Worked with a pool company in Henderson this month. The biggest lift came from fixing their lead handoff. Their ad spend stayed the same; new customers came in faster.

2. > Spent the month dialing into Vegas pool service marketing. The pattern that surprised me: most owners can't articulate what's actually broken. Diagnosis before prescription, every time.

3. > New pool company brief landed this week. First call: review the funnel end-to-end. Same playbook we use on every engagement.

(Note on example 3: "first call" passes because the regex `\bfirst (client|customer|deal|close|sale|signed)\b` is precise about which nouns trigger the ban. "First call" is a procedure noun, not a milestone noun.)

**Architectural home (deferred to Gate 3):** New `voice.banned_scenarios` block in valdes.yaml schema. Distinct from `kg_blocked_patterns` (which is a source filter, not output filter). Both filters needed.

---

## Meta-Pattern. Voice Fingerprint (Full)

The 8 rules that emerged across all 12 picks. ROCCO uses these as the primary voice prior in every generation.

1. **STORY OVER STAT.** When telling lessons, lead with the story or the specific example, then deliver the lesson. Not the other way around.

2. **SPECIFIC NUMBERS THAT EARN BELIEVABILITY.** "30 companies, 24 had it" beats "most companies." Always name the number when it makes the claim real.

3. **NAMED PEOPLE, NAMED PLACES.** "Steve in Henderson" beats "a pool company owner." Names create memory.

4. **PRACTICAL OVER PROVOCATIVE.** Don't reach for hot takes. Reach for what people can actually do.

5. **CONVERSATIONAL ON SHORT-FORM.** TikTok and Instagram captions sound like talking to someone, not announcing.

6. **PERSONAL OBSERVATION OVER AUTHORITY CLAIM.** "I spent 6 weeks studying X businesses and noticed Y" beats "X businesses always do Y."

7. **ONE STRONG IDEA, FULLY EXPANDED.** Beats list-of-three or compressed multi-points.

8. **EXPERT POSITIONING, NEVER FOUNDER-VULNERABILITY.** Grind aesthetic is fine if generic. Real founder details are off-limits for auto-generated content.

---

## Manual Review Notes

### Rhetorical vs diagnostic question openers
The `opening_rhetorical_question` regex was removed from valdes.yaml banned_structures (Gate 1 Fix 4) because regex can't reliably distinguish a rhetorical question ("Want to know why most pool websites fail?") from a genuine diagnostic hook ("Can you find your phone number without scrolling back up?"). The first is filler; the second is a strong specific hook.

**During approval, if a draft opens with a question:**
- Genuine specific question with concrete noun (pool guy, Henderson, your phone) → APPROVE
- Vague rhetorical question ("Want to learn something?") → PULL or EDIT

### Scenario 3 unlock criteria
Two gates, both required:

**Gate A (auto KG check):** At least 1 KG entity of type `ClientOutcome` exists for valdes brand with ALL of:
- `client_name` (string, populated)
- `client_niche` (string, populated)
- `metric_name` (string, populated)
- `metric_value_before` (number)
- `metric_value_after` (number)
- `time_window` (string, populated)
- `verifiable: true` (client confirmed metric in writing)
- `shareable: true` (client explicitly consented to public use)

**Gate B (manual flag):** `valdes.yaml` field `feature_flags.scenario_3_client_proof_unlocked: true` (default false). Brendan flips when ready to publish client-proof posts. Schema field added in Gate 3 with `services/voice-check.ts`.

**Two-gate rationale:** KG-only allows publishing without client consent. Flag-only allows LLM to hallucinate clients. Together: real outcome + Brendan's deliberate decision.

### Scenario 8 dormancy + alternate pattern
Same two-gate unlock as Scenario 3 for the "we fixed this" framing (Option A). Until unlocked, ONLY the alternate pattern (annotated public-site teardown) is allowed.

Alternate pattern enforcement:
- **Three-layer regex check** (negative regex hard-fail + required disclosure hard-fail + soft cause-effect warn)
- **Source metadata** must indicate `lead_scrape` / `manual_upload` / `firecrawl_ondemand` / `composite_multi_site`
- **Firecrawl cap:** 5 captures per week per brand to keep cost sane
- **Override:** Brendan can react with 🔓 in #content-valdes to override a layer-1 hard block (rare, for edge cases)

### Scenario 12 banned-pattern enforcement
Three-prong detection (regex + keyword list + structural). Hard block on Prong 1. Auto-flag for manual review on Prong 2 + 3. Permanent, no unlock.

Alternate framing for client wins (once Scenario 3 unlocks): "Worked with a pool company in [neighborhood] this month. Here's what we did." Work-specifics framing, no progression narrative.

### Specificity check on every draft
Every draft must include at least 1 of:
- Dollar amount
- Percentage
- Named industry (pool / HVAC / pest / landscaping / etc.)
- Named neighborhood (Henderson / Summerlin / Vegas / etc.)
- Specific business type

Soft fail (warn in #content-valdes, don't block). Drafts without any concrete reference read as generic, usually fixable with a one-word edit.

---

## Master Guardrails List (for Scenarios 4, 9, 11)

The grind-aesthetic scenarios (4, 9, 11) generate from generic discipline framing, never from Brendan's actual situation. Rules:

| Rule | Why |
|---|---|
| **No real numbers from Brendan's life.** "147 dials," "$0 MRR," "$330 overhead," "first client": all banned in auto-content. | User direction: "shouldn't be real. Just produce the best content possible not related to my actual situation." |
| **Generic dial / discipline / build-the-mind framing only.** | User direction: "Authority positioning through demonstrated discipline, not through vulnerability." |
| **No specific named businesses or people from Brendan's actual world.** | Same as above. Keeps content media-positioned, not founder-confessional. |
| **No timelines tied to real dates.** "3 months in" → banned. "Today" / "this week" / generic time markers → allowed. | Specific timelines anchor to real founder progression. Generic ones don't. |
| **"These are the days that build the mind" framing IS allowed.** | User direction includes this exact phrase. Quote it or echo its shape. |
| **Authority signal > vulnerability signal.** "I'm grinding because I'm new" → banned. "This is the work, period" → allowed. | Expert-from-day-one positioning anchor. |
| **No "first client" / "first close" / "first deal" milestone narrative.** | Scenario 12 specifically. Portrayed as expert from the jump. |

---

## Embedded Voice References (self-contained, no external lookup required)

The authoritative banned-words and banned-structures lists live in `config/brands/valdes.yaml`. This file's inline copy is a snapshot for self-contained reading. If the YAML changes, this file should be re-synced.

### Hard Banned Words (38 entries)

leverage, unlock, dive in, deep-dive, deep dive, game-changer, game changer, level up, hustle, grind (as verb), journey, mindset, value-add, value add, synergy, ecosystem, robust, seamless, cutting-edge, cutting edge, paradigm, ROI (unless paid ads context), pivot, scale (as verb), 10x, north star, double-click, double click, circle back, master, optimize (use "fix" or "improve"), revolutionize, transform, empower, elevate, curate, craft (as verb), foster, drive (as verb meaning cause)

### Hard Banned Structures (7 patterns, plain-language)

- "Most people think X. But really Y."
- "Here's the thing."
- "Three things I learned..."
- "In today's [adjective] world..."
- "Stop doing X. Start doing Y."
- "It's not X. It's Y." (overused contrast)
- Closing summary: "The takeaway is..." / "Bottom line..."

**Removed (Gate 1 Fix 4):** The `opening_rhetorical_question` pattern was removed. Regex can't distinguish rhetorical from diagnostic openers. See Manual Review Notes above for the manual-review rule.

### Always Use

- Sentences under 20 words when possible
- Words a 10-year-old understands
- Specific concrete nouns (named industry / neighborhood / dollar / business type)
- Numbers and details over claims
- Plain English
- One clear idea per post
- Active voice
- No dashes

---

## How ROCCO Uses This File

- **Weight in valdes.yaml voice_anchors: 0.45** (heaviest single anchor, vs sales.md 0.25, email-sequences.md 0.15, vegas-pool-scripts-v2.md 0.15)
- **Loaded into Tier 2 content-generation system prompt** at draft time
- **Smart embedding (deferred to Gate 3):** Always-loaded core (Voice Fingerprint + Meta-Pattern + Banned Words + Banned Structures + Always Use + Master Guardrails, ~80 lines / ~1,000 tokens) plus the relevant scenario's section on-demand (~400 tokens). Keeps API cost per generation under the 3,000-token sample cap.
- **Each scenario's annotation included as instruction prior**, not just sample text. The "why this fits" rationale teaches ROCCO why a pick is right, not just what to imitate.
- **Dormancy + banned-pattern checks run BEFORE drafting** (Gate 2 source-filter) AND at draft validation (Gate 3 output-filter). Defense in depth.
- **When Scenario 3 or 8 unlocks**, this file gets re-synced with updated status banners (DORMANT → ACTIVE) and the alternate-pattern sections become reference-only.

---

## Change Log

- **2026-05-21:** v1.0 created. 12 scenarios documented from voice review. Scenarios 3 + 8 marked DORMANT pending first client outcome + manual flag. Scenarios 4, 9, 11 marked OVERRIDE with grind-aesthetic guardrails. Scenario 12 marked BANNED PATTERN permanently. The opening_rhetorical_question regex was removed from banned_structures per Gate 1 Fix 4.
