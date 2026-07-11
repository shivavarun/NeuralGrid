# Requirements Document

## Introduction

NeuralGrid's Dashboard (`dashboard/`, Next.js 14 App Router) currently ships four working pages built directly against Tailwind CSS: `/login`, `/jobs`, `/keys`, and `/billing`, all authenticated via NextAuth (JWT strategy, credentials provider). The `NeuralGrid_Dashboard_PRD.md` describes a much larger surface: a redesigned User Dashboard (11 sub-specs: home, jobs, job detail, savings, API keys, billing, docs, settings, onboarding, plus auth) and a net-new Admin Dashboard (9 sub-specs), built on shadcn/ui with dark mode, plus a shared component library. This document translates that PRD into EARS-format requirements for a single combined spec covering both dashboards, per explicit direction from the product owner.

**Decisions made to reconcile this feature with existing code, confirmed with the product owner before drafting:**

1. **Scope: one spec, both dashboards.** This requirements document covers the User Dashboard (PRD Section 1) and the Admin Dashboard (PRD Section 2) together, including the admin role/database prerequisite. It is not split into a follow-on spec.
2. **shadcn/ui migration: full, now.** All four existing pages (`/login`, `/jobs`, `/keys`, `/billing`) are rebuilt on shadcn/ui as part of this feature, not left on plain Tailwind. This matches the PRD's stack lock (Next.js 14 App Router, TypeScript strict, Tailwind, shadcn/ui only) with no partial-migration exception.
3. **Route restructuring: adopt the PRD's `/dashboard/*` namespace, keep old URLs alive via redirect.** The PRD places user-facing pages under `/dashboard/*` (e.g. `/dashboard/jobs`) while the existing app has them at bare paths (`/jobs`, `/keys`, `/billing`). Because this feature already requires rebuilding every existing page's UI on shadcn/ui, moving each page's route segment at the same time carries little additional cost, and adopting `/dashboard/*` keeps the User Dashboard's route namespace parallel to the Admin Dashboard's `/admin/*` namespace introduced by this same feature. The existing flat routes (`/jobs`, `/keys`, `/billing`) become permanent redirects to their `/dashboard/*` equivalents rather than being deleted outright, so existing bookmarks and any external links keep working. `/login` keeps its current path (the PRD does not place auth pages under `/dashboard/*`). `/` (the landing page, built by the separate `landing-page-3d` spec) and its session-based redirect behavior are **not modified** by this feature; the landing page's existing redirect target is only updated to point at the new `/dashboard` home path instead of `/jobs`.
4. **UI-layer only against `neuralgrid-stage2` backend features.** Where the PRD describes a UI element backed by a `neuralgrid-stage2` capability (savings breakdown, per-job cost comparison, provider health, estimator accuracy), this document specifies the UI consuming that capability's existing endpoint/data model rather than re-deriving the calculation. Specific reconciliation notes:
   - The PRD's Savings page (`/dashboard/savings`, Section 1.6) is the same page as `neuralgrid-stage2` Requirement 17's `Savings_Dashboard` at `/dashboard/savings` — no route conflict. This document extends that page with the PRD's "what-if calculator" and monthly chart, which `neuralgrid-stage2` Requirement 19 already anticipates.
   - The PRD's Job Detail cost breakdown panel (Section 1.5) consumes `neuralgrid-stage2` Requirement 18's `Cost_Comparison_Service` (`GET /v1/jobs/:id/cost-comparison`) rather than computing a RunPod A100 comparison in the Dashboard itself.
   - The PRD's Estimator Accuracy admin page (Section 2.7) consumes `neuralgrid-stage2` Requirement 21's `Estimator_Accuracy_Record` classification (correct / over-estimated / under-estimated) directly — the terms match.
   - **Conflict flagged for the product owner to reconcile:** `neuralgrid-stage2` Requirement 22 places a single `Admin_Dashboard` page at `/dashboard/admin`, gated on an unspecified "account flagged as admin" mechanism, and Requirement 20's `Admin_Health_Endpoint` returns only per-provider status, last poll timestamp, available node count, circuit breaker state, job counts/success rate, and estimator accuracy proportions. This PRD instead specifies a full 8-page Admin Dashboard at `/admin/*` (Section 2), and its Providers page (Section 2.5) requires additional fields the `Admin_Health_Endpoint` does not currently return — per-tier node inventory with per-node GPU model/VRAM/price/warm-model detail, and price cache freshness. **This document supersedes `neuralgrid-stage2` Requirement 22's route placement** (the Admin Dashboard lives at `/admin`, not `/dashboard/admin`) and treats the `Admin_Health_Endpoint`'s missing per-node inventory and cache-freshness fields as new backend scope this feature depends on but does not itself specify the backend implementation for (see Requirement 21).
5. **New dependencies.** None of `shadcn/ui`, `next-themes`, or `recharts` are present in `dashboard/package.json` today (confirmed by reading the file). This document treats adding them as in-scope, pinned technical constraints (Requirement 1).
6. **Admin role is new scope.** Neither `dashboard/src/lib/auth.ts` (NextAuth config) nor `scripts/migrations/001_init.sql` (the only migration file) defines any concept of a user role. `developers.role` does not exist in the database. This document treats adding it — a migration, a NextAuth session/JWT claim, and server-side enforcement — as required, in-scope backend prerequisite work for this feature (Requirement 21), not an assumption.

## Glossary

- **Dashboard_App**: The existing Next.js 14 App Router application at `dashboard/`.
- **Legacy_Route**: One of the three existing bare paths — `/jobs`, `/keys`, `/billing` — that this feature relocates to `/dashboard/*` while preserving the old path as a redirect.
- **Dashboard_Shell**: The layout component wrapping every page under `/dashboard/*`, providing the Sidebar, Top_Bar, and main content area.
- **Admin_Shell**: The layout component wrapping every page under `/admin/*`, providing admin-specific navigation, structurally separate from Dashboard_Shell.
- **Sidebar**: The persistent left-hand navigation region of Dashboard_Shell (240px wide, fixed on desktop, a drawer on viewports narrower than the `md` breakpoint).
- **Top_Bar**: The horizontal header region of Dashboard_Shell containing the page title, Global_Search, and Notification_Bell.
- **Global_Search**: The search control in Top_Bar that queries across job IDs and model names.
- **Notification_Bell**: The Top_Bar control that displays a count of failed jobs and low-balance alerts.
- **Theme_Provider**: The `next-themes`-backed component that applies light, dark, or system color mode via CSS variables across Dashboard_App.
- **Typed_API_Client**: The fetch wrapper in `dashboard/src/lib/api.ts` (or its successor) that attaches the Authorization header and normalizes 401, 429, and 5xx responses into typed errors.
- **Dashboard_Route_Guard**: Server-side logic that redirects an unauthenticated request for any `/dashboard/*` or `/onboarding` path to `/login`.
- **Admin_Route_Guard**: Server-side logic that returns a 403 response (rendered as an in-app "not authorized" page, not a raw HTTP error page) for any request to `/admin/*` from a session whose `role` is not `admin`.
- **Developer**: An authenticated user of the User Dashboard, as defined in the `neuralgrid-mvp` Glossary.
- **Admin_User**: A Developer whose `role` column value is `admin`.
- **Job_Status_Badge**: The shared component rendering a Job's status (`queued`, `estimating`, `dispatched`, `running`, `complete`, `failed`, `cancelled`) with the color and animation rules in PRD Section 3.1.
- **Tier_Badge**: The shared component rendering a Job's GPU_Tier (T1, T2, T3) as a colored pill with a tooltip describing the tier's VRAM range.
- **Provider_Badge**: The shared component rendering a Provider's name as a colored badge, including an AMD hardware indicator when the node's `hardware_vendor` is `AMD`.
- **Cost_Display**: The shared component rendering a monetary value as a string with exactly 4 decimal places (e.g. `$0.0021`), or `estimating...` for a pending cost, or `$0.0000` in a muted style for a zero-cost job.
- **Savings_Pill**: The shared component rendering a savings percentage (e.g. `saved 87%`) in green, shown only when both the actual cost and a comparison baseline are available.
- **Empty_State**: A shared component rendering a designed placeholder (illustration, message, and call-to-action) in place of an empty list or table, per one of the four scenarios in PRD Section 3.6.
- **Skeleton_Screen**: A shared component rendering an animated placeholder matching the approximate shape of the content it precedes, shown while that content's data is loading.
- **Home_Page**: The page at `/dashboard`.
- **Jobs_Page**: The page at `/dashboard/jobs`.
- **Job_Detail_Page**: The page at `/dashboard/jobs/:id`.
- **Savings_Page**: The page at `/dashboard/savings` (the same page as the `neuralgrid-stage2` `Savings_Dashboard`).
- **Api_Keys_Page**: The page at `/dashboard/api-keys`.
- **Billing_Page**: The page at `/dashboard/billing`.
- **Docs_Page**: The page at `/dashboard/docs`.
- **Settings_Page**: The page at `/dashboard/settings`.
- **Onboarding_Flow**: The three-step guided flow at `/onboarding`.
- **Admin_Home_Page**: The page at `/admin`.
- **Admin_Jobs_Page**: The page at `/admin/jobs`.
- **Admin_Users_Page**: The page at `/admin/users`.
- **Admin_Providers_Page**: The page at `/admin/providers`.
- **Admin_Revenue_Page**: The page at `/admin/billing`.
- **Admin_Estimator_Page**: The page at `/admin/estimator`.
- **Admin_Logs_Page**: The page at `/admin/logs`.
- **Admin_Settings_Page**: The page at `/admin/settings`.
- **Cost_Comparison_Service**: The `neuralgrid-stage2` service exposed at `GET /v1/jobs/:id/cost-comparison`, reused (not re-implemented) by Job_Detail_Page.
- **Admin_Health_Endpoint**: The `neuralgrid-stage2` internal endpoint `GET /internal/health`, reused (not re-implemented) by Admin_Home_Page and Admin_Providers_Page for the fields it already returns.
- **Estimator_Accuracy_Record**: The `neuralgrid-stage2` per-job tier accuracy classification, reused (not re-implemented) by Admin_Estimator_Page.
- **Model_Registry**: The YAML-based model catalog, as defined in the `neuralgrid-mvp` Glossary.
- **What_If_Calculator**: The interactive component on Savings_Page that projects monthly cost across NeuralGrid, RunPod A100, and AWS baselines for a hypothetical model and job volume.

## Requirements

### Requirement 1: Technical Stack and Dependency Constraints

**User Story:** As a maintainer of the Dashboard_App, I want the redesign built on a fixed, pinned set of dependencies, so that the project's dependency footprint and stack stay predictable.

#### Acceptance Criteria

1. THE Dashboard_App SHALL use Next.js 14 App Router, TypeScript in strict mode, and Tailwind CSS as its only styling foundation.
2. WHERE a component library is required, THE Dashboard_App implementation SHALL use shadcn/ui exclusively, and SHALL NOT introduce another component library (e.g. MUI, Chakra, Ant Design).
3. WHERE dark mode support is required, THE Dashboard_App implementation SHALL use `next-themes` and CSS variables, and Theme_Provider SHALL be present from initial page load rather than added after other pages are complete.
4. WHERE a chart is required (monthly spend chart, monthly savings chart, revenue-over-time chart), THE Dashboard_App implementation SHALL use `recharts`.
5. THE Dashboard_App SHALL NOT introduce a WebSocket dependency; WHERE live-updating data is required, THE Dashboard_App SHALL poll the relevant endpoint at the interval specified for that data (5 seconds unless otherwise stated in a page-specific requirement).
6. THE Dashboard_App SHALL render every monetary value as a string with exactly 4 decimal places via Cost_Display, and SHALL NOT render a monetary value through any other formatting path.
7. THE Dashboard_App SHALL render correctly, without horizontal overflow or overlapping elements, at viewport widths down to 375px.
8. THE Dashboard_App SHALL NOT display a page-level loading spinner, including during initial application bootstrap; WHILE a data-dependent component's data has not yet loaded, THE Dashboard_App SHALL display a Skeleton_Screen matching that component's approximate loaded shape, regardless of that component's expected load time.

### Requirement 2: Route Restructuring and Legacy Redirects

**User Story:** As an existing Developer with bookmarked dashboard URLs, I want my existing links to keep working after the redesign, so that the route restructuring does not break my workflow.

#### Acceptance Criteria

1. THE Dashboard_App SHALL serve the Home_Page, Jobs_Page, Job_Detail_Page, Savings_Page, Api_Keys_Page, Billing_Page, Docs_Page, and Settings_Page under the `/dashboard/*` route namespace, matching the paths in PRD Section 1.1.
2. WHEN a request is made to a Legacy_Route (`/jobs`, `/keys`, or `/billing`), THE Dashboard_App SHALL issue a redirect to that route's corresponding `/dashboard/*` path (`/dashboard/jobs`, `/dashboard/api-keys`, `/dashboard/billing` respectively), unconditionally and regardless of whether the target `/dashboard/*` path succeeds in loading.
3. THE Dashboard_App SHALL continue to serve `/login` at its current path, unchanged by this route restructuring.
4. WHEN an authenticated Developer requests `/`, THE Dashboard_App SHALL redirect the Developer to `/dashboard` instead of `/jobs`.
5. THE Dashboard_App SHALL NOT modify the `/` route's rendering for unauthenticated visitors.

### Requirement 3: Shared Job and Provider Badge Components

**User Story:** As a developer maintaining the Dashboard, I want a single set of shared badge components used everywhere a job's status, tier, or provider appears, so that the same job state always looks the same across every page.

#### Acceptance Criteria

1. THE Job_Status_Badge SHALL render each of the following states with the mapping defined in PRD Section 3.1: `queued` (gray), `estimating` (blue, no animation), `dispatched` (blue, no animation), `running` (blue, pulsing dot animation), `complete` (green), `failed` (red), `cancelled` (gray, strikethrough text).
2. THE Tier_Badge SHALL render `T1` as a green pill labeled "T1 — Lite", `T2` as an amber pill labeled "T2 — Standard", and `T3` as a red pill labeled "T3 — Power".
3. WHEN a user hovers over or focuses a Tier_Badge, THE Tier_Badge SHALL display a tooltip stating that tier's VRAM range and representative hardware class.
4. THE Provider_Badge SHALL render a distinct color per provider (Fireworks AI: purple, Vast.ai: blue, RunPod: orange, AMD Developer Cloud: red).
5. WHEN a Provider_Badge represents a node whose `hardware_vendor` is `AMD`, THE Provider_Badge SHALL display an AMD hardware indicator icon in addition to the provider color.
6. THE Job_Status_Badge, Tier_Badge, and Provider_Badge SHALL each be implemented as a single component reused across Home_Page, Jobs_Page, Job_Detail_Page, Admin_Jobs_Page, and Admin_Providers_Page rather than page-specific duplicates.

### Requirement 4: Cost and Savings Display Components

**User Story:** As a developer viewing any page with cost data, I want costs and savings displayed with the same formatting everywhere, so that I can compare values across pages without re-reading formatting rules.

#### Acceptance Criteria

1. THE Cost_Display SHALL render a non-zero, known cost as a string with exactly 4 decimal places prefixed with `$` (e.g. `$0.0021`).
2. THE Cost_Display SHALL render a zero cost as `$0.0000` in a visually muted style.
3. WHILE a job's cost is not yet known, THE Cost_Display SHALL render the text `estimating...` in italic, muted style.
4. THE Savings_Pill SHALL render a savings percentage in a green pill labeled `saved N%`.
5. IF either the actual cost or the comparison baseline needed to compute a savings percentage is unavailable, THEN THE Savings_Pill SHALL NOT render.

### Requirement 5: Empty States and Skeleton Screens

**User Story:** As a developer with no data yet (no jobs, no keys, no invoices), I want a helpful message instead of a blank list, so that I know what to do next.

#### Acceptance Criteria

1. WHEN Jobs_Page has no jobs to display because the Developer has never submitted one, THE Jobs_Page SHALL render an Empty_State with a "Submit your first job" call to action.
2. WHEN Jobs_Page has jobs but none match the current filters, THE Jobs_Page SHALL render an Empty_State stating that no jobs match the filters, with a "Clear filters" action.
3. WHEN Api_Keys_Page has no API keys, THE Api_Keys_Page SHALL render an Empty_State prompting creation of the first key.
4. WHEN Billing_Page has no invoices, THE Billing_Page SHALL render an Empty_State stating that invoices will appear once the Developer has been charged.
5. WHILE any data-dependent section of Home_Page, Jobs_Page, Job_Detail_Page, Savings_Page, Api_Keys_Page, or Billing_Page has not yet received its data, THE Dashboard_App SHALL render a Skeleton_Screen for that section sized to match its loaded layout, so that the section's arrival does not shift surrounding layout.

### Requirement 6: Authentication Pages

**User Story:** As a developer, I want to log in, register, and recover a forgotten password through dedicated pages, so that I can access my account without contacting support.

#### Acceptance Criteria

1. THE Dashboard_App SHALL rebuild the existing `/login` page using shadcn/ui form components, preserving its current behavior: email and password fields, an error message on invalid credentials, and a redirect to `/dashboard` on success.
2. THE Dashboard_App SHALL provide a `/register` page accepting email, password, and name, which on success creates a Developer account and redirects to `/onboarding`.
3. WHEN a new Developer account is created via `/register`, THE Dashboard_App SHALL display the free tier credit amount granted to that account before redirecting to `/onboarding`.
4. THE Dashboard_App SHALL provide a `/forgot-password` page accepting an email address, which on submission sends a password reset email regardless of whether the email address is registered.
5. THE Dashboard_App SHALL provide a `/reset-password/:token` page accepting a new password, which on submission with a valid, unexpired token updates the Developer's password and redirects to `/login`.
6. IF a `/reset-password/:token` request uses an invalid or expired token, THEN THE Dashboard_App SHALL display an error and SHALL NOT update the Developer's password.

### Requirement 7: Onboarding Flow

**User Story:** As a newly registered developer, I want to run one real job during onboarding, so that I see NeuralGrid working before I have to figure it out myself.

#### Acceptance Criteria

1. WHEN a newly registered Developer reaches `/onboarding` step 1, THE Onboarding_Flow SHALL display the Developer's free credit amount and two options: "Run example job" and "I'll explore myself".
2. WHEN a Developer proceeds to Onboarding_Flow step 2, THE Onboarding_Flow SHALL display the Developer's full API key exactly once, with a prominent copy control and a statement that the key will not be shown in full again outside this step.
3. WHEN a Developer proceeds to Onboarding_Flow step 3, THE Onboarding_Flow SHALL submit a pre-filled job (model `llama-3-8b`, a fixed example prompt) on the Developer's confirmation and display the routing and completion sequence (tier estimation, node selection, running, result) as the real job progresses.
4. WHEN the Onboarding_Flow step 3 job completes, THE Onboarding_Flow SHALL display the job's actual cost, the RunPod A100 equivalent cost from Cost_Comparison_Service, and the resulting savings percentage.
5. WHEN a Developer completes the Onboarding_Flow, THE Dashboard_App SHALL record completion by writing to `localStorage` and to the Developer's `onboarding_completed` database field; IF either write fails while the other succeeds, THEN THE Dashboard_App SHALL still treat the Onboarding_Flow as complete and SHALL NOT retry the failed write or block on it.
6. WHEN a Developer whose `onboarding_completed` field is already true requests `/onboarding`, THE Dashboard_App SHALL redirect the Developer to `/dashboard` instead of restarting the flow.

### Requirement 8: Dashboard Shell, Navigation, and Search

**User Story:** As a developer using the dashboard, I want consistent navigation and search available on every page, so that I can move between sections and find a specific job without hunting.

#### Acceptance Criteria

1. THE Dashboard_Shell SHALL render Sidebar as a fixed 240px-wide panel on viewports at or above the `md` breakpoint, and as a drawer below that breakpoint.
2. THE Sidebar SHALL contain the NeuralGrid logo and wordmark, navigation links to Home_Page, Jobs_Page, Savings_Page, Api_Keys_Page, Billing_Page, and Docs_Page, an upgrade call-to-action fixed at the bottom for free-tier Developers, and the Developer's avatar, email, and plan badge at the very bottom.
3. THE Top_Bar SHALL display the current page's title, Global_Search, and Notification_Bell, and SHALL NOT duplicate any Sidebar navigation link.
4. WHEN a Developer enters text into Global_Search, THE Global_Search SHALL return matches across the Developer's job IDs and model names.
5. THE Notification_Bell SHALL display a count reflecting the Developer's failed jobs and low-balance alerts, updated on each poll cycle defined for Home_Page's stat row.

### Requirement 9: Home Page

**User Story:** As a developer, I want a home page summarizing my last 24 hours of activity and savings, so that I know at a glance whether anything needs my attention.

#### Acceptance Criteria

1. THE Home_Page SHALL display four stat cards: jobs today (with succeeded/failed subtext), spend today (with a without-NeuralGrid comparison subtext), saved today as a dollar amount and percentage, and current balance (with a low-balance warning styled amber below $1.00).
2. THE Home_Page SHALL poll for updated values for the jobs-today, spend-today, and saved-today cards every 5 seconds, and for the current-balance card every 30 seconds.
3. THE Home_Page SHALL display a live feed of the Developer's 10 most recent jobs, each row showing Job_Status_Badge, model name, Tier_Badge, Provider_Badge, Cost_Display, Savings_Pill, and a relative timestamp.
4. THE Home_Page SHALL poll the live job feed every 5 seconds.
5. WHEN a Developer clicks a row in the live job feed, THE Home_Page SHALL trigger navigation to that job's Job_Detail_Page.
6. THE Home_Page SHALL display a bar chart of the Developer's last 6 months of spend, with two bars per month comparing NeuralGrid actual cost to the equivalent RunPod A100 cost for the same jobs.
7. WHILE the Developer has not submitted a job within the last 7 days, THE Home_Page SHALL display a quick action panel containing a "Submit a test job" action, a "Copy API key" shortcut, and a link to Docs_Page.
8. IF the Developer has submitted a job within the last 7 days, THEN THE Home_Page SHALL NOT display the quick action panel.

### Requirement 10: Jobs List Page

**User Story:** As a developer, I want to filter, sort, and search my job history, so that I can find a specific job or group of jobs quickly.

#### Acceptance Criteria

1. THE Jobs_Page SHALL display a filter bar with multi-select status pills (All, Running, Complete, Failed, Queued), a date range control (Today, Last 7 days, Last 30 days, Custom), a model name search field, and Tier checkboxes.
2. THE Jobs_Page SHALL display a table with columns Job ID (truncated with a copy control and full ID on hover), Model, Status, Tier, Provider, Cost, Saved, and Submitted (relative time with full timestamp on hover).
3. WHEN a Developer clicks a sortable column header (Model, Status, Tier, Cost, Saved, or Submitted), THE Jobs_Page SHALL re-sort the table by that column.
4. THE Jobs_Page SHALL paginate the table using cursor-based pagination with a default page size of 20 rows and a maximum page size of 100 rows.
5. WHEN a Developer clicks a row, THE Jobs_Page SHALL navigate to that job's Job_Detail_Page.

### Requirement 11: Job Detail Page

**User Story:** As a developer, I want to see everything about one specific job on a single page, so that I understand what happened, what it cost, and what the result was.

#### Acceptance Criteria

1. THE Job_Detail_Page SHALL display the full job ID with a copy control, Job_Status_Badge, model name, Tier_Badge, submitted and completed timestamps, and a link back to Jobs_Page.
2. THE Job_Detail_Page SHALL display a cost breakdown panel containing the job's actual cost, tier used, provider (with Provider_Badge), and the RunPod A100 equivalent cost, absolute savings, and savings percentage retrieved from Cost_Comparison_Service.
3. WHERE the job is a text generation job, THE Job_Detail_Page cost breakdown panel SHALL additionally display input and output token counts.
4. THE Job_Detail_Page SHALL display a collapsible estimator reasoning panel showing the model, quantization, VRAM estimate, confidence level, assigned tier, and the count of nodes considered at that tier.
5. THE Job_Detail_Page SHALL render the job result according to its output type: a scrollable, copyable text block with syntax highlighting for text jobs, an inline full-width image with a download control for image jobs, an audio player with a waveform visualization and download control for audio jobs, and the first 10 vector dimensions with a "download full vector" control for embedding jobs.
6. WHILE a Developer is viewing the Job_Detail_Page for a job whose status is `failed`, THE Job_Detail_Page SHALL display a "Retry job" action that resubmits the identical job specification.
7. WHILE a Developer is viewing the Job_Detail_Page for a job whose status is `queued`, `estimating`, `dispatched`, `running`, `complete`, or `cancelled`, THE Job_Detail_Page SHALL NOT display the "Retry job" action.
8. THE Job_Detail_Page SHALL display a "Clone job" action for any completed job, which opens a job submission form pre-filled with that job's specification.
9. THE Job_Detail_Page SHALL display "Download result" and "Copy job spec" actions.

### Requirement 12: Savings Page

**User Story:** As a developer, I want to see my total savings and project future savings, so that I understand the ongoing value NeuralGrid provides.

#### Acceptance Criteria

1. THE Savings_Page SHALL display a hero metric stating the total amount saved since account creation and the total number of jobs that figure is calculated across, consistent with `neuralgrid-stage2` Requirement 17.
2. THE Savings_Page SHALL display a per-model breakdown table with columns: model, jobs run, average NeuralGrid cost, average RunPod A100 cost, and average savings percentage.
3. THE Savings_Page SHALL display a line chart of cumulative savings over time, with one line for cumulative NeuralGrid spend and one line for cumulative RunPod A100 equivalent spend.
4. THE Savings_Page SHALL display a What_If_Calculator accepting a model selection and an estimated monthly job count, and outputting the projected monthly cost on NeuralGrid, on RunPod A100, and on AWS, plus an annual savings projection.
5. WHERE a Developer has no historical job data, THE What_If_Calculator SHALL remain functional and SHALL produce output computed from zero or baseline values rather than being disabled.
6. WHEN a Developer changes any What_If_Calculator input, THE What_If_Calculator SHALL recompute its output values without a full page reload.

### Requirement 13: API Keys Page

**User Story:** As a developer, I want to create and revoke API keys with a clear one-time reveal of the full key, so that I can manage access to my account securely.

#### Acceptance Criteria

1. THE Api_Keys_Page SHALL display a table with columns Name, Key prefix, Status (Active or Revoked), Last used, Created, and an Actions column.
2. WHEN a Developer submits the create-key form with a non-empty name, THE Api_Keys_Page SHALL generate a new key server-side and display its full value exactly once with a prominent warning that it will not be shown again.
3. AFTER a newly created key's full value has been dismissed by the Developer, THE Api_Keys_Page SHALL display only that key's prefix in the table.
4. WHEN a Developer requests to revoke an active key, THE Api_Keys_Page SHALL require an explicit confirmation step before revoking.
5. IF a key has already been revoked, THEN THE Api_Keys_Page SHALL NOT display a revoke action for that key, consistent with revocation being irreversible.
6. WHEN a Developer expands a key's row, THE Api_Keys_Page SHALL display that key's request count today, request count this month, and top 3 models used.

### Requirement 14: Billing Page

**User Story:** As a developer, I want to see my balance, add funds, and manage payment methods, so that my jobs keep running without interruption.

#### Acceptance Criteria

1. THE Billing_Page SHALL display the Developer's current balance, styled green above $5, amber between $1 and $5, and red below $1.
2. THE Billing_Page SHALL display top-up controls for preset amounts of $10, $25, $50, and $100, plus a custom amount field.
3. THE Billing_Page SHALL display an auto top-up toggle allowing the Developer to specify a trigger balance and a top-up amount.
4. THE Billing_Page SHALL display a current-month summary containing job count, total spend, total savings versus RunPod A100 in dollars and percent, a link to the most expensive job this month, and a month-over-month spend trend indicator.
5. THE Billing_Page SHALL display saved payment methods (last 4 digits, expiry, brand), an "Add card" control using Stripe Elements, and a "Remove card" control that SHALL permit removing a Developer's last remaining payment method, leaving the Developer with zero saved payment methods; THE Billing_Page SHALL prompt the "Add card" flow only when the Developer next attempts an action that requires a payment method.
6. THE Billing_Page SHALL display an invoice history table with columns Period, Jobs, Amount, Status, and a Download PDF action per row.

### Requirement 15: Docs Page

**User Story:** As a developer integrating with NeuralGrid, I want runnable code samples and a live cost estimate inside the dashboard, so that I don't need to leave the app to start building.

#### Acceptance Criteria

1. THE Docs_Page SHALL display a left sidebar for section navigation and a right content area, without requiring a separate documentation site.
2. THE Docs_Page SHALL include sections for Quickstart, OpenAI migration (showing a before/after code diff of the base URL change), API reference, Model list, Code samples (Python, JavaScript/TypeScript, curl), and Webhooks (signature verification, payload schema, retry behavior).
3. THE Docs_Page SHALL display an interactive API explorer accepting a model selection and prompt text, showing a live cost estimate before the Developer runs the request.
4. WHEN a Developer clicks "Run" in the interactive API explorer AND the interactive API explorer is correctly configured with the inputs required to submit a job, THE Docs_Page SHALL submit a real job through `/v1/jobs` and display both the rendered result and the raw request/response JSON.
5. IF the interactive API explorer's setup is incomplete, THEN THE Docs_Page SHALL disable the "Run" action or display a setup-incomplete state, and SHALL NOT submit a partial job request.

### Requirement 16: Settings Page

**User Story:** As a developer, I want to manage my account, notification preferences, and defaults in one place, so that I don't need to contact support for routine changes.

#### Acceptance Criteria

1. THE Settings_Page SHALL display an account section with display name, email (read-only when the account uses an OAuth provider), and a password change control.
2. THE Settings_Page SHALL display notification toggles for job-failure email (default on), low-balance email below $2 (default on), weekly usage summary email (default off), and a configurable spending alert threshold.
3. THE Settings_Page SHALL display preference controls for default model, default max tokens, default quantization, and dashboard theme (light, dark, or system).
4. WHEN a Developer changes the dashboard theme preference, THE Settings_Page SHALL apply the change immediately via Theme_Provider without a page reload.
5. THE Settings_Page SHALL display a danger zone with three separately confirmed destructive actions: revoke all API keys (requires typing "REVOKE ALL"), delete all job history (separate confirmation), and delete account (requires typing "DELETE").
6. WHEN a Developer confirms account deletion, THE Settings_Page SHALL delete the Developer's account, jobs, keys, and billing data without requiring any additional per-data-type confirmation beyond the account-deletion confirmation itself; IF any part of the deletion process fails, THEN THE Dashboard_App SHALL roll back all deletions performed so far, leaving the Developer's account and all data intact.

### Requirement 17: Admin Access Control

**User Story:** As a platform operator, I want the admin dashboard restricted to admin accounts only, so that regular developers cannot see or affect other users' data.

#### Acceptance Criteria

1. WHEN a request is made to any path under `/admin`, THE Admin_Route_Guard SHALL verify the requesting session's `role` claim equals `admin`, and successful verification SHALL only permit the page to proceed to rendering rather than guarantee that rendering succeeds.
2. IF a non-Admin_User session requests any path under `/admin`, THEN THE Admin_Route_Guard SHALL return a 403 response and SHALL NOT render any admin data.
3. THE Dashboard_App SHALL NOT provide any in-app control for promoting a Developer to Admin_User; admin status SHALL only be set directly in the database, consistent with the PRD's access control note in Section 2.
4. THE Admin_Shell SHALL be a layout component structurally separate from Dashboard_Shell, and SHALL NOT share navigation state with Dashboard_Shell.

### Requirement 18: Admin Home Page

**User Story:** As a platform operator, I want a single page showing whether the platform is healthy right now, so that I can triage quickly.

#### Acceptance Criteria

1. THE Admin_Home_Page SHALL display a system status bar with a traffic-light indicator (green, amber, red) for API Gateway, Compute Estimator, Price Aggregator, Job Scheduler, PostgreSQL, Redis, and each configured Provider, sourced from Admin_Health_Endpoint.
2. WHEN a subsystem's status is not green, THE Admin_Home_Page SHALL display a failure or degradation count alongside that subsystem's indicator.
3. THE Admin_Home_Page SHALL display four metric cards, each auto-refreshing every 10 seconds: jobs in queue, jobs running now, job success rate over the last hour, and active users over the last 24 hours.
4. WHILE jobs in queue is between 0 and 50 inclusive, THE Admin_Home_Page SHALL style that card in its normal, unstyled appearance; WHEN jobs in queue exceeds 50, THE Admin_Home_Page SHALL style that card amber; WHEN jobs in queue exceeds 200, THE Admin_Home_Page SHALL style that card red.
5. WHEN job success rate over the last hour falls below 90%, THE Admin_Home_Page SHALL style that card to indicate an alert condition.
6. THE Admin_Home_Page SHALL display a live feed of the 20 most recent failed jobs across all Developers, each row showing job ID, Developer email, model, failure reason, and timestamp.
7. WHEN an Admin_User clicks a row in the recent failures feed, THE Admin_Home_Page SHALL navigate to that job's admin job detail view.
8. THE Admin_Home_Page SHALL display a provider health summary row per Provider showing status, last successful poll time, available node counts per Tier, current cheapest price per Tier, circuit breaker state, jobs dispatched today, and success rate today.

### Requirement 19: Admin All Jobs Page

**User Story:** As a platform operator, I want to see and investigate every job across every user, so that I can debug a specific incident or spot a pattern.

#### Acceptance Criteria

1. THE Admin_Jobs_Page SHALL display jobs from all Developers, with columns matching Jobs_Page plus Developer email, full (untruncated) job ID, provider node ID, internal provider cost, billed cost, and a margin column showing the dollar and percent difference between billed cost and provider cost, including negative values when the provider cost exceeds the billed cost.
2. THE Admin_Jobs_Page SHALL provide filters by Developer email or ID, by Provider, and by failure reason, in addition to the filters available on Jobs_Page.
3. WHEN an Admin_User clicks "Export to CSV" on Admin_Jobs_Page, THE Admin_Jobs_Page SHALL generate a downloadable CSV of the currently filtered result set.
4. WHEN an Admin_User opens an admin job detail view, THE Admin_Jobs_Page SHALL display the full internal timeline (queued, estimate started, estimate completed, dispatched, provider acknowledged, completed), estimator debug data (raw input, raw output, confidence score), provider debug data (exact API call, response headers, instance ID), retry history, and a revenue breakdown (provider cost, margin, processor fee, net revenue), in addition to everything shown on Job_Detail_Page.

### Requirement 20: Admin Users Page

**User Story:** As a platform operator, I want to see who is using the platform and act on problem accounts, so that I can support users and manage abuse.

#### Acceptance Criteria

1. THE Admin_Users_Page SHALL display a table with columns Email, Plan, Balance (styled red below $0.50), Jobs in the last 30 days, Spend in the last 30 days, Last active, and Status (Active, Suspended, or Unverified).
2. WHEN an Admin_User clicks a row, THE Admin_Users_Page SHALL open a detail drawer showing account info, balance and top-up history, job statistics, the user's API keys (with an admin revoke control per key), and the user's 10 most recent jobs linked to their admin job detail views.
3. THE Admin_Users_Page detail drawer SHALL provide actions to grant credit with an optional internal note, change the user's plan, suspend the account (blocking new job submissions while allowing in-flight jobs to complete), unsuspend the account, send a password reset email, and impersonate the user in a separate session.
4. WHEN an Admin_User uses the impersonate action, THE Dashboard_App SHALL record an audit log entry containing the admin's identity, the impersonated Developer's identity, and a timestamp before proceeding; IF the audit log entry cannot be recorded, THEN THE Dashboard_App SHALL block the impersonation action and SHALL NOT start the impersonated session.

### Requirement 21: Admin Providers Page and Admin Role Prerequisite

**User Story:** As a platform operator, I want to see live provider health and node inventory, and I want the admin role itself to be a real, enforced concept in the system, so that only authorized operators reach this data.

#### Acceptance Criteria

1. THE Dashboard_App backend SHALL define a `role` column on the `developers` table (values including at minimum `developer` and `admin`, default `developer`) via a new database migration, since no such column exists as of this feature's design.
2. WHEN a Developer with `role` equal to `admin` authenticates, THE Dashboard_App SHALL include that role in the resulting NextAuth session and JWT claims, so that Admin_Route_Guard can read it without an additional database round trip on every request.
3. THE Admin_Providers_Page SHALL display one card per configured Provider, auto-refreshing every 10 seconds, showing status (Healthy, Degraded, Down), circuit breaker state (Closed, Open with cooldown timer, or Half-Open), last successful poll time, and consecutive failure count, sourced from Admin_Health_Endpoint's existing fields.
4. THE Admin_Providers_Page SHALL display, per Provider card, node inventory counts per Tier with cheapest price per Tier, jobs dispatched/succeeded/failed today, average job duration today, and price cache freshness.
5. IF Admin_Health_Endpoint does not return the per-Tier node inventory or price cache freshness fields required by Criterion 4, THEN THE Admin_Providers_Page SHALL treat those fields as unavailable and SHALL render an Empty_State for that portion of the card rather than fabricating placeholder values; extending Admin_Health_Endpoint to return these fields is backend scope tracked outside this document.
6. THE Admin_Providers_Page SHALL provide per-provider actions: force an immediate price poll, reset an open circuit breaker (with confirmation), disable the provider from new routing, and re-enable a disabled provider; THE Admin_Providers_Page SHALL display all four actions on every Provider card regardless of that Provider's current status or circuit breaker state.
7. WHEN an Admin_User expands a Provider card, THE Admin_Providers_Page SHALL display a node-level table with columns Node ID, GPU model, VRAM, Tier, Price, Status, and currently warm models.

### Requirement 22: Admin Revenue Page

**User Story:** As a platform operator, I want to see whether money is flowing correctly, so that I can catch billing problems before they compound.

#### Acceptance Criteria

1. THE Admin_Revenue_Page SHALL display four metric cards: monthly recurring revenue equivalent, revenue today, provider cost today, and gross margin today (dollar and percent).
2. THE Admin_Revenue_Page SHALL display a line chart of daily revenue and daily provider cost over a 30-day default window, toggleable to a 90-day window.
3. THE Admin_Revenue_Page SHALL display a billing events table (Time, Developer, Type, Amount, Job ID, processor transaction ID) covering charges, refunds, top-ups, and failures in reverse chronological order.
4. THE Admin_Revenue_Page SHALL display a dedicated failed-payments table showing Developer email, amount, failure reason, and job ID, with actions to trigger a manual retry, contact the Developer, or grant credit manually.

### Requirement 23: Admin Estimator Accuracy Page

**User Story:** As a platform operator, I want to see how often the compute estimator picks the right tier, so that I can catch models that are causing job failures from under-provisioning.

#### Acceptance Criteria

1. THE Admin_Estimator_Page SHALL display the overall correct-tier rate, over-estimation rate, and under-estimation rate for the last 7 days, computed from Estimator_Accuracy_Record.
2. WHEN the under-estimation rate exceeds 5%, THE Admin_Estimator_Page SHALL display an alert, since under-estimation causes job failures.
3. IF there is no job data available to compute an under-estimation rate for the last 7 days, THEN THE Admin_Estimator_Page SHALL display an alert, distinct from a computed under-estimation rate of 0% or any computed rate at or below 5%, since an unmeasurable estimator accuracy is itself a condition worth flagging.
4. THE Admin_Estimator_Page SHALL display a per-model accuracy table with columns Model, Jobs, Correct, Over, Under, and a recommended action label.
5. THE Admin_Estimator_Page SHALL display a Model_Registry editor allowing an Admin_User to edit VRAM values per quantization level, add a new model profile, and disable a model without deleting it, with changes taking effect without a service restart.
6. WHEN an Admin_User changes a Model_Registry value, THE Admin_Estimator_Page SHALL log the admin's email, timestamp, field changed, old value, and new value; IF logging that change fails, THEN THE Admin_Estimator_Page SHALL still allow the Model_Registry change to proceed, since a logging failure SHALL NOT block the registry change itself.

### Requirement 24: Admin System Logs Page

**User Story:** As a platform operator, I want to search and filter platform logs, so that I can find the source of an error quickly.

#### Acceptance Criteria

1. THE Admin_Logs_Page SHALL provide filters for severity (Error, Warn, Info), service (api-gateway, compute-estimator, price-aggregator, job-scheduler), free text, and time range (last 1 hour, 6 hours, 24 hours, or 7 days).
2. THE Admin_Logs_Page SHALL provide an auto-refresh toggle that, when on, polls for new log entries every 10 seconds.
3. THE Admin_Logs_Page SHALL render each log entry with timestamp, severity badge, service name, message, and a collapsible block for structured context fields.
4. THE Admin_Logs_Page SHALL display the top 5 error messages by frequency within the selected time range above the log list.
5. WHEN an Admin_User clicks one of the top 5 error messages, THE Admin_Logs_Page SHALL filter the log list to entries matching that error pattern.

### Requirement 25: Admin Platform Settings Page

**User Story:** As a platform operator, I want to adjust routing, provider, billing, and rate-limit configuration from the dashboard, so that I don't need a deploy to change operational parameters.

#### Acceptance Criteria

1. THE Admin_Settings_Page SHALL display editable routing settings (T1 VRAM ceiling, T2 VRAM ceiling, T3 VRAM floor, max retry count, job timeout multiplier, low-confidence tier bump on/off).
2. THE Admin_Settings_Page SHALL display editable provider settings (price poll interval, price cache TTL, circuit breaker failure threshold, circuit breaker cooldown, AMD provider scoring bonus).
3. THE Admin_Settings_Page SHALL display editable billing settings (NeuralGrid margin percentage, free tier credit amount, low balance warning threshold, auto top-up minimum, max job cost cap).
4. THE Admin_Settings_Page SHALL display editable rate limit settings per plan (Free, Pro, Enterprise) for requests per minute and requests per day.
5. WHEN an Admin_User saves a change on Admin_Settings_Page, THE Dashboard_App SHALL apply that change within 60 seconds and SHALL log the admin's email and timestamp against the changed setting.

