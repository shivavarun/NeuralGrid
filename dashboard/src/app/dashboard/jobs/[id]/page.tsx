"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, ChevronDown, ChevronUp, RotateCcw, ClipboardCopy, Download, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/shared/JobStatusBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { ProviderBadge } from "@/components/shared/ProviderBadge";
import { CostDisplay } from "@/components/shared/CostDisplay";
import { usePolling } from "@/lib/usePolling";
import { formatCost, showRetryAction } from "@/lib/format";
import type { UiJobStatus, Tier, Provider } from "@/lib/types";

// Mock data for MVP
interface JobDetail {
  id: string;
  model: string;
  tier: Tier;
  status: UiJobStatus;
  provider: Provider;
  hardware_vendor: "AMD" | "NVIDIA";
  actual_cost_usd: number | null;
  runpod_a100_baseline_usd: number | null;
  created_at: string;
  completed_at: string | null;
  estimator_reasoning: string;
  output_type: "text" | "image" | "audio" | "embedding";
  result?: {
    text?: string;
    image_url?: string;
    audio_url?: string;
    embeddings?: number[];
  };
  job_spec: Record<string, unknown>;
}

const MOCK_JOB: JobDetail = {
  id: "job_01HX3KDE6F7G8H9J0K1L2M3N",
  model: "llama-3-8b",
  tier: "T1",
  status: "complete",
  provider: "vastai",
  hardware_vendor: "AMD",
  actual_cost_usd: 0.0048,
  runpod_a100_baseline_usd: 0.0370,
  created_at: "2025-01-15T10:23:00Z",
  completed_at: "2025-01-15T10:23:42Z",
  estimator_reasoning:
    "Model llama-3-8b requires ~8.5 GB VRAM (int8). Routed to T1 (MI210 partition, 16 GB available). High confidence — exact model profile in registry. Provider selected: Vast.ai MI210 node at $0.12/hr, estimated 144s runtime.",
  output_type: "text",
  result: {
    text: "Quantum computing leverages quantum mechanical phenomena like superposition and entanglement to perform calculations that would be impractical for classical computers, potentially solving certain complex problems exponentially faster.",
    embeddings: [0.0234, -0.1456, 0.3892, -0.0012, 0.5671, -0.2345, 0.1234, 0.8901, -0.4567, 0.0089, 0.7654, -0.3210],
  },
  job_spec: { model: "llama-3-8b", prompt: "Explain quantum computing in one sentence.", max_tokens: 100 },
};

const TERMINAL_STATUSES: UiJobStatus[] = ["complete", "failed", "cancelled"];

function isTerminal(status: UiJobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  // Poll at 5s while non-terminal
  const { data: job } = usePolling<JobDetail>(
    async () => {
      // MVP: return mock data
      return { ...MOCK_JOB, id: jobId || MOCK_JOB.id };
    },
    5000,
    { enabled: !isTerminal(MOCK_JOB.status) }
  );

  const display = job ?? MOCK_JOB;

  const copyId = async () => {
    await navigator.clipboard.writeText(display.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const savingsUsd =
    display.actual_cost_usd != null && display.runpod_a100_baseline_usd != null
      ? display.runpod_a100_baseline_usd - display.actual_cost_usd
      : null;

  const savingsPct =
    display.actual_cost_usd != null &&
    display.runpod_a100_baseline_usd != null &&
    display.runpod_a100_baseline_usd > 0
      ? ((display.runpod_a100_baseline_usd - display.actual_cost_usd) /
          display.runpod_a100_baseline_usd) *
        100
      : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/dashboard/jobs")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </button>

      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-foreground">
            {display.id}
          </h1>
          <Button variant="ghost" size="sm" onClick={copyId} className="h-7 px-2">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <JobStatusBadge status={display.status} />
          <span className="text-sm text-muted-foreground">{display.model}</span>
          <TierBadge tier={display.tier} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground font-mono">
          <span>Created: {new Date(display.created_at).toLocaleString()}</span>
          {display.completed_at && (
            <span>Completed: {new Date(display.completed_at).toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Cost Breakdown Panel */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide mb-1">
                Actual Cost
              </div>
              <CostDisplay value={display.actual_cost_usd} className="text-base font-bold" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide mb-1">
                Tier
              </div>
              <TierBadge tier={display.tier} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide mb-1">
                Provider
              </div>
              <ProviderBadge
                provider={display.provider}
                hardwareVendor={display.hardware_vendor}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide mb-1">
                Savings vs A100
              </div>
              {savingsUsd != null && savingsPct != null ? (
                <div>
                  <span className="text-base font-bold text-green-400">
                    {formatCost(savingsUsd)}
                  </span>
                  <span className="ml-2 text-xs text-green-400 font-mono">
                    ({savingsPct.toFixed(0)}%)
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">—</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estimator Reasoning Collapsible */}
      <Card className="bg-[#12171C] border-[#212930]">
        <button
          onClick={() => setReasoningOpen(!reasoningOpen)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold">Estimator Reasoning</span>
          {reasoningOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {reasoningOpen && (
          <CardContent className="pt-0 pb-4">
            <p className="text-sm text-muted-foreground font-mono leading-relaxed">
              {display.estimator_reasoning}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Result Panel — type-specific */}
      {display.status === "complete" && display.result && (
        <Card className="bg-[#12171C] border-[#212930]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Result</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Text result */}
            {display.output_type === "text" && display.result.text && (
              <pre className="rounded-lg bg-[#0A0D10] border border-[#212930] p-4 text-sm font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
                {display.result.text}
              </pre>
            )}

            {/* Image result */}
            {display.output_type === "image" && display.result.image_url && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#212930] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={display.result.image_url}
                    alt="Job result"
                    className="w-full h-auto"
                  />
                </div>
                <Button variant="outline" size="sm" className="border-[#212930]" asChild>
                  <a href={display.result.image_url} download>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download Image
                  </a>
                </Button>
              </div>
            )}

            {/* Audio result */}
            {display.output_type === "audio" && display.result.audio_url && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-4">
                  <audio controls className="w-full" src={display.result.audio_url}>
                    <track kind="captions" />
                  </audio>
                </div>
                <Button variant="outline" size="sm" className="border-[#212930]" asChild>
                  <a href={display.result.audio_url} download>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download Audio
                  </a>
                </Button>
              </div>
            )}

            {/* Embedding result */}
            {display.output_type === "embedding" && display.result.embeddings && (
              <div className="space-y-3">
                <div className="rounded-lg bg-[#0A0D10] border border-[#212930] p-4">
                  <div className="font-mono text-xs text-muted-foreground mb-2">
                    First 10 dimensions:
                  </div>
                  <div className="font-mono text-sm text-foreground">
                    [{display.result.embeddings.slice(0, 10).join(", ")}
                    {display.result.embeddings.length > 10 ? ", ..." : ""}]
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#212930]"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(display.result!.embeddings)],
                      { type: "application/json" }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${display.id}_embeddings.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download Full Vector
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job Actions */}
      <div className="flex flex-wrap gap-3">
        {/* Retry — only for failed */}
        {showRetryAction(display.status) && (
          <Button
            variant="outline"
            className="border-[#212930] text-red-400 hover:text-red-300 hover:border-red-500/50"
            onClick={() => {
              // Mock retry: would POST /v1/jobs with same spec
              alert("Retrying job with same specification...");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Retry Job
          </Button>
        )}

        {/* Clone — for completed */}
        {display.status === "complete" && (
          <Button
            variant="outline"
            className="border-[#212930]"
            onClick={() => {
              // Mock clone: navigate to job creation pre-filled
              alert("Opening job form pre-filled with this spec...");
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
            Clone Job
          </Button>
        )}

        {/* Download Result */}
        {display.status === "complete" && display.result && (
          <Button
            variant="outline"
            className="border-[#212930]"
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify(display.result, null, 2)],
                { type: "application/json" }
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${display.id}_result.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download Result
          </Button>
        )}

        {/* Copy Job Spec */}
        <Button
          variant="outline"
          className="border-[#212930]"
          onClick={async () => {
            await navigator.clipboard.writeText(
              JSON.stringify(display.job_spec, null, 2)
            );
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" />
          Copy Job Spec
        </Button>
      </div>
    </div>
  );
}
