"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TierBadge } from "@/components/shared/TierBadge";
import { toast } from "@/components/shared/Toast";
import { cn } from "@/lib/utils";
import { Zap, AlertTriangle, ExternalLink } from "lucide-react";
import type { Tier } from "@/lib/types";
import Link from "next/link";

// --- Model registry (local, no API needed) ---
interface ModelSpec {
  id: string;
  label: string;
  tier: Tier;
  vram: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  routesTo: string;
  costPerCall: number;
  savingsPct: number;
  jobType: string;
}

const MODELS: ModelSpec[] = [
  { id: "llama-3-8b", label: "llama-3-8b", tier: "T1", vram: 8.5, confidence: "HIGH", routesTo: "MI210 partition", costPerCall: 0.0023, savingsPct: 92, jobType: "llm-inference" },
  { id: "mistral-7b", label: "mistral-7b", tier: "T1", vram: 7.8, confidence: "HIGH", routesTo: "MI210 partition", costPerCall: 0.0019, savingsPct: 94, jobType: "llm-inference" },
  { id: "llama-3-70b", label: "llama-3-70b", tier: "T3", vram: 62, confidence: "HIGH", routesTo: "MI300X full node", costPerCall: 0.172, savingsPct: 75, jobType: "llm-inference" },
  { id: "stable-diffusion-xl", label: "stable-diffusion-xl", tier: "T2", vram: 8, confidence: "HIGH", routesTo: "MI300X partition", costPerCall: 0.018, savingsPct: 82, jobType: "image-gen" },
  { id: "flux", label: "flux", tier: "T2", vram: 12, confidence: "MEDIUM", routesTo: "MI300X partition", costPerCall: 0.024, savingsPct: 78, jobType: "image-gen" },
];

const JOB_TYPES = [
  { id: "llm-inference", label: "LLM Inference" },
  { id: "image-gen", label: "Image Generation" },
  { id: "audio", label: "Audio" },
  { id: "embeddings", label: "Embeddings" },
];

const QUANTIZATIONS = [
  { id: "fp16", label: "FP16 (default)" },
  { id: "int8", label: "INT8" },
  { id: "int4", label: "INT4" },
];

const QUANT_VRAM_FACTOR: Record<string, number> = { fp16: 1.0, int8: 0.55, int4: 0.3 };
const QUANT_COST_FACTOR: Record<string, number> = { fp16: 1.0, int8: 0.7, int4: 0.5 };

// Mock user balance
const USER_BALANCE = 4.23;

const TIER_COLORS: Record<Tier, string> = {
  T1: "bg-ng-tier-1",
  T2: "bg-ng-tier-2",
  T3: "bg-ng-tier-3",
};

export default function SubmitJobPage() {
  const router = useRouter();
  const [jobType, setJobType] = useState("llm-inference");
  const [modelId, setModelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(512);
  const [quantization, setQuantization] = useState("fp16");
  const [submitting, setSubmitting] = useState(false);

  // Filter models by job type
  const availableModels = MODELS.filter((m) => m.jobType === jobType);

  // Live estimate calculation
  const estimate = useMemo(() => {
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) return null;

    const vramFactor = QUANT_VRAM_FACTOR[quantization] ?? 1.0;
    const costFactor = QUANT_COST_FACTOR[quantization] ?? 1.0;
    const adjustedVram = parseFloat((model.vram * vramFactor).toFixed(1));
    const adjustedCost = parseFloat((model.costPerCall * costFactor).toFixed(4));

    // Tier can drop with aggressive quantization
    let tier = model.tier;
    let routesTo = model.routesTo;
    let confidence = model.confidence;
    if (quantization === "int4" && model.tier === "T2" && adjustedVram <= 16) {
      tier = "T1";
      routesTo = "MI210 partition";
    }
    if (quantization === "int4" && model.tier === "T3" && adjustedVram <= 64) {
      tier = "T2";
      routesTo = "MI300X partition";
    }

    return {
      vram: adjustedVram,
      confidence,
      tier,
      routesTo,
      cost: adjustedCost,
      savingsPct: model.savingsPct,
    };
  }, [modelId, quantization]);

  const canSubmit = modelId !== "" && prompt.trim().length > 0 && !submitting;
  const balanceTooLow = estimate ? estimate.cost > USER_BALANCE : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // Simulate submission delay
    await new Promise((r) => setTimeout(r, 900));
    toast("success", "Job submitted — tracking in Jobs");
    router.push("/dashboard/jobs");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-semibold">Submit Job</h1>
        <p className="text-sm text-[#8B96A1] mt-1">
          Configure and submit a new inference job to NeuralGrid
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Form */}
          <div className="lg:col-span-3 space-y-5">
            <div className="rounded-[10px] border border-[#212930] bg-[#12171C] p-5 space-y-4">
              {/* Job type */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-1.5">
                  Job Type
                </label>
                <select
                  value={jobType}
                  onChange={(e) => { setJobType(e.target.value); setModelId(""); }}
                  className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-[#E7EDF2] focus:outline-none focus:border-[#3DDC97]"
                >
                  {JOB_TYPES.map((jt) => (
                    <option key={jt.id} value={jt.id}>{jt.label}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-1.5">
                  Model
                </label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-[#E7EDF2] focus:outline-none focus:border-[#3DDC97]"
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} · {m.tier}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-1.5">
                  Prompt / Input
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Enter your prompt or input data..."
                  className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-[#E7EDF2] placeholder:text-[#5C6670] focus:outline-none focus:border-[#3DDC97] resize-none"
                />
              </div>

              {/* Max tokens */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-1.5">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={1}
                  max={32768}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                  className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-[#E7EDF2] focus:outline-none focus:border-[#3DDC97]"
                />
              </div>

              {/* Quantization */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-1.5">
                  Quantization
                </label>
                <select
                  value={quantization}
                  onChange={(e) => setQuantization(e.target.value)}
                  className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-[#E7EDF2] focus:outline-none focus:border-[#3DDC97]"
                >
                  {QUANTIZATIONS.map((q) => (
                    <option key={q.id} value={q.id}>{q.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={!canSubmit || balanceTooLow}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-mono font-semibold transition-colors",
                  canSubmit && !balanceTooLow
                    ? "bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90"
                    : "bg-[#212930] text-[#5C6670] cursor-not-allowed"
                )}
              >
                <Zap className="h-4 w-4" />
                {submitting ? "Submitting..." : "Submit Job"}
              </button>
              {balanceTooLow && (
                <div className="flex items-center gap-2 text-xs text-[#F5A623]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Insufficient balance</span>
                  <Link href="/dashboard/billing" className="underline inline-flex items-center gap-1">
                    Add funds <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Right: Estimator Preview */}
          <div className="lg:col-span-2">
            <div className="rounded-[10px] border border-[#212930] bg-[#12171C] p-5 sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2 w-2 rounded-full bg-[#3DDC97] animate-pulse" />
                <h3 className="text-sm font-semibold font-mono">Estimator Preview</h3>
              </div>

              {!estimate ? (
                <div className="text-xs text-[#5C6670] py-8 text-center">
                  Select a model to see routing estimate
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tier LED strip */}
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-[#5C6670] mb-2">
                      Tier
                    </span>
                    <div className="flex gap-2">
                      {(["T1", "T2", "T3"] as Tier[]).map((t) => (
                        <div
                          key={t}
                          className={cn(
                            "flex-1 h-2 rounded-full transition-all",
                            estimate.tier === t
                              ? TIER_COLORS[t]
                              : "bg-[#212930]"
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5">
                      <TierBadge tier={estimate.tier} />
                    </div>
                  </div>

                  {/* VRAM */}
                  <div className="flex justify-between items-center py-2 border-t border-[#212930]">
                    <span className="text-xs text-[#8B96A1] font-mono">VRAM needed</span>
                    <span className="text-sm font-semibold">{estimate.vram} GB</span>
                  </div>

                  {/* Confidence */}
                  <div className="flex justify-between items-center py-2 border-t border-[#212930]">
                    <span className="text-xs text-[#8B96A1] font-mono">Confidence</span>
                    <span
                      className={cn(
                        "text-xs font-mono font-semibold px-2 py-0.5 rounded",
                        estimate.confidence === "HIGH" && "bg-[#3DDC97]/10 text-[#3DDC97]",
                        estimate.confidence === "MEDIUM" && "bg-[#F5A623]/10 text-[#F5A623]",
                        estimate.confidence === "LOW" && "bg-[#FF5470]/10 text-[#FF5470]"
                      )}
                    >
                      {estimate.confidence}
                    </span>
                  </div>

                  {/* LOW confidence warning */}
                  {estimate.confidence === "LOW" && (
                    <div className="flex items-start gap-2 bg-[#F5A623]/5 border border-[#F5A623]/20 rounded-md px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#F5A623] mt-0.5 shrink-0" />
                      <span className="text-[11px] text-[#F5A623]">
                        We don&apos;t have exact specs for this model — routed one tier up
                      </span>
                    </div>
                  )}

                  {/* Routes to */}
                  <div className="flex justify-between items-center py-2 border-t border-[#212930]">
                    <span className="text-xs text-[#8B96A1] font-mono">Routes to</span>
                    <span className="text-xs font-mono text-[#E7EDF2]">{estimate.routesTo}</span>
                  </div>

                  {/* Estimated cost */}
                  <div className="flex justify-between items-center py-2 border-t border-[#212930]">
                    <span className="text-xs text-[#8B96A1] font-mono">Est. cost</span>
                    <span className="text-sm font-semibold text-[#3DDC97]">
                      ${estimate.cost.toFixed(4)}
                    </span>
                  </div>

                  {/* Savings */}
                  <div className="flex justify-between items-center py-2 border-t border-[#212930]">
                    <span className="text-xs text-[#8B96A1] font-mono">vs full MI300X</span>
                    <span className="text-xs font-mono font-semibold text-[#3DDC97]">
                      saves {estimate.savingsPct}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
