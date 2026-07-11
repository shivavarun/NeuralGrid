# Implementation Plan: Dashboard Redesign

## Overview

Rebuild NeuralGrid's Dashboard into two surfaces — a redesigned User Dashboard under `/dashboard/*` and a net-new Admin Dashboard under `/admin/*` — on shadcn/ui + next-themes + recharts, per `design.md`'s file layout and the PRD Section 4 phase ordering (A foundation → B shared components → C auth → D onboarding → E user dashboard → F admin dashboard → G testing). Work proceeds bottom-up in dependency order: foundation (deps/theme, migration/auth/guards, then the pure-function module, Typed_API_Client, and `usePolling` hook) → shared component library → the two shells → auth pages → onboarding → user dashboard pages → admin dashboard pages, with checkpoints at each milestone.

TypeScript strict / Next.js 14 App Router, matching the existing dashboard stack; Vitest + `@testing-library/react` for unit tests; fast-check for the 9 property tests defined in `design.md` (minimum 100 runs, matching the MVP/Stage 2/landing-page convention). Every property attaches to a pure function in `lib/format.ts` or a `SavingsPill` helper. Several admin pages are **UI-complete-but-backend-blocked** per `design.md`'s [Backend Prerequisites and Gaps](#): this plan scopes those tasks to building the UI against the design's response types and rendering the `EmptyState variant="unavailable"` path where a field/endpoint is absent — it does **not** include tasks to build the missing backend endpoints, which are out of this UI spec's scope.

## Tasks

- [x] 1. Dependencies and theme foundation
  - [x] 1.1 Add dependencies and initialize shadcn/ui
    - Add to `dashboard/package.json` `dependencies`: `next-themes`, `recharts`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, and the Radix primitives shadcn pulls in per component; add `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` to `devDependencies`
    - Run `npx shadcn-ui@latest init` producing `dashboard/src/components.json` (style `default`, base color `slate`, CSS variables `true`, alias `@/components` / `@/lib`, Tailwind config pointed at existing `tailwind.config.js`); generate the shadcn components used by the pages (`button`, `input`, `form`, `table`, `dialog`, `alert-dialog`, `sheet`, `tooltip`, `badge`, `card`, `tabs`, `switch`, `select`) into `dashboard/src/components/ui/`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 1.2 Write unit test for dependency allow-list
    - Assert `dashboard/package.json` contains `next-themes` and `recharts`, and asserts no second component library (`@mui/*`, `@chakra-ui/*`, `antd`) and no WebSocket client dependency (`ws`, `socket.io-client`) is present
    - _Requirements: 1.2, 1.5_

  - [x] 1.3 Wire CSS-variable theming, dark mode, and ThemeProvider
    - Add the shadcn `:root` / `.dark` CSS-variable blocks to `dashboard/src/app/globals.css` (preserving the existing `ng-*` brand colors); add `darkMode: ['class']` to `dashboard/tailwind.config.js`
    - Add `ThemeProvider` (`next-themes`, `attribute="class"`, `defaultTheme="system"`, `enableSystem`) inside `dashboard/src/app/providers.tsx` wrapping the existing `SessionProvider`, and add `suppressHydrationWarning` to `<html>` in `dashboard/src/app/layout.tsx` so the provider is present from initial load
    - _Requirements: 1.3_

- [x] 2. Auth, migration, routing, and middleware guards
  - [x] 2.1 Create developer role and onboarding migration
    - Create `scripts/migrations/002_add_developer_role.sql` adding `developers.role VARCHAR(20) NOT NULL DEFAULT 'developer' CHECK (role IN ('developer','admin'))`, `developers.onboarding_completed BOOLEAN NOT NULL DEFAULT false`, and `idx_developers_role`, wrapped in a transaction, per design's Data Models section
    - _Requirements: 21.1, 7.5_

  - [x] 2.2 Carry role and onboarding_completed into JWT and session
    - Update `dashboard/src/lib/auth.ts` `jwt` and `session` callbacks to carry `role` (default `'developer'`) and `onboarding_completed` (default `false`) from the `developers` row into the token and `session.user`, and extend the `SessionUser` type accordingly
    - _Requirements: 21.2, 7.5_

  - [x] 2.3 Implement middleware route guards
    - Create `dashboard/src/middleware.ts` reading the NextAuth JWT via `getToken`: `Dashboard_Route_Guard` redirects unauthenticated `/dashboard/*` and `/onboarding` requests to `/login`; `Admin_Route_Guard` redirects unauthenticated `/admin/*` to `/login` and rewrites non-`admin` roles to `/admin/forbidden` with HTTP 403; export `config.matcher` for `/dashboard/:path*`, `/onboarding`, `/admin/:path*`
    - _Requirements: 17.1, 17.2, 21.2_

  - [ ]* 2.4 Write unit tests for guards and auth callbacks
    - Test `middleware.ts` admits an `admin` token, redirects an absent token, and 403-rewrites a non-`admin` token (mock `getToken`); test `auth.ts` callbacks carry `role` + `onboarding_completed` into JWT and session
    - _Requirements: 17.1, 17.2, 21.2, 7.5_

  - [x] 2.5 Declare legacy route redirects and update landing redirect target
    - Add `async redirects()` to `dashboard/next.config.js` mapping `/jobs`→`/dashboard/jobs`, `/keys`→`/dashboard/api-keys`, `/billing`→`/dashboard/billing` as permanent (308) redirects
    - Update `dashboard/src/app/page.tsx` so the authenticated redirect target is `/dashboard` instead of `/jobs`, leaving the unauthenticated landing render unchanged
    - _Requirements: 2.2, 2.4, 2.5_

  - [ ]* 2.6 Write config-shape test for legacy redirects
    - Assert `next.config.js#redirects()` returns exactly the three legacy→`/dashboard/*` mappings with `permanent: true`, alongside Property 7's function-level check
    - _Requirements: 2.2_

- [x] 3. Pure functions, typed API client, and polling hook
  - [x] 3.1 Implement the pure-function module `lib/format.ts`
    - Create `dashboard/src/lib/format.ts` exporting `formatCost(value)` (`$${value.toFixed(4)}` — the only monetary formatter), `balanceColor(b)`, `queueCardColor(queued)`, `isAdminRole(role)`, `showRetryAction(status)`, `legacyRedirectTarget(route)`, `computeMargin(billed, provider)`, and `estimatorAlertState(records)`, matching the signatures and threshold semantics in design's Correctness Properties section
    - _Requirements: 1.6, 4.1, 4.2, 2.2, 14.1, 9.1, 18.4, 17.1, 17.2, 11.6, 11.7, 19.1, 23.2, 23.3_

  - [ ]* 3.2 Write property test for cost formatting (Property 1)
    - **Property 1: Cost_Display always renders exactly 4 decimal places**
    - **Validates: Requirements 1.6, 4.1, 4.2**

  - [ ]* 3.3 Write property test for queue-card color step function (Property 3)
    - **Property 3: Queue-card color is a strict step function at the 50 and 200 boundaries**
    - **Validates: Requirements 18.4**

  - [ ]* 3.4 Write property test for balance color thresholds (Property 4)
    - **Property 4: Balance color thresholds partition the value range without overlap**
    - **Validates: Requirements 14.1, 9.1**

  - [ ]* 3.5 Write property test for admin role guard (Property 5)
    - **Property 5: Admin route guard admits admins and returns 403 for every other role**
    - **Validates: Requirements 17.1, 17.2**

  - [ ]* 3.6 Write property test for retry-action visibility (Property 6)
    - **Property 6: Retry action is visible if and only if the job status is `failed`**
    - **Validates: Requirements 11.6, 11.7**

  - [ ]* 3.7 Write property test for legacy redirect mapping (Property 7)
    - **Property 7: Legacy route redirect mapping is a correct total function**
    - **Validates: Requirements 2.2**

  - [ ]* 3.8 Write property test for admin margin computation (Property 8)
    - **Property 8: Admin margin is billed minus provider cost, sign-correct including negatives**
    - **Validates: Requirements 19.1**

  - [ ]* 3.9 Write property test for estimator alert state (Property 9)
    - **Property 9: Estimator under-estimation alert distinguishes "no data" from a computed rate**
    - **Validates: Requirements 23.2, 23.3**

  - [x] 3.10 Define UI-facing response types
    - Create `dashboard/src/lib/types.ts` with `UiJobStatus`, `JobRow`, `CostComparisonResponse`, `SavingsResponse`, `HealthResponse`, `AdminSettings`, and `AuditLogEntry`, mirroring `@neuralgrid/shared` where types exist and marking backend-gap fields optional, per design's Data Models section
    - _Requirements: 1.6, 3.1_

  - [x] 3.11 Extend the Typed_API_Client
    - Extend `dashboard/src/lib/api.ts`: add `ApiErrorKind`, widen `ApiRequestError` with `kind` + `retryAfterSeconds`, add the pure `classifyApiError(status)` (401→`unauthorized`, 429→`rate_limited`, ≥500→`server_error`, else `client_error`), and add typed methods `getJob`, `getCostComparison`, `getSavings`, `getWhatIf`, `listApiKeys`, `createApiKey`, `revokeApiKey`, `getBillingSummary`, `getInvoices`, and the admin wrappers `adminGetHealth`, `adminListJobs`, `adminListUsers`, `adminGetEstimatorAccuracy`, `adminGetRevenue`, `adminGetLogs`
    - _Requirements: 1.5_

  - [ ]* 3.12 Write unit test for `classifyApiError`
    - Assert 401/429/5xx/4xx map to `unauthorized`/`rate_limited`/`server_error`/`client_error`
    - _Requirements: 1.5_

  - [x] 3.13 Implement the `usePolling` hook
    - Create `dashboard/src/lib/usePolling.ts`: `setInterval`-based polling at a caller-supplied interval (5000/10000/30000), pausing when `document.visibilityState === 'hidden'`, backing off on a `rate_limited` error using `retryAfterSeconds`, exposing `{ data, error, isLoading, lastUpdated }`, and never rendering a page-level spinner (consumers show `Skeleton_Screen` while `data` is `undefined`)
    - _Requirements: 1.5, 1.8_

  - [ ]* 3.14 Write unit test for `usePolling`
    - With fake timers, assert it fires at 5s/10s/30s, pauses when hidden, and backs off on a 429/`rate_limited` error
    - _Requirements: 1.5_

- [x] 4. Checkpoint - foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Shared component library
  - [x] 5.1 Implement `JobStatusBadge`
    - Create `dashboard/src/components/shared/JobStatusBadge.tsx` rendering all 7 states with the PRD 3.1 mapping (queued=gray, estimating=blue no-anim, dispatched=blue no-anim, running=blue + pulsing dot, complete=green, failed=red, cancelled=gray + line-through)
    - _Requirements: 3.1, 3.6_

  - [x] 5.2 Implement `TierBadge`
    - Create `dashboard/src/components/shared/TierBadge.tsx` rendering T1 green "T1 — Lite", T2 amber "T2 — Standard", T3 red "T3 — Power", wrapped in a shadcn `Tooltip` stating each tier's VRAM range and representative hardware class
    - _Requirements: 3.2, 3.3, 3.6_

  - [x] 5.3 Implement `ProviderBadge`
    - Create `dashboard/src/components/shared/ProviderBadge.tsx` with per-provider color (fireworks=purple, vastai=blue, runpod=orange, amd-cloud=red) and an AMD chip indicator icon when `hardwareVendor === 'AMD'`
    - _Requirements: 3.4, 3.5, 3.6_

  - [x] 5.4 Implement `CostDisplay`
    - Create `dashboard/src/components/shared/CostDisplay.tsx` routing every non-null, non-zero value through `formatCost` from `lib/format.ts`, rendering `estimating...` (italic muted) when `pending || value == null` and `$0.0000` (muted) when `value === 0`
    - _Requirements: 4.1, 4.2, 4.3, 1.6_

  - [x] 5.5 Implement `SavingsPill` and its helpers
    - Create `dashboard/src/components/shared/SavingsPill.tsx` exporting `shouldRenderSavings(actual, baseline)` and `computeSavingsPct(actual, baseline)` and rendering a green `saved N%` pill iff both costs are present and `baseline > 0`, otherwise rendering nothing
    - _Requirements: 4.4, 4.5_

  - [ ]* 5.6 Write property test for savings rendering gate (Property 2)
    - **Property 2: Savings_Pill renders if and only if both cost and baseline are present**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 5.7 Implement `EmptyState` and `SkeletonScreen`
    - Create `dashboard/src/components/shared/EmptyState.tsx` with the five variants (`no-jobs`, `no-filter-match`, `no-keys`, `no-invoices`, `unavailable`) and an optional `onAction` CTA; create `dashboard/src/components/shared/SkeletonScreen.tsx` with the `stat-card` / `table-rows` / `chart` / `detail-panel` shapes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 1.8, 5.5_

  - [ ]* 5.8 Write unit tests for shared component states
    - Assert `JobStatusBadge` all 7 states, `TierBadge` labels+tooltip, `ProviderBadge` per-provider color + AMD indicator only when `hardwareVendor === 'AMD'`, `CostDisplay` pending/zero/value branches, `EmptyState` all variants + CTA, `SkeletonScreen` shapes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4_

- [x] 6. Dashboard and Admin shells
  - [x] 6.1 Implement `Dashboard_Shell`
    - Create `dashboard/src/app/dashboard/layout.tsx` plus `dashboard/src/components/dashboard/Sidebar.tsx`, `TopBar.tsx`, `GlobalSearch.tsx`, `NotificationBell.tsx`: Sidebar fixed 240px at/above `md` and a shadcn `Sheet` drawer below, with logo/wordmark, data-driven `DASHBOARD_NAV` links, a bottom upgrade CTA for free-tier developers, and avatar/email/plan badge; TopBar shows page title + `Global_Search` + `Notification_Bell` and duplicates no Sidebar link
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 6.2 Implement `Admin_Shell` and NotAuthorized
    - Create `dashboard/src/app/admin/layout.tsx` plus `dashboard/src/components/admin/AdminSidebar.tsx`, `SystemStatusBar.tsx`, `NotAuthorized.tsx`, and `dashboard/src/app/admin/forbidden/page.tsx`: structurally separate layout with its own admin nav, sharing no navigation state with `Dashboard_Shell`, performing a defense-in-depth server-side `session.user.role !== 'admin'` check rendering `NotAuthorized`
    - _Requirements: 17.4, 17.1, 17.2_

  - [ ]* 6.3 Write unit tests for shells
    - Assert `Dashboard_Shell` renders nav links and TopBar without duplicating a Sidebar link; assert `Admin_Shell` renders `NotAuthorized` for a non-admin session and admin nav for an admin session
    - _Requirements: 8.2, 8.3, 17.4_

- [x] 7. Checkpoint - shared components and shells
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Authentication pages
  - [x] 8.1 Rebuild the login page on shadcn (migration)
    - Rebuild `dashboard/src/app/login/page.tsx` using shadcn `Form`/`Input`/`Button`, preserving the `signIn('credentials', { redirect: false })` call, the invalid-credentials error message, and a success redirect to `/dashboard`
    - _Requirements: 6.1_

  - [x] 8.2 Implement register page (net-new)
    - Create `dashboard/src/app/register/page.tsx` accepting email, password, and name; on success create the account, display the granted free-tier credit amount, and redirect to `/onboarding`
    - _Requirements: 6.2, 6.3_

  - [x] 8.3 Implement forgot-password and reset-password pages (net-new)
    - Create `dashboard/src/app/forgot-password/page.tsx` that sends a reset email regardless of whether the address is registered; create `dashboard/src/app/reset-password/[token]/page.tsx` that updates the password and redirects to `/login` on a valid token and shows an error without updating on an invalid/expired token
    - _Requirements: 6.4, 6.5, 6.6_

  - [ ]* 8.4 Write unit tests for auth pages
    - Assert login renders the shadcn form and error state, register shows the free-credit amount before redirect, and reset-password shows the error-and-no-update path on an invalid token
    - _Requirements: 6.1, 6.3, 6.6_

- [x] 9. Onboarding flow
  - [x] 9.1 Implement the onboarding flow (net-new)
    - Create `dashboard/src/app/onboarding/page.tsx`: a guarded 3-step client flow — (1) welcome + free credit + two options, (2) one-time full API key reveal + copy control + not-shown-again statement, (3) pre-filled `llama-3-8b` example job, submit, live progress via `GET /v1/jobs/:id` polling, then actual cost + RunPod A100 equivalent + savings percentage from Cost_Comparison_Service; completion writes both `localStorage` and `PATCH /v1/account { onboarding_completed: true }` best-effort (a failure of either is swallowed, not retried, and does not block); redirect to `/dashboard` when `onboarding_completed` is already true
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 9.2 Write unit tests for onboarding
    - Assert the completed-user guard redirects to `/dashboard`, and that a single failed completion write still treats the flow as complete without retry
    - _Requirements: 7.5, 7.6_

- [x] 10. User dashboard - Home page (net-new)
  - [x] 10.1 Implement Home_Page stat cards and quick-action panel
    - Create `dashboard/src/app/dashboard/page.tsx` with four stat cards (jobs today, spend today, saved today, balance — balance styled via `balanceColor`, amber below $1.00) polling stats/saved at 5s and balance at 30s via `usePolling`, and a quick-action panel shown only when no job was submitted in the last 7 days
    - _Requirements: 9.1, 9.2, 9.7, 9.8_

  - [x] 10.2 Implement live job feed and 6-month spend chart
    - Add the 10-row live job feed (each row using `JobStatusBadge`/`TierBadge`/`ProviderBadge`/`CostDisplay`/`SavingsPill` + relative timestamp, row click → `/dashboard/jobs/:id`) polling at 5s, and the recharts 6-month spend bar chart comparing NeuralGrid actual vs RunPod A100 equivalent from `GET /v1/analytics/savings`
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [ ]* 10.3 Write unit tests for Home_Page
    - Assert sections render `Skeleton_Screen` while data is `undefined`, and the quick-action panel shows iff no job in the last 7 days
    - _Requirements: 9.7, 9.8, 1.8_

- [x] 11. User dashboard - Jobs page (migration from `/jobs`)
  - [x] 11.1 Implement Jobs_Page table, filters, sort, and pagination
    - Create `dashboard/src/app/dashboard/jobs/page.tsx` on shadcn `Table` with the filter bar (multi-select status pills, date range, model search, tier checkboxes), sortable column headers, and cursor pagination (default 20, max 100), degrading to client-side filtering of the returned page where the filter/cursor query params are a backend gap; render the `no-jobs` and `no-filter-match` empty states (the legacy `/jobs` route is retired via the `next.config.js` redirect from task 2.5)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 5.1, 5.2_

  - [ ]* 11.2 Write unit tests for Jobs_Page empty states
    - Assert the `no-jobs` empty state (never-submitted) and the `no-filter-match` empty state (filtered-to-empty) each render their documented CTA
    - _Requirements: 5.1, 5.2_

- [x] 12. User dashboard - Job Detail page (net-new)
  - [x] 12.1 Implement Job_Detail_Page header, cost breakdown, and estimator panel
    - Create `dashboard/src/app/dashboard/jobs/[id]/page.tsx` header (full ID+copy, `JobStatusBadge`, model, `TierBadge`, timestamps, back link), cost breakdown panel (actual cost, tier, provider via `ProviderBadge`, RunPod A100 equivalent/absolute savings/percent from `GET /v1/jobs/:id/cost-comparison`, plus input/output token counts for text jobs), and a collapsible estimator reasoning panel; poll `GET /v1/jobs/:id` at 5s while status is non-terminal
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 12.2 Implement result panels and job actions
    - Add the type-specific result panel (text block with syntax highlighting, inline image + download, audio player + waveform + download, first 10 embedding dimensions + download-full-vector), a "Retry job" action shown iff status === `failed` (via `showRetryAction`), a "Clone job" action for completed jobs, and "Download result" / "Copy job spec" actions
    - _Requirements: 11.5, 11.6, 11.7, 11.8, 11.9_

  - [ ]* 12.3 Write unit tests for Job_Detail_Page
    - Assert the Retry action appears only for `failed` status and is absent for every other status, and that Clone appears for completed jobs
    - _Requirements: 11.6, 11.7, 11.8_

- [x] 13. User dashboard - Savings page (net-new)
  - [x] 13.1 Implement Savings_Page hero, breakdown table, and cumulative chart
    - Create `dashboard/src/app/dashboard/savings/page.tsx` with the hero metric (total saved since account creation + job count), the per-model breakdown table (model, jobs, avg NeuralGrid cost, avg RunPod A100 cost, avg savings %), and the recharts cumulative line chart (NeuralGrid vs A100 lines) from `GET /v1/analytics/savings`
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 13.2 Implement the What_If_Calculator
    - Add the What_If_Calculator (model select + estimated monthly job count → projected monthly cost on NeuralGrid/RunPod A100/AWS + annual savings) via `GET /v1/analytics/what-if`, recomputing on input change without a full page reload and remaining functional with zero history
    - _Requirements: 12.4, 12.5, 12.6_

  - [ ]* 13.3 Write unit tests for Savings_Page
    - Assert the What_If_Calculator recomputes on input change and produces output from baseline values when the developer has no history
    - _Requirements: 12.5, 12.6_

- [x] 14. User dashboard - API Keys page (migration from `/keys`)
  - [x] 14.1 Implement Api_Keys_Page table, create/revoke flows, and usage rows
    - Create `dashboard/src/app/dashboard/api-keys/page.tsx` on shadcn `Table` (Name, Key prefix, Status, Last used, Created, Actions) with a create `Dialog` (one-time full-key reveal + not-shown-again warning, then prefix-only), a revoke `AlertDialog` requiring explicit confirmation and hidden for already-revoked keys, and expandable usage rows (requests today/month, top 3 models) rendering `EmptyState variant="unavailable"` when the usage endpoint is absent; render the `no-keys` empty state
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 5.3_

  - [ ]* 14.2 Write unit tests for Api_Keys_Page
    - Assert the revoke action is hidden on already-revoked keys and the usage expansion renders the `unavailable` empty state when the usage endpoint is absent
    - _Requirements: 13.5, 13.6_

- [x] 15. User dashboard - Billing page (migration from `/billing`)
  - [x] 15.1 Implement Billing_Page balance, top-up, summary, and invoices
    - Create `dashboard/src/app/dashboard/billing/page.tsx` with the balance panel color-coded via `balanceColor` (green >$5, amber $1–$5, red <$1), top-up presets ($10/$25/$50/$100 + custom), an auto-top-up toggle (trigger balance + amount), the current-month summary (job count, spend, savings vs A100 $/%, link to priciest job, month-over-month trend), saved payment methods with Stripe Elements Add/Remove (allowing removal of the last method), and the invoice history table with the `no-invoices` empty state; top-up/auto-top-up/payment-method persistence are backend gaps rendered as disabled controls where absent
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 5.4_

  - [ ]* 15.2 Write unit tests for Billing_Page
    - Assert the balance color bands (green/amber/red) via `balanceColor` and the `no-invoices` empty state
    - _Requirements: 14.1, 5.4_

- [x] 16. User dashboard - Docs page (net-new)
  - [x] 16.1 Implement Docs_Page content and interactive API explorer
    - Create `dashboard/src/app/dashboard/docs/page.tsx` with left section nav + right content (Quickstart, OpenAI migration diff, API reference, Model list, Code samples, Webhooks) and an interactive API explorer (model select via `GET /v1/models` + prompt + live estimate + Run via `POST /v1/jobs`) that disables Run / shows a setup-incomplete state and never submits a partial job when inputs are missing
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 16.2 Write unit test for Docs_Page explorer gate
    - Assert Run is disabled / shows the setup-incomplete state when required inputs are missing
    - _Requirements: 15.4, 15.5_

- [x] 17. User dashboard - Settings page (net-new)
  - [x] 17.1 Implement Settings_Page account, preferences, theme, and danger zone
    - Create `dashboard/src/app/dashboard/settings/page.tsx` with account controls (display name, email read-only for OAuth, password change), notification toggles, preference controls (default model/max tokens/quantization/theme — theme applied immediately via `next-themes` `setTheme` without reload), and a danger-zone account deletion with a single typed confirmation; destructive endpoints and 16.6 rollback semantics are backend-dependent
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ]* 17.2 Write unit test for Settings_Page theme toggle
    - Assert changing the theme control calls `setTheme` and applies immediately without a reload
    - _Requirements: 16.4_

- [x] 18. Checkpoint - user dashboard complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Admin dashboard - Home page (net-new)
  - [x] 19.1 Implement Admin_Home_Page status bar, metric cards, and feeds
    - Create `dashboard/src/app/admin/page.tsx` with the system status bar (traffic lights per subsystem + provider), 4 metric cards (queue — color via `queueCardColor`; running; 1h success rate — alert <90%; 24h active users) polling at 10s, a 20-row recent-failures feed (row click → admin job detail), and per-provider health summary rows, from `GET /internal/health`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

  - [ ]* 19.2 Write unit tests for Admin_Home_Page
    - Assert queue-card color bands via `queueCardColor` and the success-rate alert below 90%
    - _Requirements: 18.4, 18.5_

- [x] 20. Admin dashboard - All Jobs page (net-new; backend-blocked)
  - [x] 20.1 Implement Admin_Jobs_Page table, filters, export, and detail
    - Create `dashboard/src/app/admin/jobs/page.tsx` extending the Jobs_Page columns with developer email, full job ID, provider node ID, internal cost, billed cost, and margin ($ and %, including negatives via `computeMargin`), plus admin filters (developer email/ID, provider, failure reason), Export CSV of the filtered set, and the admin job-detail view (internal timeline, estimator debug, provider debug, retry history, revenue breakdown); this page is UI-complete-but-backend-blocked — build against the design's `/v1/admin/jobs` response types and render `EmptyState variant="unavailable"` for the fields the current `/v1/jobs` does not return
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [ ]* 20.2 Write unit test for Admin_Jobs_Page margin and unavailable path
    - Assert margin rendering (including negative) via `computeMargin` and the `unavailable` empty state when the admin listing fields are absent
    - _Requirements: 19.1_

- [x] 21. Admin dashboard - Users page (net-new; backend-blocked)
  - [x] 21.1 Implement Admin_Users_Page table, detail drawer, and actions
    - Create `dashboard/src/app/admin/users/page.tsx` with the users table (Email, Plan, Balance red <$0.50, Jobs 30d, Spend 30d, Last active, Status), a slide-in detail drawer (account info, balance/top-up history, job stats, API keys with admin revoke, 10 recent jobs), and actions (grant credit, change plan, suspend/unsuspend, password reset, impersonate — with the audit-log-before-proceed gate for impersonation); this page is UI-complete-but-backend-blocked — build against the design's `/v1/admin/users` response types and render `EmptyState variant="unavailable"` since the endpoint does not exist
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [ ]* 21.2 Write unit test for Admin_Users_Page
    - Assert the `unavailable` empty state renders when the admin users endpoint is absent, and the impersonate action is blocked when the audit-log write fails
    - _Requirements: 20.4_

- [x] 22. Admin dashboard - Providers page (net-new; partially backend-blocked)
  - [x] 22.1 Implement Admin_Providers_Page cards, actions, and node table
    - Create `dashboard/src/app/admin/providers/page.tsx` with one card per provider (status, circuit breaker state + cooldown, last poll, consecutive failures from the existing `GET /internal/health` fields) polling at 10s, four always-visible actions (force poll, reset breaker, disable, re-enable), and an expandable node-level table (Node ID, GPU model, VRAM, Tier, Price, Status, warm models); render `EmptyState variant="unavailable"` for the per-tier node inventory and price-cache-freshness portions, which are a backend gap, rather than fabricating values
    - _Requirements: 21.3, 21.4, 21.5, 21.6, 21.7_

  - [ ]* 22.2 Write unit test for Admin_Providers_Page unavailable inventory
    - Assert the per-tier inventory / cache-freshness card portion renders the `unavailable` empty state when those fields are absent
    - _Requirements: 21.5_

- [x] 23. Admin dashboard - Revenue page (net-new; backend-blocked)
  - [x] 23.1 Implement Admin_Revenue_Page metrics, chart, and tables
    - Create `dashboard/src/app/admin/billing/page.tsx` with 4 metric cards (MRR, revenue today, provider cost today, gross margin), a recharts revenue-vs-cost line chart (30d default / 90d toggle), a billing-events table, and a failed-payments table with actions; this page is UI-complete-but-backend-blocked — build against the design's `/v1/admin/revenue` response types and render `EmptyState variant="unavailable"` since the endpoint does not exist
    - _Requirements: 22.1_

  - [ ]* 23.2 Write unit test for Admin_Revenue_Page unavailable path
    - Assert the `unavailable` empty state renders when the revenue endpoint is absent
    - _Requirements: 22.1_

- [x] 24. Admin dashboard - Estimator page (net-new; partially backend-blocked)
  - [x] 24.1 Implement Admin_Estimator_Page accuracy overview, table, and registry editor
    - Create `dashboard/src/app/admin/estimator/page.tsx` with the 7-day accuracy overview (correct/over/under rates), an under-estimation alert driven by `estimatorAlertState` distinguishing `no-data` from a computed rate ≤5%, a per-model accuracy table (Model, Jobs, Correct, Over, Under, recommended action) from `GET /v1/admin/estimator-accuracy`, and a Model_Registry editor (edit VRAM per quantization, add profile, disable without delete, change-log with proceed-on-log-failure); the registry write API + change log are a backend gap — render the editor against the design's types with `EmptyState variant="unavailable"` / disabled save where the write path is absent
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6_

  - [ ]* 24.2 Write unit test for Admin_Estimator_Page alert states
    - Assert the no-data alert is distinct from a computed under-rate of 0% / ≤5% via `estimatorAlertState`
    - _Requirements: 23.2, 23.3_

- [x] 25. Admin dashboard - Logs page (net-new; backend-blocked)
  - [x] 25.1 Implement Admin_Logs_Page filters, top errors, and log list
    - Create `dashboard/src/app/admin/logs/page.tsx` with filters (severity, service, free text, time range), a top-5 errors-by-frequency panel (click filters the list), a log list (timestamp, severity badge, service, message, collapsible JSON context), and an auto-refresh toggle polling at 10s when on; this page is UI-complete-but-backend-blocked — build against the design's `/v1/admin/logs` response types and render `EmptyState variant="unavailable"` since no log-query endpoint exists
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [ ]* 25.2 Write unit test for Admin_Logs_Page unavailable path
    - Assert the `unavailable` empty state renders when the logs endpoint is absent
    - _Requirements: 24.1_

- [x] 26. Admin dashboard - Settings page (net-new; backend-blocked)
  - [x] 26.1 Implement Admin_Settings_Page configuration forms
    - Create `dashboard/src/app/admin/settings/page.tsx` with editable routing, provider, billing, and per-plan rate-limit forms bound to the design's `AdminSettings` shape, with a save action that logs admin+timestamp against the changed setting; this page is UI-complete-but-backend-blocked — build against the design's `/v1/admin/settings` types and render `EmptyState variant="unavailable"` / disabled save since persistence does not exist
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5_

  - [ ]* 26.2 Write unit test for Admin_Settings_Page unavailable path
    - Assert the forms render the `unavailable` empty state / disabled save when the settings endpoint is absent
    - _Requirements: 25.1_

- [x] 27. Final checkpoint - all surfaces integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery.
- Each task references specific requirement acceptance criteria for traceability.
- Property tests validate the 9 correctness properties from `design.md` using fast-check (minimum 100 runs), matching the MVP/Stage 2/landing-page convention; each property is its own separate sub-task placed immediately after the pure function it validates. All 9 attach to pure functions in `lib/format.ts` (Properties 1, 3, 4, 5, 6, 7, 8, 9) or the `SavingsPill` helpers (Property 2).
- Unit tests are placed as optional sub-tasks immediately after the implementation task they cover, per the existing project convention.
- **Backend-blocked admin pages:** Admin Jobs (20), Users (21), Revenue (23), Logs (25), and Settings (26) are UI-complete-but-backend-blocked per `design.md`'s Backend Prerequisites and Gaps list — the endpoints `/v1/admin/jobs`, `/v1/admin/users`, `/v1/admin/revenue`, `/v1/admin/logs`, `/v1/admin/settings` do not exist today. Admin Providers (22) and Estimator (24) are partially blocked (per-tier node inventory + price-cache-freshness on `/internal/health`; the Model_Registry write API + change log). These tasks build the UI against the design's response types and render `EmptyState variant="unavailable"` (or a disabled control) where a field/endpoint is absent. **Building those missing backend endpoints is out of scope for this UI spec** and is intentionally not represented as tasks here.
- Route reorg down to 375px responsiveness (Req 1.7), light/dark snapshot coverage of migrated pages, and the route-reorg e2e smoke pass (`/jobs`→308→`/dashboard/jobs`, authed `/`→`/dashboard`, unauth `/dashboard`→`/login`, non-admin `/admin`→403) require human/visual review or an e2e suite that does not yet exist in `dashboard/`, and are excluded from this coding-task list per `design.md`'s Testing Strategy.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.5", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"] },
    { "id": 2, "tasks": ["2.3", "2.6", "3.11", "3.13"] },
    { "id": 3, "tasks": ["2.4", "3.12", "3.14", "5.1", "5.2", "5.3", "5.4", "5.5", "5.7"] },
    { "id": 4, "tasks": ["5.6", "5.8", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["8.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "10.1", "11.1", "12.1", "13.1", "14.1", "15.1", "16.1", "17.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "11.2", "12.2", "13.2", "14.2", "15.2", "16.2", "17.2"] },
    { "id": 9, "tasks": ["12.3", "13.3", "19.1", "20.1", "21.1", "22.1", "23.1", "24.1", "25.1", "26.1"] },
    { "id": 10, "tasks": ["19.2", "20.2", "21.2", "22.2", "23.2", "24.2", "25.2", "26.2"] }
  ]
}
```
