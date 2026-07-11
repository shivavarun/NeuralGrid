# NeuralGrid — Positioning Update: AMD-Only Infrastructure
**Version:** 1.0 | **Status:** Ready for Kiro | **Date:** July 2026
**Applies to:** PRD v2.0, Production Readiness PRD v1.0, Dashboard PRD v1.0, Dashboard Addendum v1.1 — this note overrides any part of those documents that references multi-provider routing or names a third-party platform.

---

## 0. The change, in one line

NeuralGrid no longer routes across outside marketplaces. **Every job runs on AMD Developer Cloud, on AMD Instinct hardware, full stop.** The product is now: automatic sizing *within* AMD's own fleet, not shopping across vendors.

This changes the architecture (single provider, not an aggregator), the tiers (AMD Instinct hardware, not a mix of NVIDIA consumer/datacenter cards), and every place competitor or provider names were written down.

---

## 1. What gets removed, everywhere

Strike these from all prior documents and from any future copy, code comments, or UI strings:

- **Vast.ai, RunPod, Lambda Labs, Akash** — no longer providers we route to. Delete the "Provider Aggregator" concept of querying multiple outside marketplaces.
- **Baseten, Cumulus Labs, Hydra Host, IonRouter, GPU Per Hour, dstack, Akamai AI Grid** — these were named as competitors in the MVP PRD's Market Validation section. Do not name them in any user-facing surface (landing page, dashboard, docs). Internal competitive strategy docs can still discuss them, but nothing shipped to a developer should.
- **Fireworks AI** — was used as a shorthand "provider on top of AMD hardware" in the Dashboard PRD examples. Drop it. There is one provider: AMD Developer Cloud.
- **"vs RunPod" as the savings baseline** — the whole cost story (40% cheaper vs RunPod) doesn't hold once RunPod isn't in the picture. Replace with the comparison that's actually true now (§3 below).
- **NVIDIA hardware references** (RTX 3060/3070/3080/3090/4090, A100, H100, A5000, A6000) — replace with AMD Instinct equivalents (§2).

---

## 2. Tiers, redefined for AMD-only

The three-tier idea stays — VRAM need still varies by job, so sizing still matters. What changes is that all three tiers are AMD Instinct hardware, reached through partitioning rather than picking a different vendor.

| Tier | VRAM range | AMD hardware | Price range | Best for |
|---|---|---|---|---|
| T1 — Lite | 0–16GB | AMD Instinct MI210 (partitioned) | $0.04–0.08/hr | Small LLMs (≤8B), embeddings, classification, small audio gen |
| T2 — Standard | 16–64GB | AMD Instinct MI300X (partitioned) | $0.18–0.35/hr | Mid LLMs (8–30B), SDXL-class image gen, fine-tuning small models |
| T3 — Power | 64GB+ | AMD Instinct MI300X (full node, 192GB HBM3) | $0.60–1.10/hr | Large LLMs (70B+), video gen, large-scale fine-tuning |

**Why this still works:** MI300X's 192GB HBM3 is large enough to partition into smaller logical instances for lighter jobs, so NeuralGrid doesn't need outside hardware to offer a cheap tier — it needs good partitioning and scheduling on AMD's own fleet. That's the actual engineering problem now: **fleet-level bin-packing across MI210 and MI300X capacity**, not cross-marketplace price shopping.

---

## 3. Architecture change

**Before:** API Gateway → Estimator → Price Aggregator (queries N outside providers) → Scheduler → dispatch to whichever outside marketplace had the cheapest matching node.

**Now:** API Gateway → Estimator → **Capacity Manager** (tracks AMD Developer Cloud's own partitioned + full-node inventory, not external prices) → Scheduler → dispatch to an AMD Developer Cloud instance.

- Delete the "Provider Adapters" layer for Vast.ai/RunPod/Akash/Lambda in the Production PRD §1 diagram. Replace with a single AMD Developer Cloud client.
- The `providers` and `provider_nodes` tables (Production PRD §2) collapse to one logical provider row; `provider_nodes` becomes AMD instance inventory only (MI210 partitions, MI300X partitions, MI300X full nodes).
- Circuit breaker logic (Production PRD §4) still applies — AMD Developer Cloud capacity can still be temporarily unavailable in a region — but there's no "failover to a different marketplace" anymore. Failover now means: retry, tier-bump, or queue, all within AMD's own fleet.
- The MVP PRD's "no cold start, route to existing providers" rationale (§4.4) still holds, just narrowed to one provider: no need to build owned hardware, AMD Developer Cloud already provides the fleet.

---

## 4. What the savings story becomes

The old pitch was "cheaper than picking wrong on RunPod." The new, honest pitch: **"cheaper than always reaching for the biggest AMD instance."** The waste is still real — a developer running a 7B model on a full MI300X node when a partitioned slice would do — it's just waste within one cloud, not waste from picking the wrong marketplace.

Landing page and dashboard copy should compare **NeuralGrid's automatic tier** against **always using a full MI300X node**, never against a named competitor's pricing.

---

## 5. Landing page — rebuilt

`neuralgrid_landing_v2.html` (attached) removes:
- The competitor comparison table (Vast.ai / RunPod / Baseten / Cumulus Labs) entirely — no substitute table naming anyone.
- All "vs RunPod" language, replaced with "vs always using a full MI300X node."
- The "Powered by AMD" partner-spotlight framing (that implied AMD was one partner among others) — now the entire page's premise *is* AMD Developer Cloud, stated plainly rather than spotlighted as an add-on.

## 6. Dashboard — rebuilt

`neuralgrid_dashboard_v2.html` (attached) replaces every `provider` column value (Vast.ai, RunPod, Fireworks AI, AMD Dev Cloud) with the specific AMD instance type (`MI210 partition`, `MI300X partition`, `MI300X full node`), since there's only one provider now — the interesting variable to show the developer is *which AMD instance*, not *which company*.

---

## 7. Action items for Kiro

- Update Production PRD §1 architecture diagram and §2 schema per §3 above.
- Update MVP PRD §4.4 supply strategy: single provider (AMD Developer Cloud), not a multi-provider aggregator.
- Remove Market Validation competitor names (MVP PRD §3) from anything that reaches a shipped surface; fine to keep internally for strategy, not fine to print in docs or UI.
- Re-run the Dashboard Addendum's Submit Job estimator preview copy — "Routes to" should show instance type, not a company name.

---
NeuralGrid — Positioning Update v1.0 — July 2026 — Confidential
