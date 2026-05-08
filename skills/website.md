# Website Build — Master Playbook
**Scope:** Every client website Valdes Agency ships. Lovable-first. Looks like $15k. Converts.
**Owner:** Brendan (build + delivery). Tyler does not touch this.
**Goal:** Repeatable system to ship a premium pool service site (or any niche) in 7–10 days from kickoff to live URL.

> **Read order:** Phase 0 → 7 in sequence. Don't skip Phase 0. The brief IS the site.

---

## STAGE 0 — DESIGN BRIEF (NEVER SKIP)

The brief is the difference between a $1,500/mo client and a $5k delivery. Every site starts here, even when the timeline is tight. Rule: **the brief is approved by Brendan before a single Lovable prompt is sent.**

### Inputs needed before writing the brief
- Business name + city + service area (cities, ZIPs)
- Owner name + phone + email
- Logo (or note: "needs logo")
- 3+ real job photos (or note: "use stock placeholders")
- Existing brand colors / preferences (or "no preference")
- 2–3 reference sites the client likes (ask on discovery — "what 2 sites do you wish yours looked like?")
- Top 3 services (in priority order — what they want to sell most)
- Service area cities (for SEO + footer)
- Years in business + pools serviced (or jobs completed, for niche-agnostic use)
- Google review count + star rating
- USP — the one thing they say better than anyone else (extract from discovery call)

### Brief generation (run this in Claude with screenshots attached)

> "You are a world-class web designer. Reference sites attached. Client info: [paste full input block]. Write a complete design brief covering:
> 1. Exact color palette — 3 colors, hex codes, role of each (primary / accent / neutral), CSS variable names
> 2. Typography pairing — display + body from Google Fonts, weights, fallbacks
> 3. Layout style — 3 adjectives + closest reference site
> 4. Hero concept — visual + headline + subheadline + primary CTA + secondary CTA
> 5. Section-by-section breakdown — order, layout notes, key copy, components needed
> 6. CTA placement strategy — where the phone number lives on every section
> 7. Mobile considerations — sticky elements, font sizing, tap targets
> 8. 3 specific animations that elevate above generic
> 9. Hero photo direction — what shot, what lighting, what to avoid
> 10. One-line site personality summary"

Save the brief output to `clients/[business-slug]/design-brief.md`. This is your blueprint. Lovable prompts inherit from it. Iteration arguments resolve back to it.

### Reference site discovery (always do this first)
- **designspells.co** — primary inspiration source. Find 2–3 sites in the niche.
- **motionsites.ai** — for animated reference points
- Top 3 competitors' websites — what we're outclassing
- Bookmark each in `clients/[business-slug]/refs/` as full-page screenshots

---

## STAGE 1 — FIRST LOVABLE PROMPT

Pasted directly into Lovable's chat. Built from the approved brief.

### Master template

```
Build a [niche] service website for [Business Name] in [City], [State].

DESIGN SYSTEM:
- Primary: [hex] (CSS var: --color-primary) — used on: nav, primary buttons, headlines accent
- Accent: [hex] (CSS var: --color-accent) — used on: CTAs, highlights, hover states
- Neutral: [hex] (CSS var: --color-neutral) — used on: backgrounds, body text base
- Display font: [Font Name] from Google Fonts — weights 600, 700 — for headlines and section titles
- Body font: [Font Name] from Google Fonts — weights 400, 500 — for everything else
- Style: [3 adjectives, e.g. "premium, confident, warm"]
- Border radius: 12px on cards, 8px on buttons
- Section padding: 96px top/bottom desktop, 56px mobile

SECTIONS IN ORDER:
1. Sticky nav — logo left, phone number right (clickable), 4 nav links center, transparent over hero, solid white after scroll
2. Hero — [visual concept] + headline "[H1]" + subheadline "[1 sentence]" + primary CTA "[CTA1]" + secondary CTA "[CTA2 phone]"
3. Trust strip — 4 stats: years in business, jobs completed, Google rating, response time
4. Services — [N] icon cards: [list each]
5. Why Us — [3-4 differentiators] in 2-column layout with icons
6. Before/After — gallery of 4 transformations (use placeholder backgrounds for now)
7. Reviews — 3 Google reviews in cards, average rating callout, link to GBP
8. Service Area — list of cities served, optional map
9. Final CTA — full-width section, contrasting background, "[CTA copy]" + form OR phone
10. Footer — 3 columns: logo + tagline | quick links | contact info + hours + social

REQUIREMENTS:
- Mobile first — test at 375px, all tap targets minimum 44px
- Smooth scroll behavior
- Hover states on every interactive element (lift 2px, shadow up)
- Sticky mobile click-to-call button — fixed bottom-right, only visible under 768px, accent color, phone icon, "Call Now"
- LCP under 2.5s — no heavy hero video yet, use a high-quality static image with subtle gradient overlay
- All colors as CSS variables in :root — never hardcode
- All copy in plain English, no jargon — assume reader is a homeowner who has never thought about [niche] before
- No placeholder images — use accent-color backgrounds with section descriptions as text overlay until I provide real photos
- Make this look like a premium agency built it, not a template
```

### Iteration rule (the one that saves you)
**One section at a time. Never change everything at once.**

Use this exact phrasing every time:
> "In the [section name] section only: [specific change]. Keep everything else exactly the same."

If Lovable changes something outside the named section: revert and re-prompt with even tighter scope.

---

## STAGE 2 — UPGRADE COMPONENTS

After the base is structurally right, layer in premium components. Don't do this in Stage 1 — it confuses Lovable.

### 21st.dev workflow
1. Browse 21st.dev → find component matching the section need
2. Click "Get Code" → select prompt type **"Lovable"**
3. Paste directly into Lovable chat: *"Replace the [section] with this component: [paste]"*

### Magic UI workflow
1. magicui.design → find animated element (Shimmer Button, Border Beam, Number Ticker, Marquee, Animated Gradient)
2. Copy code → paste into Lovable: *"Add this Magic UI component to [specific location in section]: [paste code]"*

### Components to upgrade in order (priority)
1. **Primary CTA buttons** → Shimmer Button (Magic UI) — every primary CTA
2. **Trust strip stats** → Number Ticker (Magic UI) — animate on scroll into view
3. **Hero headline** → BlurText or SplitText (ReactBits) — letter-by-letter reveal on load
4. **Background behind hero** → Animated Gradient (Magic UI) — subtle, slow
5. **Service card hover** → Border Beam (Magic UI) — beam draws around card on hover
6. **Reviews section** → Marquee (Magic UI) — auto-scrolling reviews if 6+ exist

### Framer Motion baseline (always add)
> "Add Framer Motion: hero text/CTA stagger in on load with delays 0s, 0.2s, 0.4s, 0.6s. Each section fades up 20px when entering viewport, threshold 0.1, once: true."

---

## STAGE 3 — REACTBITS VIA CODESPACES (advanced)

Use only when 21st.dev + Magic UI don't have what you need. ReactBits requires GitHub + Codespaces because Lovable can't import from npm directly for some components.

### Setup (one-time per project)
1. Lovable → Settings → Connect to GitHub → push to repo
2. Open repo in GitHub Codespaces
3. `npm install` (auto-runs in Codespaces)

### Add a ReactBits component
1. reactbits.dev → find component → copy code
2. Codespaces → create `/src/components/[ComponentName].tsx` → paste
3. Save → push to GitHub → Lovable auto-syncs
4. Back in Lovable: *"Import [ComponentName] from `@/components/[ComponentName]` and use it for [specific element]"*

### High-value ReactBits components for client sites
- **BlurText** — hero headlines (better than typed effect, classier)
- **SplitText** — section titles, animate per-word
- **CountUp** — "200+ Pools Serviced" trigger on scroll
- **TiltedCard** — service cards with subtle 3D tilt on cursor
- **Aurora** — animated background for final CTA section
- **GradualSpacing** — adds class to brand wordmarks in nav

---

## STAGE 4 — HERO VIDEO (PHASE 2 OF DELIVERY)

Static hero ships first. Hero video is an upgrade — usually post-launch week 2.

### Higgsfield method (no shoot needed)
1. Pick 1 hero photo (sparkling pool, parent seeing baby, finished kitchen — niche-specific)
2. Higgsfield.AI → upload → animate (cinematic camera push, 5–10s loop)
3. Download MP4 → optimize via HandBrake (target <2MB, H.264, 1080p, no audio)
4. Lovable: *"Replace hero static image with full-viewport looping muted autoplay video at /assets/hero.mp4. Add 40% black gradient overlay from bottom. Keep all hero text and CTAs on top with current animation timing. Lazy-load video on mobile, fallback to static image."*

### Nate Herkha 2-photo method (premium tier)
1. Take 2 photos with different framing or before/after
2. Higgsfield.AI → "morph between these two" → 8s loop
3. Use for: pool before/after, ultrasound parent reaction, kitchen reveal

### Performance gate
**Test in PageSpeed Insights immediately after adding video.** Mobile LCP must stay under 2.5s. If not, swap to static and lose the video — performance > polish.

---

## STAGE 5 — CLIENT FEEDBACK (IterationX)

Don't email a list of comments. Don't ask for "what do you think?" Make feedback structured.

1. Lovable → publish preview URL
2. iterationx.com → new project → paste preview URL
3. Copy share link
4. Send client this exact message:

> "Site is live for review: [iterationx link]. Click anywhere on the page to drop a comment directly on the design — way easier than emailing me a list. I'll turn around revisions within 24 hours. Two requests: (1) Try it on your phone, that's where most customers will find you. (2) Ask your spouse/partner to look at it too — fresh eyes catch things."

5. Set GHL reminder for 48 hours — if no feedback, follow up.

### Revision rules
- Bundle all feedback into ONE Lovable revision pass per round
- Max 3 revision rounds before it goes live (set this expectation in proposal)
- Anything outside scope → "Great idea, let's add that as a Phase 2 enhancement after we're live and getting leads"

---

## STAGE 6 — DOMAIN + DNS

### Where to buy
- **Preferred:** GHL — domain bought inside GHL, easier client handoff later
- **Fallback:** Namecheap — only if client already has domain there

### Connect to Lovable
1. Lovable → Settings → Custom Domain → enter domain
2. Lovable shows DNS records needed
3. In domain registrar:
   - **A record** — Host: `@` → Value: Lovable's IP (whatever they show)
   - **CNAME** — Host: `www` → Value: Lovable's domain
4. Wait 10 min – 2 hours for propagation
5. Verify at **dnschecker.org** — green checkmarks across regions
6. Verify HTTPS auto-issued — `https://` should resolve, no cert warning

### Final DNS QA
- [ ] `domain.com` redirects to `https://www.domain.com` (or vice versa, pick one)
- [ ] Email still works if client had Google Workspace (MX records preserved)
- [ ] No mixed-content warnings in DevTools console

---

## STAGE 7 — DELIVERY (the wow moment)

This is where $1,500/mo feels like $10k. Every delivery includes:

### Deliverable package (sent in one email + Discord notification)
1. **Live URL** — clickable, https
2. **Rotato mockups** — iPhone 15 Pro + MacBook Air frames showing the site (export PNG)
3. **Optional: 5-second MP4 walkthrough** — Rotato animated frame showing scroll
4. **Loom walkthrough (3 min max)** — show key features, mention the conversion choices made (sticky call button, before/after gallery, trust stats), end with "any questions, drop them in IterationX or text me"
5. **GBP / SEO next steps** — 1-pager outlining what's set up + what's coming in week 2

### Email template
> Subject: Your new site is live — [domain.com]
>
> [Owner first name],
>
> Site is live: [domain.com]
>
> Quick 3-min walkthrough: [Loom link]
>
> Mockups attached — feel free to use these on social.
>
> Phone clicks and form fills are tracked in your dashboard. We'll review the first 30-day numbers together on [date].
>
> Anything you want changed: [iterationx link]
>
> — Brendan

### Update GHL
- Move client from `Building` → `Live`
- Set 30-day check-in task
- Save deliverable package to client folder in Drive

---

## STAGE 8 — 3D & ADVANCED ANIMATION (OPTIONAL UPGRADES)

This is an opt-in menu, not a default. The Lovable base build (STAGE 1) plus Framer Motion baseline (STAGE 2) plus ReactBits (STAGE 3) plus a Higgsfield hero video (STAGE 4) is enough for 90% of Valdes Agency sites — and it's what wins on lead-gen niches like pool service. Pick from this menu only when the brief or pricing tier earns it: editorial sites, brand-led builds, premium-tier retainers ($2.5k+), or anywhere motion is the actual differentiator. Every tool here has a hard mobile performance contract — see the rules at the end of this stage. If you can't meet the contract, ship static + Framer Motion baseline and tell the client honestly why.

### When to ADD advanced animation (yes-list)
- Premium pricing tier ($2.5k+ retainer or one-off $8k+ build)
- Brand-led brief where motion *is* the deliverable (agency portfolio, editorial, designer-led)
- Audience is desktop-heavy or has GPU budget (B2B SaaS, enterprise, design-conscious DTC)
- Client supplies their own design system / motion direction
- Direct competitive pressure — competitor has it and the client's brand can't read "behind"

### When to SKIP and stay on baseline (no-list)
- Pool, HVAC, garage, plumbing, pest, landscaping — any local-service lead-gen niche
- Sub-$2k retainer, no premium tier yet
- Mobile-first audience on low-end Android (most local-service customers)
- Client's stated win is "more leads" — speed beats polish, every time
- Current mobile LCP > 2.0s and you can't get it down with current scope

---

### THE 8 TOOLS — DECISION TREE

```
What are you trying to do?
│
├─ 3D hero object / product config / branded 3D logo
│   ├─ Code-level control needed → Tool 1 + Tool 2 (Three.js + R3F)
│   └─ Designer-led, no code control → Tool 4 (Spline)
│
├─ Scroll-pinned timeline / horizontal scroll / pinned hero
│   └─ Tool 3 (GSAP ScrollTrigger)
│
├─ Smooth scroll + parallax aesthetic
│   └─ Tool 6 (Lenis preferred — Locomotive Scroll only for legacy compat)
│
├─ Multi-page route transitions (rare on Lovable SPAs)
│   └─ Tool 5 (Barba.js — but usually skip; AnimatePresence is enough)
│
├─ Interactive logo / state-driven illustration / hover-input states
│   └─ Tool 7 (Rive)
│
└─ Brand logo loop / designer-handoff motion / simple decorative animation
    └─ Tool 8 (Lottie)
```

Tools 1+2 are paired (you almost never use vanilla Three.js without React Three Fiber on a Lovable build). Tools 3 and 6 cannot live in the same component tree without a sync helper — see the isolation rule below.

---

### Tool 1 — Three.js (Foundation 3D Library)

**What it is:** The foundational JavaScript 3D library. Imperative API, ships everything: scenes, cameras, lights, geometry, shaders.

**When to use:** Almost never directly on a Lovable build. Use it via React Three Fiber (Tool 2) instead — the React-idiomatic wrapper.

**When to use Three.js directly (rare escape hatch):**
- Custom shader work that doesn't map cleanly to R3F
- A scene that needs imperative animation loop control beyond `useFrame`
- Migrating from a vanilla Three.js codebase

**When NOT to use:** Default Lovable builds, lead-gen niches, mobile-first sites (see contract below).

**Bundle cost:** ~85KB gzipped (core, tree-shaken). Plus your scene assets.

**Performance contract:** Same as Tool 2 (R3F). See Tool 2 for the full guardrails — they apply equally.

---

### Tool 2 — React Three Fiber (R3F — Recommended 3D Default)

**What it is:** React renderer for Three.js. Lets you compose 3D scenes with JSX — the React-idiomatic way to ship Three.js on a Lovable/React stack.

**When to use:**
- Hero 3D object on a brand-led page (rotating product, branded 3D logo, abstract shape)
- Product configurator (interactive model the user manipulates)
- Any 3D need on a Lovable build (you're already in React, R3F is the path)

**When NOT to use:**
- Lead-gen sites where LCP is the conversion lever
- Mobile-first audiences on low-end Android without a static fallback path
- Any scene over 5k polygons without LOD/instancing optimization

**Lovable integration:**
1. Open the Lovable project in GitHub Codespaces (STAGE 3 setup)
2. `npm install three @react-three/fiber @react-three/drei`
3. Wrap the 3D component in `<Canvas>` from R3F
4. Lazy-load via `React.lazy` + `Suspense` so the ~120KB bundle doesn't block LCP
5. Provide a static fallback `<img>` for `prefers-reduced-motion` and mobile breakpoints

**Code skeleton:**

```jsx
// Hero3D.tsx — lazy-loaded R3F scene
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useRef } from 'react';

function Model() {
  const ref = useRef();
  const { scene } = useGLTF('/models/hero.glb');
  useFrame((_, delta) => { ref.current.rotation.y += delta * 0.2; });
  return <primitive ref={ref} object={scene} />;
}

export default function Hero3D() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <Model />
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}
```

```jsx
// Page.tsx — lazy + static fallback
import { lazy, Suspense } from 'react';
const Hero3D = lazy(() => import('./Hero3D'));

const isMobile = window.matchMedia('(max-width: 767px)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion)').matches;
const useStatic = isMobile || reducedMotion;

return useStatic
  ? <img src="/hero-static.webp" alt="" />
  : <Suspense fallback={<img src="/hero-static.webp" alt="" />}><Hero3D /></Suspense>;
```

**Performance contract:**
- Max 5k polygons total across the scene (use Draco compression on .glb)
- Lazy-load via `React.lazy` + `Suspense` — never block LCP
- Static `.webp` fallback ALWAYS provided (for `prefers-reduced-motion` and mobile)
- Hide on mobile breakpoint (<768px) OR ship the static fallback there
- Bundle cost: ~120KB gzipped (Three.js + R3F + drei tree-shaken). Audit with `vite build --mode analyze`
- Test mobile LCP after adding. < 2.5s or revert.

---

### Tool 3 — GSAP ScrollTrigger (Scroll-Pinned Timeline Animation)

**What it is:** GreenSock's scroll-driven animation engine. Pin elements, scrub timelines on scroll, build horizontal scroll sections, choreograph complex reveals.

**When to use:**
- Scroll-pinned hero (element stays in place while content animates around it)
- Horizontal scroll sections (case studies, gallery walks)
- Complex timeline reveals that go beyond Framer Motion's declarative `useScroll`/`useTransform`
- Scroll-scrubbed video or canvas effect

**When NOT to use:**
- Simple stagger / fade-up — that's already in the Framer Motion baseline (STAGE 2). Don't reach for GSAP for this.
- Any component that already uses Framer Motion (see isolation rule below)
- Lead-gen sites where scroll choreography doesn't directly drive conversion

**ISOLATION RULE (LOCKED):** Never mix GSAP and Framer Motion in the same component tree. They both manipulate transform values and will fight each other. Pick ONE per component. Mixing across different components on the same page is fine — just not inside the same subtree.

**Lovable integration:**
1. `npm install gsap @gsap/react`
2. Register the ScrollTrigger plugin once at module level
3. Use `useGSAP` hook for proper React lifecycle + cleanup
4. ALWAYS kill ScrollTrigger instances on unmount

**Code skeleton:**

```jsx
import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

export default function PinnedHero() {
  const containerRef = useRef(null);

  useGSAP(() => {
    gsap.to('.hero-content', {
      yPercent: -50,
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top top',
        end: '+=100%',
        pin: true,
        scrub: 1,
      },
    });
  }, { scope: containerRef });

  return (
    <section ref={containerRef} className="h-screen">
      <div className="hero-content">{/* ... */}</div>
    </section>
  );
}
```

**Performance contract:**
- Use `useGSAP` (not raw `useEffect`) — handles cleanup automatically
- Below 768px: replace ScrollTrigger pins with IntersectionObserver fade-ups (pinning is expensive on mobile)
- NEVER use `window.addEventListener('scroll')` — kills mobile (rule carries from `.claude/skills/skills/taste-skill`)
- Bundle cost: ~40KB gzipped (GSAP core + ScrollTrigger plugin)
- Test mobile LCP and scroll smoothness on a real low-end Android, not just DevTools

---

### Tool 4 — Spline (Visual 3D Editor)

**What it is:** A browser-based visual 3D editor (think Figma for 3D). You build the scene with a UI, then embed via iframe or a runtime React component.

**When to use:**
- Designer-led 3D where the designer ships a Spline file, not a glTF
- Rapid 3D prototyping when you don't have R3F skills handy
- Brand-led page where the 3D is the differentiator and Spline's renderer quality is "good enough"

**When NOT to use:**
- Performance-critical pages — Spline's runtime is heavier than custom R3F
- Mobile-first sites
- Anything needing custom shaders (Spline can't ship them)
- Sites where you need code-level control over the scene

**Honest call:** Spline runtime is heavier than a custom R3F scene with the same visual content. Use Spline only when designer-handoff speed matters more than perf budget. For most agency builds, custom R3F is the better long-term choice.

**Lovable integration:**
1. Designer exports the scene from Spline (gives you a URL like `prod.spline.design/...`)
2. `npm install @splinetool/react-spline`
3. Drop in `<Spline scene="..." />` — lazy-load it

**Code skeleton:**

```jsx
import { lazy, Suspense } from 'react';
const Spline = lazy(() => import('@splinetool/react-spline'));

export default function HeroSpline() {
  return (
    <Suspense fallback={<img src="/hero-static.webp" alt="" />}>
      <Spline scene="https://prod.spline.design/YOUR_SCENE/scene.splinecode" />
    </Suspense>
  );
}
```

**Performance contract:**
- Lazy-load below the fold ONLY (never as the LCP element)
- Hide on mobile if scene drops below 60fps (test on real device)
- Max 1 Spline scene per page
- Bundle cost: ~80KB runtime + scene file size (varies, often 200KB+)
- Same static fallback rule as R3F: provide `.webp` for `prefers-reduced-motion` + mobile

---

### Tool 5 — Barba.js (Page Transitions)

**HONEST CALL FIRST:** For 95% of Valdes Agency sites, skip Barba entirely. Lovable builds are React SPAs — Framer Motion's `<AnimatePresence>` handles route transitions natively, with no extra library. Barba is for retrofitting SPA-feel transitions onto multi-page (WordPress, Astro, static HTML) sites.

**When to use:**
- Editorial multi-page site (NOT a Lovable build) where you want SPA-feel transitions retroactively
- Agency portfolio with stylized route transitions where the transition itself is the feature
- WordPress/Astro/static-HTML migrations where converting to a real SPA isn't feasible

**When NOT to use:**
- Lovable SPAs (default — use AnimatePresence)
- Lead-gen sites — page-load speed beats transition polish, every time
- Anything where SEO requires server-rendered HTML and Barba's prefetching breaks crawling

**Integration steps (only if you've decided yes):**
1. `npm install @barba/core`
2. Init Barba in your main JS entry
3. Define a `data-barba-namespace` per page
4. Hook `leave` and `enter` transitions

**Code skeleton:**

```js
import barba from '@barba/core';

barba.init({
  transitions: [{
    name: 'fade',
    leave({ current }) {
      return gsap.to(current.container, { opacity: 0, duration: 0.3 });
    },
    enter({ next }) {
      return gsap.from(next.container, { opacity: 0, duration: 0.3 });
    },
  }],
});
```

**Performance contract:**
- Adds ~15KB gzipped to bundle
- Pre-fetches linked pages by default — extra network cost (turn off if it hurts your CDN bill)
- Disable on iOS Safari if transitions stutter
- Confirm SEO bots still crawl pages independently (Barba's intercept can mask routes from crawlers)

---

### Tool 6 — Lenis (Smooth Scroll) + Locomotive Scroll (Legacy)

**MODERN PICK — USE LENIS, NOT LOCOMOTIVE:** Lenis (~7KB) replaced Locomotive Scroll (~25KB) as the smooth-scroll standard in 2024-2025. Same buttery scroll feel, smaller bundle, better React integration, actively maintained, plays nice with GSAP ScrollTrigger via a sync helper.

**When to use:**
- Editorial sites where smooth scroll IS part of the brand aesthetic
- Brand-led builds where the scroll feel itself is a quality signal
- Designer specifically requested smooth scroll and you can meet the perf contract

**When NOT to use:**
- Lead-gen sites — most Valdes Agency work
- iOS — smooth scroll fights iOS native momentum, feels broken
- Anywhere `prefers-reduced-motion` is likely (accessibility-first audiences)

**Lovable integration (Lenis):**
1. `npm install @studio-freight/lenis` (or the new `lenis` package)
2. Init in a top-level `useEffect` with a `requestAnimationFrame` loop
3. Disable on iOS via UA check or feature detection
4. Respect `prefers-reduced-motion` and disable

**Code skeleton:**

```jsx
import { useEffect } from 'react';
import Lenis from '@studio-freight/lenis';

export function SmoothScroll() {
  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const reduced = window.matchMedia('(prefers-reduced-motion)').matches;
    if (isIOS || reduced) return;

    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    return () => lenis.destroy();
  }, []);
  return null;
}
```

**Locomotive Scroll (legacy reference only):**
Same use case, larger bundle, harder React integration. If you're maintaining an older site that already ships Locomotive, leave it. For new builds: Lenis.

**Performance contract:**
- DISABLE on iOS (smooth scroll fights native momentum, feels broken — every time)
- DISABLE for `prefers-reduced-motion` users (accessibility hard rule)
- Don't combine with GSAP ScrollTrigger pins without using the official Lenis-ScrollTrigger sync helper
- Bundle cost: ~7KB (Lenis) or ~25KB (Locomotive)

---

### Tool 7 — Rive (State-Machine Vector Animation)

**What it is:** A runtime animation tool with a state-machine model. You design states + transitions in the Rive editor, then trigger them at runtime via inputs (boolean, number, trigger). Lighter than Lottie for interactive work; heavier than Lottie for simple loops.

**When to use:**
- Interactive logo with hover/click/loaded states
- State-driven illustration (e.g., a button that morphs between idle → hover → success)
- Micro-interactions where Framer Motion can't reach (multi-state vector with internal logic)
- Animations driven by user input, scroll position, or app state

**When NOT to use:**
- Simple loops (a logo that just plays once on load) — Lottie is lighter
- Static graphics — plain SVG is enough
- Complex 3D — wrong tool, use R3F

**Lovable integration:**
1. Designer ships a `.riv` file (export from Rive editor)
2. `npm install @rive-app/react-canvas`
3. Drop `.riv` into `/public`, use the `useRive` hook

**Code skeleton:**

```jsx
import { useRive, Layout, Fit } from '@rive-app/react-canvas';

export default function InteractiveLogo() {
  const { RiveComponent, rive } = useRive({
    src: '/logo.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
    layout: new Layout({ fit: Fit.Contain }),
  });

  return (
    <div onMouseEnter={() => rive?.play()} className="w-32 h-32">
      <RiveComponent />
    </div>
  );
}
```

**Performance contract:**
- Lazy-load on intersection (use `IntersectionObserver` or React `lazy`)
- Max 3 Rive instances per page
- Total `.riv` budget < 200KB across the page
- Bundle cost: ~50KB runtime (gzipped)
- Test mobile — state-machine logic is light, but multiple canvases compound

---

### Tool 8 — Lottie (After Effects → JSON)

**What it is:** Renders After Effects animations as JSON in the browser. Designer-handoff staple — designer animates in AE, exports via Bodymovin plugin, you ship the .json.

**When to use:**
- Brand logo loop (plays once on load, or on a slow loop)
- Simple decorative animation (icons, success checkmarks, illustrative loops)
- Designer-handoff workflow where the designer owns AE and ships .json files
- Anywhere SVG is too static and Rive is overkill

**When NOT to use:**
- Interactive state-machine work — Rive wins
- Complex 3D — wrong tool, use R3F
- Animations that need runtime data binding beyond color/scale (Lottie is hard to drive dynamically)

**Lovable integration:**
1. Designer exports `.json` via Bodymovin (After Effects plugin)
2. `npm install lottie-react`
3. Drop `.json` into `/public`, use the `Lottie` component

**Code skeleton:**

```jsx
import Lottie from 'lottie-react';
import animationData from '/public/logo-loop.json';

export default function LogoLoop() {
  return <Lottie animationData={animationData} loop autoplay style={{ width: 160 }} />;
}
```

**Performance contract:**
- Optimize the JSON via lottiefiles.com optimizer or LottieLab before shipping
- Max 100KB per `.json` file (un-optimized AE exports are often 500KB+ — never ship raw)
- Lazy-load below the fold; don't make Lottie the LCP element
- Use `renderer: 'canvas'` for >5 instances on a page; default `'svg'` is fine for <5
- Bundle cost: ~50KB runtime + JSON file size

---

### LAYERING ORDER — How These Stack on Lovable

The motion stack of any premium build, from foundation up:

1. **Lovable base** (STAGE 1) — vanilla React + Tailwind, no motion
2. **Framer Motion baseline** (STAGE 2) — stagger, fade-up 20px, parallax. Hard floor for every site.
3. **Component libraries** (STAGE 2-3) — Magic UI (Shimmer, Border Beam, Number Ticker), 21st.dev, ReactBits (BlurText, TiltedCard, Aurora)
4. **Hero video** (STAGE 4) — Higgsfield (image → cinematic camera push)
5. **THIS STAGE — pick from the menu above**
   - Pick ONE primary motion library per component
   - Mixing libraries across DIFFERENT components on the same page is fine (R3F hero + GSAP scroll section + Lottie footer logo all coexist)
   - **NEVER mix GSAP + Framer Motion in the same component tree** (locked isolation rule — they fight over transforms)
   - **NEVER mix Lenis/Locomotive + GSAP ScrollTrigger pins without the official sync helper**

---

### MOBILE PERFORMANCE — HARD GATES

Extends the existing DESIGN STANDARDS performance gates (LCP < 2.5s mobile, Mobile score 85+, hero image WebP < 200KB). These tool-specific guardrails are additive — they apply ON TOP of the base contract, not instead of it.

| Tool | Bundle (gzip) | Mobile-safe? | Required guardrail |
|---|---|---|---|
| Three.js + R3F | ~120KB | Conditional | Static fallback + lazy-load + max 5k polys + hide <768px or fallback |
| Spline | ~80KB + scene | Below-fold only | Hide if <60fps; max 1 scene per page |
| GSAP + ScrollTrigger | ~40KB | Yes with IO fallback | IntersectionObserver replaces pins <768px |
| Barba.js | ~15KB | Yes | Rarely needed — usually skip |
| Locomotive Scroll | ~25KB | iOS: disable | Use Lenis instead for new builds |
| Lenis | ~7KB | Yes | Disable on iOS + for `prefers-reduced-motion` |
| Rive | ~50KB | Yes | Lazy-load + max 3 instances + total .riv budget < 200KB |
| Lottie-Web | ~50KB + JSON | Yes | Optimize JSON, max 100KB/file, lazy below fold |

**The hard rule:** **Test mobile LCP after every addition. Under 2.5s or revert.**

---

### COST DECISION GATE — When a client asks "can we add a 3D thing?"

Run this 3-step gate before saying yes:

1. **Pricing tier check.** Sub-$2k retainer or sub-$8k one-off? Default to no. Pitch a static premium graphic instead. Premium motion is a premium-tier feature.
2. **LCP budget check.** Current mobile LCP > 2.0s? No room. Optimize the existing site first, then revisit.
3. **Brief alignment.** Does the 3D/animation directly serve the conversion goal (or the brand goal on a brand-led brief)? Or is it eye candy?

If all three pass → ship it via the menu above. If any fail → static + Framer Motion baseline only, and tell the client honestly why.

---

### CLIENT-FACING TALKING POINTS

When scoping a build that includes 3D or advanced motion, set expectations upfront:

- **"Premium motion adds 5-10 days to the build timeline."** Set scope and price accordingly.
- **"We test mobile performance after every addition. If it slows the site, we remove it."** Sets the performance contract before the work, not after.
- **"On lead-gen sites, the conversion winner is usually clean + fast, not flashy. We add motion where it earns the conversion, not for show."** This is the honest no-thanks line for clients on $1.5-2k retainers asking for premium polish.
- **"Three.js / Spline / scroll choreography work best on desktop-heavy audiences. If most of your traffic is mobile lead-gen, we'll spend the budget on speed instead."** Reframes the conversation toward what actually moves their numbers.

---

## DESIGN STANDARDS — NON-NEGOTIABLE

### Colors
- **Max 3 colors:** primary, accent, neutral
- **Always CSS variables.** Never hardcode hex in components.
- **Approved palettes (proven):**
  - **Pool service — desert blue:** #1B3A5C (twilight) + #F4A261 (sunset) + #FAF6F1 (cream)
  - **Pool service — navy + gold:** #1A2744 + #F0B429 + #FFFFFF
  - **Pool service — slate + electric:** #1B2E2A + #00D4FF + #FFFFFF
  - **Elective ultrasound:** #FDF8F3 (cream) + #F4C5B0 (blush) + #8B3A52 (deep rose)
- **NEVER:** generic blue-white SaaS gradients, purple-on-white, Bootstrap defaults, pure black on pure white

### Typography
- **Max 2 fonts:** display + body
- **Display options:** Syne, Cabinet Grotesk, Plus Jakarta Sans, Playfair Display, Cormorant Garamond
- **Body options:** DM Sans, Geist, Inter Tight (only if Inter Tight, never Inter regular)
- **NEVER:** Inter (regular), Roboto, Arial, Times New Roman as primary
- **Sizes (desktop):** H1 64–80px, H2 40–48px, H3 24–28px, body 16–18px, small 14px
- **Sizes (mobile):** H1 40–48px, H2 28–32px, H3 20–24px, body 16px

### Spacing
- Section padding: 96px top/bottom desktop, 56px mobile minimum
- Card padding: 32px desktop, 20px mobile
- Generous whitespace. Amateur sites are cluttered. Pro sites breathe.

### Performance gates (every site, every commit)
- LCP under 2.5s on mobile (test PageSpeed Insights)
- Mobile score above 85 — non-negotiable
- Hero image: WebP, max 200KB, properly sized
- No JS frameworks loaded for static sections that don't need them
- Slow site = worse Quality Score = higher CPC = client churns

### Animations — USE
- Hero text BlurText/stagger reveal on load
- Fade-up 20px on scroll for cards/sections
- Number ticker on stats
- Hover lift (2-4px up + shadow increase) on cards
- Shimmer/border-beam on primary CTA
- Subtle parallax on hero background (0.5x scroll speed)

### Animations — AVOID
- Heavy Three.js / particle without optimization (see STAGE 8 for safe-use rules + mobile fallbacks)
- Looping animations that never stop (distracting + battery)
- Anything delaying CTA visibility on load
- Full-page loading screens (users bounce instantly)
- More than 2 animation types per section

---

## NICHE PLAYBOOKS

### Pool Service (priority niche)
- **Hero:** Sparkling clean pool, golden hour lighting, Vegas mountains in background ideal. Massive headline, phone number visible, "Get Free Quote" CTA above fold.
- **Trust above fold:** Years in business · Pools serviced · Star rating · Response time
- **Services as icon cards (6 max):** Weekly Maintenance · One-Time Cleaning · Green-to-Clean · Equipment Repair · Salt Cell Service · Filter Service
- **Mobile sticky click-to-call** — single biggest conversion driver. Always include.
- **Before/After gallery** — green pool → crystal clear is the strongest visual selling tool in this niche
- **Section order:** Hero → Trust → Services → Why Us → Before/After → Reviews → Service Area → Final CTA → Footer
- **Voice:** Confident, local, no-BS. "We show up. We get it done. Same crew every time." Never use "leverage", "solutions", "synergize."
- **Service area:** Always list cities individually (Las Vegas, Henderson, Summerlin, North Las Vegas, Boulder City, Spring Valley, Enterprise) — local SEO ranking factor

### Elective Ultrasound (SonoView style — proven)
- **Hero:** Parent seeing baby on screen. Warm lighting. Emotional. Never clinical.
- **Booking CTA above fold always** — non-negotiable
- **Package pricing visible** — people leave if they can't find cost
- **Gallery of real ultrasound images** — top conversion driver, ask client for 8–12
- **FAQ:** Safety · What to expect · Best age (varies by package) · What to bring · Can dad/family come
- **Voice:** Warm, milestone-focused. "See your baby smile for the first time." Celebratory, never medical.
- **Section order:** Hero → How It Works → Packages + Pricing → Gallery → FAQ → Reviews → Book Now

### Future niches (extract patterns when first client lands)
- HVAC, roofing, plumbing → similar to pool but emphasize emergency response, financing
- Med spa, dental → ultrasound playbook adapted, before/after critical
- Solar, fencing, landscaping → high-ticket, longer form, financing calculators

---

## LOVABLE PROMPT LIBRARY (battle-tested)

### Make it premium
> "Make this look more premium and less template-like. Add more visual depth, better spacing between elements, more distinctive typography weight contrast (display font heavier, body font lighter). Audit colors — if anything looks generic, lean harder into the brand palette."

### Mobile pass
> "Mobile pass at 375px width: increase H1 font size by 4px, all body text up 1px, full-width buttons with 16px vertical padding, 24px horizontal section padding, phone number visible in top nav, sticky bottom call button visible only under 768px."

### Hero impact
> "Hero needs more visual impact: add subtle animated gradient overlay (Magic UI), increase headline weight to 700 and size to 72px desktop / 44px mobile, add social proof line under CTA: '⭐ 4.9 stars · 200+ Las Vegas homeowners served'. Keep section length the same."

### Sticky nav
> "Add a sticky nav that appears only after scrolling past the hero (fade in on scroll, transparent → solid white with 4px shadow). Layout: logo left · phone number right (clickable, accent color) · single primary CTA button right of phone. Backdrop blur 8px. Hidden on mobile (mobile already has bottom sticky call button)."

### Parallax hero
> "Add subtle parallax to the hero background image — moves at 0.5x scroll speed using Framer Motion useScroll + useTransform. Hero text and CTAs stay fixed, only the background photo parallaxes."

### Footer cleanup
> "Clean up footer: 3 columns desktop / stacked mobile. Left = logo + 1-line tagline + copyright. Center = 4 quick links (Services, Service Area, Reviews, Contact). Right = phone + email + hours + 2 social icons. Background color = darkest brand neutral. Text = cream or white at 70% opacity, links 100% opacity on hover."

### Trust strip
> "Add a trust strip directly under the hero — 4 columns desktop / 2x2 grid mobile. Each cell: large number (display font, 48px, accent color) with Number Ticker animation on scroll into view, label below (body font, 14px, neutral). Stats: [years] Years in Business · [count]+ Pools Serviced · [rating]★ Google Rating · [time] Avg Response Time. Background: subtle accent-color tint at 5% opacity."

### Services grid
> "Build the services section: 3-column grid desktop, 1-column mobile, [N] cards total. Each card: icon top (lucide-react, 32px, accent color), service name H3 (display font, 24px), 2-line description, '$ from [price]' line at bottom in accent color. Hover: lift 4px, border-beam from Magic UI draws around card. Card background: white, 12px radius, soft shadow."

### Sticky mobile call button
> "Add fixed bottom-right floating call button, mobile only (under 768px). Accent color background, white phone icon (lucide-react Phone), 'Call Now' text, 56px height, 16px from bottom, 16px from right, soft shadow, scales up 5% on tap. Tel link: tel:[phone]. z-index 50."

---

## LOCAL SEO — EVERY SITE GETS THIS

### Setup checklist (during build, not after)
- [ ] All page titles include city + service ("Pool Service in Las Vegas | [Business]")
- [ ] H1 on home includes primary keyword + city
- [ ] Footer has full NAP (Name, Address, Phone) — exactly matching GBP
- [ ] LocalBusiness schema in `<head>` of every page (template below)
- [ ] Service pages: one per service (`/services/weekly-maintenance`, `/services/green-to-clean`)
- [ ] City pages for each service area (`/las-vegas`, `/henderson`, `/summerlin`)
- [ ] Sitemap.xml auto-generated
- [ ] robots.txt allows all
- [ ] Submitted to Google Search Console
- [ ] `llms.txt` file at root for AI crawler visibility (ChatGPT, Perplexity, Claude, Gemini)

### Schema template (paste into site `<head>`)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[Business Name]",
  "image": "[logo URL]",
  "telephone": "[Phone]",
  "url": "[Website URL]",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "addressCountry": "US"
  },
  "areaServed": ["[City1]", "[City2]", "[City3]"],
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
    "opens": "08:00",
    "closes": "17:00"
  }],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[rating]",
    "reviewCount": "[count]"
  }
}
</script>
```

### llms.txt template
```
# [Business Name]
[Business Name] provides [service] to [city] and surrounding areas including [list cities].

## Services
- [Service 1]: [1-line description, price range if relevant]
- [Service 2]: [1-line description]
- [Service 3]: [1-line description]

## Service Area
[City list]

## Contact
Phone: [number]
Hours: [hours]
Website: [URL]

## What makes us different
[USP from discovery, 2-3 sentences]
```

---

## PRE-LAUNCH QA CHECKLIST

Run before sending the live URL to client. No exceptions.

### Functional
- [ ] All phone numbers clickable on mobile (`tel:` links)
- [ ] All email addresses clickable (`mailto:` links)
- [ ] Form submits → confirmation message → email + GHL contact created
- [ ] Form spam protection (honeypot or Turnstile)
- [ ] All internal links work (no 404s)
- [ ] All images have alt text
- [ ] Favicon set
- [ ] Open Graph tags set (og:title, og:description, og:image)
- [ ] Twitter card tags set

### Visual
- [ ] Tested at 375px (iPhone SE), 390px (iPhone 15), 768px (iPad), 1280px (laptop), 1920px (desktop)
- [ ] Sticky elements don't overlap content on scroll
- [ ] No horizontal scroll at any breakpoint
- [ ] Hover states work on all interactive elements
- [ ] Loading state on form submit
- [ ] Dark mode considered (or explicitly disabled — pick one)

### Performance
- [ ] PageSpeed Mobile score 85+
- [ ] LCP under 2.5s
- [ ] CLS under 0.1
- [ ] All images WebP, lazy-loaded below fold
- [ ] No render-blocking JS
- [ ] Fonts preloaded (display: swap)

### SEO
- [ ] Title tags unique per page, under 60 chars
- [ ] Meta descriptions unique, under 160 chars
- [ ] One H1 per page, includes keyword + city
- [ ] Schema validates at validator.schema.org
- [ ] Submitted to Google Search Console
- [ ] Sitemap.xml accessible at /sitemap.xml
- [ ] robots.txt accessible at /robots.txt

### Tracking
- [ ] PostHog or GA4 installed
- [ ] Phone clicks tracked (event: `phone_click`)
- [ ] Form submits tracked (event: `form_submit`)
- [ ] Sticky CTA clicks tracked (event: `sticky_cta_click`)
- [ ] Sentry installed for error tracking

---

## TIMELINE — STANDARD CLIENT BUILD

| Day | Stage | Deliverable |
|---|---|---|
| 0 | Kickoff call | Inputs gathered, references picked |
| 1 | Stage 0 | Design brief written + approved |
| 2-3 | Stage 1 | Base Lovable build, sections live, copy in |
| 4 | Stage 2 | 21st.dev + Magic UI components layered |
| 5 | Stage 3 (optional) | ReactBits advanced components if needed |
| 6 | Stage 4 | Hero photo finalized, video if applicable |
| 6 | QA | Pre-launch checklist run |
| 6 | Stage 5 | IterationX feedback link sent to client |
| 7-8 | Revisions | Up to 2 revision rounds |
| 9 | Stage 6 | Domain + DNS connected, HTTPS verified |
| 10 | Stage 7 | Delivery package sent, GHL updated, GBP work begins |

If you're past day 10 without launch, diagnose: brief was bad, scope crept, or revisions are unfocused. Don't push date silently — always tell client why.

---

## VOICE NOTES — HOW WE COPYWRITE FOR LOCAL SERVICE SITES

- **Specificity beats cleverness.** "Crystal-clear pool, every Tuesday" > "Premium pool care experiences"
- **Numbers are credibility.** "200+ Vegas pools serviced" > "Many happy customers"
- **Owner-friendly language.** Pool guys read this. Lawyers don't.
- **Local pride wins.** "We're Vegas. We get desert pools." Generic copy loses to local copy every time.
- **CTAs are verbs.** "Get Free Quote" not "Free Quote." "Call Now" not "Contact."
- **One promise per section.** If a section says 3 things, it says nothing.

Last rule: **Every site we ship should make the client text Brendan a screenshot of it.** That's the bar.
