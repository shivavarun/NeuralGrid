"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { queueCardColor } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Activity,
  Layers,
} from "lucide-react";
import type { Provider } from "@/lib/types";

// --- Mock data ---
const MOCK_SUBSYSTEMS: Record<string, "green" | "amber" | "red"> = {
  "API Gateway": "green",
  "Job Queue": "green",
  Estimator: "green",
  "Provider Router": "amber",
  Billing: "green",
};

const MOCK_PROVIDERS: Array<{
  provider: Provider;
  status: "green" | "amber" | "red";
  lastPoll: string;
  nodesAvailable: number;
  circuitBreaker: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  jobs: { last1h: number; last24h: number };
}> = [
  {
    provider: "amd-cloud",
    status: "green",
    lastPoll: "2024-06-15T14:32:00Z",
    nodesAvailable: 12,
    circuitBreaker: "closed",
    consecutiveFailures: 0,
    jobs: { last1h: 45, last24h: 820 },
  },
  {
    provider: "vastai",
    status: "green",
    lastPoll: "2024-06-15T14:31:50Z",
    nodesAvailable: 28,
    circuitBreaker: "closed",
    consecutiveFailures: 0,
    jobs: { last1h: 32, last24h: 510 },
  },
  {
    provider: "runpod",
    status: "amber",
    lastPoll: "2024-06-15T14:30:00Z",
    nodesAvailable: 6,
    circuitBreaker: "half-open",
    consecutiveFailures: 3,
    jobs: { last1h: 8, last24h: 190 },
  },
  {
    provider: "fireworks",
    status: "green",
    lastPoll: "2024-06-15T14:32:05Z",
    nodesAvailable: 15,
    circuitBreaker: "closed",
    consecutiveFailures: 0,
    jobs: { last1h: 22, last24h: 380 },
  },
];

const MOCK_METRICS = {
  queued: 34,
  running: 12,
  successRate1h: 96.8,
  activeUsers24h: 147,
};

const MOCK_RECENT_FAILURES: Array<{
  id: string;
  model: string;
  provider: Provider;
  reason: string;
  time: string;
}> = [
  { id: "job_01HX3KDE6F7G8H9J0K1L2M3N", model: "llama-3-70b", provider: "runpod", reason: "GPU OOM", time: "2m ago" },
  { id: "job_01HX3KCD5E6F7G8H9J0K1L2M", model: "stable-diffusion-xl", provider: "runpod", reason: "Provider timeout", time: "5m ago" },
  { id: "job_01HX3KBC4D5E6F7G8H9J0K1L", model: "llama-3-8b", provider: "vastai", reason: "Node disconnected", time: "12m ago" },
  { id: "job_01HX3KAB2C3D4E5F6G7H8J9K", model: "mistral-7b", provider: "runpod", reason: "GPU OOM", time: "15m ago" },
  { id: "job_01HX3K9M7N2P4Q5R6S7T8U9V", model: "llama-3-70b", provider: "runpod", reason: "Provider timeout", time: "18m ago" },
  { id: "job_01HX3K8L6M1O3P4Q5R6S7T8U", model: "flux", provider: "vastai", reason: "VRAM exhausted", time: "25m ago" },
  { id: "job_01HX3K7K5L0N2O3P4Q5R6S7T", model: "whisper-large-v3", provider: "fireworks", reason: "Decode error", time: "32m ago" },
  { id: "job_01HX3K6J4K9M1N2O3P4Q5R6S", model: "llama-3-8b", provider: "amd-cloud", reason: "Timeout 120s", time: "40m ago" },
  { id: "job_01HX3K5I3J8L0M1N2O3P4Q5R", model: "stable-diffusion-xl", provider: "runpod", reason: "GPU OOM", time: "45m ago" },
  { id: "job_01HX3K4H2I7K9L0M1N2O3P4Q", model: "llama-3-70b", provider: "vastai", reason: "Node disconnected", time: "52m ago" },
  { id: "job_01HX3K3G1H6J8K9L0M1N2O3P", model: "mistral-7b", provider: "fireworks", reason: "Rate limited", time: "58m ago" },
  { id: "job_01HX3K2F0G5I7J8K9L0M1N2O", model: "flux", provider: "runpod", reason: "Provider timeout", time: "1h ago" },
  { id: "job_01HX3K1E9F4H6I7J8K9L0M1N", model: "llama-3-8b", provider: "amd-cloud", reason: "Decode error", time: "1h ago" },
  { id: "job_01HX3K0D8E3G5H6I7J8K9L0M", model: "llama-3-70b", provider: "vastai", reason: "GPU OOM", time: "1h ago" },
  { id: "job_01HX3JZC7D2F4G5H6I7J8K9L", model: "stable-diffusion-xl", provider: "runpod", reason: "Provider timeout", time: "2h ago" },
  { id: "job_01HX3JYB6C1E3F4G5H6I7J8K", model: "mistral-7b", provider: "fireworks", reason: "Node disconnected", time: "2h ago" },
  { id: "job_01HX3JXA5B0D2E3F4G5H6I7J", model: "llama-3-8b", provider: "amd-cloud", reason: "Timeout 120s", time: "3h ago" },
  { id: "job_01HX3JW94A9C1D2E3F4G5H6I", model: "flux", provider: "vastai", reason: "VRAM exhausted", time: "3h ago" },
  { id: "job_01HX3JV83Z8B0C1D2E3F4G5H", model: "llama-3-70b", provider: "runpod", reason: "GPU OOM", time: "4h ago" },
  { id: "job_01HX3JU72Y7A9B0C1D2E3F4G", model: "whisper-large-v3", provider: "fireworks", reason: "Decode error", time: "4h ago" },
];

function StatusDot({ status }: { status: "green" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        status === "green" && "bg-[#3DDC97] shadow-[0_0_4px_#3DDC97]",
        status === "amber" && "bg-[#F59E0B] shadow-[0_0_4px_#F59E0B]",
        status === "red" && "bg-[#FF5470] shadow-[0_0_4px_#FF5470]"
      )}
    />
  );
}

const PROVIDER_COLORS: Record<Provider, string> = {
  fireworks: "text-[#A78BFA]",
  vastai: "text-[#60A5FA]",
  runpod: "text-[#FB923C]",
  "amd-cloud": "text-[#FF5470]",
};

export default function AdminHomePage() {
  const queueColor = queueCardColor(MOCK_METRICS.queued);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Admin Dashboard</h1>

      {/* System Status Bar */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-3">
          System Status
        </h2>
        <div className="flex flex-wrap gap-4">
          {Object.entries(MOCK_SUBSYSTEMS).map(([name, status]) => (
            <div key={name} className="flex items-center gap-2">
              <StatusDot status={status} />
              <span className="text-sm text-[#8B96A1]">{name}</span>
            </div>
          ))}
          <div className="w-px h-5 bg-[#212930] mx-1" />
          {MOCK_PROVIDERS.map((p) => (
            <div key={p.provider} className="flex items-center gap-2">
              <StatusDot status={p.status} />
              <span className={cn("text-sm font-mono", PROVIDER_COLORS[p.provider])}>
                {p.provider}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Queue */}
        <Card
          className={cn(
            "border-[#212930] bg-[#12171C] p-4",
            queueColor === "amber" && "border-[#F59E0B]/30",
            queueColor === "red" && "border-[#FF5470]/30"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-4 w-4 text-[#5C6670]" />
            <span className="text-xs font-mono text-[#5C6670] uppercase">Queue</span>
          </div>
          <p
            className={cn(
              "text-2xl font-bold font-mono",
              queueColor === "normal" && "text-[#E7EDF2]",
              queueColor === "amber" && "text-[#F59E0B]",
              queueColor === "red" && "text-[#FF5470]"
            )}
          >
            {MOCK_METRICS.queued}
          </p>
        </Card>

        {/* Running */}
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-[#5C6670]" />
            <span className="text-xs font-mono text-[#5C6670] uppercase">Running</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#E7EDF2]">{MOCK_METRICS.running}</p>
        </Card>

        {/* Success Rate */}
        <Card
          className={cn(
            "border-[#212930] bg-[#12171C] p-4",
            MOCK_METRICS.successRate1h < 90 && "border-[#FF5470]/30"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-[#5C6670]" />
            <span className="text-xs font-mono text-[#5C6670] uppercase">1h Success</span>
          </div>
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-2xl font-bold font-mono",
                MOCK_METRICS.successRate1h >= 90 ? "text-[#3DDC97]" : "text-[#FF5470]"
              )}
            >
              {MOCK_METRICS.successRate1h}%
            </p>
            {MOCK_METRICS.successRate1h < 90 && (
              <AlertTriangle className="h-4 w-4 text-[#FF5470]" />
            )}
          </div>
        </Card>

        {/* Active Users */}
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#5C6670]" />
            <span className="text-xs font-mono text-[#5C6670] uppercase">24h Users</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#E7EDF2]">{MOCK_METRICS.activeUsers24h}</p>
        </Card>
      </div>

      {/* Recent Failures Feed */}
      <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1A2026]">
          <h2 className="text-sm font-semibold">Recent Failures</h2>
        </div>
        <div className="divide-y divide-[#1A2026] max-h-[480px] overflow-y-auto">
          {MOCK_RECENT_FAILURES.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#161C22] cursor-pointer transition-colors"
            >
              <span className="h-2 w-2 rounded-full bg-[#FF5470] shrink-0" />
              <span className="font-mono text-xs text-[#8B96A1] w-[100px] shrink-0 truncate">
                {f.id.slice(0, 14)}...
              </span>
              <span className="text-sm text-[#E7EDF2] w-[140px] shrink-0">{f.model}</span>
              <span className={cn("text-xs font-mono w-[90px] shrink-0", PROVIDER_COLORS[f.provider])}>
                {f.provider}
              </span>
              <span className="text-xs text-[#FF5470] flex-1 truncate">{f.reason}</span>
              <span className="text-xs text-[#5C6670] font-mono shrink-0">{f.time}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Per-Provider Health Summary */}
      <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1A2026]">
          <h2 className="text-sm font-semibold">Provider Health</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1A2026]">
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Provider</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Status</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Breaker</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Nodes</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Jobs 1h</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Jobs 24h</th>
              <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Failures</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_PROVIDERS.map((p) => (
              <tr key={p.provider} className="border-b border-[#1A2026] last:border-0">
                <td className={cn("px-4 py-2.5 font-mono text-sm font-medium", PROVIDER_COLORS[p.provider])}>
                  {p.provider}
                </td>
                <td className="px-4 py-2.5">
                  <StatusDot status={p.status} />
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-mono text-[10px]",
                      p.circuitBreaker === "closed" && "border-[#3DDC97] text-[#3DDC97]",
                      p.circuitBreaker === "half-open" && "border-[#F59E0B] text-[#F59E0B]",
                      p.circuitBreaker === "open" && "border-[#FF5470] text-[#FF5470]"
                    )}
                  >
                    {p.circuitBreaker}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-mono text-sm text-[#8B96A1]">{p.nodesAvailable}</td>
                <td className="px-4 py-2.5 font-mono text-sm text-[#8B96A1]">{p.jobs.last1h}</td>
                <td className="px-4 py-2.5 font-mono text-sm text-[#8B96A1]">{p.jobs.last24h}</td>
                <td className="px-4 py-2.5 font-mono text-sm">
                  <span className={p.consecutiveFailures > 0 ? "text-[#FF5470]" : "text-[#8B96A1]"}>
                    {p.consecutiveFailures}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
