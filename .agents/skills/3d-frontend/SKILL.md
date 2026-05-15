---
name: 3D-frontend
description: "Build immersive 3D websites and landing pages where users scroll to walk or fly through a WebGL-rendered 3D scene. Use this skill whenever the user asks for a 3D website, 3D landing page, 3D frontend, scroll-driven 3D experience, room walkthrough, fly-through, parallax 3D scene, immersive web experience, 3D portfolio, 3D storytelling page, or any web page where scrolling controls movement through a three-dimensional space. Also trigger when the user mentions 'Three.js website', 'WebGL scroll', '3D scroll animation', 'camera path on scroll', '3D frontend', 'scroll to explore 3D', 'walk through 3D', or wants to present content within a 3D world navigated by scrolling. Even if the user just says 'make it 3D' or 'make an immersive page' or '3D landing page', use this skill."
---

# 3D Frontend — Scroll-Driven 3D Websites

Create immersive single-file HTML pages where scrolling walks the user through a 3D scene built with Three.js. Content (headings, text, images, CTAs) is overlaid on or embedded within the 3D world. Every DreamWalk page is a self-contained `.html` artifact — no build tools, no npm, no React.

## Tech Stack

All outputs are **single-file HTML** artifacts. No build tools, no npm, no React — just a self-contained `.html` file.

| Library | CDN | Purpose |
|---------|-----|---------|
| Three.js r128 | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | 3D rendering engine |
| GSAP 3.12.5 | `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js` | Animation engine |
| ScrollTrigger 3.12.5 | `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js` | Scroll-to-animation binding |

> **Why this stack?** Three.js is the dominant WebGL framework with the largest ecosystem. GSAP ScrollTrigger is the industry standard for mapping scroll position to animation timelines. Together they power the majority of award-winning 3D scroll websites (see Awwwards, FWA). This combination works in a single HTML file with no build step, perfect for artifacts.
>
> **Important: Three.js r128 API constraints.** This is NOT the latest Three.js. The following do NOT exist in r128 and must never be used: `CapsuleGeometry`, `RoundedBoxGeometry`, `THREE.MathUtils.seededRandom`, `WebGPURenderer`, `THREE.ColorManagement`. Always use `BufferGeometry` primitives (`BoxBufferGeometry`, `SphereBufferGeometry`, etc.) or their aliases (`BoxGeometry`, `SphereGeometry`).

## Architecture Pattern

```
┌─────────────────────────────────────────┐
│  HTML Page                              │
│  ┌───────────────────────────────────┐  │
│  │ <canvas> - Three.js scene (fixed) │  │
│  │  • Camera on a path/spline        │  │
│  │  • 3D objects (geometry/particles) │  │
│  │  • Lighting & fog                 │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ <div class="scroll-container">    │  │
│  │  height: 500vh+ (scrollable)      │  │
│  │  Sections with text/content       │  │
│  │  overlaid via position:fixed or   │  │
│  │  opacity-faded on scroll triggers │  │
│  └───────────────────────────────────┘  │
│                                         │
│  GSAP ScrollTrigger maps scroll% →      │
│  camera.position / camera.lookAt /      │
│  object transforms / material params    │
└─────────────────────────────────────────┘
```

## How to Build a 3D Scroll Page

**Read `references/PATTERNS.md` for detailed, copy-paste code patterns before writing code.** It contains 40+ production-ready patterns for camera animation, lighting, shaders, particles, procedural geometry, and performance optimization — all Three.js r128 compatible.

### Step 1: Scene Design

Decide the **experience type** based on user intent:

| Type | Camera Behavior | Best For |
|------|----------------|----------|
| **Tunnel / Corridor** | Fly forward along Z-axis | Product reveals, storytelling |
| **Orbit / Showcase** | Rotate around a central object | Product pages, portfolios |
| **Landscape Flyover** | Sweep over terrain/cityscape | Landing pages, intros |
| **Room Walk-through** | Move through connected spaces | Virtual tours, presentations |
| **Vertical Descent** | Camera drops down Y-axis | Timeline, layer reveals |
| **Spline Path** | Camera follows a curved 3D path | Cinematic, editorial |

### Step 2: Scaffold the HTML

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Experience</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { overflow-x: hidden; }
    canvas { position: fixed; top: 0; left: 0; z-index: 0; }
    .scroll-container { position: relative; z-index: 1; pointer-events: none; }
    .section { height: 100vh; display: flex; align-items: center; justify-content: center; }
    .content { pointer-events: auto; /* re-enable for interactive elements */ }
  </style>
</head>
<body>
  <!-- Three.js canvas is created programmatically -->
  <div class="scroll-container">
    <!-- Sections drive scroll height; content overlays the 3D scene -->
    <div class="section" id="section-1">...</div>
    <div class="section" id="section-2">...</div>
    <!-- Add more sections = more scroll distance = longer camera journey -->
  </div>
  <script src="THREE_CDN"></script>
  <script src="GSAP_CDN"></script>
  <script src="SCROLLTRIGGER_CDN"></script>
  <script>
    // Scene setup, animation, ScrollTrigger bindings
  </script>
</body>
</html>
```

### Step 3: Core Three.js Setup

Always include these fundamentals:

1. **Scene + Camera + Renderer** — Use `PerspectiveCamera` with FOV 60-75 for immersive feel
2. **Lighting** — At minimum: one `AmbientLight` + one `DirectionalLight`. Add `PointLight` or `SpotLight` for drama
3. **Fog** — `scene.fog = new THREE.FogExp2(color, density)` adds depth and hides pop-in
4. **Resize handler** — Always handle `window.resize`
5. **Render loop** — `requestAnimationFrame` with `renderer.render(scene, camera)`

### Step 4: Scroll → Camera Animation with GSAP

The critical binding pattern:

```javascript
gsap.registerPlugin(ScrollTrigger);

// Store camera animation targets as a plain object
const camAnim = { x: 0, y: 2, z: 10, lookX: 0, lookY: 0, lookZ: 0 };

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: 1,  // 1 second smoothing
  }
});

// Chain camera keyframes
tl.to(camAnim, { x: 0, y: 2, z: 5, lookX: 0, lookY: 0, lookZ: 0, duration: 1 })
  .to(camAnim, { x: 3, y: 1, z: 0, lookX: 2, lookY: 0, lookZ: -5, duration: 1 })
  .to(camAnim, { x: 0, y: 5, z: -10, lookX: 0, lookY: 0, lookZ: -15, duration: 1 });

// In the render loop, apply the animated values
function animate() {
  requestAnimationFrame(animate);
  camera.position.set(camAnim.x, camAnim.y, camAnim.z);
  camera.lookAt(camAnim.lookX, camAnim.lookY, camAnim.lookZ);
  renderer.render(scene, camera);
}
```

### Step 5: Content Overlay

Overlay HTML content that fades in/out at scroll positions:

```javascript
// Fade in a section when the camera reaches a waypoint
gsap.fromTo("#section-2 .content", 
  { opacity: 0, y: 50 },
  { opacity: 1, y: 0,
    scrollTrigger: {
      trigger: "#section-2",
      start: "top center",
      end: "top 20%",
      scrub: true
    }
  }
);
```

### Step 6: Visual Polish

Apply these to elevate from basic to impressive:

- **Particles** — `THREE.Points` with `THREE.BufferGeometry` for floating dust/stars
- **Post-processing glow** — Use emissive materials + bloom-like bright colors
- **Color transitions** — Animate `scene.background` and `scene.fog.color` along the scroll
- **Object reveals** — Objects scale from 0 or fade in as camera approaches
- **Parallax layers** — Objects at different distances move at different rates
- **Subtle rotation** — Slowly rotate decorative objects in the render loop (independent of scroll)
- **Mouse parallax** — Slight camera offset based on mouse position for depth feel

## Design Principles

1. **Performance first** — Keep geometry simple. Use `BufferGeometry`, limit draw calls, use `fog` to hide far objects. Target 60fps
2. **Smooth scrolling** — `scrub: 1` or `scrub: 2` in ScrollTrigger for buttery motion. Never use `scrub: true` (instant, jerky)
3. **Readable content** — Text overlays need contrast. Use semi-transparent dark panels behind light text, or ensure 3D background is dark/blurred behind text areas
4. **Mobile fallback** — Touch scrolling works with ScrollTrigger. Consider reducing particle counts and geometry complexity on mobile via `window.innerWidth` checks
5. **Loading graceful** — Show a simple CSS loading screen, hide it when Three.js scene is ready

## Common 3D Objects to Build (no external models needed)

These can all be created with Three.js built-in geometry — no GLTF files required:

- **Floating geometric shapes** — BoxGeometry, IcosahedronGeometry, TorusKnotGeometry with MeshStandardMaterial
- **Terrain** — PlaneGeometry with vertex displacement (sine waves, noise)
- **Particle fields** — BufferGeometry + Points for stars, dust, snow, data visualization
- **Grid floors** — GridHelper or custom line geometry
- **Tubes/tunnels** — TubeGeometry along a CatmullRomCurve3 path
- **Text** — Canvas textures rendered onto PlaneGeometry, or sprite-based
- **Wireframe objects** — Any geometry with `wireframe: true` material for a tech aesthetic
- **Light beams** — CylinderGeometry with emissive transparent material

### Step 7: Mouse Parallax (Optional but Recommended)

Add subtle camera offset on mouse move for depth perception:

```javascript
const mouse = { x: 0, y: 0 };
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
  mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

// In the render loop, add a slight offset to the camera
const parallaxStrength = 0.3;
camera.position.x = camAnim.x + mouse.x * parallaxStrength;
camera.position.y = camAnim.y - mouse.y * parallaxStrength * 0.5;
```

### Room Walk-through Pattern

For architectural / real estate walk-throughs, build rooms from simple geometry:

```javascript
// Create a room with BoxGeometry for walls, floor, ceiling
function createRoom(width, height, depth, position, color) {
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  room.position.copy(position);
  scene.add(room);
  return room;
}

// Create furniture placeholders with simple geometry
// Sofa = wide flat box, Table = thin box on cylinders, Lamp = cylinder + sphere
// Use emissive PointLights inside rooms for warm interior feel
```

Key principles for room walkthroughs:
- Use `THREE.BackSide` on materials so walls render from inside
- Place warm `PointLight` sources inside each room (color `0xffeedd`, intensity 0.8)
- Camera path should enter through doorway openings, not clip through walls
- Animate camera lookAt to naturally scan each room as you enter
- Add window rectangles with emissive bright material to simulate daylight

## Anti-Patterns to Avoid

- ❌ Do NOT use `OrbitControls` — scroll should be the only navigation
- ❌ Do NOT load external GLTF/GLB models — keep it self-contained in the HTML file
- ❌ Do NOT use `THREE.CapsuleGeometry` — not available in r128
- ❌ Do NOT set canvas `pointer-events: none` globally — the render loop needs the canvas
- ❌ Do NOT forget `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — prevents GPU overload on retina
- ❌ Do NOT animate camera with `camera.rotation` directly — use `camera.lookAt()` with animated target coordinates for stable results
- ❌ Do NOT make the scroll container too short — 400vh minimum for a meaningful journey, 600vh+ preferred

## Aesthetic Direction

Apply the same creative boldness from the `frontend-design` skill. Each 3D scroll page should feel unique:

- Choose a **color mood**: neon cyberpunk, warm sunset, deep ocean, crystalline ice, dark void with emissive accents, etc.
- Choose a **geometry language**: organic curves vs hard edges, sparse vs dense, large monoliths vs tiny particles
- **Typography** overlay: import distinctive Google Fonts. Use large, cinematic type. Animate opacity and transform on scroll
- The 3D scene and HTML content should feel like **one cohesive experience**, not a 3D background with slapped-on text

## Quick Reference: CDN URLs

```
Three.js r128:     https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
GSAP 3.12.5:       https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
ScrollTrigger:     https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js
```
