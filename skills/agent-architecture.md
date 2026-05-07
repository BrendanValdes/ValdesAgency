# ROCCO — Agent Architecture
**The org chart. 8 Masters. Who owns what. How they hand off.**

Owner: Brendan Valdes | Last updated: 2026-05-07
Read order: CLAUDE.md (persona) → THIS FILE (orchestration) → skills/*.md (execution)

---

## PURPOSE

CLAUDE.md tells you WHO ROCCO is.
This file tells you WHICH MASTER owns the task and HOW they hand off when work crosses divisions.
The per-topic playbooks (`skills/*.md`) tell you HOW to execute inside a Master.

If a task touches more than one Master → use the contracts in §6.
If you don't know which Master owns it → use the routing in §5.
If a Master playbook exists → load it before answering.

---

## §1 — THE THREE-TIER STACK

```
TIER 1   ROCCO              persona, voice, frameworks       → CLAUDE.md
TIER 2   8 MASTERS          orchestration, routing, contracts → THIS FILE
TIER 3   SUB-AGENTS         execution                         → .claude/skills/* + skills/*.md
```

ROCCO is one voice. The 8 Masters are how that voice splits the workload. Sub-agents are the 67+ skills installed at `.claude/skills/` plus the per-Master playbooks in `skills/`.

---

## §2 — ORG CHART AT A GLANCE

| # | Master | Owns | Status | Feeds → | Fed by ← |
|---|---|---|---|---|---|
| 1 | **Build** | Sites, landing pages, CRO, copy, code | PARTIAL | Google Ads, Meta Ads, Sales+Ops | Marketing, Content, Sales+Ops |
| 2 | **Google Ads** | Google Ads campaigns + tracking | PARTIAL | Intelligence, Sales+Ops | Sales+Ops, Build, Marketing, Intelligence |
| 3 | **Meta Ads** | Facebook/Instagram ads | PLANNED | Intelligence, Sales+Ops | Sales+Ops, Build, Content, Intelligence |
| 4 | **TikTok Ads** | TikTok ads + short-form | PLANNED | Intelligence, Sales+Ops | Sales+Ops, Content, Intelligence |
| 5 | **Marketing** | Strategy, positioning, frameworks, pricing, **outreach design (sequences, channels, hooks)** | PARTIAL | Content, Build, all Ads, Sales+Ops | Intelligence |
| 6 | **Content** | Social, video, newsletter, voice | PLANNED | all Ads, Build | Marketing, Intelligence |
| 7 | **Intelligence** | Research, recon, customer/competitor intel | PLANNED | Marketing, all Ads, Content | all Ads (perf data), Sales+Ops |
| 8 | **Sales and Ops** | Sales execution (Tyler dials, discovery, close), GHL pipeline ops, lifecycle delivery, daily ops, vault hygiene | LIVE (sales) | Build, all Ads, Intelligence | Build, all Ads, **Marketing (designed sequences)** |

LIVE = playbook exists, contracts work today
PARTIAL = skills work, playbook stub
PLANNED = skills installed, no playbook yet, contracts documented but not battle-tested

---

## §3 — THE 8 MASTERS (FULL BREAKDOWN)

---

### 1. BUILD MASTER
**Owns:** Every pixel and line of code that ships to a client or to the agency itself — websites, landing pages, conversion optimization, copy on the page, design system, deployment.
**Status:** PARTIAL — skills installed, no `skills/build.md` yet
**Callsign (optional):** Brick

**Sub-agents** (`.claude/skills/`):
- `homepage-audit` → outputs `HomepageAudit`
- `page-cro` → outputs `CROReport`
- `signup-flow-cro` → outputs `SignupFlowReport`
- `form-cro` → outputs `FormReport`
- `popup-cro` → outputs `PopupSpec`
- `onboarding-cro` → outputs `OnboardingPlan`
- `paywall-upgrade-cro` → outputs `PaywallSpec`
- `copywriting` → outputs `PageCopy`
- `copy-editing` → outputs `EditedCopy`
- `site-architecture` → outputs `Sitemap`
- `ui-ux-pro-max` → outputs `UISpec`
- `image` → outputs `ImageAssets`
- `schema-markup` → outputs `SchemaJSON` (technical SEO that lives on the page)
- `gitnexus` → outputs `ImpactReport` (call BEFORE any code edit per CLAUDE.md)

**Playbook:** `skills/build.md` — TBD (priority #2 in build order)

**Tools / MCP:** Lovable, Vercel, Supabase, Clerk, Sentry, PostHog, 21st.dev, Magic UI, uiguideline.com, Remotion, Higgsfield.AI, Jitter, Motionsites.ai, ReactBits, Framer Motion, Rotato, IterationX, Kombai, GitNexus

**Routing triggers:**
- "build me a site" / "landing page" / "homepage" / "hero section"
- "CRO" / "conversion" / "this page isn't converting" / "redesign"
- "write copy for" / "rewrite this page" / "headlines"
- "form / popup / signup flow / onboarding"
- "schema markup" / "structured data" / "rich snippets"
- Any code edit in the repo (gitnexus first)

**Feeds →** Google Ads (landing page live → conversion tracking), Meta Ads (LP for ad), Sales+Ops (site delivered → onboarding handoff)
**Fed by ←** Marketing (positioning + brand brief), Content (hero copy, video assets), Sales+Ops (closed deal → site brief)

**Default next move when called:** Read the brief. Pull design inspiration from designspells.co. Run Council LCM if pricing/positioning is unclear. Then scaffold pages → write copy → ship.

---

### 2. GOOGLE ADS MASTER
**Owns:** Google Ads campaign strategy, structure, creative, bidding, optimization, tracking. Primary paid service for pool clients.
**Status:** PARTIAL — SonoView running ($30/day), CPL framework documented in CLAUDE.md, no `skills/google-ads.md` yet
**Callsign (optional):** Hunter

**Sub-agents:**
- `paid-ads` (Google subset) → outputs `CampaignPlan`
- `ad-creative` (RSA headlines, descriptions, sitelinks) → outputs `AdCreativeSet`
- `ab-test-setup` → outputs `ExperimentSpec`
- `analytics-tracking` → outputs `TrackingPlan` (GA4, GTM, conversion events)

**Playbook:** `skills/google-ads.md` — TBD (priority #3 in build order)

**Tools / MCP:** Google Ads API, Google Tag Manager, GA4, PostHog (event mirror)

**Routing triggers:**
- "Google Ads" / "Google campaign" / "search campaign" / "PMax"
- "RSA" / "responsive search ad" / "ad headlines"
- "CPL is too high" / "Google CPC" / "quality score"
- "set up tracking" (Google-side) / "GA4 / GTM"
- "learning phase" / "optimize Google ads"

**Feeds →** Intelligence (weekly perf data → next-cycle insights), Sales+Ops (CPL/booking data for client report)
**Fed by ←** Sales+Ops (closed deal → kickoff brief, budget, geo, services), Build (LP live → tracking can fire), Marketing (positioning → ad angle), Intelligence (audience research → targeting)

**Default next move when called:** Pull current account state. Check learning phase status. Reference CLAUDE.md SonoView CPL targets ($20–35 GOOD, $35–55 OK, $55+ FIX). Diagnose before suggesting changes. Never block geo terms.

---

### 3. META ADS MASTER
**Owns:** Facebook + Instagram ads — campaign structure, creative testing, audiences, tracking, optimization.
**Status:** PLANNED — skills installed, not yet active for any client
**Callsign (optional):** Mirror

**Sub-agents:**
- `paid-ads` (Meta subset) → outputs `CampaignPlan`
- `ad-creative` (Meta variants — image, carousel, video) → outputs `AdCreativeSet`
- `ab-test-setup` → outputs `ExperimentSpec`

**Playbook:** `skills/meta-ads.md` — TBD (priority #5 in build order)

**Tools / MCP:** Meta Business Suite, Meta Ads API, Pixel + CAPI

**Routing triggers:**
- "Facebook ads" / "Meta ads" / "Instagram ads" / "Reels ads"
- "creative testing" / "static vs video ad"
- "lookalike audience" / "interest targeting"
- "Meta CPL" / "Meta ROAS" / "Pixel firing"

**Feeds →** Intelligence (perf data), Sales+Ops (lead/conversion data for report)
**Fed by ←** Sales+Ops (kickoff brief), Build (LP), Content (video/static creative), Intelligence (audience insights)

**Default next move when called:** Confirm Pixel + CAPI fire correctly. Set up creative test (3+ angles minimum). Do not optimize before signal.

---

### 4. TIKTOK ADS MASTER
**Owns:** TikTok paid + organic short-form for ad context. Last priority because pool companies aren't TikTok-first.
**Status:** PLANNED — defer until first non-pool client or until Brendan tests TikTok for pools
**Callsign (optional):** Spark

**Sub-agents:**
- `paid-ads` (TikTok subset) → outputs `CampaignPlan`
- `ad-creative` (TikTok-native) → outputs `AdCreativeSet`
- `video` (short-form scripts + production) → outputs `VideoAsset`
- `ab-test-setup` → outputs `ExperimentSpec`

**Playbook:** `skills/tiktok-ads.md` — TBD (priority #8 in build order)

**Tools / MCP:** TikTok Ads Manager, TikTok Pixel, Remotion (animated cuts), Higgsfield (image-to-video)

**Routing triggers:**
- "TikTok ads" / "TikTok creative" / "Spark Ads" / "TikTok Pixel"
- "short-form video ad"
- Any TikTok-specific platform question

**Feeds →** Intelligence (perf data), Sales+Ops (leads)
**Fed by ←** Content (raw creative + script), Sales+Ops (kickoff), Intelligence (trend signals via reddit-insights / last30days)

**Default next move when called:** Validate the offer is TikTok-native (problem-aware + visual). If not, route back to Marketing for angle work first.

---

### 5. MARKETING MASTER
**Owns:** Strategy, positioning, ICP, pricing, messaging frameworks, organic SEO direction, launches, case studies, testimonials, **outreach design (cold email sequences, channel mix, niche selection, Review Scraper SOP, FB groups strategy)**. The brain that decides WHAT we say, HOW we differentiate, and WHICH channel + sequence to deploy.
**Status:** PARTIAL — `skills/marketing.md` LIVE; sub-domains still expanding
**Callsign (optional):** Compass

**Sub-agents:**
- `positioning-basics` → outputs `PositioningDoc`
- `product-marketing-context` → outputs `MarketingContext`
- `marketing-psychology` → outputs `PsychLens`
- `marketing-principles` → outputs `PrinciplesApplied`
- `marketing-ideas` → outputs `IdeaList`
- `pricing-strategy` → outputs `PricingPlan`
- `launch-strategy` → outputs `LaunchPlan`
- `content-strategy` → outputs `ContentStrategy`
- `competitor-alternatives` → outputs `AlternativePage`
- `case-study-builder` → outputs `CaseStudy`
- `testimonial-collector` → outputs `TestimonialSet`
- `free-tool-strategy` → outputs `FreeToolPlan`
- `aso-audit` → outputs `ASOReport`
- `community-marketing` → outputs `CommunityPlan`
- `seo-audit` → outputs `SEOAudit` (organic strategy)
- `ai-seo` → outputs `AIVisibilityPlan`
- `programmatic-seo` → outputs `pSEOPlan`
- `cold-email` → outputs `EmailSequence` *(shared with Sales+Ops — Marketing OWNS sequence design, Sales+Ops OWNS execution)*
- `cold-outreach-sequence` → outputs `LinkedInSequence` *(shared with Sales+Ops — same split)*
- `email-sequence` → outputs `LifecycleSequence` *(shared with Sales+Ops — Marketing designs lifecycle flows, Sales+Ops executes via GHL automations)*

**Playbook:** `skills/marketing.md` — **LIVE** (11 niches, Vegas markets, channel mix, cold sequences, Review Scraper SOP, FB groups, GHL marketing view, positioning matrix, Council LCM examples)

**Tools / MCP:** Brave Search, NotebookLM (fact-check), Apollo.io (lead lists), Apify (Review Scraper), Google Sheets, GHL (custom fields + import), positioning frameworks, Council LCM (CLAUDE.md)

**Routing triggers:**
- "positioning" / "ICP" / "value prop" / "messaging"
- "pricing" / "package" / "what should I charge"
- "launch" / "go-to-market" / "GTM"
- "SEO" / "ranking" / "keywords" (organic, not page-level — for page-level go to Build)
- "case study" / "testimonial" / "social proof"
- "cold email design" / "outreach sequence" / "channel mix" / "what channel should I use"
- "11 niches" / "niche selection" / "expand to a new niche"
- "Vegas markets" / "Vegas zip codes" / "neighborhood targeting"
- "Review Scraper" / "review audit" / "personalization hook"
- "Facebook groups" / "FB group strategy"
- Anything triggering Council LCM (strategy / pricing / clients / growth / money)

**Feeds →** Content (strategy → calendar), Build (positioning → site brief), all Ads (angle → creative), **Sales+Ops (positioning → cold script, designed sequences → execution)**
**Fed by ←** Intelligence (research → positioning input)

**Default next move when called:** Load `skills/marketing.md`. If task is strategic → run Council LCM (5 lenses). If task is sequence design → produce sequence + handoff to Sales+Ops via Contract C13. Never produce abstract advice — output the doc, the sequence, or the decision.

---

### 6. CONTENT MASTER
**Owns:** Social posts, threads, videos, newsletters, voice/tone documentation, repurposing. Both agency content (Brendan's LinkedIn/Twitter) and client content.
**Status:** PLANNED — skills installed, no `skills/content.md` yet
**Callsign (optional):** Echo

**Sub-agents:**
- `content-idea-generator` → outputs `IdeaList`
- `social-content` → outputs `PostBatch`
- `social-card-gen` → outputs `PlatformVariants`
- `newsletter-creation-curation` → outputs `NewsletterIssue`
- `tweet-draft-reviewer` → outputs `TweetScore` + rewrite
- `voice-extractor` → outputs `VoiceGuide`
- `video` → outputs `VideoAsset`
- `youtube-summarizer` → outputs `VideoSummary`
- `de-ai-ify` → outputs `HumanizedCopy`
- `linkedin-authority-builder` → outputs `LinkedInSystem`
- `linkedin-profile-optimizer` → outputs `ProfileRewrite`

**Playbook:** `skills/content.md` — TBD (priority #7 in build order)

**Tools / MCP:** Remotion, HeyGen, Higgsfield, Jitter, Motionsites, Brave Search

**Routing triggers:**
- "tweet" / "thread" / "LinkedIn post" / "Reels" / "TikTok video"
- "newsletter" / "email content"
- "what should I post" / "content ideas"
- "make this sound human" / "remove AI tone"
- "voice guide" / "ghostwriting"
- "repurpose this content"

**Feeds →** all Ads (creative + scripts), Build (hero copy, page video assets)
**Fed by ←** Marketing (strategy + positioning), Intelligence (pain points + trends)

**Default next move when called:** Pull voice guide if it exists. Pull Marketing positioning if it exists. Generate 3+ angles before drafting. Never single-shot a post.

---

### 7. INTELLIGENCE MASTER
**Owns:** Pre-action research. Customer mining, competitor profiling, Reddit/X/web scans, AI search visibility audits, audience insights. The recon arm.
**Status:** PLANNED — skills installed, no `skills/intelligence.md` yet
**Callsign (optional):** Hawk

**Sub-agents:**
- `customer-research` → outputs `ICPDoc` + `JTBDList`
- `competitor-profiling` → outputs `CompetitorProfile`
- `reddit-insights` → outputs `PainList` + `TrendSignal`
- `last30days` → outputs `TrendReport` (Reddit + X + web, last 30d)
- `ai-discoverability-audit` → outputs `AIVisibilityReport`

**Playbook:** `skills/intelligence.md` — TBD (priority #4 in build order)

**Tools / MCP:** Brave Search API, Reddit MCP, Apollo.io, Apify, NotebookLM (verification)

**Routing triggers:**
- "research" / "competitive analysis" / "competitor"
- "ICP" / "customer interviews" / "JTBD"
- "find pain points" / "what do customers say"
- "trend" / "what's hot in [niche]"
- "AI search visibility" / "how do I show up in ChatGPT"
- ANY task that wants "data" before "decisions" → start here

**Feeds →** Marketing (positioning input), all Ads (audience targeting), Content (hooks, angles)
**Fed by ←** all Ads (perf data → next research cycle), Sales+Ops (qualified call notes → ICP refinement)

**Default next move when called:** Define the question precisely. Set scope (one competitor vs landscape, one subreddit vs cross-platform). Output structured doc, never raw notes.

---

### 8. SALES AND OPS MASTER
**Owns:** Sales **execution** — Tyler's dials, discovery calls, proposals, closes. GHL pipeline operations + automations. Lifecycle delivery (sending the sequences Marketing designed). Daily ops + internal vault hygiene.
**Status:** LIVE — `skills/sales.md` is the completed execution playbook. Lifecycle + ops sub-playbooks still PARTIAL.
**Callsign (optional):** Closer

**Sub-agents:**
- `sales-enablement` → outputs `SalesAsset` (deck, one-pager, objection doc)
- `meeting-prep` → outputs `MeetingBrief`
- `lead-magnets` → outputs `LeadMagnetSpec`
- `churn-prevention` → outputs `ChurnPlan`
- `revops` → outputs `RevOpsPlan`
- `referral-program` → outputs `ReferralProgram`
- `directory-submissions` → outputs `DirectoryList`
- `plan-my-day` → outputs `DayPlan`
- `daily-briefing-builder` → outputs `MorningBrief`
- `vault-cleanup-auditor` → outputs `VaultReport`
- `go-mode` → orchestrator for autonomous goal execution
- `cold-email` *(shared — see Marketing for design; Sales+Ops sends)*
- `cold-outreach-sequence` *(shared — see Marketing for design; Sales+Ops sends)*
- `email-sequence` *(shared — see Marketing for design; Sales+Ops executes via GHL)*

**Playbook:** `skills/sales.md` — LIVE. Lifecycle + ops sub-playbooks TBD.

**Tools / MCP:** GHL, Discord, Railway, Google Workspace, Apollo.io, Apify, MCP Knowledge Graph

**Routing triggers:**
- "cold call" / "Tyler" / "dial" / "discovery call" / "proposal" / "close"
- "GHL" / "pipeline" / "lead status" / "GHL automations"
- "send the sequence" / "execute the sequence" / "run the email"
- "churn" / "cancel" / "save offer" *(execution; Marketing designs)*
- "plan my day" / "what should I do today"
- ANY revenue-generating task → priority #1 per CLAUDE.md

**Feeds →** Build (closed deal → site brief), all Ads (closed deal → kickoff brief), Intelligence (call notes → ICP refinement), **Marketing (call notes + dial outcomes → sequence iteration)**
**Fed by ←** Build (site delivered → onboarding email), all Ads (perf data → client report), **Marketing (designed sequences for execution via Contract C13)**

**Default next move when called:** Check GHL pipeline state first. Reference `skills/sales.md` for any execution question; reference `skills/marketing.md` for any sequence/strategy question. Cold calls are #1 priority — interrupt other work if a sales blocker shows up.

---

## §4 — ROUTING LOGIC

How ROCCO decides which Master owns a task.

### TIER 1 — Keyword routing (single-Master tasks)

Most tasks resolve to one Master via keywords in the user input. See each Master's "Routing triggers" above. Special cases:

- **"ads" alone is ambiguous** → ROCCO asks: Google, Meta, or TikTok? (Or routes to all three if it's a portfolio question.)
- **"copy" alone** → context determines: page copy → Build, ad copy → relevant Ads Master, social copy → Content, email copy → Sales+Ops or Content depending on cold vs lifecycle.
- **"SEO"** → organic strategy/keywords/audit → Marketing. On-page schema/technical → Build.
- **"video"** → ad video → relevant Ads Master, social/organic video → Content.

### TIER 2 — Multi-Master detection (cross-division tasks)

Trigger phrases that always span Masters. ROCCO announces the route before starting.

| Trigger | Master sequence |
|---|---|
| "Onboard new client" | Sales+Ops → Intelligence → Marketing → Build → Ads (per package) |
| "Launch a new service line" | Marketing → Content → Build → Ads |
| "Audit a client" | Intelligence → Marketing → all active Ads |
| "Build a campaign for [client]" | Intelligence → Marketing → Build (LP) → relevant Ads Master |
| "Why aren't leads converting?" | Intelligence (data) → Marketing (positioning) → Build (page) → Ads (creative) |
| "Write our agency's [X]" | Marketing (positioning) → Content (draft) → Build (if page) |

### TIER 3 — Council LCM trigger

If the task touches **strategy, pricing, clients, growth, or money** → run Council LCM (CLAUDE.md) BEFORE handing off to a single Master. The 5 lenses (Marketing, Revenue, Ops, Strategy, Finance) decide whether the framing is right; only then route to the executing Master.

### Three-rule routing (extends CLAUDE.md)

1. If a Master playbook exists for the topic → load it first, then act.
2. If no playbook but skills exist → invoke the Master's skill cluster directly.
3. If neither → flag the gap, do the work this session, propose adding to that Master's playbook next session.

---

## §5 — INTER-MASTER CONTRACTS (JSON)

When work crosses Masters, the handoff is a structured JSON object. ROCCO produces and consumes these in conversation. LIVE = use today. PLANNED = schema is the design intent; manually approximate until automated.

### Base envelope (all contracts)

```json
{
  "from": "{master}.{sub-agent}",
  "to": "{master}.{sub-agent}",
  "client": "string",
  "task_id": "string",
  "timestamp": "ISO-8601",
  "status": "LIVE | PLANNED",
  "payload": { },
  "next_action": "string"
}
```

---

### LIVE CONTRACTS

#### C1 — `Sales+Ops → Build` :: client-onboarding-to-site

```json
{
  "from": "sales-ops.close",
  "to": "build.site-brief",
  "client": "Acme Pool Co",
  "task_id": "onboard-acme-pool-2026-05",
  "timestamp": "2026-05-07T14:30:00-07:00",
  "status": "LIVE",
  "payload": {
    "package": "Site + Google Ads $1500/mo",
    "services_offered": ["pool cleaning", "equipment repair", "green pool recovery"],
    "service_area": ["Las Vegas", "Henderson", "Summerlin"],
    "brand": {
      "name": "Acme Pool Co",
      "tagline_existing": "string | null",
      "colors_existing": ["hex", "hex"] ,
      "logo_url": "string | null"
    },
    "phone": "+1XXXXXXXXXX",
    "owner_contact": { "name": "string", "email": "string" },
    "ghl_subaccount_id": "string",
    "deadline": "2026-05-14",
    "notes": "Owner wants emphasis on weekly maintenance, NOT one-time cleans"
  },
  "next_action": "Pull design inspo, draft hero + service sections, review with owner before code"
}
```

#### C2 — `Sales+Ops → Google Ads` :: client-onboarding-to-google

```json
{
  "from": "sales-ops.close",
  "to": "google-ads.kickoff",
  "client": "Acme Pool Co",
  "task_id": "google-kickoff-acme-2026-05",
  "timestamp": "2026-05-07T14:30:00-07:00",
  "status": "LIVE",
  "payload": {
    "monthly_ad_spend": 1500,
    "daily_cap": 50,
    "service_area_geos": ["Las Vegas NV", "Henderson NV", "Summerlin NV"],
    "primary_services": ["pool cleaning", "weekly maintenance"],
    "cpl_targets": { "good": "20-35", "acceptable": "35-55", "fix": "55+" },
    "phone_for_call_extension": "+1XXXXXXXXXX",
    "landing_page_url": "TBD by Build",
    "ga4_property": "TBD",
    "gtm_container": "TBD"
  },
  "next_action": "Wait for Build → landing-page-to-tracking handoff before launching, then build campaign skeleton"
}
```

#### C3 — `Sales+Ops → Meta Ads` :: client-onboarding-to-meta

```json
{
  "from": "sales-ops.close",
  "to": "meta-ads.kickoff",
  "client": "Acme Pool Co",
  "task_id": "meta-kickoff-acme-2026-05",
  "timestamp": "2026-05-07T14:30:00-07:00",
  "status": "LIVE",
  "payload": {
    "monthly_ad_spend": 1000,
    "service_area_geos": ["Las Vegas NV+25mi"],
    "facebook_page_url": "string",
    "instagram_handle": "string",
    "pixel_id": "TBD",
    "capi_token": "TBD (env var)",
    "creative_seeds_from_content": "Awaiting Content → creative-to-ad-variants"
  },
  "next_action": "Confirm Pixel + CAPI before launch. Request 3 creative angles from Content."
}
```

#### C4 — `Build → Google Ads` :: landing-page-to-tracking

```json
{
  "from": "build.deploy",
  "to": "google-ads.tracking-setup",
  "client": "Acme Pool Co",
  "task_id": "tracking-acme-2026-05",
  "timestamp": "2026-05-09T10:00:00-07:00",
  "status": "LIVE",
  "payload": {
    "landing_page_url": "https://acmepool.com/lp/google",
    "conversion_events": [
      { "name": "form_submit", "selector": "#lead-form", "value_default": 100 },
      { "name": "phone_click", "selector": "a[href^='tel:']", "value_default": 100 }
    ],
    "ga4_measurement_id": "G-XXXXXXX",
    "gtm_container_id": "GTM-XXXXXXX",
    "ghl_webhook_url": "https://services.leadconnectorhq.com/...",
    "tested_in_preview": true
  },
  "next_action": "Mirror conversions into Google Ads, set as primary, wait for 30 conversions before optimizing"
}
```

---

### PLANNED CONTRACTS

#### C5 — `Intelligence → Marketing` :: research-to-positioning

```json
{
  "from": "intelligence.competitor-profiling",
  "to": "marketing.positioning-basics",
  "client": "Acme Pool Co",
  "task_id": "positioning-acme-2026-05",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "competitors_profiled": [
      { "name": "string", "url": "string", "angle": "string", "weakness": "string" }
    ],
    "icp_findings": { "demographics": {}, "psychographics": {}, "jtbd": [] },
    "pain_points_top_5": ["string"],
    "language_used_by_customers": ["verbatim phrases"],
    "competitive_gap": "string — the angle nobody owns"
  },
  "next_action": "Marketing produces positioning doc + recommended hero message"
}
```

#### C6 — `Marketing → Content` :: strategy-to-calendar

```json
{
  "from": "marketing.content-strategy",
  "to": "content.content-idea-generator",
  "client": "Acme Pool Co | Valdes Agency",
  "task_id": "calendar-q3-2026",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "positioning_summary": "string",
    "icp": "string",
    "content_pillars": ["pillar 1", "pillar 2", "pillar 3"],
    "platforms": ["LinkedIn", "Twitter", "Reels"],
    "cadence": { "linkedin": "3/wk", "twitter": "daily", "reels": "2/wk" },
    "top_keywords_seo": ["string"],
    "voice_guide_path": "skills/voice/{client}.md | null"
  },
  "next_action": "Content generates 30-day idea bank + first week's drafts"
}
```

#### C7 — `Content → Meta Ads` :: creative-to-ad-variants

```json
{
  "from": "content.video",
  "to": "meta-ads.ad-creative",
  "client": "Acme Pool Co",
  "task_id": "creative-acme-2026-05",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "creative_assets": [
      { "type": "video", "url": "string", "duration_s": 15, "angle": "string" },
      { "type": "image", "url": "string", "angle": "string" }
    ],
    "headlines_seed": ["string", "string", "string"],
    "primary_text_seed": ["string", "string"],
    "cta": "Get a Free Quote"
  },
  "next_action": "Meta Ads builds 3 ad sets × 3 creatives, launches in CBO"
}
```

#### C8 — `Content → TikTok Ads` :: script-to-tiktok-creative

```json
{
  "from": "content.video",
  "to": "tiktok-ads.ad-creative",
  "client": "Acme Pool Co",
  "task_id": "tiktok-creative-acme-2026-05",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "scripts": [
      { "hook": "string (first 1.5s)", "body": "string", "cta": "string", "duration_s": 15 }
    ],
    "format": "UGC | green-screen | demo",
    "music_brief": "string | null",
    "captions_required": true
  },
  "next_action": "TikTok Ads validates Spark Ads handle, launches with 3 hooks"
}
```

#### C9 — `All Ads → Intelligence` :: performance-to-insights (weekly)

```json
{
  "from": "{google-ads | meta-ads | tiktok-ads}.weekly-report",
  "to": "intelligence.next-cycle",
  "client": "Acme Pool Co",
  "task_id": "perf-week-19-2026",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "channel": "google | meta | tiktok",
    "spend": 350,
    "leads": 12,
    "cpl": 29.17,
    "booked": 3,
    "cost_per_booked": 116.67,
    "winning_creative": ["asset_id"],
    "losing_creative": ["asset_id"],
    "search_terms_winners": ["string"],
    "search_terms_losers": ["string"],
    "audience_winners": ["string"]
  },
  "next_action": "Intelligence updates ICP doc + feeds new angles to Marketing/Content"
}
```

#### C10 — `Marketing → Sales+Ops` :: positioning-to-cold-script

```json
{
  "from": "marketing.positioning-basics",
  "to": "sales-ops.cold-outreach-sequence",
  "client": "Valdes Agency (internal)",
  "task_id": "cold-script-pool-vegas-v3",
  "timestamp": "ISO",
  "status": "LIVE",
  "payload": {
    "icp_segment": "5-20 employee pool service companies, Vegas",
    "core_message": "string (one-liner)",
    "top_3_pain_points": ["string"],
    "differentiator": "string",
    "proof_to_drop": ["SonoView CPL", "case study link"],
    "objection_responses": [
      { "objection": "string", "response": "string" }
    ]
  },
  "next_action": "Sales+Ops updates Tyler's call script + email templates per skills/marketing.md §10 positioning matrix"
}
```

#### C11 — `Build → Sales+Ops` :: site-live-to-handoff

```json
{
  "from": "build.deploy",
  "to": "sales-ops.client-onboarding",
  "client": "Acme Pool Co",
  "task_id": "site-live-acme-2026-05",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "site_url": "https://acmepool.com",
    "lighthouse_scores": { "performance": 95, "seo": 100, "a11y": 92 },
    "lcp_s": 1.8,
    "tracking_verified": true,
    "ghl_forms_wired": true,
    "client_walkthrough_video_url": "string",
    "credentials_handoff": "1Password vault link"
  },
  "next_action": "Sales+Ops sends client onboarding email, updates GHL stage to 'live', schedules week-1 check-in"
}
```

#### C12 — `Intelligence → All Ads` :: audience-to-targeting

```json
{
  "from": "intelligence.customer-research",
  "to": "{google-ads | meta-ads | tiktok-ads}.targeting",
  "client": "Acme Pool Co",
  "task_id": "audience-acme-2026-05",
  "timestamp": "ISO",
  "status": "PLANNED",
  "payload": {
    "primary_persona": {
      "demographics": {},
      "income_band": "string",
      "home_value_band": "string",
      "psychographics": {}
    },
    "google_keyword_themes": ["string"],
    "google_negative_themes": ["string"],
    "meta_interest_seeds": ["string"],
    "meta_lookalike_seed_event": "purchase | lead | bookrate-3",
    "tiktok_hashtag_themes": ["string"],
    "geo_radius_recommendation_mi": 15
  },
  "next_action": "Each Ads Master applies platform-specific targeting"
}
```

---

#### C13 — `Marketing → Sales+Ops` :: cold-sequence-deploy (LIVE)

Marketing designs a cold email + LinkedIn sequence (per `skills/marketing.md` §6). Sales+Ops executes (Tyler dials replies + GHL automations send the touches). This contract is the handoff.

```json
{
  "from": "marketing.cold-email",
  "to": "sales-ops.dial",
  "client": "Valdes Agency (internal)",
  "task_id": "cold-batch-pool-vegas-2026-05",
  "timestamp": "2026-05-07T14:00:00-07:00",
  "status": "LIVE",
  "payload": {
    "niche": "pool-service",
    "geo_target": ["Las Vegas NV", "Henderson NV", "Summerlin NV", "Enterprise NV"],
    "batch_size": 50,
    "review_scraper_run_id": "apify-run-{{id}}",
    "sequence_version": "pool-5touch-v1 (skills/marketing.md §6)",
    "merge_fields_required": [
      "owner_first_name",
      "business_name",
      "rating",
      "review_count",
      "negative_theme",
      "response_gap"
    ],
    "ghl_tag": "cold-pool-2026-05",
    "engaged_handoff_trigger": "replied | clicked | opened-3plus",
    "tyler_call_window": "Tue-Thu 8-10am or 2-4pm",
    "expected_reply_rate_baseline": 0.05
  },
  "next_action": "Sales+Ops triggers sequence in GHL; Tyler watches inbox daily; engaged contacts dialed within 2 hours of signal; outcomes feed back to Marketing for v2 iteration"
}
```

---

## §6 — BUILD ORDER

Order to write the per-Master playbooks. Driven by **revenue impact + foundational dependency**.

| # | Master | Why this order | Playbook to write |
|---|---|---|---|
| 1 | Sales and Ops | `sales.md` is LIVE. Finish lifecycle (email-sequence, churn) + ops integration. Cold calls are #1 priority (CLAUDE.md). | `skills/sales.md` ✅ + extend with lifecycle |
| 2 | Marketing | `skills/marketing.md` LIVE. Owns niche selection, channel mix, cold sequence design, Review Scraper SOP — direct upstream of sales execution. | `skills/marketing.md` ✅ |
| 3 | Build | Primary deliverable for clients. Without sites, ads have nowhere to send traffic. | `skills/build.md` |
| 4 | Google Ads | Primary paid service for pool clients. CPL framework already drafted. | `skills/google-ads.md` |
| 5 | Intelligence | Research backbone every other Master leans on. Building this 5th unlocks better outputs everywhere. | `skills/intelligence.md` |
| 6 | Meta Ads | Second paid service offered. | `skills/meta-ads.md` |
| 7 | Content | Agency growth (Brendan's LinkedIn/Twitter) + client content. Important but not on critical path. | `skills/content.md` |
| 8 | TikTok Ads | Pool companies aren't TikTok-first. Defer until first non-pool client or until tested for pools. | `skills/tiktok-ads.md` |

This is the order for **per-Master playbooks**. The architecture file (this doc) ships in one pass with all 8 Masters defined.

---

## §7 — HOW DIVISIONS CONNECT

ASCII flow showing data movement across Masters during a typical client lifecycle.

```
                          ┌──────────────────┐
                          │  INTELLIGENCE    │
                          │  (research)      │
                          └────────┬─────────┘
                  ┌────────────────┼────────────────┐
                  ↓ ICPDoc         ↓ Audience       ↓ PainList
         ┌────────────────┐ ┌────────────┐ ┌────────────────┐
         │   MARKETING    │ │    ADS*    │ │    CONTENT     │
         │  (positioning) │ │ (targeting)│ │   (hooks)      │
         └───────┬────────┘ └─────┬──────┘ └───────┬────────┘
                 │ Strategy       ↑                │ Creative
                 ↓                │                ↓
         ┌──────────────┐         │         ┌────────────┐
         │   CONTENT    │         └─────────┤    ADS*    │
         │  (calendar)  │                   │ (creative) │
         └───────┬──────┘                   └─────┬──────┘
                 │                                │
                 ↓ HeroCopy                       │
         ┌──────────────┐                         │
         │    BUILD     │ ←───────────────────────┘
         │  (the site)  │   LP for ads
         └───────┬──────┘
                 │ site-live-to-handoff (C11)
                 ↓
         ┌─────────────────────┐
         │   SALES + OPS       │ ← acquisition (cold calls in)
         │ (delivery + life-   │ → all Ads kickoff (C2, C3)
         │   cycle + CRM)      │ → Build site brief (C1)
         └─────────────────────┘
                 ↑
                 │ performance-to-insights (C9)
                 │
              ALL ADS → INTELLIGENCE (next cycle)

* ADS = Google + Meta + TikTok (parallel; choose by client + budget)
```

**Two ROCCO heuristics from this diagram:**
1. Intelligence is upstream of almost everything. When in doubt, start there.
2. Sales+Ops is both upstream (acquisition) AND downstream (delivery, lifecycle, perf reporting). It's the agency's spine.

---

## §8 — STATUS LEGEND + MAINTENANCE

**Status values:**
- **LIVE** — playbook (`skills/{name}.md`) exists, tested in production, contracts work today.
- **PARTIAL** — skills installed, contracts documented, no playbook OR playbook is stub.
- **PLANNED** — skills installed, contracts are design intent only, no playbook, not battle-tested.

**When to update this file:**
- New client onboarded → no change (use existing contracts).
- New skill installed at `.claude/skills/` → add it under the right Master in §3.
- New per-Master playbook written → flip that Master's Status from PARTIAL/PLANNED to LIVE in §2 + §3.
- New cross-Master workflow discovered → add the contract in §5.
- Master renamed or split → update everywhere (this is rare; do it deliberately).

**Memory hooks:**
- Save key decisions, client status, what was built to MCP Knowledge Graph at session end.
- Use `/workspaces/ValdesAgency/memory/brain-dump.md` as the cross-Master scratch pad mid-task.

**Cross-references:**
- `CLAUDE.md` → ROCCO persona, voice, frameworks, current playbook index. Update its index to point here once this file lands.
- `skills/sales.md` → reference template for tone + format of future per-Master playbooks.
- `.claude/skills/` → 67+ sub-agents. Don't reorganize; this file points to them.
- `AGENTS.md` + `.gitnexus/` → code intelligence layer. Build Master uses gitnexus before any code edit.

---

**End of architecture.**
**Three-rule reminder:** playbook exists → load it. Skills exist → invoke them. Neither → flag the gap, do the work, propose the playbook.
