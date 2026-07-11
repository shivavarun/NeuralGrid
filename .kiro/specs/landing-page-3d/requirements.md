# Requirements Document

## Introduction

NeuralGrid currently has no public marketing landing page. The root route (`/`) only performs a session check and redirects visitors to `/jobs` (authenticated) or `/login` (unauthenticated). This feature replaces that behavior with a real landing page, aimed at both developer acquisition (post-hackathon) and the AMD Developer Hackathon ACT II demo video/judging.

The landing page communicates NeuralGrid's core value proposition (automatic GPU tier routing, 40% average cost reduction vs. manual selection) using a Vercel-style dark, minimal, gradient-driven visual language, centered on a literal 3D GPU/chip model in the hero section that reacts to mouse movement and scroll position. The page must render acceptably on both desktop (demo recording) and mobile/lower-end devices (real-world traffic), and must degrade gracefully for users who prefer reduced motion or whose browser lacks WebGL support.

Session-based redirect behavior for already-authenticated users is preserved: visiting `/` while authenticated still routes to `/jobs`. Only unauthenticated visitors see the new landing page.

## Glossary

- **Landing_Page**: The new marketing page rendered at the `/` route for unauthenticated visitors, replacing the previous redirect-only behavior.
- **Session_Router**: The existing authentication check (via NextAuth session) that determines whether a visitor to `/` is redirected to `/jobs` or shown the Landing_Page.
- **GPU_Scene**: The 3D animated visualization of a GPU/chip model rendered inside the Hero_Section.
- **Hero_Section**: The first full-viewport section of the Landing_Page, containing the GPU_Scene, the primary tagline, supporting subtext, and the Primary_CTA.
- **Primary_CTA**: The main call-to-action control on the Landing_Page that navigates the visitor to `/login`.
- **Problem_Section**: The Landing_Page section presenting GPU cost-waste statistics sourced from the product's PRD (e.g. tier mismatch waste factors).
- **How_It_Works_Section**: The Landing_Page section visualizing the job routing flow (job submission → Compute Estimator → tier selection → GPU provider).
- **AMD_Callout_Section**: The Landing_Page section describing AMD Developer Cloud and Fireworks AI integration.
- **Comparison_Section**: The Landing_Page section presenting a competitive comparison table against other GPU marketplaces/routers.
- **Pricing_Section**: The Landing_Page section presenting the T1/T2/T3 tier breakdown (VRAM range, hardware examples, price range).
- **Footer_CTA_Section**: The final Landing_Page section containing a closing call-to-action and standard footer links.
- **Reduced_Motion_Preference**: The visitor's operating system or browser level `prefers-reduced-motion: reduce` media query setting.
- **WebGL_Unsupported_State**: The condition where the visitor's browser does not support or has disabled WebGL rendering.
- **Static_Fallback**: A non-animated, non-WebGL visual (image, gradient, or CSS-only graphic) shown in place of the GPU_Scene when required.
- **Viewport_Breakpoint**: One of the responsive width breakpoints defined in the dashboard's Tailwind configuration (sm, md, lg, xl, 2xl).
- **Largest_Contentful_Paint**: The Core Web Vitals metric measuring the render time of the largest visible content element on initial load.
- **Frame_Rate**: The number of rendered frames per second measured while the GPU_Scene is animating.

## Requirements

### Requirement 1: Landing Page Route and Session Handling

**User Story:** As an unauthenticated visitor, I want to see a marketing landing page when I visit the root URL, so that I can learn about NeuralGrid before signing up.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor requests the `/` route, THE Landing_Page SHALL render in place of the previous redirect-only behavior.
2. WHEN an authenticated visitor requests the `/` route, THE Session_Router SHALL redirect the visitor to `/jobs`, preserving current behavior.
3. WHEN a visitor activates the Primary_CTA, THE Landing_Page SHALL navigate the visitor to `/login`.
4. THE Landing_Page SHALL render using the dashboard's existing Next.js App Router structure without introducing a separate deployment or subdomain.

> Note: Rendering of the Landing_Page is not gated on detection of a specific router structure. THE Landing_Page SHALL still attempt to render even if the router structure differs from what is expected.

### Requirement 2: Hero Section Content

**User Story:** As a visitor, I want an immediate, clear statement of what NeuralGrid does, so that I understand the value proposition within seconds of landing on the page.

#### Acceptance Criteria

1. THE Hero_Section SHALL display a primary tagline communicating automatic GPU tier routing and cost reduction.
2. THE Hero_Section SHALL display supporting subtext referencing the 40% average cost reduction metric stated in the PRD.
3. THE Hero_Section SHALL display the Primary_CTA labeled to invite sign-up.
4. THE Hero_Section SHALL render the GPU_Scene as its visual centerpiece.
5. WHEN the Landing_Page is rendered at any Viewport_Breakpoint from `sm` through `2xl`, THE Hero_Section SHALL arrange the tagline, subtext, Primary_CTA, and GPU_Scene without overlapping content, allowing natural vertical overflow or scrolling when the content does not fit within the viewport height rather than forcing resizing or truncation.

### Requirement 3: GPU Scene Visual Design

**User Story:** As a visitor, I want to see a visually distinctive 3D GPU model, so that the page feels credible and technically impressive.

#### Acceptance Criteria

1. THE GPU_Scene SHALL render a literal, stylized 3D model resembling a GPU or chip with illuminated circuit-line detailing.
2. THE GPU_Scene SHALL apply a dark background with gradient lighting consistent with a Vercel-style visual theme.
3. WHILE no visitor interaction occurs, THE GPU_Scene SHALL continue an ambient idle animation (e.g. slow auto-rotation); THE GPU_Scene SHALL continue this ambient idle animation concurrently even while interaction-driven transformations from mouse movement or scrolling are being applied, without pausing or being replaced by the interaction response.
4. THE Landing_Page SHALL apply the same dark, gradient-driven visual theme established by the GPU_Scene to the Problem_Section, How_It_Works_Section, AMD_Callout_Section, Comparison_Section, Pricing_Section, and Footer_CTA_Section.

### Requirement 4: GPU Scene Mouse and Scroll Interaction

**User Story:** As a visitor, I want the 3D GPU model to respond to my mouse movement and scrolling, so that the hero feels alive and engaging.

#### Acceptance Criteria

1. WHEN a visitor moves the mouse cursor within the Hero_Section on a pointer-capable device, THE GPU_Scene SHALL adjust its rotation or tilt toward the cursor position.
2. WHEN a visitor scrolls the Landing_Page, THE GPU_Scene SHALL update its rotation, position, or scale in response to scroll position.
3. IF the visitor's device does not report pointer input (e.g. touch-only device), THEN THE GPU_Scene SHALL rely on scroll-based interaction alone without requiring pointer movement.
4. THE GPU_Scene SHALL clamp interaction-driven transformations at viewport boundary limits, strictly preventing the model from exceeding those bounds within the Hero_Section viewport at all supported Viewport_Breakpoints.

### Requirement 5: Cross-Device Performance of the GPU Scene

**User Story:** As a visitor on a mobile phone or lower-end laptop, I want the 3D scene to run smoothly, so that the page doesn't feel janky or drain my device.

#### Acceptance Criteria

1. THE GPU_Scene SHALL sustain a Frame_Rate of at least 30 frames per second on a mid-range mobile device (e.g. a device with a Tier equivalent to a 2021 mid-range smartphone GPU).
2. THE GPU_Scene SHALL sustain a Frame_Rate of at least 55 frames per second on a desktop or laptop with a dedicated or integrated GPU released within the last 5 years.
3. WHEN the Landing_Page detects a Viewport_Breakpoint below `md`, THE GPU_Scene SHALL reduce model geometry complexity or effect count to maintain the frame rate targets in Criteria 1.
4. IF reducing model geometry complexity or effect count is insufficient to reach the Frame_Rate target in Criterion 1 on a given device, THEN THE GPU_Scene SHALL continue running below the target Frame_Rate rather than disabling itself.
5. THE Landing_Page SHALL load and initialize the GPU_Scene without blocking the Largest_Contentful_Paint of the Hero_Section's tagline and Primary_CTA text.

### Requirement 6: Reduced Motion and WebGL Fallback

**User Story:** As a visitor who prefers reduced motion or whose browser lacks 3D rendering support, I want a non-distracting, functional hero section, so that I can still read the page content comfortably.

#### Acceptance Criteria

1. IF the visitor's browser reports a Reduced_Motion_Preference, THEN THE Hero_Section SHALL display a Static_Fallback in place of the animated GPU_Scene.
2. IF the visitor's browser is in a WebGL_Unsupported_State, THEN THE Hero_Section SHALL display a Static_Fallback in place of the GPU_Scene.
3. WHILE a Static_Fallback is displayed, THE Hero_Section SHALL retain the tagline, subtext, and Primary_CTA at their normal readable positions.
4. THE Static_Fallback SHALL visually communicate the GPU/chip subject matter (e.g. a rendered still image or CSS gradient silhouette of the 3D model) rather than an empty or blank area.

### Requirement 7: Problem Statement Section

**User Story:** As a visitor evaluating NeuralGrid, I want to see concrete evidence of GPU cost waste, so that I understand why this product matters.

#### Acceptance Criteria

1. THE Problem_Section SHALL display a table or comparable structured layout listing at least 3 task types, the GPU tier actually needed, the GPU tier typically used, and the resulting waste factor, sourced from the values in the PRD.
2. THE Problem_Section SHALL NOT display cost, waste, or performance figures that do not appear in the PRD or hackathon submission documents.

### Requirement 8: How It Works Section

**User Story:** As a visitor, I want to see how a job moves through NeuralGrid, so that I understand the mechanism behind the cost savings.

#### Acceptance Criteria

1. THE How_It_Works_Section SHALL display a sequential visualization of the flow: job submission, Compute Estimator classification, tier selection, and routing to a GPU provider.
2. THE How_It_Works_Section SHALL display step labels as accessible text content describing each step's function, independent of whether the sequential visual flow itself is rendered, so that labels remain present and readable even in a fallback or non-visual rendering state.

### Requirement 9: AMD and Fireworks Integration Callout

**User Story:** As a hackathon judge or technical visitor, I want to see NeuralGrid's AMD hardware integration called out explicitly, so that I understand the AMD angle without digging through documentation.

#### Acceptance Criteria

1. THE AMD_Callout_Section SHALL name AMD Developer Cloud and Fireworks AI as integrated providers.
2. THE AMD_Callout_Section SHALL state the AMD MI300X VRAM capacity (192GB HBM3) and its relevance to routing large-model workloads, consistent with the hackathon submission document.

### Requirement 10: Competitive Comparison Section

**User Story:** As a visitor comparing options, I want to see how NeuralGrid differs from existing GPU marketplaces, so that I can evaluate whether to switch.

#### Acceptance Criteria

1. THE Comparison_Section SHALL display a table comparing NeuralGrid against at least 3 named competitor platforms referenced in the PRD or hackathon submission document.
2. THE Comparison_Section SHALL indicate, for each compared platform, whether automatic job-to-tier routing is supported.

### Requirement 11: Pricing Tier Section

**User Story:** As a prospective developer, I want to see the GPU tier structure and price ranges, so that I can estimate what my jobs would cost.

#### Acceptance Criteria

1. THE Pricing_Section SHALL display the T1, T2, and T3 tiers with their VRAM ranges, representative hardware, and price-per-hour ranges as defined in the PRD.
2. THE Pricing_Section SHALL display at least one example workload type per tier (e.g. small LLM inference for T1).

### Requirement 12: Footer Call-to-Action Section

**User Story:** As a visitor who has scrolled through the page, I want a final clear next step, so that I don't have to scroll back up to sign up.

#### Acceptance Criteria

1. THE Footer_CTA_Section SHALL display both a call-to-action control that navigates the visitor to `/login` and standard footer content including a link to the project's GitHub repository together, such that neither is displayed without the other.

### Requirement 13: Responsive Layout

**User Story:** As a visitor on any device size, I want the landing page to display correctly, so that I have a usable experience regardless of screen size.

#### Acceptance Criteria

1. WHEN the Landing_Page is rendered at any Viewport_Breakpoint from `sm` through `2xl`, THE Landing_Page SHALL display all section content without horizontal overflow or overlapping elements; this criterion applies at the `sm` Viewport_Breakpoint independently of, and prior to, the table reflow behavior specified in Criterion 2.
2. THE Landing_Page SHALL reflow the Comparison_Section and Pricing_Section tables into a stacked or horizontally scrollable layout when rendered below the `md` Viewport_Breakpoint.

### Requirement 14: Page Load Performance Budget

**User Story:** As a visitor, I want the landing page to load quickly, so that I don't abandon the page before it renders.

#### Acceptance Criteria

1. THE Landing_Page SHALL achieve a Largest_Contentful_Paint of 2.5 seconds or less on a simulated fast 4G mobile connection.
2. THE Landing_Page SHALL defer loading of GPU_Scene rendering libraries until after the Hero_Section's text content has been requested, using code-splitting or dynamic import.

### Requirement 15: Accessibility of Page Content

**User Story:** As a visitor using a screen reader, I want to access all landing page content and navigate to sign-up, so that the 3D visual elements don't block my access to information.

#### Acceptance Criteria

1. THE GPU_Scene SHALL be marked as decorative to assistive technology (e.g. via `aria-hidden`) so that screen readers skip directly to surrounding text content.
2. THE Landing_Page SHALL expose the tagline, subtext, section headings, and all CTA controls to screen readers as focusable or readable text elements.
3. THE Primary_CTA and Footer_CTA_Section call-to-action control SHALL be reachable via keyboard navigation in the page's tab order.

### Requirement 16: Technical Dependency Constraints

**User Story:** As a maintainer of the dashboard codebase, I want the 3D landing page built with a constrained, known set of new dependencies, so that the project's dependency footprint stays predictable.

#### Acceptance Criteria

1. WHERE a 3D rendering library is required, THE Landing_Page implementation SHALL use `three`, `@react-three/fiber`, and `@react-three/drei` as the 3D rendering stack.
2. WHERE a scroll or motion animation library is required beyond CSS transitions, THE Landing_Page implementation SHALL use `framer-motion` as the animation library. This constraint governs which library is selected when such animation is used; it does not prohibit the presence of `framer-motion` as a dependency when no scroll or motion animation beyond CSS transitions is used.
3. THE Landing_Page implementation SHALL NOT introduce additional 3D, animation, or scroll-linking libraries beyond those listed in Criteria 1 and 2 without updating this requirements document.
4. THE Landing_Page implementation SHALL reuse the dashboard's existing Tailwind CSS configuration for spacing, color, and typography utilities rather than introducing a separate styling system.
