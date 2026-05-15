# Website Build Operating System
**Scope:** From design brief → live, delivered website
**Reads:** Brendan (sole builder)
**Trigger:** Read this BEFORE any client website work — design brief, Lovable, components, niche playbook, delivery
**Goal:** Every site looks like it cost $15k. 7–10 days from brief to handoff. Same playbook, every client.

---

## THE BUILD MOTION — OVERVIEW

Seven phases. In order. No skipping.

1. **BRIEF** — designspells reference + AI design brief. The blueprint.
2. **FOUNDATION** — Lovable structure prompt. The skeleton.
3. **COMPONENTS** — 21st.dev + Magic UI + uiguideline upgrades. The polish.
4. **ADVANCED** — ReactBits via GitHub/Codespaces. The standout features.
5. **HERO VIDEO** — Higgsfield, 2-photo method. The cinematic edge.
6. **FEEDBACK + DNS** — IterationX, domain, https. The pre-launch loop.
7. **DELIVERY** — Rotato mockups, handoff email. The $10k feel.

**Target time:** 7–10 days from signed proposal to delivered site. Beat that, you're scaling. Slower than that, you've got a process leak — find it.

---

## PHASE 0 — DESIGN BRIEF (NEVER SKIP)

Skipping this = generic Lovable output that looks like every other AI site. Every $15k-feel site started with a real brief.

### Step 1: Reference hunt
Go to **designspells.co** → find 2–3 reference sites that match the client's vibe. Screenshot them. Save to `/workspaces/ValdesAgency/clients/[client-name]/references/`.

### Step 2: AI design brief (paste into Claude with the screenshots)
> "You are a world-class web designer. Based on these reference sites and this client info: [paste]. Write a complete design brief: exact color palette with hex codes, typography pairing (display + body from Google Fonts), layout style, hero concept with headline + subheadline copy, section-by-section breakdown with layout notes, CTA placement strategy, mobile considerations, 2–3 specific animations that would elevate this above generic."

### Step 3: Save the output
This is your Lovable blueprint. Don't open Lovable until this exists.

### Step 4: Sanity check
Read the brief out loud. If a section is vague ("modern, clean, professional") — push back, get specific. "Modern" means nothing. "Cabinet Grotesk for headlines, deep navy + gold accent, generous spacing, hero takes 100vh" means something.

---

## PHASE 1 — LOVABLE FOUNDATION

The master prompt template. Fill in the brackets, paste into Lovable. One shot.

```
Build a [niche] service website for [business] in [city].

DESIGN:
- Colors: [primary hex] + [accent hex] + white
- Fonts: [display] for headlines, [body] for text
- Style: [3 adjectives — pulled from the design brief]

SECTIONS IN ORDER:
1. Hero — [concept + headline + CTA]
2. Trust signals — [years, jobs done, rating]
3. Services — [list with descriptions]
4. Why Us — [3-4 differentiators]
5. Reviews — Google review section
6. Service Area — cities covered
7. Final CTA — phone + form
8. Footer — NAP + links

REQUIREMENTS:
- Mobile first, 375px tested
- Smooth scroll behavior
- Hover states on all interactive elements
- No placeholder images — use colored backgrounds with text for now
- Make it look like a premium agency built this, not a template
```

### Iteration rule
**One section at a time. Never change everything at once.** The moment you ask Lovable to "redo the whole thing" you lose work.

### Iteration prompt
> "In the [section] section only: [change]. Keep everything else exactly the same."

### What good looks like after Phase 1
- All 8 sections present
- Mobile renders cleanly at 375px
- Colors match the brief
- Typography matches the brief
- No placeholder images (use colored backgrounds with text)
- Site is ugly-but-correct. Not pretty yet. That comes in Phase 2.

---

## PHASE 2 — COMPONENT UPGRADES

This is where ugly-but-correct turns into premium.

### 21st.dev workflow
1. Browse 21st.dev → find the component (hero variant, pricing card, testimonial layout)
2. Click "Get Code" → select **Lovable** prompt type
3. Copy the generated prompt → paste directly into Lovable chat
4. Lovable swaps in the new component, keeps everything else

### Magic UI workflow
- magicui.design → copy component
- Paste into Lovable: "Add this Magic UI component to [section]: [paste code]"
- Best Magic UI picks: ShimmerButton, BorderBeam, NumberTicker, Marquee, AnimatedGradientText

### uiguideline.com workflow
- Best for: navbars, pricing tables, testimonial cards, CTA sections
- Same paste-to-Lovable flow as Magic UI

### Stagger animation (paste into Lovable)
> "Add Framer Motion: hero elements stagger in on load (0s, 0.2s, 0.4s). Each section fades up 20px on scroll entry."

### Component priority list (in order of impact)
1. **ShimmerButton** on primary CTA — pulses, draws the eye
2. **CountUp** for social proof — "500+ Pools Serviced" counter
3. **Animated gradient** behind hero — subtle, never loud
4. **BorderBeam** on service cards — gives them premium edge
5. **Marquee** for partner logos / certifications

---

## PHASE 3 — REACTBITS (Advanced)

For when Magic UI isn't enough. Real React work.

### Setup (one-time per project)
1. Lovable Settings → Connect to GitHub
2. Open the repo in GitHub Codespaces (free for Brendan with Pro)
3. Terminal: `npm install`

### Workflow per component
1. reactbits.dev → find component → copy code
2. Codespaces: Create `/src/components/[Name].tsx` → paste code → save
3. Back in Lovable: "Import [Name] from components/[Name] and use it for the [hero headline / service cards / etc.]"
4. Lovable wires it in.

### Top 5 ReactBits worth the setup time
1. **BlurText / SplitText** — hero headlines animate letter by letter on load. Cinematic.
2. **CountUp** — number triggers when scrolled into view ("500+ Pools Serviced")
3. **ShimmerButton** — better than Magic UI's version, more control
4. **AnimatedBackground** — subtle gradient that shifts, never overwhelming
5. **FadeIn on scroll** — service cards and testimonials reveal as you scroll

### When NOT to use ReactBits
If Magic UI or 21st.dev already covers it. Don't add complexity for the sake of it.

---

## PHASE 4 — HERO VIDEO

The single biggest differentiator between a $5k site and a $15k site.

### Higgsfield.AI workflow
1. Get a high-quality client photo (or use a stock pool / family / clinic photo)
2. Upload to Higgsfield.AI
3. Generate animation (subtle camera move usually wins — pan, push-in, parallax)
4. Download MP4
5. Drop into `/public/hero-video.mp4`
6. Lovable prompt:
   > "Add full-viewport looping muted autoplay video to hero. Dark gradient overlay (rgba(0,0,0,0.4)). Text and CTA on top, centered."

### Nate Herkha 2-photo method
Take 2 photos → create transition → build into hero. Best uses:
- **Pool service:** Green pool → crystal clear blue (the transformation IS the sales pitch)
- **Ultrasound:** Parent's face → baby on screen (the emotional sequence)
- **Landscaping:** Overgrown yard → manicured paradise

### Jitter.Video
Use when Higgsfield doesn't fit. UI motion, transitions between sections, animated logos. Lighter weight than Higgsfield.

### Motionsites.ai
Reference library. Browse for cinematic site ideas, pull the patterns into your build.

### Remotion (brief mention)
Remotion = React-code video tool. Use it for: animated explainer videos, programmatic ad creative (auto-generate 50 variants), branded testimonial montages. NOT part of standard website build — bring it in for special asks. Full Remotion docs in `.claude/skills/` (search `remotion`).

---

## PHASE 5 — CLIENT FEEDBACK

The pre-launch loop. Where deals get killed by chaos if you don't run it tight.

### IterationX setup
1. Deploy Lovable → get preview URL
2. iterationx.com → New project → paste URL → copy feedback link

### Send-to-client email template
> Subject: Your site preview — leave feedback here
>
> [Client name] — first preview is up.
>
> Click the link below. You can click anywhere on the page to leave a comment directly on the design.
>
> [IterationX link]
>
> Two revision rounds included. Send all comments by [date 3 days out]. After that we go live.
>
> — Brendan

### Hard rule: TWO REVISION ROUNDS MAX
State this in the proposal AND the delivery email. Round 3+ = scope creep = new project pricing.

### How to handle vague feedback
- "Make it pop" → "Pop how — bigger headline, bolder color, more animation? Send me a reference."
- "I don't love the colors" → "What about them? Too dark, too light, wrong vibe? What feeling are you missing?"
- "Can we add another section?" → "Yes, $X. Want me to send a quick scope add?"

Never argue with a real preference. Argue with vague preferences and scope creep.

---

## PHASE 6 — DOMAIN + DNS

### Domain purchase
- **Preferred:** Buy through GHL (they handle DNS automatically with their funnels)
- **Backup:** Namecheap (cheaper, but manual DNS)

### DNS setup (Namecheap → Lovable)
- Lovable Settings → Custom Domain → copy the IP and CNAME
- Namecheap → Advanced DNS:
  - **A record** — Host: `@` → Value: [Lovable's IP]
  - **CNAME** — Host: `www` → Value: [Lovable's domain]
- Save. Wait.

### Verification
- **dnschecker.org** — paste the domain, check propagation across regions
- Propagation usually <2 hours, can take up to 48
- Verify `https://` works AND `http://` redirects to `https://`
- Test on mobile data (different DNS resolver than home wifi sometimes)
- Test from incognito (rule out cached DNS)

### Common gotcha
If www works but the bare domain doesn't (or vice versa), the A record is missing. Check both.

---

## PHASE 7 — DELIVERY

This is what makes delivery feel like $10k. Don't skip the mockups.

### Screenshots
- Hero — desktop 1440×900
- Full page scrolling — desktop 1440×full-height
- Mobile — 375×full-height (iPhone SE size — most restrictive)

### Rotato mockups
1. Open Rotato (Mac app)
2. Drop hero screenshot into iPhone 15 Pro frame → export PNG
3. Drop full-page screenshot into MacBook frame → export PNG
4. Optional: Export the iPhone version as MP4 with subtle rotation animation (premium feel)

### Delivery email (template)
> Subject: Your new site is live — here's the walkthrough
>
> [Client name] —
>
> [Site name] is live at [URL].
>
> Quick 3-min walkthrough: [Loom link]
>
> [Mockup PNG/MP4 attachment]
>
> Two revision rounds included — reply with anything you want changed. After that, edits are billed at [rate].
>
> Pumped to have you live.
>
> — Brendan

### The Loom walkthrough
Record it. 3 minutes max. Walk through:
- Hero + the design decision behind it (why this color, why this image)
- Services section + how it converts
- Mobile experience (do this on actual phone, screen-share to Loom)
- The CTA flow — phone click + form submit (test it live in the Loom)

This Loom is the difference between "they paid me $1,500" and "they refer me three friends."

---

## DESIGN STANDARDS — NON-NEGOTIABLE

### Colors
- **Max 3:** primary, accent, neutral. Always use CSS variables.
- **Pool service palette A:** Deep navy `#1a2744` + white + gold `#f0b429`
- **Pool service palette B:** Slate green `#1B2E2A` + white + electric blue `#00D4FF`
- **Elective ultrasound:** Warm cream `#FDF8F3` + soft blush `#F4C5B0` + deep rose `#8B3A52`
- **HVAC:** Cool blue `#0A4D8C` + white + warm orange `#F77F00` (heating + cooling visual cue)
- **Pest control:** Forest green `#1B4332` + white + soft yellow `#F4D35E` (clean + safe)
- **Garage door:** Industrial charcoal `#2B2D42` + white + safety red `#D62828`
- **Landscaping:** Earth brown `#7F4F24` + sage `#A4AC86` + cream `#FAF3DD`
- **Carpet/house cleaning:** Soft teal `#4ECDC4` + white + soft coral `#FF6B6B`
- **Handyman:** Navy `#264653` + white + warm gold `#E9C46A`
- **Travel:** Ocean `#006A6B` + sand `#F4A261` + cream `#FAF3DD` OR adventure earth `#6B4423` + cream
- **Marketing agency:** Bold black `#0A0A0A` + white + electric accent (your pick — `#00FF87` lime or `#FF006E` magenta)
- **NEVER:** Generic blue-white, purple gradients on white, Bootstrap defaults, Material Design starter palette

### Typography
- **Max 2 fonts:** display headline + body
- **Display options:** Syne, Playfair Display, Cabinet Grotesk, Plus Jakarta Sans, Cormorant Garamond
- **Body options:** DM Sans, Geist, DM Mono
- **NEVER** Inter, Roboto, or Arial as primary font. They scream "default."

### Spacing
- Section padding: **80px top/bottom desktop, 48px mobile minimum**
- Generous whitespace — amateur sites are cluttered, pro sites breathe
- Container max-width: 1280px on desktop. Don't go full-width on text content (eye strain).

### Performance
- **LCP under 2.5 seconds** — TEST with Google PageSpeed Insights after every animation added
- **Score above 85 on mobile** — non-negotiable, kills delivery if missed
- Slow site = worse Google Ads Quality Score = higher CPC. Speed is a sales metric.

### Animations — USE
- Fade-in on scroll for cards and testimonials
- Number counters for social proof ("500+ Pools Serviced")
- Hero text reveal on load with stagger (0s, 0.2s, 0.4s)
- Hover lift on cards (4px up, shadow increase)
- ShimmerButton on primary CTA
- Parallax on hero background (subtle, 0.5x scroll speed max)

### Animations — AVOID
- Heavy Three.js / particle backgrounds on mobile (kills speed)
- Looping animations that never stop (distracting)
- Anything delaying CTA visibility on load
- Full-page loading screens (users bounce)
- More than 2 animation types per section

---

## LOVABLE PROMPTS THAT ALWAYS WORK

The copy-paste vault. All proven. Use as-is.

**Premium polish pass:**
> "Make this look more premium and less template-like. Add more visual depth, better spacing, more distinctive typography."

**Mobile fix:**
> "Mobile at 375px: increase font sizes 2px, full-width buttons, more padding between sections, phone number in top nav."

**Hero impact boost:**
> "Hero needs more impact: subtle animated gradient overlay, larger headline, social proof line under CTA ('⭐ 4.9 stars · 200+ happy customers')"

**Sticky nav:**
> "Add a sticky nav that appears after scrolling past the hero. Business name left, phone number right. Subtle backdrop blur."

**Hero parallax:**
> "Add a subtle parallax effect to the hero background image so it moves at 0.5x scroll speed using Framer Motion."

**Footer cleanup:**
> "Clean up footer: left = logo + tagline, center = quick links, right = contact + social. Dark background, light text."

**Mobile sticky click-to-call:**
> "Add fixed bottom-right call button mobile only. [Color] background, phone icon, 'Call Now' text. Only visible under 768px. Tappable target 56px minimum."

**Before/after slider:**
> "Add a before/after image slider to the gallery section. Drag handle in the middle. Smooth animation. Mobile-friendly touch."

**CTA section pop:**
> "Make the final CTA section pop: gradient background using primary + accent colors, ShimmerButton CTA, large headline, urgency line under button."

**Testimonial carousel:**
> "Add testimonial carousel with auto-scroll every 5 seconds, pause on hover, dot indicators, swipeable on mobile."

---

## NICHE PLAYBOOKS

### LOCAL HOME SERVICE — MASTER TEMPLATE

Used by 8 niches: pool service, pest control, garage door, HVAC, landscaping, carpet cleaning, house cleaning, handyman.

**Section order (always):**
Hero → Trust signals → Services → Before/After (where applicable) → Reviews → Service Area → Final CTA → Footer

**Shared structure rules:**
- Hero: Full-width photo of service in action + massive phone number top-right + "Get a Free Quote" primary CTA + trust badges below CTA
- Trust above fold: 4 numbers — years in business, jobs completed, response time, star rating
- Services: Icon cards, 4–6 services. Each with 1-line description + price range or "Free quote"
- **Mobile sticky click-to-call: ALWAYS INCLUDE.** Single biggest conversion driver on home service sites.
- Before/After gallery: Critical for pool, landscape, carpet. Optional for pest, HVAC, garage, house cleaning, handyman.
- Reviews: Google reviews embed (real, never fake)
- Service area: Cities + ZIP codes covered. Bullet list, no map (maps slow page).
- Final CTA: Phone (giant) + simple form (name, phone, service)
- Footer: NAP (name/address/phone matching GBP exactly) + hours + social links

**The Lovable prompt for the sticky call button:**
> "Add fixed bottom-right call button mobile only. [Niche-color] background, phone icon, 'Call Now' text. Only visible under 768px. Tappable target 56px minimum."

---

### NICHE 1 — POOL SERVICE  ⭐ PROVEN

Vegas pool service is Brendan's wedge. Every word here is battle-ready.

- **Color:** Palette A (navy + gold) for premium feel, Palette B (slate green + electric blue) for modern/tech feel
- **Hero image:** Full-width sparkling pool, sun glinting off water, ideally with a service tech in frame
- **Hero headline:** "Vegas Pools, Serviced Right." or "Crystal Clear Pools, Year-Round."
- **Services (4–6):** Weekly Maintenance, One-Time Cleaning, Equipment Repair, Green-to-Clean Restoration, Acid Wash, Emergency Service
- **Trust signals:** "X years serving Vegas" / "Y pools serviced" / "Same-day callbacks" / "⭐ 4.9 stars"
- **CTA copy:** "Get a Free Pool Quote" (better than "Contact Us")
- **Differentiation hook:** Year-round Vegas pools. Lead with this — it's the unfair geographic edge.
- **Photo gallery:** Before/after green-to-clean (the WOW). Equipment installs. Smiling customers next to clean pool.
- **Special features:** Chemical safety mention, equipment certifications, BBB / Yelp logos

---

### NICHE 2 — PEST CONTROL  📋 TEMPLATE — refine after first client

- **Color:** Forest green + soft yellow (clean + safe + natural)
- **Hero image:** Clean home + family on couch (the result, not the bug). Never put a roach on the hero — sells the problem, not the solution.
- **Hero headline:** "Pest-Free, Family-Safe." or "[City]'s Pest Problem, Solved for Good."
- **Services (4–6):** General Pest Control, Termite Treatment, Rodent Control, Mosquito Treatment, Bed Bug Removal, Commercial Pest Control
- **Trust signals:** "X homes protected" / "Y years in [city]" / "Pet-safe & eco-friendly" / "Same-week service"
- **CTA copy:** "Get a Free Inspection" (free inspection is the industry standard ask)
- **Differentiation hook:** Pet-safe / eco-friendly chemistry. Most owners care about kids + pets.
- **Photo gallery:** Tech in branded gear, eco-friendly products, happy family/pet shots
- **Special features:** EPA registration #, eco-certifications, before/after only if visible (rodent traps, termite damage repair)

---

### NICHE 3 — GARAGE DOOR  📋 TEMPLATE — refine after first client

- **Color:** Industrial charcoal + safety red. Modern, trustworthy, urgency-coded.
- **Hero image:** Clean modern home with garage door open mid-rise (the action shot). OR truck-mount of installed door.
- **Hero headline:** "Same-Day Garage Door Repair in [City]." or "Garage Door Down? We're 60 Minutes Away."
- **Services (4–6):** Spring Repair, Opener Installation, Panel Replacement, New Door Installation, Cable & Roller Repair, Emergency 24/7
- **Trust signals:** "Average response: 60 minutes" / "X years repairing garage doors" / "Licensed & bonded" / "$X warranty on parts"
- **CTA copy:** "Call for Same-Day Repair" (urgency closes garage door deals)
- **Differentiation hook:** Same-day or 24-hour emergency response. Time IS the value.
- **Photo gallery:** Before/after broken-spring repairs, installed doors (residential + commercial), branded service trucks
- **Special features:** Emergency 24/7 banner, response time counter (live: "Average call answered in 18 seconds"), brand badges (LiftMaster, Genie, Chamberlain)

---

### NICHE 4 — HVAC  📋 TEMPLATE — refine after first client

- **Color:** Cool blue + warm orange (heating + cooling visual cue, instantly recognizable)
- **Hero image:** Family comfortable in home (cozy/cool depending on season focus). NOT a tech with a clipboard — that's stock photo death.
- **Hero headline:** "[City]'s AC Out? We Fix It Today." (summer) or "Furnace Down? We're 60 Minutes Away." (winter)
- **Services (4–6):** AC Repair, AC Installation, Heating Repair, Heating Installation, Ductwork & Air Quality, Maintenance Plans
- **Trust signals:** "X years in [city]" / "License #[number]" / "Y systems installed" / "BBB A+" / "0% Financing Available"
- **CTA copy:** "Schedule Same-Day Service" or "Get a Free Estimate"
- **Differentiation hook:** Financing available + 24/7 emergency. HVAC is a $5k–$15k purchase — financing closes deals.
- **Photo gallery:** Installed systems (clean install shots), branded trucks, tech with happy customer
- **Special features:** Financing calculator widget, license # in footer (state requires it), seasonal urgency banner ("Beat the Vegas summer — book your AC tune-up now")

---

### NICHE 5 — LANDSCAPING  📋 TEMPLATE — refine after first client

- **Color:** Earth brown + sage + cream (natural, premium, NOT garden-store cheap)
- **Hero image:** Dramatic before/after side-by-side OR cinematic shot of a manicured property
- **Hero headline:** "Your Property, Reimagined." or "[City] Landscapes, Worth Looking At."
- **Services (4–6):** Weekly Lawn Maintenance, Landscape Design, Hardscaping (patios/walkways), Tree Service, Irrigation, Seasonal Cleanup
- **Trust signals:** "X years transforming [city] yards" / "Y properties served" / "Licensed & insured" / "⭐ 4.9 stars"
- **CTA copy:** "Get a Free Design Consultation" (consultation > quote — feels premium)
- **Differentiation hook:** Full-service vs. mow-and-go. Landscaping is design — sell the vision.
- **Photo gallery:** Heavy emphasis on before/after transformations. Show the WOW. Hardscape installs. Mature landscapes (proves you can grow it, not just plant it).
- **Special features:** Portfolio gallery (this niche needs a real one — landscaping is visual or it's nothing), seasonal package pricing

---

### NICHE 6 — CARPET CLEANING  📋 TEMPLATE — refine after first client

- **Color:** Soft teal + soft coral (clean, fresh, friendly — not clinical)
- **Hero image:** Pristine carpet + family relaxed on the floor (the lifestyle, not the machine)
- **Hero headline:** "Carpets That Look Brand New. In Hours, Not Days."
- **Services (4–6):** Steam Cleaning, Stain Removal, Pet Odor Treatment, Upholstery Cleaning, Tile & Grout, Commercial Carpet Cleaning
- **Trust signals:** "Dries in 2 hours" / "Eco-friendly products" / "X carpets cleaned" / "100% satisfaction guarantee"
- **CTA copy:** "Get a Free Quote in 60 Seconds" (instant gratification)
- **Differentiation hook:** Drying time (2hr vs industry 6hr) + eco-friendly chemistry
- **Photo gallery:** Heavy before/after. Pet stain removal especially — that's the WOW.
- **Special features:** Stain-type matrix ("we handle: red wine, pet, blood, ink, paint..."), eco certifications, room-count pricing calculator

---

### NICHE 7 — HOUSE CLEANING  📋 TEMPLATE — refine after first client

- **Color:** Soft teal + white + soft coral (light, fresh, NOT sterile)
- **Hero image:** Pristine kitchen or living room — staged, sunlit. Aspirational.
- **Hero headline:** "[City]'s Cleanest Homes. Without Lifting a Finger." or "Move-In Ready, Every Week."
- **Services (4–6):** Recurring Weekly/Bi-Weekly, One-Time Deep Clean, Move-In/Out, Post-Construction, Office Cleaning, Airbnb Turnover
- **Trust signals:** "Background-checked cleaners" / "X homes cleaned" / "Bonded & insured" / "Same cleaner every visit (recurring)"
- **CTA copy:** "Book Your First Clean" (commitment-light language)
- **Differentiation hook:** Background-checked + bonded staff + same cleaner each visit (consistency)
- **Photo gallery:** Before/after deep cleans. Branded cleaner uniforms. Happy customer in clean home.
- **Special features:** Recurring vs one-time pricing toggle, online booking widget (industry expects it), satisfaction guarantee badge

---

### NICHE 8 — HANDYMAN  📋 TEMPLATE — refine after first client

- **Color:** Navy + warm gold (trustworthy + approachable, NOT contractor-cheap)
- **Hero image:** Real person in branded shirt with a toolbelt — friendly face. OR a service collage (4 quadrants showing different jobs)
- **Hero headline:** "[City]'s Handyman. No Job Too Small." or "One Call, Anything Fixed."
- **Services (4–6):** Drywall & Painting, Plumbing Repairs, Electrical (basic), Furniture Assembly, Door & Window Repair, Mounting & Installation
- **Trust signals:** "Hourly rate: $X (no hidden fees)" / "Y jobs completed" / "Insured & bonded" / "Same-day availability"
- **CTA copy:** "Book a Handyman Today" (action-oriented)
- **Differentiation hook:** Visible hourly rate (most handymen hide it = consumers distrust). Show the rate, win the trust.
- **Photo gallery:** Action shots — drilling, painting, mounting. Variety of jobs (proves the "anything" claim).
- **Special features:** Service-list page (long, scannable, every service they do), hourly rate visible above fold, "what's NOT a handyman job" section (builds trust by saying "for big plumbing call a plumber")

---

### NICHE 9 — ONLINE TRAVEL PLANNING + BOOKING  📋 TEMPLATE — Trade N Travel

Different motion. Not local home service. Booking flow is the heart.

- **Color:** Ocean blue + sand + cream OR adventure earth + cream (depending on positioning — beach/luxury vs. adventure/rugged)
- **Hero image:** Cinematic destination shot. Video > still photo for travel — Higgsfield helps here.
- **Hero headline:** "Plan Your Next Trip. We'll Handle the Rest." or "Curated Travel for People Who Hate Planning."
- **Sections:** Hero → Destinations (visual grid) → Packages (with pricing) → How It Works → Why Us → Testimonials → Booking
- **Services / Packages:** Honeymoon, Family Adventure, Solo Travel, Group / Bachelorette, Luxury Getaways, Custom Itineraries
- **Trust signals:** "X trips planned" / "Y countries covered" / "ASTA member" / "24/7 in-trip support"
- **CTA copy:** "Plan Your Trip" (primary) + "Book a Free Consultation" (secondary)
- **Differentiation hook:** Curated, not OTA-style. The pitch is "we know the destinations, we save you 20 hours of research."
- **Photo gallery:** Destination photography (high res, real, NOT stock)
- **Booking integration:** Stripe for deposits + a booking widget (Calendly for consults, Stripe for package deposits, third-party tour booking for tours)
- **Special features:** Trip type quiz ("What kind of traveler are you?"), destination filter, package comparison
- **Trade N Travel application:** This IS Brendan's affiliate travel project. Use this template when building it out.

---

### NICHE 10 — MARKETING AGENCY  📋 TEMPLATE — Valdes Agency itself

The pitch is the positioning. Generic = invisible.

- **Color:** Bold black + white + electric accent (lime `#00FF87` or magenta `#FF006E`). Confidence in palette = confidence in pitch.
- **Hero image:** NOT a stock photo of people in a meeting. Real client work — screenshots, results, dashboards. OR bold typography hero (no image).
- **Hero headline:** SPECIFIC. Not "We Do Marketing." Try: "We help pool service companies in Vegas get booked out." Niche specificity is the moat.
- **Sections:** Hero → Case studies (numbers-driven) → How we work (process) → Pricing or "What does it cost" → About → Contact / Book a call
- **Services / Approach:** Don't list services first. Lead with results. Services come later (or not at all on the homepage).
- **Trust signals:** SPECIFIC client results — "$X pipeline added" / "Y leads in 30 days" / "Z% close rate increase". Numbers > vibes.
- **CTA copy:** "Book a Strategy Call" (consultative, not pushy)
- **Differentiation hook:** Niche focus. "We only work with [niche]" is the strongest positioning play in agency.
- **Photo gallery / proof:** Case studies — before/after metrics, client logos, screenshots of dashboards/wins, video testimonials
- **Special features:** Case study deep-dive pages, ROI calculator (optional), about page that builds founder credibility (especially when the founder is 17 and crushing it)
- **Valdes Agency application:** Brendan's own site uses this exact template. Lead with niche (pool service Vegas), show SonoView numbers as proof, book a call CTA.

---

### NICHE 11 — ELECTIVE ULTRASOUND  ⭐ PROVEN (SonoView)

Emotional. Medical-adjacent but NEVER clinical. Get this wrong and the site feels cold.

- **Color:** Warm cream `#FDF8F3` + soft blush `#F4C5B0` + deep rose `#8B3A52`. Already established for SonoView — don't deviate.
- **Hero image:** Parent looking at the screen, mid-emotion. Warm lighting. Soft focus. NEVER a clinical room or technical equipment shot.
- **Hero headline:** "Meet Your Baby. Before They Arrive." or "See Your Baby's First Smile."
- **Sections:** Hero → How It Works → Packages + Pricing → Gallery (real ultrasound images) → FAQ → Book Now
- **Packages / Services:** Gender Reveal (early), 3D/4D Bonding Session, Heartbeat Animal (audio keepsake), Twin Sessions, VIP Package (long session + photos + video)
- **Trust signals:** "X families served" / "Certified sonographer" / "FDA-approved equipment" / "All scans non-diagnostic / for bonding"
- **CTA copy:** "Book Your Session" (gentle, celebratory)
- **Differentiation hook:** Emotional/keepsake angle. NOT diagnostic. Lean into "milestone, memory, magic."
- **Photo gallery:** Real ultrasound images (with mom permission). Family in waiting area. Parent watching screen. Baby photos post-birth (proof the experience matters).
- **FAQ topics:** Is it safe? Best timing (16–32 weeks)? What to bring? Difference vs medical ultrasound? Refund policy? Can dad/family attend?
- **Copy tone:** Warm, milestone-focused, celebratory. "See your baby smile for the first time." Never clinical: avoid words like "imaging," "scan," "examination" — use "session," "bonding time," "first look."
- **Booking CTA above fold ALWAYS** — non-negotiable. SonoView data confirms.
- **Package pricing visible** — people leave if they can't find cost. Show prices on the homepage.
- **SonoView application:** Already live at sonoviewforyou.com. Reference it for what works in production.

---

## PERFORMANCE CHECKLIST — RUN BEFORE EVERY DELIVERY

Every site must pass before you send the delivery email. No exceptions.

- [ ] PageSpeed mobile score ≥ 85 (Google PageSpeed Insights)
- [ ] PageSpeed desktop score ≥ 95
- [ ] LCP under 2.5 seconds
- [ ] CLS under 0.1 (no layout shift)
- [ ] Phone number is `tel:` link on mobile (clickable — TEST it)
- [ ] All images compressed (WebP format, lazy-loaded below fold)
- [ ] Hero image / video preloaded (no flash on load)
- [ ] No console errors in browser dev tools (Cmd+Opt+J)
- [ ] HTTPS forced (http:// auto-redirects to https://)
- [ ] Mobile tested at 375px (iPhone SE), 390px (iPhone 14), 414px (iPhone Pro Max)
- [ ] Tablet tested at 768px (iPad portrait)
- [ ] All forms submit successfully (test the flow yourself, end-to-end, get the confirmation email)
- [ ] Form spam protection on (reCAPTCHA or honeypot)
- [ ] GBP link in footer + Google Maps embed working (NOT iframe of full Google Maps — just GBP)
- [ ] LocalBusiness schema in `<head>` (basic version below — full version lives in future seo.md)
- [ ] Favicon set (don't ship with the Lovable default)
- [ ] Page titles + meta descriptions written for every page (not "Home — site")
- [ ] OG image set for social sharing (ogimage.org or static asset)

### Basic LocalBusiness schema (paste in `<head>`)
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[Business Name]",
  "telephone": "[Phone with country code]",
  "url": "[Website URL]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Street]",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "postalCode": "[ZIP]",
    "addressCountry": "US"
  },
  "areaServed": ["[City1]", "[City2]"],
  "openingHours": "Mo-Fr 08:00-17:00",
  "priceRange": "$$"
}
```

---

## VOICE NOTES — HANDLING REVISIONS

- **Two revision rounds included.** State this in the proposal AND the delivery email. Round 3+ = scope creep = new project pricing.
- **"Make it pop" is unanswerable.** Push back: "Pop how — bigger headline, bolder color, more animation? Show me a reference site that's the vibe." Force specificity.
- **Don't argue with real preferences.** They want green instead of blue, that's fine, change it. They want a "completely different homepage" mid-build, that's a new project.
- **Revisions in IterationX, not email.** Email = chaos, lost comments, "you missed one." IterationX pins the comment to the actual element. Train the client up front.
- **Final approval =** client emails "Looks great, ship it" OR thumbs-up on the IterationX project. Then DNS goes live. Don't go live without explicit approval.
- **When stuck:** show 2–3 reference sites and ask "Which of these is closer to what you want?" Reference > description, every time.

---

## ONE LAST RULE

If a section reads "general web design advice" instead of "Vegas pool company that needs leads on Tuesday" — rewrite it. Specificity is the whole product.
