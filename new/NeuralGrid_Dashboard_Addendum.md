# NeuralGrid — User Dashboard: Build Addendum for Kiro
**Version:** 1.1 | **Status:** Ready for Kiro | **Date:** July 2026
**Supersedes:** nothing. Adds to `Dashboard PRD v1.0` §1 (User Dashboard). Read that first — this fixes what's missing from the current build, shown in the attached screenshot of `localhost:3000/jobs`.

---

## 0. What's wrong with the current build

The screenshot shows a bare table at `/jobs`. Functionally this is not a dashboard yet — it's a table.

| Missing | Why it matters | Where it's specified |
|---|---|---|
| No sidebar / nav | User can't get anywhere else. Dashboard PRD §1.2 requires a fixed sidebar on every page. | §1.2 |
| No way to submit a job | There is a `jobs` table but no button, page, or form that creates one. This is the single most important screen in the product and it doesn't exist. | New in this doc, §2 |
| No API key page reachable | Developers cannot get a key, so they cannot call the API at all. | Dashboard PRD §1.7, wired properly in §3 below |
| No stat cards / savings framing | Home page (§1.3) isn't built — this table appears to be standing in for it. | §1.3 |
| Unexplained "1 error" toast | A raw, unlabeled error toast is a dead end for the user. Every error must say what happened and what to do. | §4 below |
| Native `<select>` dropdowns, default browser chrome | Not using shadcn/ui components as the stack requires. | Dashboard PRD §0.3 |
| Dates as raw ISO-ish strings | No relative time ("2m ago") per spec. | Dashboard PRD §1.4 |

**This addendum specifies the two flows that are completely absent (Submit Job, Generate API Key) and the layout shell that should wrap every page.** Everything else (Savings, Billing, Docs, Settings) is already fully specified in Dashboard PRD §1 — build those as written.

---

## 1. Layout shell (build this once, before any page)

Reference points: Vercel's dashboard and Linear both use a **thin fixed sidebar + breadcrumb-style topbar + card-first content area** — that's the pattern here, not a generic admin template with a giant header.

```
┌───────────┬──────────────────────────────────────────┐
│  NG logo  │  Jobs                    [search] [bell]  │  ← topbar, 56px
├───────────┼──────────────────────────────────────────┤
│  Home     │                                          │
│  Jobs     │        page content                      │
│▸ Submit   │                                          │
│  Savings  │                                          │
│  API Keys │                                          │
│  Billing  │                                          │
│  Docs     │                                          │
│           │                                          │
│ [Upgrade] │                                          │
│  avatar   │                                          │
└───────────┴──────────────────────────────────────────┘
   240px
```

Sidebar and topbar are exactly as specified in Dashboard PRD §1.2 — this addendum adds **one nav item: "Submit Job"**, positioned second, right after Home, because it's the primary action a developer takes. Give it a filled/accent treatment (not just a text link) since it's the one action every user needs constantly — same visual weight as a "Compose" or "New" button in Gmail/Linear.

---

## 2. Submit Job — the missing core screen

**Question this screen answers:** *"What will this job cost and where will it run, before I commit to it?"*

Route: `/dashboard/jobs/new`. Also reachable as a slide-over modal from the Home quick-action panel and from a persistent "+ New Job" button in the sidebar.

### 2.1 Layout — two columns

Left column: the form. Right column: **live estimator preview** — this is not decoration, it's the product's core mechanic made visible, and it should reuse the same visual language as the marketing site's routing gauge (tier LEDs, VRAM readout, routed provider + cost) so the dashboard and the landing page feel like the same product.

```
┌─────────────────────────────┬───────────────────────┐
│ Job type                    │  ESTIMATOR PREVIEW     │
│ [LLM Inference ▾]           │  ─────────────────     │
│                              │  VRAM needed: 8.5 GB   │
│ Model                        │  Confidence: HIGH       │
│ [Search models... ▾]        │                         │
│                              │  ○ T1  ● T2  ○ T3      │
│ Prompt / Input               │                         │
│ ┌─────────────────────────┐ │  Routes to: Vast.ai     │
│ │                         │ │  Est. cost: $0.0180     │
│ └─────────────────────────┘ │                         │
│                              │  vs A100 baseline:      │
│ Max tokens: [512]            │  $0.0980 — saves 82%    │
│ Quantization: [int8 ▾]       │                         │
│                              │  [Submit Job]           │
└─────────────────────────────┴───────────────────────┘
```

### 2.2 Behavior

- Estimator preview **updates live** as the user changes model, quantization, or input size — debounce 400ms, call `GET /estimate` (already specified in Production PRD §3), never re-submit the form to get a preview.
- Confidence badge uses the same three states as the estimator reasoning panel on Job Detail (Dashboard PRD §1.5): HIGH / MEDIUM / LOW, same colors.
- If confidence is LOW, show an inline note under the preview: *"We don't have exact specs for this model — routed one tier up to avoid a failed job."* (Plain language, not "insufficient telemetry.")
- "Submit Job" button is disabled until a model is selected and input is non-empty. Disabled state has a tooltip explaining why, not just grayed out silently.
- On submit: `POST /jobs` with the idempotency key generated client-side per attempt. Button shows a loading state (`Submitting...`), then redirects to `/dashboard/jobs/:id` where the job's live status takes over (Dashboard PRD §1.5).
- Model dropdown groups by job type and shows tier as a small badge next to each model name, e.g. `llama-3-8b · T1`, `llama-3-70b · T3` — this lets a user recognize cost tier before they even open the estimator panel.
- Insufficient balance: don't let the request round-trip and fail. If estimated cost > current balance, disable Submit and show "Add funds to submit this job" with a direct link to `/dashboard/billing`.

### 2.3 Component reuse

Build one `EstimatorPreview` component. It is used in three places: this screen, the onboarding step 3 "submit a test job" flow (Dashboard PRD §1.11), and the Home quick-action modal. Build once.

---

## 3. API Keys — make it reachable and make generation obvious

Dashboard PRD §1.7 already specifies the API Keys page in full. What's missing in the current build is that **it isn't reachable from anywhere** (no sidebar) and there's likely no entry point to actually create the first key. Fix:

- Sidebar nav item "API Keys" always visible (per §1 above).
- Empty state (no keys yet): centered card, *"Create your first API key to start calling NeuralGrid."* with a single primary button **"Generate API key."** Not a table with nothing in it.
- **Generate flow:**
  1. Click "Generate API key" → modal asks for a label only (e.g. "Production", "Local dev"). No other fields.
  2. On confirm, show the **full key exactly once**, in a monospace field with a copy button, and a clear warning: *"Copy this now — you won't be able to see it again."*
  3. Require the user to click "I've copied my key" to close the modal (don't let an accidental click-away lose it silently — but also don't block indefinitely; an "X" close still works, it just carries the same warning).
  4. After closing, the table shows the new key as `ngr_live_••••••••3f2a` (prefix + last 4 only), label, created date, last used ("Never" until first request), and a "Revoke" action.
- Revoke requires a confirm dialog: *"Requests using this key will start failing immediately. This can't be undone."*

---

## 4. Error handling (fixes the unexplained toast)

Every error surfaced to the user follows one format — a toast with:
- **What happened**, in plain language (not an error code alone)
- **What to do**, if there's an action (retry, add funds, check status page)
- Auto-dismiss after 6s for informational errors; persistent (manual dismiss) for anything blocking an action

Example: instead of `1 error`, a failed poll should read: *"Couldn't refresh jobs — retrying..."* and retry silently in the background. A failed job submission should read: *"Job wasn't submitted — [reason]. Try again."* with a Retry button in the toast itself.

---

## 5. Design language note for Kiro

Keep the dashboard visually continuous with the marketing site: same dark base, same tier colors (T1 green / T2 amber / T3 rose), same monospace treatment for all numeric/cost/ID data, sans-serif for everything else. A developer should recognize it's the same product the moment the dashboard loads after signup. Light mode (Dashboard PRD §0.3 requirement) inverts the same tokens — don't design a second, unrelated light theme.

---

## 6. Updated Kiro task list (insert into Dashboard PRD §4)

**Phase E addition — insert before "/dashboard home":**
- `EstimatorPreview` shared component: live VRAM/tier/cost preview, debounced calls to `GET /estimate`, three confidence states, reused across Submit Job, onboarding, and Home quick-action
- `/dashboard/jobs/new`: two-column form + live estimator, disabled-state handling for missing balance, idempotency key generation on submit
- Sidebar "Submit Job" nav item with accent treatment + persistent "+ New Job" affordance

**Phase E addition — API Keys:**
- Empty state with single CTA (no bare table)
- Generate-key modal: label input → one-time reveal → forced acknowledgment → masked table row
- Revoke confirm dialog

**Cross-cutting:**
- Global toast component: message + optional action button + auto vs. persistent dismiss rules (§4)
- Verify every nav item in Dashboard PRD §1.2 sidebar spec is actually wired and reachable — current build is missing this entirely

---
NeuralGrid — User Dashboard Build Addendum v1.1 — July 2026 — Confidential
