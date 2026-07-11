# Requirements Document

## Introduction

NeuralGrid's public marketing landing page currently renders at the `/` route as a Next.js/React page (`dashboard/src/app/page.tsx`) built from the `landing-page-3d` spec, whose hero centerpiece is a literal 3D GPU/chip model built with `three`, `@react-three/fiber`, and `@react-three/drei`, reacting to pointer movement and scroll.

This feature replaces that 3D hero and its supporting visual system with a new design defined by the mockup file `neuralgrid_landing.html` (a static HTML/CSS/vanilla-JS reference, not the target stack). The new hero centerpiece is a "Compute Estimator" telemetry panel: a live-cycling simulated dashboard widget showing a sample job's name, VRAM requirement, confidence level, a 3-tier LED indicator strip, routed provider, and cost, with no 3D rendering, no WebGL, and no pointer/scroll-driven interaction.

The redesign also introduces a new dark color system with distinct tier colors, a monospace font for telemetry/data text and a display font for headings, a new nav bar, and restyled versions of the problem, how-it-works, AMD callout, comparison, pricing, and footer CTA sections. The existing content data (waste factors, competitors, pricing tiers, AMD callout facts) and the session-based redirect behavior at `/` are preserved. All three.js/WebGL-specific requirements from `landing-page-3d` (GPU_Scene, ChipModel, pointer tilt, scroll transforms, complexity tiers, static fallback, dynamic-import boundary for 3D libraries) are dropped and must not be reintroduced.

## Glossary

- **Landing_Page**: The marketing page rendered at the `/` route for unauthenticated visitors, implemented in the Next.js dashboard app.
- **Session_Router**: The existing authentication check (via NextAuth session) that determines whether a visitor to `/` is redirected to `/jobs` or shown the Landing_Page.
- **Nav_Bar**: The top navigation region of the Landing_Page containing the logo, section links, and the Nav_CTA.
- **Nav_CTA**: The "Get started" call-to-action control rendered inside the Nav_Bar.
- **Nav_Menu_Toggle**: The control displayed in the Nav_Bar below the 860px Viewport_Breakpoint that opens or closes the Nav_Menu.
- **Nav_Menu**: The overlay displayed below the 860px Viewport_Breakpoint, opened via the Nav_Menu_Toggle, containing the Nav_Bar's section links and the Nav_CTA.
- **Hero_Section**: The first section of the Landing_Page, containing the eyebrow label, headline, subtext, stat line, Primary_CTA, Secondary_CTA, and the Compute_Estimator_Panel.
- **Primary_CTA**: The main call-to-action control on the Landing_Page that navigates the visitor to `/login`.
- **Secondary_CTA**: The ghost-styled call-to-action control in the Hero_Section that navigates the visitor to the How_It_Works_Section.
- **Compute_Estimator_Panel**: The telemetry-style widget rendered in the Hero_Section that cycles through a fixed set of Sample_Jobs on a timed interval, displaying job name, VRAM needed, confidence level, the Tier_Indicator_Strip, routed provider, and cost.
- **Sample_Job**: One fixed, hardcoded entry in the set of jobs the Compute_Estimator_Panel cycles through, consisting of a job name, VRAM value, confidence level, tier, routed provider name, and cost value.
- **Tier_Indicator_Strip**: The row of three LED-style indicators (T1, T2, T3) inside the Compute_Estimator_Panel, where the indicator matching the currently displayed Sample_Job's tier is visually lit and the other two are unlit.
- **Confidence_Level**: One of the three enumerated values HIGH, MEDIUM, or LOW associated with a Sample_Job.
- **Problem_Section**: The Landing_Page section presenting the GPU cost-waste table (task type, tier needed, tier typically used, waste factor).
- **How_It_Works_Section**: The Landing_Page section visualizing the 4-step job routing flow with a connector line and numbered step circles.
- **AMD_Callout_Section**: The Landing_Page section displaying the AMD MI300X VRAM statistic and descriptive copy about AMD Developer Cloud and Fireworks AI.
- **Comparison_Section**: The Landing_Page section presenting a platform comparison table with a column indicating automatic tier routing support.
- **Pricing_Section**: The Landing_Page section presenting the T1/T2/T3 tier cards with VRAM range, hardware examples, price range, and example workload.
- **Footer_CTA_Section**: The final Landing_Page section containing a closing call-to-action and footer content including a GitHub link.
- **Tier_Badge**: A visually styled label (e.g. "T1 · RTX 3060") used in the Problem_Section table to denote a GPU tier, styled distinctly per tier (T1, T2, or T3).
- **Reduced_Motion_Preference**: The visitor's operating system or browser level `prefers-reduced-motion: reduce` media query setting.
- **Viewport_Breakpoint**: A responsive layout boundary; for this feature, the single mobile breakpoint at 860px, below which multi-column layouts collapse to a single column, in addition to the dashboard's existing Tailwind breakpoints (sm, md, lg, xl, 2xl).

## Requirements

### Requirement 1: Landing Page Route and Session Handling

**User Story:** As an unauthenticated visitor, I want to see the redesigned marketing landing page when I visit the root URL, so that I can learn about NeuralGrid before signing up.

#### Acceptance Criteria

1. WHEN an unauthenticated visitor requests the `/` route, THE Landing_Page SHALL render the Nav_Bar, Hero_Section, Problem_Section, How_It_Works_Section, AMD_Callout_Section, Comparison_Section, Pricing_Section, and Footer_CTA_Section, and SHALL NOT render any WebGL canvas, three.js scene, or other 3D-rendered visual element.
2. WHEN an authenticated visitor requests the `/` route, THE Session_Router SHALL redirect the visitor to `/jobs` before any Landing_Page section content is rendered, preserving current behavior.
3. WHEN a visitor activates the Primary_CTA, THE Landing_Page SHALL navigate the visitor to `/login`.
4. THE Landing_Page SHALL render using the dashboard's existing Next.js App Router structure without introducing a separate deployment or subdomain.

### Requirement 2: Navigation Bar

**User Story:** As a visitor, I want a navigation bar with links to key sections, so that I can jump directly to the information I care about.

#### Acceptance Criteria

1. THE Nav_Bar SHALL display the NeuralGrid logo mark and wordmark.
2. THE Nav_Bar SHALL display links to the Problem_Section, the How_It_Works_Section, the Pricing_Section, and the Comparison_Section.
3. THE Nav_Bar SHALL display the Nav_CTA labeled to invite sign-up.
4. WHEN a visitor activates a Nav_Bar section link, THE Landing_Page SHALL scroll the viewport, within 1 second of activation, so that the top edge of the corresponding section is within 16px of the viewport top edge.
5. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE Nav_Bar SHALL hide the section links and display the logo, the Nav_CTA, and a Nav_Menu_Toggle control in place of the hidden links.
6. WHEN a visitor activates the Nav_Menu_Toggle, THE Nav_Bar SHALL open a Nav_Menu overlay displaying the section links and the Nav_CTA if the Nav_Menu is currently closed, or close the Nav_Menu if it is currently open.
7. WHEN a visitor activates a section link within the Nav_Menu, THE Nav_Bar SHALL close the Nav_Menu, and THE Landing_Page SHALL scroll to the corresponding section per criterion 4's timing and position bounds.
8. WHEN a visitor activates the Nav_CTA, THE Landing_Page SHALL navigate the visitor to the sign-up entry point.

### Requirement 3: Hero Section Content

**User Story:** As a visitor, I want an immediate, clear statement of what NeuralGrid does, so that I understand the value proposition within seconds of landing on the page.

#### Acceptance Criteria

1. THE Hero_Section SHALL display an eyebrow label containing text identifying automatic GPU tier routing as the capability being described.
2. THE Hero_Section SHALL display a two-line headline in which one phrase is rendered in an accent color distinct from the color of the surrounding headline text.
3. THE Hero_Section SHALL display subtext that both describes how NeuralGrid profiles submitted jobs and describes how NeuralGrid routes submitted jobs.
4. THE Hero_Section SHALL display a stat line stating the 40% average cost reduction metric.
5. THE Hero_Section SHALL display the Primary_CTA with label text inviting sign-up.
6. THE Hero_Section SHALL display the Secondary_CTA with label text inviting the visitor to see how routing works.
7. WHEN a visitor activates the Secondary_CTA, THE Landing_Page SHALL scroll to the How_It_Works_Section.
8. AT the `lg` Viewport_Breakpoint and above, THE Hero_Section SHALL render the Compute_Estimator_Panel as the largest single visual element within the Hero_Section by rendered area.
9. WHEN the Landing_Page is rendered at any Viewport_Breakpoint from `sm` through `2xl`, THE Hero_Section SHALL arrange the eyebrow label, headline, subtext, stat line, Primary_CTA, Secondary_CTA, and Compute_Estimator_Panel without overlapping content, allowing natural vertical overflow or scrolling when the content does not fit within the viewport height rather than forcing resizing or truncation.

### Requirement 4: Compute Estimator Panel Behavior

**User Story:** As a visitor, I want to see a live-feeling demonstration of how job routing works, so that the product's mechanism feels concrete rather than abstract.

#### Acceptance Criteria

1. THE Compute_Estimator_Panel SHALL define a fixed, hardcoded set of between 5 and 10 Sample_Jobs, each specifying a job name, a VRAM value between 0.1 and 100 GB, a Confidence_Level of HIGH, MEDIUM, or LOW, a tier of T1, T2, or T3, a routed provider name, and a cost value between $0.0001 and $1.00.
2. WHEN the Landing_Page loads, THE Compute_Estimator_Panel SHALL display the first Sample_Job in the fixed set.
3. WHILE the Landing_Page remains open, THE Compute_Estimator_Panel SHALL advance to the next Sample_Job in the fixed set, cycling back to the first after the last, on a fixed interval of 3.2 seconds ± 0.1 seconds.
4. WHEN the Compute_Estimator_Panel displays a Sample_Job, THE Tier_Indicator_Strip SHALL visually light the indicator matching that Sample_Job's tier and leave the other two indicators unlit.
5. UNLESS the visitor's browser reports a Reduced_Motion_Preference, THE Compute_Estimator_Panel SHALL display a "live" status indicator alongside a continuously pulsing dot to communicate that the panel is actively updating.
6. THE Compute_Estimator_Panel SHALL require no visitor interaction to cycle through Sample_Jobs.
7. IF the visitor's browser reports a Reduced_Motion_Preference, THEN THE Compute_Estimator_Panel SHALL continue cycling Sample_Jobs on its fixed interval from criterion 3, SHALL display a static (non-pulsing) "live" status indicator, and SHALL NOT render any continuous transform or opacity animation.

### Requirement 5: Visual Design System

**User Story:** As a visitor, I want a visually cohesive, distinctive dark interface, so that the page feels credible and matches the product's technical positioning.

#### Acceptance Criteria

1. THE Landing_Page SHALL apply a single, consistent dark background color value across the Nav_Bar, Hero_Section, Problem_Section, How_It_Works_Section, AMD_Callout_Section, Comparison_Section, Pricing_Section, and Footer_CTA_Section.
2. THE Landing_Page SHALL apply a distinct color value to elements representing the T1 tier, a distinct color value to elements representing the T2 tier, and a distinct color value to elements representing the T3 tier, such that each tier color is visually distinguishable from the other two tier colors, from the background color, and from the cyan accent color, consistently across the Compute_Estimator_Panel, Problem_Section, and Pricing_Section.
3. THE Landing_Page SHALL apply a single, consistent cyan accent color value to accent elements, including at minimum the routed-provider value in the Compute_Estimator_Panel, wherever an accent color is used on the page.
4. THE Landing_Page SHALL render all telemetry and tabular data text, including all Compute_Estimator_Panel values and all table cell values, in a single, consistent monospace font.
5. THE Landing_Page SHALL render all headings in a single, consistent display font that is distinct from the monospace data font and the body text font.
6. THE Landing_Page SHALL NOT render any WebGL canvas, three.js scene, or other 3D-rendered visual element.

### Requirement 6: Problem Statement Section

**User Story:** As a visitor evaluating NeuralGrid, I want to see concrete evidence of GPU cost waste, so that I understand why this product matters.

#### Acceptance Criteria

1. THE Problem_Section SHALL display a table listing at least 3 task types, in the order defined by the existing waste factor content data, showing for each task type the GPU tier actually needed, the GPU tier typically used, and the resulting waste factor, sourced from that existing waste factor content data.
2. THE Problem_Section SHALL render each of the tier-needed and tier-typically-used table values as a Tier_Badge displaying that value's tier identifier (T1, T2, or T3) styled with the tier color defined in Requirement 5.2, with any remaining descriptive text from the source value (e.g. a hardware example) rendered adjacent to or within the Tier_Badge rather than as plain unstyled text.
3. THE Problem_Section SHALL NOT display any cost, waste-factor, or performance numeric value that does not appear verbatim in the existing waste factor content data.

### Requirement 7: How It Works Section

**User Story:** As a visitor, I want to see how a job moves through NeuralGrid, so that I understand the mechanism behind the cost savings.

#### Acceptance Criteria

1. THE How_It_Works_Section SHALL display the 4 existing steps (submit job, Compute Estimator classification, tier selection, routing to a GPU provider) as 4 distinct sequential elements, each with a title and description, in that fixed order.
2. THE How_It_Works_Section SHALL display a numbered circle (1, 2, 3, 4) for each of the 4 steps, matching each step's position in the sequence defined in criterion 1.
3. WHEN the Landing_Page is rendered at or above the 860px Viewport_Breakpoint, THE How_It_Works_Section SHALL display a dashed connector line spanning between each adjacent pair of step circles in the sequence.
4. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE How_It_Works_Section SHALL NOT display the dashed connector line.
5. THE How_It_Works_Section SHALL display step titles and descriptions as accessible text content for each step, independent of whether the connector line is rendered.

### Requirement 8: AMD Spotlight Section

**User Story:** As a hackathon judge or technical visitor, I want to see NeuralGrid's AMD hardware integration called out explicitly, so that I understand the AMD angle without digging through documentation.

#### Acceptance Criteria

1. THE AMD_Callout_Section SHALL display the AMD MI300X VRAM capacity (192GB HBM3) inside a visually distinct container element separated from the surrounding descriptive copy.
2. THE AMD_Callout_Section SHALL display a pill-styled label containing non-empty text that identifies the section as a provider spotlight.
3. THE AMD_Callout_Section SHALL display descriptive copy naming AMD Developer Cloud and Fireworks AI as integrated providers, consistent with the existing AMD callout content data.
4. THE AMD_Callout_Section SHALL display the MI300X relevance explanation text (describing why 192GB HBM3 lets NeuralGrid route large model jobs to a single AMD node), consistent with the existing AMD callout content data.

### Requirement 9: Competitive Comparison Section

**User Story:** As a visitor comparing options, I want to see how NeuralGrid differs from existing GPU marketplaces, so that I can evaluate whether to switch.

#### Acceptance Criteria

1. THE Comparison_Section SHALL display a table containing one row for NeuralGrid and one row for each named competitor platform from the existing competitor content data, with the NeuralGrid row displayed first followed by the competitor rows in the order defined by that content data.
2. THE Comparison_Section SHALL display, for every row including the NeuralGrid row, whether automatic job-to-tier routing is supported, using a checkmark for supported and a cross mark for unsupported.
3. THE Comparison_Section SHALL render the NeuralGrid row with a background or border style not applied to any competitor row, such that the NeuralGrid row is visually distinguishable from every competitor row.

### Requirement 10: Pricing Tier Section

**User Story:** As a prospective developer, I want to see the GPU tier structure and price ranges, so that I can estimate what my jobs would cost.

#### Acceptance Criteria

1. THE Pricing_Section SHALL display exactly three tier cards, in the order T1, T2, and T3, each showing that tier's VRAM range, representative hardware list, and price-per-hour range, with all three values sourced verbatim from the existing pricing tier content data.
2. THE Pricing_Section SHALL display, on each tier card, at least one example workload type text sourced from that tier's `exampleWorkload` entry in the existing pricing tier content data.
3. THE Pricing_Section SHALL render each tier card with a border or background accent element whose color exactly matches that tier's color as defined in Requirement 5, such that each card is visually distinguishable from the other two tiers by color alone.

### Requirement 11: Footer Call-to-Action Section

**User Story:** As a visitor who has scrolled through the page, I want a final clear next step, so that I don't have to scroll back up to sign up.

#### Acceptance Criteria

1. THE Footer_CTA_Section SHALL render as the last section in the page's vertical layout and SHALL simultaneously display a call-to-action control and a footer link to the project's GitHub repository, such that neither is displayed without the other.
2. THE Footer_CTA_Section SHALL label the call-to-action control with text indicating sign-up or account creation.
3. WHEN the visitor activates the call-to-action control, THE Footer_CTA_Section SHALL navigate the visitor to `/login`.
4. WHEN the visitor activates the GitHub repository link, THE Footer_CTA_Section SHALL open the project's GitHub repository URL in a new browser tab.

### Requirement 12: Responsive Layout

**User Story:** As a visitor on any device size, I want the landing page to display correctly, so that I have a usable experience regardless of screen size.

#### Acceptance Criteria

1. WHEN the Landing_Page is rendered at any viewport width from 320px through and beyond the `2xl` Viewport_Breakpoint, THE Landing_Page SHALL display all section content within the viewport width, with no horizontal scrollbar present and no two visible content elements' bounding boxes overlapping.
2. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE Hero_Section SHALL collapse its two-column layout (headline/CTA column and Compute_Estimator_Panel) into a single column.
3. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE How_It_Works_Section SHALL reflow its 4-step layout into a 2-column grid.
4. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE AMD_Callout_Section SHALL collapse its layout into a single column.
5. WHEN the Landing_Page is rendered below the 860px Viewport_Breakpoint, THE Pricing_Section SHALL collapse its 3-column tier card grid into a single column.
6. WHEN the Comparison_Section or Problem_Section tables are rendered below the `md` Viewport_Breakpoint, THE Landing_Page SHALL reflow each table into either a stacked layout requiring no horizontal scrolling or a horizontally scrollable layout with a visible scroll indicator, and SHALL NOT truncate, hide, or omit any row or column content in either layout.
7. WHEN the Landing_Page's viewport width changes due to window resize or device orientation change, THE Landing_Page SHALL apply the layout corresponding to the new Viewport_Breakpoint without requiring a page reload.

### Requirement 13: Accessibility of Page Content

**User Story:** As a visitor using a screen reader, I want to access all landing page content and navigate to sign-up, so that decorative and animated elements don't block my access to information.

#### Acceptance Criteria

1. THE Landing_Page SHALL expose the headline, subtext, section headings, and all CTA controls to assistive technology as readable text content, and each CTA control SHALL have a non-empty accessible name of 1 to 100 characters describing its target action.
2. THE Primary_CTA, Secondary_CTA, Nav_CTA, and Footer_CTA_Section call-to-action control SHALL be reachable via keyboard alone (Tab / Shift+Tab, no mouse) in a tab order matching the visual top-to-bottom reading order, and WHEN a CTA control receives keyboard focus, THE Landing_Page SHALL render a visible focus indicator on that control.
3. WHERE the Compute_Estimator_Panel's output value updates on an interval, THE Compute_Estimator_Panel SHALL mark that output with an ARIA live-region politeness level of "off" or "polite" such that assistive technology announces the value no more than once every 5 seconds, regardless of update frequency.
4. WHERE decorative or purely animated graphical elements are rendered (there are none remaining in this redesign, but this rule applies to any future decorative element), THE Landing_Page SHALL exclude them from the accessibility tree (e.g. aria-hidden) so they are not announced or focusable by screen readers or keyboard navigation.

### Requirement 14: Technical Dependency Constraints

**User Story:** As a maintainer of the dashboard codebase, I want the redesigned landing page built without the 3D rendering dependencies it replaces, so that the project's dependency footprint shrinks rather than grows.

#### Acceptance Criteria

1. THE Landing_Page implementation SHALL NOT list `three`, `@react-three/fiber`, or `@react-three/drei` as dependencies in `dashboard/package.json`.
2. WHERE a scroll-to-section or interval-driven update is required, THE Landing_Page implementation SHALL use CSS scroll behavior, native DOM APIs, or React state and timers rather than introducing a new animation or 3D library.
3. THE Landing_Page implementation SHALL reuse the dashboard's existing Tailwind CSS configuration for spacing, color, and typography utilities, extending it only with the tier and accent color tokens defined in Requirement 5, rather than introducing a separate styling system or additional color tokens beyond those.
4. THE Landing_Page implementation SHALL import the existing content data modules (waste factors, competitors, pricing tiers, AMD callout facts) rather than duplicating their values inline.
5. THE Landing_Page implementation SHALL NOT import any component from the existing `gpu-scene` directory or any component that itself imports `three`, `@react-three/fiber`, or `@react-three/drei`.
