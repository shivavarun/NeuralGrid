# Implementation Plan: Landing Page Redesign

## Overview

Replace the 3D hero and its supporting visual system with the Compute_Estimator_Panel design, bottom-up per design.md's file layout: dependency/config setup first, then content data, then pure `lib/*.ts` functions (with property tests), then the relocated reduced-motion hook, then leaf components (TierBadge, TierIndicatorStrip), then ComputeEstimatorPanel, then NavBar/NavMenu, then HeroSection, then the remaining restyled sections, then LandingPage composition, then `gpu-scene/` deletion, then final integration. TypeScript/Next.js App Router, matching the existing dashboard stack; Vitest + `@testing-library/react` + jsdom for unit tests; fast-check for the 9 property tests in design.md (minimum 100 runs).

## Tasks

- [x] 1. Dependency and config setup
  - [x] 1.1 Remove 3D/animation dependencies from `dashboard/package.json`
    - Remove `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` from `dependencies` and `@types/three` from `devDependencies`
    - _Requirements: 14.1_

  - [x] 1.2 Add test-library devDependencies to `dashboard/package.json`
    - Add `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` to `devDependencies` per design.md's Dependencies section
    - _Requirements: 14.1_

  - [ ]* 1.3 Write unit test for dependency allow-list
    - Assert `dashboard/package.json` does not list `three`, `@react-three/fiber`, `@react-three/drei`, or `framer-motion` in `dependencies`
    - _Requirements: 14.1_

  - [x] 1.4 Switch Vitest environment to jsdom
    - Update `dashboard/vitest.config.ts` `test.environment` from `'node'` to `'jsdom'`
    - _Requirements: 14.1_

  - [x] 1.5 Add tier and accent color tokens to Tailwind config
    - Update `dashboard/tailwind.config.js` `theme.extend.colors`: add `ng-tier-1` (`#3DDC97`), `ng-tier-2` (`#F5A623`), `ng-tier-3` (`#FF5470`), update `ng-accent-cyan` to `#7FD1FF`; leave all other existing keys untouched
    - _Requirements: 5.2, 5.3, 14.3_

  - [ ]* 1.6 Write unit test for Tailwind color-token allow-list
    - Assert `theme.extend.colors` keys are exactly the pre-existing keys plus `ng-tier-1`, `ng-tier-2`, `ng-tier-3` (no other additions)
    - _Requirements: 14.3_

  - [x] 1.7 Add display and mono font loaders to `layout.tsx`
    - Add `next/font/google` loaders (`Space_Grotesk` as `--font-display`, `JetBrains_Mono` as `--font-mono`) and apply both variable classes on `<html>`
    - _Requirements: 5.4, 5.5_

- [x] 2. Content data
  - [x] 2.1 Create `content/sampleJobs.ts`
    - Create `dashboard/src/components/content/sampleJobs.ts` exporting `Tier`, `ConfidenceLevel`, `SampleJob` types and the `SAMPLE_JOBS` array (5 entries) exactly as specified in design.md
    - _Requirements: 4.1_

  - [x] 2.2 Update `content/heroContent.ts`
    - Replace contents with `HERO_EYEBROW`, `HERO_HEADLINE_PLAIN`, `HERO_HEADLINE_ACCENT`, `HERO_HEADLINE_TAIL`, `HERO_SUBTEXT`, `HERO_STAT`, `PRIMARY_CTA_LABEL`, `SECONDARY_CTA_LABEL` exactly as specified in design.md's Data Models section
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Checkpoint - config and content data validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Pure lib functions with property tests
  - [x] 4.1 Implement `lib/computeEstimator.ts`
    - Create `dashboard/src/components/landing/lib/computeEstimator.ts` exporting `nextJobIndex(currentIndex, length)` and `CYCLE_INTERVAL_MS = 3200`
    - _Requirements: 4.3_

  - [ ]* 4.2 Write property test for Sample_Job cycling
    - **Property 1: Sample_Job cycling always advances and wraps correctly**
    - **Validates: Requirements 4.3**

  - [x] 4.3 Implement `lib/tierColors.ts`
    - Create `dashboard/src/components/landing/lib/tierColors.ts` exporting `Tier`, `TIER_COLORS`, `ACCENT_CYAN`, `BG_COLOR`, and `tierColor(tier)`
    - _Requirements: 5.2, 10.3_

  - [ ]* 4.4 Write property test for tier color mapping
    - **Property 4: Tier color mapping is deterministic and pairwise distinct**
    - **Validates: Requirements 5.2, 10.3**

  - [x] 4.5 Implement `lib/tierBadge.ts`
    - Create `dashboard/src/components/landing/lib/tierBadge.ts` exporting `ParsedTierLabel` and `parseTierLabel(label)`
    - _Requirements: 6.2_

  - [ ]* 4.6 Write property test for tier badge parsing round trip
    - **Property 5: Tier badge parsing round-trips through formatting**
    - **Validates: Requirements 6.2**

  - [x] 4.7 Implement `lib/comparisonIndicator.ts`
    - Create `dashboard/src/components/landing/lib/comparisonIndicator.ts` exporting `routingIndicator(supported)`
    - _Requirements: 9.2_

  - [ ]* 4.8 Write property test for comparison indicator mapping
    - **Property 6: Comparison indicator is a total, correct mapping from support to symbol**
    - **Validates: Requirements 9.2**

  - [x] 4.9 Implement `lib/viewportBreakpoint.ts`
    - Create `dashboard/src/components/landing/lib/viewportBreakpoint.ts` exporting pure `isBelowBreakpoint(width, threshold)` and the `useViewportBreakpoint(thresholdPx)` hook (native `matchMedia`, SSR-safe default `false`)
    - _Requirements: 2.5, 7.3, 7.4, 12.2, 12.3, 12.4, 12.5, 12.7, 14.2_

  - [ ]* 4.10 Write property test for viewport breakpoint boundary correctness
    - **Property 7: Viewport breakpoint check is a correct, total boundary function**
    - **Validates: Requirements 2.5, 7.3, 7.4, 12.2, 12.3, 12.4, 12.5, 12.7**

  - [x] 4.11 Implement `lib/liveRegionThrottle.ts`
    - Create `dashboard/src/components/landing/lib/liveRegionThrottle.ts` exporting pure `shouldAnnounce(lastAnnouncedAt, now, minIntervalMs)` and `foldAnnouncements(timestamps, minIntervalMs)`
    - _Requirements: 13.3_

  - [ ]* 4.12 Write property test for live-region announcement throttling
    - **Property 8: Live-region announcements are never closer together than the minimum interval**
    - **Validates: Requirements 13.3**

- [x] 5. Checkpoint - pure lib functions validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Relocate reduced-motion hook
  - [x] 6.1 Move `usePrefersReducedMotion` out of `gpu-scene/`
    - Create `dashboard/src/components/landing/hooks/usePrefersReducedMotion.ts` with the unchanged implementation currently in `gpu-scene/usePrefersReducedMotion.ts`
    - _Requirements: 4.5, 4.7_

- [x] 7. Leaf components
  - [x] 7.1 Implement `TierBadge.tsx`
    - Create `dashboard/src/components/landing/TierBadge.tsx` rendering the tier label and remainder text styled via `tierColor(tier)`, using the mono font variable
    - _Requirements: 6.2, 5.4_

  - [x] 7.2 Implement `TierIndicatorStrip.tsx`
    - Create `dashboard/src/components/landing/TierIndicatorStrip.tsx` rendering T1/T2/T3 LEDs, lighting the one matching `activeTier` via `tierColor`
    - _Requirements: 4.4, 5.2_

  - [ ]* 7.3 Write property test for Tier_Indicator_Strip LED matching
    - **Property 2: Tier_Indicator_Strip lights exactly the matching LED**
    - **Validates: Requirements 4.4**

- [x] 8. Compute Estimator Panel
  - [x] 8.1 Implement `ComputeEstimatorPanel.tsx`
    - Create `dashboard/src/components/landing/ComputeEstimatorPanel.tsx`: `currentIndex` state advanced every `CYCLE_INTERVAL_MS` via `nextJobIndex`, seeded at `0`; `announcedIndex` state updated only when `shouldAnnounce` against a `lastAnnouncedAtRef` returns true; renders job name/VRAM/confidence/route-out row from `SAMPLE_JOBS[currentIndex]`, mounts `TierIndicatorStrip` with `activeTier={job.tier}`, renders an `aria-live="polite"` element bound to `announcedIndex`, and a live-status dot that gets the `animate-pulse` class only when `usePrefersReducedMotion()` is `false`
    - No visitor interaction handler of any kind
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.2, 5.3, 5.4, 13.3_

  - [ ]* 8.2 Write property test for reduced-motion animation branch
    - **Property 3: Reduced-motion preference determines the live indicator's animation branch, never the cycling itself**
    - **Validates: Requirements 4.5, 4.7**

  - [ ]* 8.3 Write unit tests for `ComputeEstimatorPanel` cycling and live region
    - Assert first render shows `SAMPLE_JOBS[0]`; after advancing fake timers by `3200ms` shows `SAMPLE_JOBS[1]`; assert the live-region element has `aria-live="polite"`
    - _Requirements: 4.2, 4.3, 13.3_

- [x] 9. Checkpoint - estimator panel validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Navigation
  - [x] 10.1 Implement `NavMenu.tsx`
    - Create `dashboard/src/components/landing/NavMenu.tsx`: mobile overlay rendering section links and `Nav_CTA`, calling `onLinkActivate` when a link is clicked
    - _Requirements: 2.6, 2.7, 2.8_

  - [x] 10.2 Implement `NavBar.tsx`
    - Create `dashboard/src/components/landing/NavBar.tsx`: logo, `useViewportBreakpoint(860)`-gated section links vs. `Nav_Menu_Toggle`, `Nav_CTA`, `menuOpen` boolean state toggled by the toggle button, mounts `NavMenu` when open and mobile; links scroll via `document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 10.3 Write property test for nav menu toggle self-inverse
    - **Property 9: Nav menu toggle is a self-inverse over open/closed state**
    - **Validates: Requirements 2.6**

  - [ ]* 10.4 Write unit tests for `NavBar`/`NavMenu` responsive behavior
    - Mock `useViewportBreakpoint` to `false`: assert links and `Nav_CTA` visible, toggle absent; mock to `true`: assert links hidden, toggle visible, clicking it opens `NavMenu`, clicking a link inside `NavMenu` closes it (mock `scrollIntoView`)
    - _Requirements: 2.5, 2.6, 2.7_

- [x] 11. Hero section
  - [x] 11.1 Implement `HeroSection.tsx`
    - Create `dashboard/src/components/landing/HeroSection.tsx`: eyebrow label, two-line headline with `HERO_HEADLINE_ACCENT` in a separately-styled `<span>`, subtext, stat line, `Primary_CTA` (`next/link` to `/login`), `Secondary_CTA` (scrolls to How_It_Works_Section), mounts `ComputeEstimatorPanel`
    - No pointer/scroll capture, no `GpuSceneOrFallback` import
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 12.2_

  - [ ]* 11.2 Write unit test for hero content and CTA reachability
    - Assert eyebrow/headline segments/subtext/stat/both CTA labels render; assert `Primary_CTA` and `Secondary_CTA` are native `<a>`/`<button>` elements with no `tabIndex={-1}` override
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.1, 13.2_

- [x] 12. Checkpoint - nav and hero validated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Remaining restyled sections
  - [x] 13.1 Restyle `ProblemSection.tsx`
    - Update `dashboard/src/components/landing/ProblemSection.tsx` to the dark/mono theme, calling `parseTierLabel` on `row.tierNeeded`/`row.tierTypicallyUsed` and rendering each result through `TierBadge`
    - _Requirements: 6.1, 6.2, 6.3, 5.1, 5.4_

  - [x] 13.2 Restyle `HowItWorksSection.tsx`
    - Update `dashboard/src/components/landing/HowItWorksSection.tsx`: 4 numbered step circles with title/description, dashed connector rendered only when `useViewportBreakpoint(860)` is `false`, step text always present as text nodes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 5.1_

  - [x] 13.3 Restyle `AmdCalloutSection.tsx`
    - Update `dashboard/src/components/landing/AmdCalloutSection.tsx`: MI300X VRAM stat in a visually distinct container, spotlight pill label, AMD Developer Cloud/Fireworks AI copy, MI300X relevance text, single column below 860px
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 12.4, 5.1_

  - [x] 13.4 Restyle `ComparisonSection.tsx`
    - Update `dashboard/src/components/landing/ComparisonSection.tsx`: `NEURALGRID_ROW` first then `COMPETITORS`, `routingIndicator(row.autoTierRouting)` per row, distinct style on the NeuralGrid row, reflow wrapper below `md`
    - _Requirements: 9.1, 9.2, 9.3, 12.6, 5.1, 5.4_

  - [x] 13.5 Restyle `PricingSection.tsx`
    - Update `dashboard/src/components/landing/PricingSection.tsx`: exactly 3 cards in T1/T2/T3 order, each with VRAM range/hardware/price range/`exampleWorkload`, border/background accent via `tierColor(tier)`, single column below 860px
    - _Requirements: 10.1, 10.2, 10.3, 12.5, 5.1, 5.4_

  - [x] 13.6 Restyle `FooterCtaSection.tsx`
    - Update `dashboard/src/components/landing/FooterCtaSection.tsx`: CTA (`next/link` to `/login`) and GitHub link co-rendered in the same component with no prop that can separate them, GitHub link opens in a new tab
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 5.1_

  - [ ]* 13.7 Write unit tests for restyled section content presence
    - Assert `ProblemSection` renders all `WASTE_FACTORS` rows with `TierBadge`s; `ComparisonSection` renders `NEURALGRID_ROW` first then `COMPETITORS` in order; `PricingSection` renders exactly 3 cards in order with each `exampleWorkload`; `AmdCalloutSection` contains both `AMD_PROVIDERS` names, `AMD_MI300X_VRAM`, `AMD_MI300X_RELEVANCE`; `HowItWorksSection` renders all 4 step titles/descriptions; `FooterCtaSection` always renders CTA and GitHub link together
    - _Requirements: 6.1, 7.1, 7.5, 8.3, 8.4, 9.1, 10.1, 10.2, 11.1_

  - [ ]* 13.8 Write unit test for `HowItWorksSection` connector visibility
    - Mock `useViewportBreakpoint` to `false`: assert connector present; mock to `true`: assert connector absent, step text still present
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 14. Checkpoint - all sections restyled
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Composition, cleanup, and route integration
  - [x] 15.1 Implement `LandingPage.tsx`
    - Update `dashboard/src/components/landing/LandingPage.tsx` composing `NavBar`, `HeroSection`, `ProblemSection`, `HowItWorksSection`, `AmdCalloutSection`, `ComparisonSection`, `PricingSection`, `FooterCtaSection` in order, applying the shared dark background theme once at this layer
    - _Requirements: 1.1, 5.1_

  - [x] 15.2 Delete the `gpu-scene/` directory
    - Delete `dashboard/src/components/landing/gpu-scene/` (ChipModel, GpuScene, GpuSceneOrFallback, StaticFallback, useComplexityTier, useWebglSupported, transforms) now that `usePrefersReducedMotion` has been relocated
    - _Requirements: 5.6, 14.5_

  - [ ]* 15.3 Write unit test for no 3D/gpu-scene imports
    - Static-source-scan test asserting no file under `dashboard/src` imports from a `gpu-scene` path or from `three`/`@react-three/*`
    - _Requirements: 14.5_

  - [ ]* 15.4 Write unit test for `page.tsx` session routing (unchanged behavior)
    - Mock `getServerSession`: session present → assert `redirect('/jobs')` called; session absent → assert `LandingPage` is rendered with no WebGL canvas or three.js element present
    - _Requirements: 1.1, 1.2_

  - [ ]* 15.5 Write unit tests for CTA accessible names and focus reachability
    - Assert `Primary_CTA`, `Secondary_CTA`, `Nav_CTA`, and the footer CTA are native `<a>`/`<button>` elements with no `tabIndex={-1}`, each with an accessible name between 1 and 100 characters
    - _Requirements: 13.1, 13.2_

- [x] 16. Final checkpoint - full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- Each task references specific requirement acceptance criteria for traceability
- Property tests validate the 9 correctness properties from design.md using fast-check (minimum 100 runs); each property is its own separate sub-task placed immediately after the implementation task it validates
- Unit tests are placed as optional sub-tasks immediately after the implementation task they cover, matching the `landing-page-3d` convention
- Visual/manual QA (breakpoint appearance at real widths, scroll-timing/position checks, font/background consistency) and the manual smoke pass from design.md's Testing Strategy are intentionally excluded — they require human review or real-browser measurement and are not automatable coding tasks

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "1.5", "1.7", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.3", "1.6", "4.1", "4.3", "4.5", "4.7", "4.9", "4.11", "6.1"] },
    { "id": 2, "tasks": ["4.2", "4.4", "4.6", "4.8", "4.10", "4.12", "7.1", "7.2"] },
    { "id": 3, "tasks": ["7.3", "8.1", "10.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "10.2"] },
    { "id": 5, "tasks": ["10.3", "10.4", "11.1"] },
    { "id": 6, "tasks": ["11.2", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 7, "tasks": ["13.7", "13.8", "15.1"] },
    { "id": 8, "tasks": ["15.2"] },
    { "id": 9, "tasks": ["15.3", "15.4", "15.5"] }
  ]
}
```
