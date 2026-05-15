# 3D Frontend — Code Patterns Reference

Production-ready patterns for building smooth, beautiful scroll-driven 3D websites. All code is Three.js r128 compatible (CDN, no ES modules). Copy-paste into any single-file HTML.

---

## 1. Scroll-Driven Camera Animation

### Pattern 1A: Master Timeline Scrub (Recommended Default)

**What it does**: Maps the entire scroll range to a single GSAP timeline, giving one unified camera journey.

**When to use**: Every scroll-driven 3D page. This is the foundation.

```javascript
gsap.registerPlugin(ScrollTrigger);

const cam = { x: 0, y: 2, z: 15, lx: 0, ly: 0, lz: 0 };

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: "#scroll-container",
    start: "top top",
    end: "bottom bottom",
    scrub: 1.5,    // 1.5s smoothing — buttery feel
  }
});

// Chain keyframes — each .to() is a segment of the journey
tl.to(cam, { x: 0, y: 2, z: 5, lx: 0, ly: 1, lz: -5, duration: 1, ease: "none" })
  .to(cam, { x: 5, y: 3, z: 0, lx: 0, ly: 0, lz: -10, duration: 1.5, ease: "none" })
  .to(cam, { x: 0, y: 8, z: -15, lx: 0, ly: 0, lz: -20, duration: 1.5, ease: "none" });

// In render loop — apply animated values
function animate() {
  requestAnimationFrame(animate);
  camera.position.set(cam.x, cam.y, cam.z);
  camera.lookAt(cam.lx, cam.ly, cam.lz);
  renderer.render(scene, camera);
}
```

**Performance**: scrub: 1.5 is optimal. Lower = responsive but jittery. Higher = smooth but sluggish. Never use `scrub: true` (instant, no smoothing).

### Pattern 1B: Normalized Scroll Progress

**What it does**: Exposes a 0–1 progress value you can use for anything (camera, colors, opacity, size).

```javascript
let scrollProgress = 0;

ScrollTrigger.create({
  trigger: "#scroll-container",
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => {
    scrollProgress = self.progress; // 0 at top, 1 at bottom
  }
});

// In render loop — use scrollProgress for any interpolation
camera.position.z = 15 - scrollProgress * 30;
scene.fog.density = 0.02 + scrollProgress * 0.01;
```

### Pattern 1C: Per-Section Triggers

**What it does**: Each HTML section triggers its own animation, allowing independent control.

```javascript
const sections = ["#s0", "#s1", "#s2", "#s3"];

sections.forEach((sel, i) => {
  gsap.to(cam, {
    x: keyframes[i].x, y: keyframes[i].y, z: keyframes[i].z,
    scrollTrigger: {
      trigger: sel,
      start: "top center",
      end: "bottom center",
      scrub: 1.5,
    }
  });
});
```

### Pattern 1D: Pinned Camera Rotation (Product Showcase)

**What it does**: Camera orbits around a central object while the section is pinned.

```javascript
const orbit = { angle: 0 };
const orbitRadius = 8;

gsap.to(orbit, {
  angle: Math.PI * 2,
  scrollTrigger: {
    trigger: "#product-section",
    start: "top top",
    end: "+=300%",
    pin: true,
    scrub: 1.5,
  }
});

// In render loop:
camera.position.x = Math.sin(orbit.angle) * orbitRadius;
camera.position.z = Math.cos(orbit.angle) * orbitRadius;
camera.position.y = 3 + Math.sin(orbit.angle * 2) * 1;
camera.lookAt(0, 1, 0);
```

---

## 2. Modern Visual Techniques

### Pattern 2A: Three-Point Lighting Setup

**What it does**: Creates professional, cinematic lighting used in architectural and product visualization.

```javascript
// Key light — main illumination, warm tone
const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.0);
keyLight.position.set(5, 8, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 50;
scene.add(keyLight);

// Fill light — soften shadows, cooler tone
const fillLight = new THREE.DirectionalLight(0xc0d0e0, 0.4);
fillLight.position.set(-5, 3, -3);
scene.add(fillLight);

// Rim/back light — edge highlights, slight color
const rimLight = new THREE.DirectionalLight(0xaabbff, 0.3);
rimLight.position.set(0, 3, -8);
scene.add(rimLight);

// Ambient — baseline so nothing is pure black
const ambient = new THREE.AmbientLight(0x404060, 0.35);
scene.add(ambient);
```

**Lighting recipes by mood:**

| Mood | Key (hex/intensity) | Fill | Ambient | Fog |
|------|---------------------|------|---------|-----|
| Warm interior | `0xffeedd` / 0.9 | `0xffd4a0` / 0.4 | `0x404030` / 0.3 | `0x0a0a08` |
| Cool night | `0x6688bb` / 0.6 | `0x334466` / 0.3 | `0x202030` / 0.2 | `0x0a0a15` |
| Golden hour | `0xffaa55` / 1.2 | `0xcc8844` / 0.4 | `0x503020` / 0.3 | `0x1a0a00` |
| Cyberpunk | `0xff00ff` / 0.8 | `0x00ffff` / 0.5 | `0x100020` / 0.2 | `0x050010` |
| Studio white | `0xffffff` / 1.0 | `0xf0f0ff` / 0.6 | `0x808080` / 0.5 | none |

### Pattern 2B: Fake Bloom / Glow (No Post-Processing)

**What it does**: Creates glow effects without EffectComposer (unavailable in single-file CDN setup). Uses layered meshes with additive blending.

```javascript
// Method 1: Emissive material + transparent glow shell
function createGlowingOrb(position, color, radius) {
  const group = new THREE.Group();
  group.position.copy(position);

  // Core — solid, emissive
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.5,
    })
  );
  group.add(core);

  // Glow shell 1 — larger, transparent, additive
  const glow1 = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.8, 24, 24),
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
  );
  group.add(glow1);

  // Glow shell 2 — even larger, more subtle
  const glow2 = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 3, 16, 16),
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
  );
  group.add(glow2);

  scene.add(group);
  return group;
}

// Method 2: Sprite-based glow (billboard, always faces camera)
function createGlowSprite(position, color, scale) {
  // Create a radial gradient on canvas
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    color: color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.8,
  }));
  sprite.scale.setScalar(scale);
  sprite.position.copy(position);
  scene.add(sprite);
  return sprite;
}
```

### Pattern 2C: Fog & Atmosphere

**What it does**: Adds depth perception and hides geometry pop-in at distance.

```javascript
// Exponential fog — fades smoothly, great for interiors
scene.fog = new THREE.FogExp2(0x0a0a0a, 0.02);

// Linear fog — more control over start/end
scene.fog = new THREE.Fog(0x0a0a0a, 10, 80);

// Animate fog color on scroll (mood transitions)
const fogColors = [
  new THREE.Color(0x0a0a15), // dark blue
  new THREE.Color(0x1a0a00), // warm amber
  new THREE.Color(0x0a1520), // teal night
];

function updateFogMood(progress) {
  const i = Math.min(Math.floor(progress * (fogColors.length - 1)), fogColors.length - 2);
  const t = (progress * (fogColors.length - 1)) - i;
  scene.fog.color.copy(fogColors[i]).lerp(fogColors[i + 1], t);
  scene.background.copy(scene.fog.color); // match background to fog
}
```

### Pattern 2D: Procedural Canvas Textures

**What it does**: Generates textures at runtime using Canvas2D — no external image files needed.

```javascript
// Marble / stone texture
function createMarbleTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width || 512;
  canvas.height = height || 512;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#e8e0d0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Veins
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(180,170,155,${0.1 + Math.random() * 0.15})`;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    let x = Math.random() * canvas.width;
    let y = Math.random() * canvas.height;
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (Math.random() - 0.5) * 80;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

// Wood grain texture
function createWoodTexture(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width || 512;
  canvas.height = height || 256;
  const ctx = canvas.getContext("2d");

  const baseColor = [60, 40, 25];
  for (let y = 0; y < canvas.height; y++) {
    const noise = Math.sin(y * 0.3) * 10 + Math.sin(y * 0.7) * 5;
    const r = baseColor[0] + noise + Math.random() * 8;
    const g = baseColor[1] + noise * 0.7 + Math.random() * 5;
    const b = baseColor[2] + noise * 0.3 + Math.random() * 3;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, canvas.width, 1);
  }

  return new THREE.CanvasTexture(canvas);
}

// Usage:
const marbleMat = new THREE.MeshStandardMaterial({
  map: createMarbleTexture(),
  roughness: 0.2,
  metalness: 0.05,
});
```

### Pattern 2E: Metallic & Glass Materials

**What it does**: PBR-like materials for luxury/product aesthetics.

```javascript
// Brushed metal
const brushedMetal = new THREE.MeshStandardMaterial({
  color: 0xaaaaaa,
  metalness: 0.9,
  roughness: 0.35,
});

// Gold / brass accent
const goldAccent = new THREE.MeshStandardMaterial({
  color: 0xc9a86c,
  metalness: 0.7,
  roughness: 0.25,
});

// Tinted glass
const tintedGlass = new THREE.MeshStandardMaterial({
  color: 0x88bbdd,
  transparent: true,
  opacity: 0.2,
  metalness: 0.95,
  roughness: 0.05,
  side: THREE.DoubleSide,
});

// Frosted glass
const frostedGlass = new THREE.MeshStandardMaterial({
  color: 0xddddee,
  transparent: true,
  opacity: 0.35,
  metalness: 0.1,
  roughness: 0.8,
});

// Matte ceramic
const ceramic = new THREE.MeshStandardMaterial({
  color: 0xf5f0e8,
  metalness: 0.0,
  roughness: 0.6,
});
```

### Pattern 2F: Advanced Particle Systems

**What it does**: Particles with per-particle size, color, and opacity via custom attributes.

```javascript
function createParticleField(count, bounds, color, sizeRange) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * bounds.x;
    positions[i * 3 + 1] = Math.random() * bounds.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * bounds.z;
    sizes[i] = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    opacities[i] = 0.2 + Math.random() * 0.6;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: color,
    size: sizeRange[1],
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  return { points, positions: geo.attributes.position };
}

// Animate particles (gentle drift + sine wave)
function animateParticles(field, time) {
  const arr = field.positions.array;
  for (let i = 0; i < arr.length / 3; i++) {
    arr[i * 3 + 1] += Math.sin(time * 0.5 + i * 0.1) * 0.001; // gentle vertical float
    arr[i * 3]     += Math.cos(time * 0.3 + i * 0.2) * 0.0005; // gentle horizontal drift
  }
  field.positions.needsUpdate = true;
}

// Usage:
const dustMotes = createParticleField(500, { x: 40, y: 6, z: 60 }, 0xc9a86c, [0.02, 0.06]);
```

### Pattern 2G: Custom ShaderMaterial — Gradient Sky Dome

**What it does**: Creates a smooth gradient sky using vertex shader — no texture needed.

```javascript
const skyGeo = new THREE.SphereGeometry(100, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor: { value: new THREE.Color(0x0a0a2e) },
    bottomColor: { value: new THREE.Color(0x1a0a00) },
    offset: { value: 20 },
    exponent: { value: 0.6 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Animate sky colors on scroll:
// skyMat.uniforms.topColor.value.lerp(newTopColor, delta);
```

### Pattern 2H: Fresnel Glow Shader (Edge Glow)

**What it does**: Objects glow at their edges, creating a holographic/energy feel.

```javascript
const fresnelMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    glowColor: { value: new THREE.Color(0x44aaff) },
    intensity: { value: 1.5 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform vec3 glowColor;
    uniform float intensity;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      float fresnel = 1.0 - dot(vNormal, vViewDir);
      fresnel = pow(fresnel, 3.0) * intensity;
      gl_FragColor = vec4(glowColor, fresnel);
    }
  `,
  side: THREE.FrontSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), fresnelMat);
scene.add(glowSphere);
```

### Pattern 2I: Noise Vertex Displacement Shader

**What it does**: Deforms geometry with animated noise for organic blob/water effects.

```javascript
const noiseMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uAmplitude: { value: 0.4 },
    uFrequency: { value: 2.0 },
    uColor1: { value: new THREE.Color(0x1a0a3a) },
    uColor2: { value: new THREE.Color(0x6644aa) },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uAmplitude;
    uniform float uFrequency;
    varying float vDisplacement;
    varying vec3 vNormal;

    // Simple 3D noise function
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }

    void main() {
      vNormal = normal;
      float noise = snoise(position * uFrequency + uTime * 0.5);
      vDisplacement = noise;
      vec3 newPos = position + normal * noise * uAmplitude;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying float vDisplacement;
    void main() {
      float t = vDisplacement * 0.5 + 0.5;
      vec3 color = mix(uColor1, uColor2, t);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const blob = new THREE.Mesh(new THREE.SphereGeometry(2, 64, 64), noiseMat);
scene.add(blob);

// In render loop:
// noiseMat.uniforms.uTime.value = elapsedTime;
```

### Pattern 2J: Animated Water Plane Shader

**What it does**: Creates a simple animated water surface.

```javascript
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x1a6a8a) },
    uOpacity: { value: 0.8 },
  },
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      vUv = uv;
      float wave = sin(position.x * 2.0 + uTime) * 0.15
                  + sin(position.y * 3.0 + uTime * 1.3) * 0.1
                  + sin((position.x + position.y) * 1.5 + uTime * 0.7) * 0.08;
      vWave = wave;
      vec3 pos = position;
      pos.z += wave;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vWave;
    void main() {
      float highlight = smoothstep(0.1, 0.3, vWave);
      vec3 color = mix(uColor, uColor * 1.5, highlight);
      gl_FragColor = vec4(color, uOpacity);
    }
  `,
  side: THREE.DoubleSide,
});

const water = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 64, 64), waterMat);
water.rotation.x = -Math.PI / 2;
scene.add(water);
// In render loop: waterMat.uniforms.uTime.value = elapsedTime;
```

---

## 3. Performance Optimization

### Pattern 3A: InstancedMesh for Repeated Objects

**What it does**: Renders hundreds of identical objects in a single draw call.

```javascript
function createInstancedForest(treeCount, areaSize) {
  const geo = new THREE.ConeGeometry(0.5, 2, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, treeCount);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < treeCount; i++) {
    dummy.position.set(
      (Math.random() - 0.5) * areaSize,
      1,
      (Math.random() - 0.5) * areaSize
    );
    dummy.scale.setScalar(0.5 + Math.random() * 1.5);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  scene.add(mesh);
  return mesh;
}

// 500 trees in 1 draw call:
createInstancedForest(500, 80);
```

### Pattern 3B: Mobile Detection & Quality Scaling

```javascript
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

// Renderer quality
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.antialias = !isMobile;

// Scene complexity
const particleCount = isMobile ? 200 : 800;
const shadowsEnabled = !isMobile;
renderer.shadowMap.enabled = shadowsEnabled;

// Geometry detail
const sphereSegments = isMobile ? 16 : 32;
const planeSegments = isMobile ? 32 : 128;
```

### Pattern 3C: Geometry Budget Guidelines

| Object Type | Max Triangles | Notes |
|-------------|--------------|-------|
| Hero object | 5,000–10,000 | IcosahedronGeometry(1, 3) = ~5k tris |
| Furniture piece | 100–500 | Box + cylinder combos |
| Room (walls/floor/ceiling) | 10–20 | PlaneGeometry per surface |
| Terrain | 10,000–30,000 | PlaneGeometry(100, 100, 128, 128) |
| Particles | 500–2,000 points | BufferGeometry + Points |
| Total scene | < 100,000 tris | Target 60fps on mid-range mobile |

### Pattern 3D: Frustum Culling & Distance Culling

```javascript
// Frustum culling is ON by default in Three.js. Never disable it.
// For manual distance culling of expensive objects:

function updateDistanceCulling(camera, objects, maxDistance) {
  objects.forEach(obj => {
    const dist = camera.position.distanceTo(obj.position);
    obj.visible = dist < maxDistance;
  });
}

// Call in render loop:
// updateDistanceCulling(camera, decorativeObjects, 50);
```

---

## 4. Content Overlay Patterns

### Pattern 4A: Glass Panel Overlay (Glassmorphism)

```css
.glass-panel {
  background: rgba(10, 10, 10, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 2.5rem;
}
```

### Pattern 4B: Scroll-Synced Fade In/Out

```javascript
const sections = ["#s0", "#s1", "#s2", "#s3"];

sections.forEach((sel, i) => {
  const el = document.querySelector(sel + " .content");
  if (!el) return;

  // Fade in
  gsap.fromTo(el,
    { opacity: 0, y: 40 },
    {
      opacity: 1, y: 0,
      scrollTrigger: {
        trigger: sel,
        start: "top 60%",
        end: "top 25%",
        scrub: true,
      }
    }
  );

  // Fade out (except last section)
  if (i < sections.length - 1) {
    gsap.to(el, {
      opacity: 0, y: -30,
      scrollTrigger: {
        trigger: sel,
        start: "bottom 55%",
        end: "bottom 25%",
        scrub: true,
      }
    });
  }
});
```

### Pattern 4C: Progress Indicator

```javascript
// HTML: dots on the right edge
// <div class="progress-track">
//   <div class="progress-dot active" data-section="0"></div>
//   <div class="progress-dot" data-section="1"></div>
//   ...
// </div>

const dots = document.querySelectorAll(".progress-dot");
const roomLabels = ["Entrance", "Living Room", "Kitchen", "Bedroom"];
const roomLabel = document.getElementById("room-label");

ScrollTrigger.create({
  trigger: "#scroll-container",
  start: "top top",
  end: "bottom bottom",
  onUpdate: (self) => {
    const idx = Math.min(Math.floor(self.progress * sections.length), sections.length - 1);
    dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    if (roomLabel) roomLabel.textContent = roomLabels[idx];
  }
});

// Click to scroll
dots.forEach(dot => {
  dot.addEventListener("click", () => {
    const idx = parseInt(dot.dataset.section);
    document.querySelector(sections[idx])?.scrollIntoView({ behavior: "smooth" });
  });
});
```

### Pattern 4D: Parallax Text (Different Speed than Scene)

```javascript
gsap.to("#hero-text", {
  y: -200,
  scrollTrigger: {
    trigger: "#s0",
    start: "top top",
    end: "bottom top",
    scrub: 0.5,  // faster scrub = text moves ahead of scene
  }
});
```

---

## 5. Camera Path Techniques

### Pattern 5A: CatmullRomCurve3 Spline Path

**What it does**: Camera follows a smooth curved path through 3D space, creating a cinematic fly-through.

```javascript
const cameraPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 2, 15),
  new THREE.Vector3(0, 2, 5),
  new THREE.Vector3(-3, 3, -5),
  new THREE.Vector3(5, 2, -10),
  new THREE.Vector3(0, 5, -20),
], false, "catmullrom", 0.5);

// Optional: visualize the path during development
// const pathGeo = new THREE.TubeGeometry(cameraPath, 100, 0.05, 8, false);
// scene.add(new THREE.Mesh(pathGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 })));

const lookAtPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 1, -5),
  new THREE.Vector3(0, 1, -12),
  new THREE.Vector3(2, 0, -15),
  new THREE.Vector3(0, 0, -25),
]);

// In render loop — use scrollProgress (0 to 1)
function updateCameraOnPath(progress) {
  const pos = cameraPath.getPointAt(progress);
  const look = lookAtPath.getPointAt(progress);
  camera.position.copy(pos);
  camera.lookAt(look);
}
```

### Pattern 5B: Smooth LookAt Interpolation

**What it does**: Prevents camera snapping when lookAt target changes. Smoothly rotates.

```javascript
const currentLookAt = new THREE.Vector3(0, 0, 0);
const targetLookAt = new THREE.Vector3();

function smoothLookAt(targetX, targetY, targetZ, lerpFactor) {
  targetLookAt.set(targetX, targetY, targetZ);
  currentLookAt.lerp(targetLookAt, lerpFactor || 0.05);
  camera.lookAt(currentLookAt);
}

// In render loop:
// smoothLookAt(cam.lx, cam.ly, cam.lz, 0.08);
```

### Pattern 5C: Tunnel / Corridor Fly-Through

```javascript
const tunnelPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 20),
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(2, 0, 0),
  new THREE.Vector3(-1, 0, -10),
  new THREE.Vector3(0, 0, -20),
]);

const tunnelGeo = new THREE.TubeGeometry(tunnelPath, 200, 3, 16, false);
const tunnelMat = new THREE.MeshStandardMaterial({
  color: 0x222233,
  side: THREE.BackSide,
  metalness: 0.3,
  roughness: 0.7,
});
const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat);
scene.add(tunnel);

// Camera follows the same path
function updateTunnelCamera(progress) {
  const pos = tunnelPath.getPointAt(Math.min(progress, 0.99));
  const lookAhead = tunnelPath.getPointAt(Math.min(progress + 0.01, 1.0));
  camera.position.copy(pos);
  camera.lookAt(lookAhead);
}
```

---

## 6. Procedural Geometry

### Pattern 6A: Terrain from Noise

**What it does**: Creates natural-looking terrain by displacing plane vertices with a noise function.

```javascript
// Simple JS noise for vertex displacement
function simpleNoise(x, z) {
  return Math.sin(x * 0.3) * Math.cos(z * 0.3) * 2
       + Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.5 + 0.7) * 1
       + Math.sin(x * 1.5) * Math.cos(z * 1.2) * 0.5;
}

function createTerrain(width, depth, resolution, heightScale) {
  const geo = new THREE.PlaneGeometry(width, depth, resolution, resolution);
  geo.rotateX(-Math.PI / 2);

  const positions = geo.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    positions[i + 1] = simpleNoise(x, z) * heightScale;
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a5a3a,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  const terrain = new THREE.Mesh(geo, mat);
  scene.add(terrain);
  return terrain;
}

createTerrain(100, 100, 128, 3);
```

### Pattern 6B: Architectural Elements

```javascript
// Column with base and capital
function createColumn(radius, height, position) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.3, metalness: 0.05 });

  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 16), mat);
  shaft.position.y = height / 2;
  group.add(shaft);

  // Base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.5, radius * 1.6, 0.3, 16), mat);
  base.position.y = 0.15;
  group.add(base);

  // Capital
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.6, radius * 1.2, 0.3, 16), mat);
  cap.position.y = height + 0.15;
  group.add(cap);

  group.position.copy(position);
  scene.add(group);
  return group;
}

// Arch / doorway
function createArch(width, height, depth, position) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.4 });

  // Left pillar
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.3, height, depth), mat);
  pillarL.position.set(-width / 2, height / 2, 0);
  group.add(pillarL);

  // Right pillar
  const pillarR = pillarL.clone();
  pillarR.position.x = width / 2;
  group.add(pillarR);

  // Top beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.3, depth), mat);
  beam.position.set(0, height, 0);
  group.add(beam);

  group.position.copy(position);
  scene.add(group);
  return group;
}

// Staircase
function createStairs(stepCount, stepWidth, stepHeight, stepDepth, position) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.3 });

  for (let i = 0; i < stepCount; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth), mat);
    step.position.set(0, i * stepHeight + stepHeight / 2, -i * stepDepth);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }

  group.position.copy(position);
  scene.add(group);
  return group;
}
```

### Pattern 6C: Procedural City / Skyline

```javascript
function createCity(buildingCount, areaSize) {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.8, metalness: 0.2 });

  for (let i = 0; i < buildingCount; i++) {
    const w = 0.5 + Math.random() * 2;
    const d = 0.5 + Math.random() * 2;
    const h = 1 + Math.random() * 12 + Math.pow(Math.random(), 3) * 20;

    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), baseMat);
    building.position.set(
      (Math.random() - 0.5) * areaSize,
      h / 2,
      (Math.random() - 0.5) * areaSize
    );
    group.add(building);

    // Random lit windows
    if (Math.random() > 0.5) {
      const windowMat = new THREE.MeshBasicMaterial({
        color: 0xffeebb,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.5,
      });
      const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), windowMat);
      windowPane.position.set(building.position.x, building.position.y, building.position.z + d / 2 + 0.01);
      group.add(windowPane);
    }
  }

  scene.add(group);
  return group;
}
```

### Pattern 6D: Room Builder (Interior Walkthrough)

```javascript
function createRoom(w, h, d, position, wallColor) {
  const group = new THREE.Group();
  group.position.copy(position);
  const mat = new THREE.MeshStandardMaterial({ color: wallColor || 0x1a1a1a, side: THREE.DoubleSide, roughness: 0.9 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.7, metalness: 0.1 });

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  group.add(ceil);

  // Back wall
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  back.position.set(0, h / 2, -d / 2);
  group.add(back);

  // Left wall
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), mat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, h / 2, 0);
  group.add(left);

  // Right wall
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), mat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, h / 2, 0);
  group.add(right);

  // Interior light
  const light = new THREE.PointLight(0xffeedd, 0.8, h * 4);
  light.position.set(0, h * 0.85, 0);
  group.add(light);

  scene.add(group);
  return group;
}
```

---

## 7. Animation Patterns

### Pattern 7A: Floating Objects (Sine-Based Hover)

```javascript
const floatingObjects = [];

function addFloatingObject(mesh, amplitude, speed, phase) {
  floatingObjects.push({
    mesh,
    baseY: mesh.position.y,
    amplitude: amplitude || 0.3,
    speed: speed || 1,
    phase: phase || Math.random() * Math.PI * 2,
    rotSpeed: {
      x: (Math.random() - 0.5) * 0.005,
      y: (Math.random() - 0.5) * 0.008,
      z: (Math.random() - 0.5) * 0.003,
    }
  });
}

function animateFloatingObjects(time) {
  floatingObjects.forEach(obj => {
    obj.mesh.position.y = obj.baseY + Math.sin(time * obj.speed + obj.phase) * obj.amplitude;
    obj.mesh.rotation.x += obj.rotSpeed.x;
    obj.mesh.rotation.y += obj.rotSpeed.y;
    obj.mesh.rotation.z += obj.rotSpeed.z;
  });
}
```

### Pattern 7B: Breathing / Pulsing Effect

```javascript
function breathe(mesh, minScale, maxScale, speed, time) {
  const t = (Math.sin(time * speed) + 1) / 2;
  const scale = minScale + t * (maxScale - minScale);
  mesh.scale.setScalar(scale);
}

function pulseEmissive(material, minIntensity, maxIntensity, speed, time) {
  const t = (Math.sin(time * speed) + 1) / 2;
  material.emissiveIntensity = minIntensity + t * (maxIntensity - minIntensity);
}
```

### Pattern 7C: Color Transitions on Scroll

```javascript
const moods = [
  { bg: new THREE.Color(0x0a0a15), fog: 0.025, ambient: new THREE.Color(0x404060) },
  { bg: new THREE.Color(0x1a0a00), fog: 0.020, ambient: new THREE.Color(0x806040) },
  { bg: new THREE.Color(0x0a1520), fog: 0.015, ambient: new THREE.Color(0x405060) },
];

function updateMood(progress) {
  const count = moods.length;
  const scaled = progress * (count - 1);
  const i = Math.min(Math.floor(scaled), count - 2);
  const t = scaled - i;

  scene.background.copy(moods[i].bg).lerp(moods[i + 1].bg, t);
  scene.fog.color.copy(scene.background);
  scene.fog.density = moods[i].fog + (moods[i + 1].fog - moods[i].fog) * t;
  ambientLight.color.copy(moods[i].ambient).lerp(moods[i + 1].ambient, t);
}
```

### Pattern 7D: Object Reveals (Scale Up on Approach)

```javascript
function createRevealObject(mesh, startProgress, endProgress) {
  mesh.scale.setScalar(0);

  ScrollTrigger.create({
    trigger: ".scroll-container",
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      const t = (self.progress - startProgress) / (endProgress - startProgress);
      if (t < 0) mesh.scale.setScalar(0);
      else if (t > 1) mesh.scale.setScalar(1);
      else {
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        mesh.scale.setScalar(eased);
      }
    }
  });
}
```

### Pattern 7E: Mouse Parallax (Smoothed)

```javascript
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  document.addEventListener("mousemove", (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  });
}

// In render loop — lerp for smooth response
function applyMouseParallax() {
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;
  camera.position.x = cam.x + mouse.x * 0.25;
  camera.position.y = cam.y - mouse.y * 0.12;
}
```

### Pattern 7F: Scroll Velocity Effects

```javascript
let lastScrollY = 0;
let scrollVelocity = 0;
let smoothVelocity = 0;

window.addEventListener("scroll", () => {
  scrollVelocity = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
});

function updateVelocityEffects() {
  smoothVelocity += (scrollVelocity - smoothVelocity) * 0.1;
  scrollVelocity *= 0.95;

  // FOV widening for speed effect
  camera.fov = 65 + Math.abs(smoothVelocity) * 0.05;
  camera.updateProjectionMatrix();

  // Particle spread
  particles.material.size = 0.05 + Math.abs(smoothVelocity) * 0.003;
}
```

### Pattern 7G: Loading Screen

```javascript
// CSS: #loader { position:fixed; inset:0; z-index:1000; background:#0a0a0a;
//        display:flex; align-items:center; justify-content:center;
//        transition: opacity 0.8s, visibility 0.8s; }
// #loader.hidden { opacity:0; visibility:hidden; pointer-events:none; }

function hideLoader() {
  renderer.render(scene, camera); // ensure at least one frame
  setTimeout(() => {
    document.getElementById("loader").classList.add("hidden");
  }, 500);
}

window.addEventListener("load", () => setTimeout(hideLoader, 1500));
```

---

## 8. Advanced Shader Effects

### Pattern 8A: Holographic / Iridescent Material

**What it does**: Scan-line + rainbow Fresnel for sci-fi objects, data visualizations, hero elements.

```javascript
const holoMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime:  { value: 0 },
    uColor1: { value: new THREE.Color(0x00ffff) },
    uColor2: { value: new THREE.Color(0xff00ff) },
    uColor3: { value: new THREE.Color(0xffff00) },
    uAlpha:  { value: 0.7 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPos;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor1, uColor2, uColor3;
    uniform float uAlpha;
    varying vec3 vNormal, vViewDir, vWorldPos;
    void main() {
      float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0);
      float shift = dot(vNormal, vViewDir) * 3.0 + uTime * 0.5;
      vec3 rainbow = mix(uColor1, uColor2, sin(shift) * 0.5 + 0.5);
      rainbow = mix(rainbow, uColor3, sin(shift * 1.5 + 1.0) * 0.5 + 0.5);
      float scanLine = smoothstep(0.15, 0.0,
        abs(fract(vWorldPos.y * 2.0 - uTime * 2.0) - 0.5));
      vec3 color = rainbow * (0.3 + fresnel * 0.7) + vec3(scanLine * 0.5);
      float lines = step(0.5, fract(vWorldPos.y * 80.0));
      color *= 0.8 + lines * 0.2;
      gl_FragColor = vec4(color, uAlpha + fresnel * 0.3 + scanLine * 0.2);
    }
  `,
  transparent: true, side: THREE.DoubleSide, depthWrite: false,
});
// In render loop: holoMat.uniforms.uTime.value = elapsedTime;
```

### Pattern 8B: Caustic Water Pattern

**What it does**: Animated Voronoi-based caustic light pattern for pool/water scenes.

```javascript
const causticMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime:  { value: 0 },
    uColor: { value: new THREE.Color(0x4488cc) },
    uScale: { value: 3.0 },
    uIntensity: { value: 0.3 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uScale, uIntensity;
    varying vec2 vUv;
    vec2 random2(vec2 p) {
      return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
    }
    float caustic(vec2 uv) {
      vec2 i_st = floor(uv), f_st = fract(uv);
      float minDist = 1.0;
      for (int y = -1; y <= 1; y++)
        for (int x = -1; x <= 1; x++) {
          vec2 neighbor = vec2(float(x), float(y));
          vec2 pt = random2(i_st + neighbor);
          pt = 0.5 + 0.5 * sin(uTime * 0.8 + 6.2831 * pt);
          minDist = min(minDist, length(neighbor + pt - f_st));
        }
      return minDist;
    }
    void main() {
      vec2 uv = vUv * uScale;
      float pattern = pow(caustic(uv) * caustic(uv * 1.5 + 3.0), 0.8) * 3.0;
      pattern = smoothstep(0.0, 1.0, pattern);
      gl_FragColor = vec4(uColor * pattern * uIntensity, pattern * uIntensity);
    }
  `,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
```

---

## 9. Volumetric & Atmospheric Effects

### Pattern 9A: God Rays (Billboard Planes)

**What it does**: Simulates light rays streaming through a window or opening using transparent billboard planes.

```javascript
function createGodRays(position, count) {
  const group = new THREE.Group();
  const canvas = document.createElement("canvas");
  canvas.width = 32; canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "rgba(255,240,200,0.3)");
  grad.addColorStop(0.3, "rgba(255,240,200,0.08)");
  grad.addColorStop(1, "rgba(255,240,200,0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 256);
  const rayTex = new THREE.CanvasTexture(canvas);

  for (let i = 0; i < (count || 8); i++) {
    const angle = (i / count) * Math.PI * 0.6 - Math.PI * 0.3;
    const ray = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5 + Math.random() * 2, 15 + Math.random() * 10),
      new THREE.MeshBasicMaterial({
        map: rayTex, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
        opacity: 0.15 + Math.random() * 0.15, side: THREE.DoubleSide,
      })
    );
    ray.position.copy(position);
    ray.rotation.z = angle;
    ray.rotation.y = Math.random() * 0.3 - 0.15;
    group.add(ray);
  }
  scene.add(group);
  return group;
}
```

### Pattern 9B: Volumetric Light Shaft (Cone Mesh)

**What it does**: A glowing cone of light from a point source, with animated flicker.

```javascript
function createLightShaft(position, height) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xfff4e0) },
      uOpacity: { value: 0.12 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv; vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity, uTime;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        float gradient = pow(1.0 - vUv.y, 1.5);
        float edge = pow(1.0 - abs(vUv.x * 2.0 - 1.0), 2.0);
        float flicker = 0.9 + 0.1 * sin(uTime * 3.0 + vPos.y * 2.0);
        gl_FragColor = vec4(uColor, gradient * edge * uOpacity * flicker);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 3, height || 10, 32, 1, true), mat
  );
  shaft.position.copy(position);
  shaft.position.y -= (height || 10) / 2;
  scene.add(shaft);
  return { mesh: shaft, material: mat };
}
```

### Pattern 9C: Shape-Morphing Particles (Scatter ↔ Sphere)

**What it does**: Particles morph between a random scatter and an organized shape (sphere, logo, etc.) driven by scroll progress.

```javascript
function createMorphingParticles(count) {
  count = count || 3000;
  const geo = new THREE.BufferGeometry();
  const startPos = new Float32Array(count * 3);
  const targetPos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    startPos[i * 3] = (Math.random() - 0.5) * 30;
    startPos[i * 3 + 1] = (Math.random() - 0.5) * 30;
    startPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    // Target: sphere surface
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 4;
    targetPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    targetPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    targetPos[i * 3 + 2] = r * Math.cos(phi);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(startPos), 3));
  geo.setAttribute("aTarget", new THREE.BufferAttribute(targetPos, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(startPos, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(0xc9a86c) },
      uColor2: { value: new THREE.Color(0x4488ff) },
      uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
    },
    vertexShader: `
      uniform float uProgress, uTime, uPixelRatio;
      attribute vec3 aTarget, aStart;
      void main() {
        vec3 pos = mix(aStart, aTarget, uProgress);
        pos += vec3(
          sin(uTime + pos.y * 2.0) * 0.1 * (1.0 - uProgress),
          cos(uTime + pos.x * 2.0) * 0.1 * (1.0 - uProgress),
          sin(uTime * 0.7 + pos.z) * 0.1 * (1.0 - uProgress)
        );
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 3.0 * uPixelRatio * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor1, uColor2;
      uniform float uProgress;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * 0.8;
        gl_FragColor = vec4(mix(uColor1, uColor2, uProgress), alpha);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return { points, material: mat };
  // Drive with scroll: gsap.to(mat.uniforms.uProgress, { value: 1, scrollTrigger: {...} });
}
```

---

## 10. Reusable GLSL Noise Functions

Paste into any `vertexShader` or `fragmentShader` string. These are the Ashima Arts simplex implementations — the standard for WebGL noise.

### Simplex 2D

```glsl
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g; g.x = a0.x*x0.x + h.x*x0.y; g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0 * dot(m, g);
}
```

### FBM (Fractal Brownian Motion)

```glsl
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5, frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0; amplitude *= 0.5;
  }
  return value;
}
```

### JavaScript-Side Noise (for CPU terrain generation)

```javascript
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbmJS(x, y, octaves) {
  let value = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < (octaves || 6); i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2; amp *= 0.5;
  }
  return value;
}
```

---

## Appendix A: Boilerplate Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Scroll Experience</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { overflow-x: hidden; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff; }
    canvas { position: fixed; top: 0; left: 0; z-index: 0; }
    .scroll-container { position: relative; z-index: 1; pointer-events: none; }
    .section { height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .content { pointer-events: auto; max-width: 520px; opacity: 0; }
    .content.left { margin-right: auto; margin-left: 8vw; }
    .content.right { margin-left: auto; margin-right: 8vw; }
    .content.center { text-align: center; margin: 0 auto; }
    .glass-panel {
      background: rgba(10,10,10,0.55);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 2.5rem;
    }
    #loader {
      position: fixed; inset: 0; z-index: 1000; background: #0a0a0a;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.8s, visibility 0.8s;
    }
    #loader.hidden { opacity: 0; visibility: hidden; }
  </style>
</head>
<body>
  <div id="loader"><p style="letter-spacing:0.2em;text-transform:uppercase;font-size:0.8rem;">Loading</p></div>

  <div class="scroll-container" id="scroll-container">
    <div class="section" id="s0"><div class="content center"><h1>Section 1</h1></div></div>
    <div class="section" id="s1"><div class="content left glass-panel"><h2>Section 2</h2><p>Content</p></div></div>
    <div class="section" id="s2"><div class="content right glass-panel"><h2>Section 3</h2><p>Content</p></div></div>
    <div class="section" id="s3"><div class="content center"><h2>Section 4</h2></div></div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script>
    gsap.registerPlugin(ScrollTrigger);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth < 768;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = new THREE.FogExp2(0x0a0a0a, 0.02);

    const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 2, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.prepend(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x404060, 0.4));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.0);
    key.position.set(5, 8, 5);
    scene.add(key);

    // ── Your scene objects here ──

    const cam = { x: 0, y: 2, z: 15, lx: 0, ly: 0, lz: 0 };
    const tl = gsap.timeline({
      scrollTrigger: { trigger: "#scroll-container", start: "top top", end: "bottom bottom", scrub: 1.5 }
    });
    tl.to(cam, { z: 5, duration: 1, ease: "none" })
      .to(cam, { x: 5, z: 0, lz: -5, duration: 1, ease: "none" })
      .to(cam, { y: 6, z: -10, lz: -15, duration: 1, ease: "none" });

    ["#s0","#s1","#s2","#s3"].forEach((sel, i, arr) => {
      const el = document.querySelector(sel + " .content");
      if (!el) return;
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0,
        scrollTrigger: { trigger: sel, start: "top 60%", end: "top 25%", scrub: true }
      });
      if (i < arr.length - 1) {
        gsap.to(el, { opacity: 0, y: -30,
          scrollTrigger: { trigger: sel, start: "bottom 55%", end: "bottom 25%", scrub: true }
        });
      }
    });

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!isMobile) {
      document.addEventListener("mousemove", e => {
        mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
        mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
      });
    }

    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      camera.position.set(cam.x + mouse.x * 0.25, cam.y - mouse.y * 0.12, cam.z);
      camera.lookAt(cam.lx, cam.ly, cam.lz);
      renderer.render(scene, camera);
    }

    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    addEventListener("load", () => setTimeout(() => document.getElementById("loader").classList.add("hidden"), 1000));
    animate();
  </script>
</body>
</html>
```

---

## Appendix B: Three.js r128 API Quick Reference

### Safe to use:
- `BoxGeometry`, `SphereGeometry`, `PlaneGeometry`, `CylinderGeometry`, `ConeGeometry`
- `TorusGeometry`, `TorusKnotGeometry`, `RingGeometry`, `IcosahedronGeometry`, `OctahedronGeometry`, `DodecahedronGeometry`
- `TubeGeometry`, `ExtrudeGeometry`, `LatheGeometry`, `ShapeGeometry`
- `BufferGeometry`, `BufferAttribute`, `Float32BufferAttribute`
- `InstancedMesh`, `LOD`
- `MeshBasicMaterial`, `MeshStandardMaterial`, `MeshPhongMaterial`, `MeshLambertMaterial`
- `ShaderMaterial`, `RawShaderMaterial`, `PointsMaterial`, `SpriteMaterial`, `LineBasicMaterial`
- `AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`
- `PerspectiveCamera`, `OrthographicCamera`
- `WebGLRenderer`, `Fog`, `FogExp2`
- `CatmullRomCurve3`, `CubicBezierCurve3`, `QuadraticBezierCurve3`
- `CanvasTexture`, `DataTexture`
- `Vector2`, `Vector3`, `Matrix4`, `Quaternion`, `Color`, `Clock`, `Group`, `Scene`
- `THREE.ACESFilmicToneMapping`, `THREE.PCFSoftShadowMap`, `THREE.AdditiveBlending`

### Does NOT exist in r128 (never use):
- `CapsuleGeometry` (added r142)
- `THREE.ColorManagement` (added r139)
- `THREE.MathUtils.seededRandom`
- `WebGPURenderer`
- `RoundedBoxGeometry` (never in core)
- `EffectComposer`, `RenderPass`, `UnrealBloomPass` (separate imports, not on CDN)
- `OrbitControls` (conflicts with scroll navigation)

---

## Appendix C: GSAP ScrollTrigger Quick Reference

```javascript
gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.create({
  trigger: "#element",
  start: "top center",     // "triggerPosition viewportPosition"
  end: "bottom top",
  scrub: 1.5,              // seconds of smoothing
  pin: true,               // pin element during scroll
  markers: true,           // DEBUG: show start/end markers
  onUpdate: (self) => {
    self.progress;          // 0 to 1
  },
});

// Start/End positions:
// "top top"       = element top at viewport top
// "top center"    = element top at viewport center
// "top 80%"       = element top at 80% from viewport top
// "bottom bottom" = element bottom at viewport bottom

// Scrub values:
// true   = instant (jerky — avoid)
// 0.5    = responsive
// 1-2    = smooth (recommended)
// 3+     = sluggish
```

---

## Appendix D: Pattern Selection Guide

| Goal | Combine These Patterns |
|------|----------------------|
| **Product showcase** | 1D (orbit) + 2E (metals) + 2B (glow) + 4A (glass panels) |
| **Architectural walkthrough** | 1A (timeline) + 5A (spline) + 2A (lighting) + 6D (rooms) |
| **Landing page hero** | 1B (progress) + 2G (sky shader) + 7A (floating) + 7E (parallax) |
| **Data visualization** | 2F (particles) + 3A (instancing) + 7C (color transitions) |
| **Sci-fi / cyberpunk** | 5C (tunnel) + 2H (fresnel) + 2I (noise shader) + 6C (city) |
| **Nature / landscape** | 6A (terrain) + 2C (fog) + 2F (particles as dust) + 5A (flyover) |
| **Luxury / editorial** | 1A (smooth scrub) + 2A (lighting) + 4A (glass) + 7B (breathing) |
| **Portfolio** | 1C (per-section) + 7D (reveals) + 4D (parallax text) + 4C (progress) |
