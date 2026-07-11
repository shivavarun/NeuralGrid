# Implementation Plan: Landing Page 3D

## Overview

Build the unauthenticated marketing landing page at `dashboard/src/app/page.tsx`, replacing the current redirect-only behavior, while preserving the authenticated redirect to `/jobs`. Work proceeds bottom-up per the design's file layout: dependencies and theme first, then content data and pure interaction-transform functions (with property tests), then capability hooks, then the GPU_Scene 3D stack (StaticFallback → ChipModel → GpuScene → GpuSceneOrFallback), then HeroSection, then the remaining six landing sections, then the LandingPage composition and the `app/page.tsx` route wiring. TypeScript/Next.js App Router, matching the existing dashboard stack; Vitest + `@testing-library/react` for unit tests; fast-check for the five property tests defined in design.md (minimum 100 runs), matching the MVP/Stage 2 testing convention.

## Tasks

- [x] 1. Dependencies and theme setup
  - [x] 1.1 Add 3D rendering and animation dependencies to dashboard `package.json`
    - Add `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` to `dependencies` and `@types/three` to `devDependencies` in `dashboard/package.json`, matching the exact versions in design.md's Dependencies section
    - _Requirements: 16.1, 16.2_

  - [ ]* 1.2 Write unit test for dependency allow-list
    - Assert `dashboard/package.json` contains `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` (and `@types/three` as a dev dependency)
    - Assert no additional 3D, animation, or scroll-linking package is present beyond that set
    - _Requirements: 16.3_

  - [x] 1.3 Extend Tailwind theme with `ng-*` color tokens and gradient utilities
    - Update `dashboard/tailwind.config.js` with `ng-bg`, `ng-surface`, `ng-accent-violet`, `ng-accent-cyan` colors and `ng-hero-gradient`, `ng-section-gradient` background images, exactly as specified in design.md's Styling and Theme section
    - Do not introduce a separate stylesheet or CSS-in-JS system; `globals.css` stays `@tailwind base/components/utilities` only
    - _Requirements: 3.4, 16.4_

- [x] 2. Content data and copy constants
  - [x] 2.1 Create `wasteFactors.ts` content data
    - Create `dashboard/src/components/content/wasteFactors.ts` with the `WasteFactorRow` interface and the `WASTE_FACTORS` array populated with the four rows from design.md's Data Models section (LLM inference 7B, Image gen SDXL, Fine-tune small LLM, Audio generation)
    - _Requirements: 7.1, 7.2_

  - [x] 2.2 Create `competitors.ts` content data
    - Create `dashboard/src/components/content/competitors.ts` with the `CompetitorRow` interface, the `COMPETITORS` array (Vast.ai, RunPod, Baseten, Cumulus Labs, all `autoTierRouting: false`), and the `NEURALGRID_ROW` constant (`autoTierRouting: true`)
    - _Requirements: 10.1, 10.2_

  - [x] 2.3 Create `pricingTiers.ts` content data
    - Create `dashboard/src/components/content/pricingTiers.ts` with the `PricingTierRow` interface and the `PRICING_TIERS` array for T1/T2/T3 (VRAM range, hardware, price range, example workload) exactly as specified in design.md's Data Models section
    - _Requirements: 11.1, 11.2_

  - [x] 2.4 Create hero and AMD callout copy constants
    - Create `dashboard/src/components/content/heroContent.ts` exporting `HERO_TAGLINE`, `HERO_SUBTEXT`, `PRIMARY_CTA_LABEL` with the exact copy from design.md's Data Models section
    - Create `dashboard/src/components/content/amdCallout.ts` exporting `AMD_PROVIDERS`, `AMD_MI300X_VRAM`, `AMD_MI300X_RELEVANCE` with the exact copy from design.md's Data Models section
    - _Requirements: 2.1, 2.2, 9.1, 9.2_

- [x] 3. Interaction transform utilities
  - [x] 3.1 Implement `transforms.ts` pure functions
    - Create `dashboard/src/components/landing/gpu-scene/transforms.ts` exporting `clamp`, `pointerToTilt`, `scrollToTransform`, `shouldShowFallback`, `ComplexityTier`, `getComplexityTier`, and the `PointerState`/`TiltBounds`/`ScrollBounds` types, matching the signatures in design.md's Data Models section
    - Also export a pure idle-rotation accumulator function (e.g. summing `delta * IDLE_SPEED` across a sequence of deltas) that `ChipModel` will call from its `useFrame` loop, factored out here specifically so Property 1 is testable as a pure function per the Testing Strategy's stated approach (no Canvas/WebGL mounting)
    - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4, 5.3, 6.1, 6.2_

  - [ ]* 3.2 Write property test for idle rotation independence
    - **Property 1: Idle rotation advances independently of interaction state**
    - **Validates: Requirements 3.3**

  - [ ]* 3.3 Write property test for pointer tilt correctness
    - **Property 2: Pointer tilt is directionally correct, neutral when inactive, and bounds-respecting**
    - **Validates: Requirements 4.1, 4.3, 4.4**

  - [ ]* 3.4 Write property test for scroll transform correctness
    - **Property 3: Scroll transform is monotonic within domain and always bounds-respecting**
    - **Validates: Requirements 4.2, 4.4**

  - [ ]* 3.5 Write property test for complexity tier breakpoint correctness
    - **Property 4: Complexity tier is a pure, breakpoint-correct function of viewport width**
    - **Validates: Requirements 5.3**

  - [ ]* 3.6 Write property test for static fallback decision
    - **Property 5: Static fallback is shown if and only if reduced motion or WebGL-unsupported holds**
    - **Validates: Requirements 6.1, 6.2**

- [~] 4. Checkpoint - transform utilities validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Client capability hooks
  - [x] 5.1 Implement `usePrefersReducedMotion` hook
    - Create `dashboard/src/components/landing/gpu-scene/usePrefersReducedMotion.ts` using `matchMedia('(prefers-reduced-motion: reduce)')`, with a change listener so the value updates live if the OS-level preference changes while the page is open
    - _Requirements: 6.1_

  - [x] 5.2 Implement `useWebglSupported` hook
    - Create `dashboard/src/components/landing/gpu-scene/useWebglSupported.ts` with a scratch-canvas `getContext('webgl')` probe, memoized, catching any context-creation exception and treating it as `webglSupported = false`
    - _Requirements: 6.2_

  - [x] 5.3 Implement `useComplexityTier` hook
    - Create `dashboard/src/components/landing/gpu-scene/useComplexityTier.ts` reading `window.matchMedia('(min-width: 768px)').matches` once on mount (delegating the pure width-to-tier decision to `getComplexityTier` from `transforms.ts`), returning the full tier config (fin grid, die smoothness segments, light count, pulse on/off, `dpr`) per the Mobile/LOD table in design.md
    - _Requirements: 5.3_

  - [ ]* 5.4 Write unit tests for capability hooks
    - Test `usePrefersReducedMotion` and `useWebglSupported` with mocked `matchMedia`/canvas context (including the exception-thrown case for WebGL)
    - Test `useComplexityTier` returns the mobile tier config below 768px and the desktop tier config at/above it
    - _Requirements: 5.3, 6.1, 6.2_

- [x] 6. GPU scene 3D components
  - [x] 6.1 Implement `StaticFallback` component
    - Create `dashboard/src/components/landing/gpu-scene/StaticFallback.tsx`: a plain `<div>` matching the `Canvas` container's aspect ratio, `ng-hero-gradient`-based background, a static inline SVG chip silhouette with circuit-trace `<line>` paths (no `<animate>`), and `aria-hidden="true"` on the root
    - _Requirements: 6.3, 6.4, 15.1_

  - [x] 6.2 Implement `ChipModel` component
    - Create `dashboard/src/components/landing/gpu-scene/ChipModel.tsx`: `RoundedBox` die body, instanced-mesh heatsink fin grid sized by the complexity tier, a procedurally generated canvas texture applied as `emissiveMap` for circuit-line detail, and `useFrame`-driven pulsing `emissiveIntensity` (disabled on the mobile tier)
    - Wire the idle-rotation accumulator, `pointerToTilt`, and `scrollToTransform` from `transforms.ts` so idle rotation applies to `rotation.y`, pointer tilt lerps into `rotation.x`/`rotation.z`, and scroll transform adds to `position.y`, an additional rotation term, and `scale` — composed, never overwriting one another
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.4, 5.3_

  - [x] 6.3 Implement `GpuScene` component
    - Create `dashboard/src/components/landing/gpu-scene/GpuScene.tsx`: `Canvas` with near-black background color, `PerspectiveCamera`, the lighting rig (ambient + violet/cyan point lights + dim directional rim light on desktop tier, ambient + one point light on mobile tier), `dpr` capped per complexity tier, and the `ChipModel` instance receiving `pointerState`/`scrollYProgress` props
    - _Requirements: 3.1, 3.2, 5.3, 5.4_

  - [x] 6.4 Implement `GpuSceneOrFallback` client component with dynamic import boundary
    - Create `dashboard/src/components/landing/gpu-scene/GpuSceneOrFallback.tsx`: `'use client'` component gating on `usePrefersReducedMotion`/`useWebglSupported` via `shouldShowFallback`, rendering `StaticFallback` when true
    - Load `GpuScene` only via `next/dynamic(() => import('./GpuScene'), { ssr: false, loading: () => <StaticFallback /> })` so `three`/`@react-three/*` never enter the SSR'd HTML or the initial hero JS chunk
    - Apply `aria-hidden="true"` once at this component's outer wrapper so it covers both branches
    - _Requirements: 5.5, 6.1, 6.2, 6.3, 14.2, 15.1_

  - [ ]* 6.5 Write unit test for dynamic-import boundary
    - Static-analysis-style test asserting `HeroSection`'s (and `GpuSceneOrFallback`'s) source has no module-scope static import from `three` or `@react-three/*`, only inside the `next/dynamic` callback
    - _Requirements: 14.2_

  - [ ]* 6.6 Write unit test for aria-hidden accessibility
    - Assert `GpuSceneOrFallback`'s root container and `StaticFallback`'s root both render with `aria-hidden="true"`
    - _Requirements: 15.1_

- [x] 7. Checkpoint - GPU scene complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Hero section
  - [x] 8.1 Implement `HeroSection` component
    - Create `dashboard/src/components/landing/HeroSection.tsx`: `'use client'` component owning `heroRef`, an `onPointerMove` handler computing normalized `ndcX`/`ndcY` pointer state (left at `{ active: false, x: 0, y: 0 }` until the first pointer event), and framer-motion's `useScroll({ target: heroRef, offset: ['start start', 'end start'] })` for `scrollYProgress`
    - Render the `<h1>` tagline (`HERO_TAGLINE`), `<p>` subtext (`HERO_SUBTEXT`), and `Primary_CTA` (`next/link` to `/login`, labeled `PRIMARY_CTA_LABEL`) directly in the initial HTML (not inside the dynamic-import boundary), and mount `GpuSceneOrFallback` passing `pointerState`/`scrollYProgress`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 15.2, 15.3_

  - [ ]* 8.2 Write unit test for hero content and CTA reachability
    - Assert the rendered tagline/subtext text matches `HERO_TAGLINE`/`HERO_SUBTEXT`
    - Assert `Primary_CTA` is a native `<a>` element with no `tabIndex={-1}` override, verifying default tab-order reachability
    - _Requirements: 2.1, 2.2, 2.3, 15.2, 15.3_

- [x] 9. Landing page sections
  - [x] 9.1 Implement `ProblemSection` component
    - Create `dashboard/src/components/landing/ProblemSection.tsx` rendering `WASTE_FACTORS` as a table/structured layout (task type, tier needed, tier typically used, waste factor), applying the shared `ng-section-gradient` theme
    - _Requirements: 7.1, 7.2, 13.1_

  - [x] 9.2 Implement `HowItWorksSection` component
    - Create `dashboard/src/components/landing/HowItWorksSection.tsx` visualizing the 4-step flow (job submission → Compute Estimator classification → tier selection → routing to GPU provider) with each step label rendered as a real DOM text node, independent of the visual connector styling
    - _Requirements: 8.1, 8.2, 13.1_

  - [x] 9.3 Implement `AmdCalloutSection` component
    - Create `dashboard/src/components/landing/AmdCalloutSection.tsx` naming both `AMD_PROVIDERS` and stating `AMD_MI300X_VRAM`/`AMD_MI300X_RELEVANCE`
    - _Requirements: 9.1, 9.2, 13.1_

  - [x] 9.4 Implement `ComparisonSection` component
    - Create `dashboard/src/components/landing/ComparisonSection.tsx` rendering a table of `COMPETITORS` plus `NEURALGRID_ROW` with a per-platform auto-tier-routing indicator, wrapped in an `overflow-x-auto` (or stacked `md:hidden`/`hidden md:table`) reflow container for below-`md` viewports
    - _Requirements: 10.1, 10.2, 13.1, 13.2_

  - [x] 9.5 Implement `PricingSection` component
    - Create `dashboard/src/components/landing/PricingSection.tsx` rendering `PRICING_TIERS` (T1/T2/T3 with VRAM range, hardware, price range, example workload) using the same reflow wrapper pattern as `ComparisonSection`
    - _Requirements: 11.1, 11.2, 13.1, 13.2_

  - [x] 9.6 Implement `FooterCtaSection` component
    - Create `dashboard/src/components/landing/FooterCtaSection.tsx` rendering the closing CTA (`next/link` to `/login`) and the GitHub repository link together in the same component render, with no prop that can separate them
    - _Requirements: 12.1, 15.2, 15.3, 13.1_

  - [ ]* 9.7 Write unit tests for section content presence
    - Assert `ProblemSection` renders all `WASTE_FACTORS` rows, `ComparisonSection` renders all `COMPETITORS` plus `NEURALGRID_ROW`, `PricingSection` renders all `PRICING_TIERS`, and `AmdCalloutSection` contains both `AMD_PROVIDERS` names and `AMD_MI300X_VRAM`
    - _Requirements: 7.1, 9.1, 9.2, 10.1, 11.1_

  - [ ]* 9.8 Write unit test for `HowItWorksSection` accessible step labels
    - Assert all 4 step labels are present as text nodes regardless of the visual flow markup
    - _Requirements: 8.2_

  - [ ]* 9.9 Write unit test for `FooterCtaSection` CTA and GitHub link co-presence
    - Assert both the CTA control and the GitHub link are present in a single render, with no render path producing one without the other
    - _Requirements: 12.1_

  - [ ]* 9.10 Write unit test for table reflow class presence
    - Assert `ComparisonSection` and `PricingSection` markup includes the responsive reflow wrapper (`overflow-x-auto` or the stacked `md:table`/`md:hidden` pair)
    - _Requirements: 13.2_

- [x] 10. Page composition and routing
  - [x] 10.1 Implement `LandingPage` composition component
    - Create `dashboard/src/components/landing/LandingPage.tsx` composing `HeroSection`, `ProblemSection`, `HowItWorksSection`, `AmdCalloutSection`, `ComparisonSection`, `PricingSection`, `FooterCtaSection` in order, applying the shared `bg-ng-section-gradient text-white` theme wrapper once at this composition layer
    - _Requirements: 3.4_

  - [x] 10.2 Wire `app/page.tsx` route
    - Update `dashboard/src/app/page.tsx` to call `getServerSession(authOptions)`; redirect to `/jobs` when a session exists (preserving current behavior exactly), otherwise render `<LandingPage />` in place of the previous unconditional `redirect('/login')`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 10.3 Write unit test for `page.tsx` session routing
    - Mock `getServerSession`: session present → assert `redirect('/jobs')` called; session absent → assert `LandingPage` is rendered
    - _Requirements: 1.1, 1.2_

- [x] 11. Final checkpoint - all sections integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- Each task references specific requirement acceptance criteria for traceability
- Property tests validate the 5 correctness properties from design.md using fast-check (minimum 100 runs), matching the MVP/Stage 2 testing convention; each property is its own separate sub-task
- Unit tests are placed as optional sub-tasks immediately after the implementation task they cover, per the existing project convention
- `heroContent.ts` and `amdCallout.ts` are added under `dashboard/src/components/content/` alongside `wasteFactors.ts`/`competitors.ts`/`pricingTiers.ts` — design.md's Data Models section defines this copy but doesn't pin an exact file path for it, so it follows the same `content/` file-per-section pattern already established for the other three data files
- The idle-rotation pure function in `transforms.ts` is an inferred addition: design.md's Testing Strategy explicitly describes Property 1 as a pure-function test with no Canvas/WebGL mounting and lists a delta-sequence generator for it, which requires the idle-rotation accumulation logic to be exposed as a pure function even though it isn't separately named in the Data Models interface list
- Visual/manual QA (breakpoint appearance, frame-rate profiling, Lighthouse LCP) and the Playwright/manual route smoke pass from design.md's Testing Strategy are intentionally excluded from this task list — they require human review or real-device/network measurement and are not automatable coding tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "2.2", "2.3", "2.4", "3.1", "5.1", "5.2", "5.3"] },
    { "id": 1, "tasks": ["1.2", "3.2", "5.4", "6.1"] },
    { "id": 2, "tasks": ["3.3", "6.2"] },
    { "id": 3, "tasks": ["3.4", "6.3"] },
    { "id": 4, "tasks": ["3.5", "6.4"] },
    { "id": 5, "tasks": ["3.6", "6.5", "6.6"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 8, "tasks": ["9.7", "9.8", "9.9", "9.10", "10.1"] },
    { "id": 9, "tasks": ["10.2"] },
    { "id": 10, "tasks": ["10.3"] }
  ]
}
```
