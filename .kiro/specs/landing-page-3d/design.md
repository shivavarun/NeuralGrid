# Design Document: Landing Page 3D

## Overview

The dashboard's root route (`/`) currently does nothing but a session check and redirect. This feature replaces that with a real marketing Landing_Page for unauthenticated visitors, while preserving the existing redirect-to-`/jobs` behavior for authenticated visitors. The page is a single long-scroll Next.js App Router page composed of seven sections, with a react-three-fiber 3D GPU/chip scene as the hero centerpiece that idles, tilts toward the pointer, and reacts to scroll — all on a Vercel-style dark/gradient theme applied consistently across every section.

**Core flow:**
```
GET / → Session_Router (getServerSession) → session? → redirect /jobs
                                           → no session → render Landing_Page
```

**Key design decisions:**

- **No new route group.** Requirement 1.4 only forbids a separate deployment/subdomain — it does not require a `(marketing)` route group. `dashboard/src/app/page.tsx` stays the single entry point and becomes a thin server component that either redirects or renders a `<LandingPage />` client/server composite from `src/components/landing/`. This is the smallest change that satisfies Requirement 1 and keeps the existing `login`/`jobs`/`billing` sibling-route pattern untouched.
- **Section-per-file component breakdown**, matching the Glossary's section vocabulary 1:1, so requirements trace directly to files.
- **Procedural, primitive-based GPU model instead of an external 3D asset.** Modeling and exporting a custom GLTF chip is out of scope for a coding agent to produce convincingly. The design instead builds the chip from `three`/`@react-three/drei` primitives (RoundedBox package + BoxGeometry heatsink fin array) with a procedurally generated canvas texture driving an emissive map for the circuit-line detail — fully buildable with code, no external asset pipeline.
- **framer-motion's `useScroll` for scroll progress, not a hand-rolled scroll listener.** Requirement 16.2 already mandates framer-motion as the motion library when motion beyond CSS transitions is needed, and `useScroll` already handles passive listeners, rAF batching, and cleanup. Reimplementing that manually would duplicate functionality the mandated dependency already provides. The resulting motion value is read imperatively inside the R3F `useFrame` loop via `.get()`, bridging the two rendering systems without adding a second scroll-tracking mechanism.
- **Dynamic import (`next/dynamic`, `ssr:false`) for the entire 3D stack**, so `three`/`@react-three/fiber`/`@react-three/drei` never enter the server-rendered HTML or the initial JS chunk that contains the hero text, satisfying Requirements 5.5 and 14.2 by construction rather than by a manual bundle-splitting rule.
- **Client-side capability gating before mount, not after.** Reduced-motion and WebGL support are both checked client-side before the `Canvas` is ever created, so `WebGL_Unsupported_State`/`Reduced_Motion_Preference` visitors never pay the cost of initializing a 3D context that will immediately be torn down.

## Architecture

```mermaid
graph TD
    Visitor -->|GET /| Page[app/page.tsx]
    Page -->|getServerSession| Auth[authOptions - lib/auth.ts]
    Auth -->|session exists| Redirect[redirect '/jobs']
    Auth -->|no session| LP[LandingPage]

    LP --> Hero[HeroSection]
    LP --> Problem[ProblemSection]
    LP --> How[HowItWorksSection]
    LP --> Amd[AmdCalloutSection]
    LP --> Comparison[ComparisonSection]
    LP --> Pricing[PricingSection]
    LP --> Footer[FooterCtaSection]

    Hero --> Gate[GpuSceneOrFallback]
    Gate -->|reduced motion or no WebGL| Fallback[StaticFallback]
    Gate -->|capable client| Dyn["dynamic(() => GpuScene, ssr:false)"]
    Dyn --> Scene[GpuScene: Canvas]
    Scene --> Chip[ChipModel primitives]
    Scene --> Lights[Lighting rig]
    Scene --> Camera[PerspectiveCamera]

    Hero -->|useScroll target=heroRef| FM[framer-motion scrollYProgress]
    FM -.->|read via .get() in useFrame| Scene
    Hero -->|onPointerMove| PointerState[pointer ref]
    PointerState -.->|lerp in useFrame| Scene
```

**Data flow for GPU_Scene inputs:** pointer position and scroll progress are captured as refs/motion-values in `HeroSection` (outside the dynamically-imported chunk) and passed as props into `GpuScene`, so the interaction wiring itself has zero dependency on the 3D libraries and can be unit tested without mounting a WebGL context.

## Components and Interfaces

### File layout

```
dashboard/src/
  app/
    page.tsx                          # session check + redirect | <LandingPage />
  components/
    landing/
      LandingPage.tsx                 # composes all sections, applies shared theme wrapper
      HeroSection.tsx                 # tagline, subtext, Primary_CTA, pointer/scroll capture, mounts GpuSceneOrFallback
      ProblemSection.tsx              # waste-factor table, reads content/wasteFactors.ts
      HowItWorksSection.tsx           # 4-step flow visualization + accessible step labels
      AmdCalloutSection.tsx           # AMD Developer Cloud / Fireworks AI / MI300X callout
      ComparisonSection.tsx           # competitor table, reads content/competitors.ts
      PricingSection.tsx              # T1/T2/T3 table, reads content/pricingTiers.ts
      FooterCtaSection.tsx            # closing CTA + GitHub link, co-rendered
      gpu-scene/
        GpuSceneOrFallback.tsx        # client component: reduced-motion + WebGL gating, dynamic import boundary
        GpuScene.tsx                  # Canvas, camera, lighting rig, ChipModel (3D-library code, never SSR'd)
        ChipModel.tsx                 # primitive geometry + circuit emissive material + idle/tilt/scroll transform composition
        StaticFallback.tsx            # CSS/SVG fallback, same aspect-ratio slot as Canvas
        useComplexityTier.ts          # viewport-width -> {segments, lightCount, pulse, dpr}
        usePrefersReducedMotion.ts    # matchMedia('(prefers-reduced-motion: reduce)') hook
        useWebglSupported.ts          # scratch-canvas getContext probe, memoized
        transforms.ts                 # pure functions: pointerToTilt, scrollToTransform, clamp bounds (unit + property tested)
    content/
      wasteFactors.ts                 # Problem_Section data (Requirement 7)
      competitors.ts                  # Comparison_Section data (Requirement 10)
      pricingTiers.ts                 # Pricing_Section data (Requirement 11)
```

### `app/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { LandingPage } from '@/components/landing/LandingPage';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/jobs');
  }

  return <LandingPage />;
}
```

This preserves Requirement 1.2's existing redirect exactly (same `getServerSession`/`authOptions` call as `jobs/page.tsx` and `billing/page.tsx` today), and satisfies 1.1 by rendering `LandingPage` inline instead of the previous unconditional `redirect('/login')`.

### `HeroSection.tsx` (interaction capture)

```typescript
'use client';

interface HeroSectionProps {}

// Pointer state: ref, not React state — avoids a re-render per mousemove.
// Populated by onPointerMove on the section's bounding container; left at
// { active: false, x: 0, y: 0 } until the first pointer event ever fires,
// which is how touch-only devices naturally fall through to Requirement 4.3.
interface PointerState {
  active: boolean;
  ndcX: number; // normalized device coords, [-1, 1]
  ndcY: number;
}
```

`HeroSection` owns:
- the `heroRef` used both as the `onPointerMove` target and as framer-motion's `useScroll({ target: heroRef, offset: ['start start', 'end start'] })` target
- the semantic markup for tagline (`<h1>`), subtext (`<p>`), and `Primary_CTA` (`<Link href="/login">`), rendered directly (not inside the dynamic-import boundary) so they are part of the initial HTML for LCP purposes (Requirement 5.5, 14.2)
- passing `pointerState` (ref) and `scrollYProgress` (framer-motion `MotionValue<number>`) down to `GpuSceneOrFallback`

### `GpuSceneOrFallback.tsx`

```typescript
'use client';

export function GpuSceneOrFallback({ pointerState, scrollYProgress }: {
  pointerState: React.RefObject<PointerState>;
  scrollYProgress: MotionValue<number>;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const webglSupported = useWebglSupported();
  const showFallback = shouldShowFallback(prefersReducedMotion, webglSupported);

  if (showFallback) return <StaticFallback />;
  return <GpuScene pointerState={pointerState} scrollYProgress={scrollYProgress} />;
}
```

`GpuScene` here is `next/dynamic(() => import('./GpuScene'), { ssr: false, loading: () => <StaticFallback /> })`, so:
- during SSR, neither branch imports `three`/`@react-three/fiber` — `usePrefersReducedMotion`/`useWebglSupported` default to their "safe" client-only values and only resolve after mount, using `<StaticFallback />` as the universal SSR/loading placeholder in the same layout slot.
- `shouldShowFallback` is a pure function (`transforms.ts`), covered by Correctness Property 5 below.

### `ChipModel.tsx` (GPU_Scene technical design — Requirement 3, 4)

**Geometry:** No external 3D asset. The chip is assembled from primitives:
- Package/die body: `<RoundedBox args={[3, 0.3, 3]} radius={0.06} smoothness={complexity.segments}>` (drei) — a flat squarish chip silhouette.
- Heatsink fin array: a grid of thin `<boxGeometry>` fins (count driven by `complexity.segments`, e.g. 6×6 on desktop, 3×3 on mobile) instanced via `<instancedMesh>` to keep draw calls low, positioned above the die body.
- Circuit-line detail: a single procedurally generated canvas texture (`document.createElement('canvas')`, 2D context, drawn once on mount — thin rectangles/lines in a circuit-trace pattern with random-but-seeded branching) applied as the `emissiveMap` of a `MeshStandardMaterial` on the die body's top face, with `emissiveColor` set to an accent (e.g. `#7c3aed`/`#22d3ee` gradient pair matching the Tailwind theme extension below). This is a **texture-driven emissive glow**, chosen over a custom GLSL `ShaderMaterial` because it is reliably buildable without hand-written fragment shader code, while still producing the "illuminated circuit-line detailing" required by 3.1.
- Pulsing glow: rather than a shader uniform, `useFrame` animates `material.emissiveIntensity = baseIntensity + Math.sin(clock.elapsedTime * pulseSpeed) * pulseAmplitude` on the same material each frame — a plain material-property animation, disabled entirely (`pulse: false`, fixed intensity) on the mobile complexity tier per Requirement 5.3.

**Lighting rig (Requirement 3.2 — dark background, gradient lighting, Vercel-style):**
- Scene/canvas background: solid near-black (`#0a0a0f`) matching the page's dark theme, set via `<color attach="background" args={['#0a0a0f']} />`.
- `<ambientLight intensity={0.15} />` — minimal fill so unlit faces aren't pure black.
- Two `<pointLight>`s with distinct accent colors (violet `#7c3aed` from above, cyan `#22d3ee`) positioned on opposite sides, producing the two-tone gradient-lit look; a single dim white rim `<directionalLight>` for edge definition.
- Desktop complexity tier uses all three lights; mobile tier drops to the ambient light + one point light (Requirement 5.3).

**Camera:** `<PerspectiveCamera fov={45} position={[0, 0.4, 6]} />`, `Canvas` `dpr` capped by complexity tier (`[1, 2]` desktop, `1` mobile) to bound pixel-fill cost on high-DPI phones.

**Idle animation (Requirement 3.3):**

```typescript
useFrame((_, delta) => {
  idleRotationRef.current += delta * IDLE_SPEED; // radians/sec, e.g. 0.15
  groupRef.current.rotation.y = idleRotationRef.current;
  // tilt/scroll below are applied to different axes/properties — see composition note
});
```

The idle rotation is a monotonically-increasing accumulator on `rotation.y`, updated unconditionally every frame regardless of pointer/scroll activity — it is never reset, paused, or overwritten by the interaction code, which is exactly Requirement 3.3's "concurrently, not paused or replaced" clause. Correctness Property 1 formalizes this.

**Mouse-tilt interaction (Requirement 4.1, 4.3):**

`transforms.ts` exports a pure function:

```typescript
export function pointerToTilt(
  pointer: { active: boolean; ndcX: number; ndcY: number },
  bounds: { x: [number, number]; z: [number, number] }
): { x: number; z: number } {
  if (!pointer.active) return { x: 0, z: 0 }; // Requirement 4.3: touch-only / no pointer yet
  const rawX = clamp(pointer.ndcY * TILT_SENSITIVITY, bounds.x[0], bounds.x[1]);
  const rawZ = clamp(-pointer.ndcX * TILT_SENSITIVITY, bounds.z[0], bounds.z[1]);
  return { x: rawX, z: rawZ };
}
```

`ndcX`/`ndcY` are computed in `HeroSection`'s `onPointerMove` handler from `(clientX - rect.left) / rect.width * 2 - 1` (and the Y equivalent), so they are naturally in `[-1, 1]` for pointer positions inside the hero bounding box, and can exceed that range for the intentionally-tested out-of-bounds inputs in the property test. Inside `useFrame`, the *target* tilt from `pointerToTilt` is lerped toward with `THREE.MathUtils.lerp(current, target, 0.08)` each frame and assigned to `groupRef.current.rotation.x` / `.z` — separate axes from the idle animation's `rotation.y`, so the two never overwrite each other (composition, not replacement).

**Scroll interaction (Requirement 4.2):**

`transforms.ts` exports:

```typescript
export function scrollToTransform(
  progress: number, // framer-motion scrollYProgress.get(), nominally [0,1]
  bounds: { posY: [number, number]; rotExtra: [number, number]; scale: [number, number] }
): { posY: number; rotExtra: number; scale: number } {
  const p = clamp(progress, 0, 1); // out-of-domain scroll progress clamped first
  return {
    posY: lerpRange(p, bounds.posY),
    rotExtra: lerpRange(p, bounds.rotExtra),
    scale: lerpRange(p, bounds.scale),
  };
}
```

Read imperatively inside `useFrame` via `scrollYProgress.get()` (the `MotionValue` passed down from `HeroSection`'s `useScroll`), applied to `groupRef.current.position.y`, an *additional* rotation term added to (not replacing) `rotation.y`, and `groupRef.current.scale.setScalar(...)`.

**Clamping strategy (Requirement 4.4):** every bound (`TILT_BOUNDS`, `SCROLL_BOUNDS`) is expressed in scene units (radians for rotation, world units for position/scale) rather than pixels, so the same bound constants apply at every `Viewport_Breakpoint` — what changes per breakpoint is *complexity* (geometry/lights), not the interaction bounds. Both pure functions above clamp their output before returning, so no caller-side clamping is needed and there is exactly one place per interaction type where the bound is enforced — this is what Correctness Properties 2 and 3 check directly.

**Mobile/LOD strategy (Requirement 5.3, 5.4):** `useComplexityTier()` reads `window.matchMedia('(min-width: 768px)').matches` once on mount (768px = Tailwind's `md`, matching Requirement 13's breakpoint vocabulary) and returns one of two fixed tiers:

| Tier | Fin grid | Die smoothness segments | Lights | Pulse glow | `dpr` |
|---|---|---|---|---|---|
| mobile (`< md`) | 3×3 | 4 | ambient + 1 point | off | `1` |
| desktop (`>= md`) | 6×6 | 16 | ambient + 2 point + 1 directional | on | `[1, 2]` |

No frame-rate measurement or self-disabling logic exists anywhere in `GpuScene` — the component always renders once mounted; Requirement 5.4 is satisfied by the *absence* of a kill-switch, not by an active check.

### `StaticFallback.tsx` (Requirement 6)

A plain `<div>` (no canvas, no SVG animation) that:
- Fills the exact same aspect-ratio box the `Canvas` would occupy (`aspect-square` or a fixed `min-h` matching `GpuScene`'s container), so swapping between fallback and real scene never causes layout shift.
- Background: a Tailwind-utility CSS `radial-gradient`/`conic-gradient` using the same two accent colors as the lighting rig (`from-violet-600/30 via-transparent to-cyan-400/20`), giving the same dark/gradient impression at zero animation cost.
- Foreground: a static inline SVG chip silhouette (rect + a handful of `<line>` "circuit trace" paths, `stroke="currentColor"`, no `<animate>`), so the GPU/chip subject matter is visually communicated per Requirement 6.4 without any motion.
- `aria-hidden="true"` (decorative in both the fallback and real-scene case — see Accessibility below).

## Data Models

### Content data (Requirement 7, 10, 11 — figures pulled from PRD.md / HACKATHON_SUBMISSION.md)

```typescript
// src/components/content/wasteFactors.ts — sourced from PRD.md Section 2 table
export interface WasteFactorRow {
  taskType: string;
  tierNeeded: string;
  tierTypicallyUsed: string;
  wasteFactor: string;
}

export const WASTE_FACTORS: WasteFactorRow[] = [
  { taskType: 'LLM inference, 7B model', tierNeeded: 'RTX 3060 (8GB) — T1', tierTypicallyUsed: 'A100 (80GB) — T3', wasteFactor: '5–10×' },
  { taskType: 'Image gen (SDXL)', tierNeeded: 'RTX 3090 (24GB) — T2', tierTypicallyUsed: 'A100 (80GB) — T3', wasteFactor: '3–5×' },
  { taskType: 'Fine-tune, small LLM', tierNeeded: 'RTX 4090 (24GB) — T2', tierTypicallyUsed: 'A100 (80GB) — T3', wasteFactor: '3–4×' },
  { taskType: 'Audio generation', tierNeeded: 'RTX 3080 (10GB) — T1', tierTypicallyUsed: 'A100 (80GB) — T3', wasteFactor: '5–8×' },
];
```

```typescript
// src/components/content/competitors.ts — sourced from PRD.md Section 3 / HACKATHON_SUBMISSION.md Part 1
export interface CompetitorRow {
  name: string;
  autoTierRouting: boolean;
}

export const COMPETITORS: CompetitorRow[] = [
  { name: 'Vast.ai', autoTierRouting: false },
  { name: 'RunPod', autoTierRouting: false },
  { name: 'Baseten', autoTierRouting: false },
  { name: 'Cumulus Labs', autoTierRouting: false },
];

export const NEURALGRID_ROW: CompetitorRow = { name: 'NeuralGrid', autoTierRouting: true };
```

`autoTierRouting: false` for every named competitor reflects the PRD's explicit finding ("zero platforms automatically profile the job and select the cheapest sufficient GPU tier") — this is the source for Requirement 10.2's per-platform indicator, not an assumption.

```typescript
// src/components/content/pricingTiers.ts — sourced from PRD.md Section 4.2 table
export interface PricingTierRow {
  tier: 'T1' | 'T2' | 'T3';
  label: string;
  vramRange: string;
  hardware: string;
  priceRange: string;
  exampleWorkload: string;
}

export const PRICING_TIERS: PricingTierRow[] = [
  { tier: 'T1', label: 'Lite', vramRange: '0–12GB', hardware: 'RTX 3060, 3070, 3080', priceRange: '$0.05–0.10/hr', exampleWorkload: 'Small LLM inference (Llama-3-8B)' },
  { tier: 'T2', label: 'Standard', vramRange: '12–28GB', hardware: 'RTX 3090, 4090, A5000', priceRange: '$0.15–0.30/hr', exampleWorkload: 'SDXL image generation' },
  { tier: 'T3', label: 'Power', vramRange: '28GB+', hardware: 'A100, H100, A6000', priceRange: '$0.50–1.20/hr', exampleWorkload: 'Llama-3-70B inference' },
];
```

### Hero copy (Requirement 2 — sourced from PRD.md Executive Summary)

```typescript
export const HERO_TAGLINE = 'Automatic GPU tier routing. Same output. Lower cost.';
export const HERO_SUBTEXT = '40% average cost reduction vs manually selecting GPUs on RunPod.';
export const PRIMARY_CTA_LABEL = 'Get started';
```

### AMD callout copy (Requirement 9 — sourced from HACKATHON_SUBMISSION.md AMD Integration / Slide 5)

```typescript
export const AMD_PROVIDERS = ['AMD Developer Cloud', 'Fireworks AI'] as const;
export const AMD_MI300X_VRAM = '192GB HBM3';
export const AMD_MI300X_RELEVANCE =
  "The MI300X's 192GB HBM3 lets NeuralGrid route 70B+ model jobs to a single AMD node instead of splitting them across multiple NVIDIA GPUs.";
```

### `transforms.ts` types (Requirement 4 — shared by `ChipModel` and its property tests)

```typescript
export interface PointerState { active: boolean; ndcX: number; ndcY: number; }
export interface TiltBounds { x: [number, number]; z: [number, number]; }
export interface ScrollBounds { posY: [number, number]; rotExtra: [number, number]; scale: [number, number]; }

export function clamp(v: number, min: number, max: number): number;
export function pointerToTilt(pointer: PointerState, bounds: TiltBounds): { x: number; z: number };
export function scrollToTransform(progress: number, bounds: ScrollBounds): { posY: number; rotExtra: number; scale: number };
export function shouldShowFallback(prefersReducedMotion: boolean, webglSupported: boolean): boolean;
export type ComplexityTier = 'mobile' | 'desktop';
export function getComplexityTier(viewportWidth: number, mdBreakpointPx?: number): ComplexityTier;
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Most of this feature's acceptance criteria are visual/aesthetic (theme consistency, "feels Vercel-style", "communicates GPU subject matter") or require real-device/real-network measurement (frame rate, LCP timing) and are intentionally **not** modeled as properties — they are covered instead under manual/visual QA and integration/perf testing in the Testing Strategy below. The five properties below cover the parts of the GPU_Scene interaction logic and fallback/complexity decisions that are pure functions over a meaningfully large input space, per the prework analysis.

### Property 1: Idle rotation advances independently of interaction state

*For any* sequence of `delta` time increments and *for any* concurrently-applied pointer tilt or scroll transform (including a neutral/zero transform), the accumulated idle rotation about the Y axis after those increments SHALL equal the sum of `delta × IDLE_SPEED` across the sequence, and SHALL be unaffected by the values of the pointer tilt or scroll transform applied in the same frames.

**Validates: Requirements 3.3**

### Property 2: Pointer tilt is directionally correct, neutral when inactive, and bounds-respecting

*For any* `PointerState` and *for any* `TiltBounds`: if `active` is `false`, `pointerToTilt` SHALL return exactly `{ x: 0, z: 0 }` regardless of the `ndcX`/`ndcY` values present. If `active` is `true`, the sign of the returned `x` SHALL match the sign of `ndcY`, the sign of the returned `z` SHALL match the sign of `-ndcX`, and both returned values SHALL lie within their respective `bounds` interval for any `ndcX`, `ndcY` in ℝ (including values outside `[-1, 1]`).

**Validates: Requirements 4.1, 4.3, 4.4**

### Property 3: Scroll transform is monotonic within domain and always bounds-respecting

*For any* `progress` value in ℝ (including values outside `[0, 1]`) and *for any* `ScrollBounds`: `scrollToTransform` SHALL first clamp `progress` to `[0, 1]`, and each of `posY`, `rotExtra`, and `scale` in the result SHALL lie within its corresponding `bounds` interval. For any two progress values `p1 < p2` both within `[0, 1]`, the mapped `posY`, `rotExtra`, and `scale` SHALL each move monotonically (non-decreasing or non-increasing, consistently for a given bound direction) between the two.

**Validates: Requirements 4.2, 4.4**

### Property 4: Complexity tier is a pure, breakpoint-correct function of viewport width

*For any* non-negative viewport width, `getComplexityTier` SHALL return `'mobile'` for widths strictly below the `md` breakpoint (768px) and `'desktop'` for widths greater than or equal to it, with no other possible return value.

**Validates: Requirements 5.3**

### Property 5: Static fallback is shown if and only if reduced motion or WebGL-unsupported holds

*For any* combination of `prefersReducedMotion: boolean` and `webglSupported: boolean`, `shouldShowFallback` SHALL return `true` if and only if `prefersReducedMotion` is `true` or `webglSupported` is `false` (i.e. it SHALL return `false` only when `prefersReducedMotion` is `false` and `webglSupported` is `true`).

**Validates: Requirements 6.1, 6.2**

## Error Handling

The Landing_Page has no server-side data fetching beyond the existing `getServerSession` call, so most "error handling" here is about degrading the client-only 3D layer safely rather than handling request failures.

| Condition | Handling |
|---|---|
| `getServerSession` throws or returns an unexpected shape | Treated as "no session" (falls through to rendering `LandingPage`) — fails toward showing the marketing page rather than a broken redirect, matching current `jobs`/`billing` pages' existing pattern of only branching on a truthy session. |
| `useWebglSupported` probe throws (context creation exception rather than `null`) | Caught and treated as `webglSupported = false`, routing to `StaticFallback` — never left unhandled. |
| Dynamic import of `GpuScene` chunk fails to load (network failure) | `next/dynamic`'s built-in error boundary behavior applies; the `loading` fallback (`StaticFallback`) remains visible since the swap to the real component never occurs — visitor still sees a complete, readable hero. |
| Canvas mounts but a WebGL context is lost mid-session (`webglcontextlost` event) | Out of scope for this iteration — noted as a known gap; the browser's default (blank canvas) would show. Not required by any of the 16 requirements, which only cover initial support detection. |
| `prefers-reduced-motion` changes *while the page is open* (OS-level toggle) | `usePrefersReducedMotion`'s `matchMedia` change listener updates state live, so `GpuSceneOrFallback` re-evaluates and swaps to `StaticFallback` without a reload — a stricter behavior than the requirement demands (which only specifies initial state) but free to provide given the hook already needs a listener for correctness on first paint in some browsers. |

## Testing Strategy

**Unit tests** (Vitest + `@testing-library/react`, new dev dependencies — testing libraries are outside Requirement 16's 3D/animation/scroll-linking restriction):
- `app/page.tsx`: session present → `redirect('/jobs')` called; session absent → `LandingPage` rendered (mock `getServerSession`).
- Content presence: hero tagline/subtext text matches `HERO_TAGLINE`/`HERO_SUBTEXT`; `ProblemSection` renders all `WASTE_FACTORS` rows; `ComparisonSection` renders all `COMPETITORS` + `NEURALGRID_ROW`; `PricingSection` renders all `PRICING_TIERS`; `AmdCalloutSection` contains both `AMD_PROVIDERS` names and `AMD_MI300X_VRAM`.
- `HowItWorksSection`: all 4 step labels present as text nodes regardless of the visual flow markup structure (Requirement 8.2).
- `FooterCtaSection`: CTA control and GitHub link both present in a single render (Requirement 12.1) — no test renders one without the other since the component has no prop that can separate them.
- Accessibility: `GpuSceneOrFallback`'s root container (and `StaticFallback`'s root) has `aria-hidden="true"`; `Primary_CTA` and footer CTA are real `<a>`/`<button>` elements with no `tabIndex={-1}`, verifying default tab-order reachability (Requirement 15).
- `PricingSection`/`ComparisonSection` markup includes the responsive reflow class (e.g. `overflow-x-auto` wrapper or a `md:table` / stacked-below-`md` variant) present in the rendered output (Requirement 13.2).
- package.json: `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` present; no additional 3D/animation/scroll-linking package present beyond that set (Requirement 16.1–16.3) — a simple allow-list test over `package.json`'s dependency keys.
- Dynamic-import boundary: static analysis-style test asserting `HeroSection`'s source does not statically import from `three`/`@react-three/*` at module scope (only inside the `next/dynamic` callback) — guards Requirement 14.2 structurally.

**Property-based tests** (fast-check, already a dev dependency; minimum 100 runs per property, tagged per the format below):
- Implemented as pure-function tests against `transforms.ts` — no `Canvas`/WebGL mounting required, keeping them fast and CI-friendly.
- Tag format: `Feature: landing-page-3d, Property {number}: {property text}`.
- Generators: `fc.record` for `PointerState`/bounds tuples using `fc.float()` with unconstrained ranges (including values outside `[-1, 1]`) to exercise Property 2's out-of-bounds clamping; `fc.float()` unconstrained for scroll `progress` in Property 3; `fc.integer({ min: 0, max: 4000 })` for viewport widths in Property 4, with explicit boundary cases (767, 768, 769) additionally pinned as unit-style edge assertions inside the same property test; `fc.tuple(fc.boolean(), fc.boolean())` for Property 5's full truth table; `fc.array(fc.float({ min: 0, max: 0.1 }))` for delta sequences in Property 1.

**Visual / manual QA** (not automated, tracked as a manual pass before demo recording):
- Requirements 2.5, 3.1, 3.2, 3.4, 6.4, 13.1: rendered at each of `sm`/`md`/`lg`/`xl`/`2xl` in a browser or via Storybook/Chromatic-style snapshot if later added, checking for overlap, the Vercel-style dark/gradient feel, and that the fallback silhouette reads as a chip.
- Requirement 5.1, 5.2: manual frame-rate profiling (Chrome DevTools Performance panel / a physical mid-range Android device) against the 30fps/55fps targets — not unit-testable, no synthetic device farm is in scope for this feature.
- Requirement 14.1: Lighthouse run against a fast-4G throttling profile, checked against the 2.5s LCP budget.

**Integration checks:**
- A single Playwright/manual smoke pass confirming the end-to-end route behavior: visiting `/` unauthenticated shows the landing page and `/` authenticated redirects to `/jobs`, matching the existing `jobs`/`billing` integration test conventions if/when an e2e suite is introduced for the dashboard (none currently exists in `dashboard/`).

## Styling and Theme

`tailwind.config.js` gains theme extensions so every section shares one token set (Requirement 3.4) instead of each component hand-rolling gradient classes:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'ng-bg': '#0a0a0f',
        'ng-surface': '#111116',
        'ng-accent-violet': '#7c3aed',
        'ng-accent-cyan': '#22d3ee',
      },
      backgroundImage: {
        'ng-hero-gradient': 'radial-gradient(circle at 50% 20%, rgba(124,58,237,0.25), transparent 60%), radial-gradient(circle at 80% 80%, rgba(34,211,238,0.15), transparent 55%)',
        'ng-section-gradient': 'linear-gradient(180deg, #0a0a0f 0%, #111116 100%)',
      },
    },
  },
  plugins: [],
};
```

`globals.css` stays as-is (`@tailwind base/components/utilities`) — no new global stylesheet or CSS-in-JS system is introduced, satisfying Requirement 16.4. Every landing section wraps its content in a shared `bg-ng-section-gradient text-white` container class from `LandingPage.tsx` so the theme is applied once at the composition layer rather than duplicated per section.

`ComparisonSection`/`PricingSection` tables reflow below `md` via a wrapper (`<div className="overflow-x-auto md:overflow-visible">` around a `min-w-[640px] md:min-w-0` table, or a `hidden md:table` + `md:hidden` stacked-card pair — the design allows either; the requirement (13.2) is satisfied by "stacked or horizontally scrollable", and the horizontally-scrollable wrapper is the lower-effort choice reused for both sections).

## Accessibility

- `GpuSceneOrFallback`'s outermost container carries `aria-hidden="true"` unconditionally — applied once at the wrapper level so it covers both the `Canvas` and `StaticFallback` branches without needing to remember to tag each separately (Requirement 15.1).
- Section headings use a single semantic `<h1>` (hero tagline) followed by one `<h2>` per subsequent section (`ProblemSection` through `FooterCtaSection`), giving screen readers a predictable outline independent of the visual 3D layer (Requirement 15.2).
- `Primary_CTA` (`HeroSection`) and the footer CTA (`FooterCtaSection`) are rendered as native `<a href="/login">` elements (via `next/link`) in normal document order with no `tabIndex` override, so both are reachable via default browser tab order without any custom focus management (Requirement 15.3).
- `HowItWorksSection` step labels are real text nodes in the DOM (not canvas-drawn or `content:` CSS pseudo-elements), so they remain in the accessibility tree regardless of whatever visual connector/arrow styling is layered on top (Requirement 8.2).

## Dependencies

New additions to `dashboard/package.json`, exactly matching Requirement 16.1/16.2 (no others):

```json
{
  "dependencies": {
    "three": "^0.169.0",
    "@react-three/fiber": "^8.17.10",
    "@react-three/drei": "^9.114.0",
    "framer-motion": "^11.11.0"
  },
  "devDependencies": {
    "@types/three": "^0.169.0"
  }
}
```

`@react-three/fiber`'s peer dependencies (`react`/`react-dom`) are already satisfied by the existing `^18.2.0` versions in `package.json`. No additional testing-library packages are listed here as they are a testing-only addition orthogonal to Requirement 16's 3D/animation/scroll-linking scope; if adopted they would be `@testing-library/react` and `@testing-library/jest-dom` as dev dependencies alongside the existing `vitest`.
