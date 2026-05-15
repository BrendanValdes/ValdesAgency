# Design References Playbook
**Scope:** Reference libraries + animated background components used during the design phase
**Reads:** ROCCO (design brief, hero builds, component selection)
**Trigger:** Read this BEFORE picking UI patterns or building a hero section background
**Goal:** Every client site uses real-world proven UI patterns and a hero that stops the scroll in <2s.

---

## WHY THIS FILE EXISTS

Two tools that should be hit on every single website build but kept getting skipped:

1. **Mobbin** — when you need a real UI pattern, not a hallucinated one
2. **Shadergradient** — when the hero needs to feel alive without spending 3 hours on Higgsfield

Use both. Every build. No exceptions.

---

## TOOL 1 — MOBBIN (UI PATTERN REFERENCE)

**URL:** mobbin.com
**Type:** Reference library — 1000s of real production app/web UIs, screenshot + flow library
**Cost:** Free tier covers 90% of what we need

### What it solves
Stops ROCCO from inventing UI patterns. Mobbin shows what Airbnb, Linear, Stripe, Notion actually shipped. Real apps, real flows, real conversion-tested designs.

### When to use it
Trigger Mobbin BEFORE the design brief, AND before any component decision:

- **Hero section layout** — search "hero" → filter by industry/style → screenshot 3 references
- **Pricing page** — search "pricing" → see what actually converts in the wild
- **Onboarding flows** — search "onboarding" → swipe 5 patterns
- **Empty states, forms, dashboards** — anything UI-shaped
- **Industry-specific** — search "fitness app", "real estate", "service business" — Mobbin has it

### The workflow
```
1. Open mobbin.com → search the pattern (e.g. "service business hero")
2. Filter by:
   - Platform (Web for client sites, iOS for app screenshots in pitch decks)
   - Style tag (e.g. "minimal", "bold", "playful")
3. Screenshot 3–5 references
4. Save to /workspaces/ValdesAgency/clients/[client-name]/references/mobbin/
5. Paste into the design brief alongside designspells references
```

### What to grab vs ignore
- ✅ GRAB: layout proportions, hierarchy, microcopy patterns, CTA placement, color/typography pairing
- ❌ IGNORE: exact pixel-perfect copies (that's plagiarism), super-niche SaaS patterns for local service businesses

### Speed rule
If you're stuck designing a section for >5 minutes, you skipped Mobbin. Open it. Find the pattern. Move on.

---

## TOOL 2 — SHADERGRADIENT (HERO BACKGROUND)

**URL:** shadergradient.co
**Type:** Animated WebGL gradient React component
**Cost:** Free, MIT license
**Repo:** github.com/ruucm/shadergradient

### What it solves
Hero section backgrounds that feel premium without:
- Generating a Higgsfield video (60–180s + credit cost)
- Hosting a video file (LCP killer)
- Using a static gradient (looks dead)

Shadergradient = continuous slow-moving 3D shader gradient. Looks like Apple, Linear, Vercel. Loads fast, runs on GPU, ~30kb gzipped.

### When to use it
- Hero backgrounds where the client wants "premium / cinematic / modern"
- Service industries that DON'T need to show a literal pool/product image
- Section dividers that need motion
- Loading screens, splash pages

### When NOT to use it
- Pool service hero — show the actual pool (Higgsfield image > generic gradient)
- Medical / ultrasound (SonoView) — needs warmth + real imagery
- Anywhere the LCP budget is already tight (run PageSpeed first)

### Install
```bash
npm install shadergradient
```

### Basic usage — hero background
```tsx
import ShaderGradient from 'shadergradient'

export function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Animated gradient layer */}
      <div className="absolute inset-0 -z-10">
        <ShaderGradient
          control="props"
          type="waterPlane"
          color1="#ff5005"
          color2="#dbba95"
          color3="#d0bce1"
          uTime={0}
          uSpeed={0.3}
          uStrength={1.5}
          uDensity={1.3}
          grain="on"
          reflection={0.1}
        />
      </div>

      {/* Hero content on top */}
      <div className="relative z-10 flex h-full items-center justify-center">
        <h1 className="text-6xl font-bold text-white">
          Pool service Vegas trusts
        </h1>
      </div>
    </section>
  )
}
```

### Preset colorways (steal these, don't reinvent)

**Vegas sunset (pool clients):**
```tsx
color1="#ff5005" color2="#ff8a3d" color3="#6d2c8a"
```

**Cool water blue (pool, spa, wellness):**
```tsx
color1="#0a2540" color2="#3b82c4" color3="#a8d8ea"
```

**Warm rose (SonoView / mom-focused):**
```tsx
color1="#fdd5d5" color2="#f4a8a8" color3="#b87878"
```

**Premium navy + gold (high-end service):**
```tsx
color1="#0a1929" color2="#1e3a5f" color3="#d4af37"
```

### Performance rules — non-negotiable
1. **Lazy-load below the fold.** Use `next/dynamic` with `ssr: false` if hero is not in first paint:
   ```tsx
   const ShaderGradient = dynamic(() => import('shadergradient'), { ssr: false })
   ```
2. **Cap `uSpeed` at 0.4.** Anything faster looks frantic, kills CPU on low-end mobile.
3. **`uDensity` between 1.0–1.5.** Higher = busier = looks AI-generated.
4. **Always test on a mid-range Android.** If FPS drops below 30, swap to a static gradient.
5. **Run PageSpeed after adding.** LCP must stay <2.5s (CLAUDE.md baseline).
6. **Add `prefers-reduced-motion` fallback:**
   ```tsx
   import { useReducedMotion } from 'framer-motion'

   export function Hero() {
     const reduceMotion = useReducedMotion()
     return (
       <section>
         {reduceMotion ? (
           <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#ff5005] to-[#6d2c8a]" />
         ) : (
           <ShaderGradient {...} />
         )}
       </section>
     )
   }
   ```

### Tuning workflow
Don't guess colors. Use the live editor:
1. Go to shadergradient.co
2. Tune sliders + colors until it matches the brief
3. Hit "Copy Code" — paste into the component

---

## WORKFLOW INTEGRATION

How these slot into the website build motion ([[website-build]]):

```
PHASE 0 — BRIEF
  ↳ designspells.co (reference vibe)
  ↳ MOBBIN (specific UI patterns)         ← ADD THIS
  ↳ Save all references → /clients/[name]/references/

PHASE 1 — LOVABLE FOUNDATION
  ↳ Standard structure prompt

PHASE 2 — COMPONENTS
  ↳ 21st.dev + Magic UI + uiguideline

PHASE 3 — ADVANCED
  ↳ ReactBits via Codespaces
  ↳ SHADERGRADIENT for hero background    ← ADD THIS (when applicable)

PHASE 4 — HERO VIDEO
  ↳ Higgsfield (only if the client needs literal product imagery)
  ↳ Otherwise SHADERGRADIENT covers it    ← DECISION POINT
```

### Decision tree: Higgsfield video OR Shadergradient?
```
Does the hero need to show a real product/service in action?
  ├─ YES (pool, ultrasound, food, real estate)  → Higgsfield video
  └─ NO  (software, consulting, finance, B2B) → Shadergradient
```

---

## CHECKLIST — BEFORE LAUNCH

- [ ] Mobbin references pulled for all major sections, saved to `/clients/[name]/references/mobbin/`
- [ ] Shadergradient (if used) lazy-loaded, `uSpeed` ≤ 0.4
- [ ] `prefers-reduced-motion` fallback shipped
- [ ] PageSpeed run on mobile — LCP < 2.5s
- [ ] FPS check on mid-range device (Pixel 6a / iPhone SE)

---

## NEXT MOVE WHEN STUCK

1. **Hero looks dead** → Shadergradient with Vegas sunset preset, 2 minutes done.
2. **Section feels generic** → Mobbin search for that section type, copy the layout, not the pixels.
3. **Client says "make it pop"** → That's a vague brief. Pull 3 Mobbin references, ask which one "pops" for them. Now you have spec.

End of file. Update when you find a new preset that converts, or a Mobbin pattern that hit on multiple clients.
