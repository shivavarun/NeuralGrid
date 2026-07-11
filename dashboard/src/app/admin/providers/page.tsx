"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  RotateCcw,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { Provider, Tier } from "@/lib/types";

// --- Mock provider data ---
interface ProviderNode {
  nodeId: string;
  gpu: string;
  vram: number;
  tier: Tier;
  priceUsdPerHr: number;
  status: "available" | "busy" | "offline";
  warmModels: string[];
}

interface ProviderData {
  provider: Provider;
  status: "green" | "amber" | "red";
  circuitBreaker: "closed" | "open" | "half-open";
  cooldownRemainingSec?: number;
  lastPoll: string;
  consecutiveFailures: number;
  nodes: ProviderNode[];
}

const MOCK_PROVIDERS: ProviderData[] = [
  {
    provider: "amd-cloud",
    status: "green",
    circuitBreaker: "closed",
    lastPoll: "2024-06-15T14:32:00Z",
    consecutiveFailures: 0,
    nodes: [
      { nodeId: "amd-mi300-003", gpu: "MI300X", vram: 192, tier: "T3", priceUsdPerHr: 2.10, status: "available", warmModels: ["llama-3-70b"] },
      { nodeId: "amd-mi300-007", gpu: "MI300X", vram: 192, tier: "T3", priceUsdPerHr: 2.10, status: "busy", warmModels: ["llama-3-70b", "mistral-7b"] },
      { nodeId: "amd-mi250-001", gpu: "MI250", vram: 128, tier: "T2", priceUsdPerHr: 1.40, status: "available", warmModels: ["stable-diffusion-xl"] },
      { nodeId: "amd-mi210-012", gpu: "MI210", vram: 64, tier: "T1", priceUsdPerHr: 0.80, status: "available", warmModels: ["llama-3-8b", "mistral-7b"] },
    ],
  },
  {
    provider: "vastai",
    status: "green",
    circuitBreaker: "closed",
    lastPoll: "2024-06-15T14:31:50Z",
    consecutiveFailures: 0,
    nodes: [
      { nodeId: "vast-4090-12", gpu: "RTX 4090", vram: 24, tier: "T1", priceUsdPerHr: 0.45, status: "available", warmModels: ["llama-3-8b"] },
      { nodeId: "vast-a100-08", gpu: "A100 80GB", vram: 80, tier: "T3", priceUsdPerHr: 1.80, status: "busy", warmModels: ["llama-3-70b"] },
      { nodeId: "vast-3090-22", gpu: "RTX 3090", vram: 24, tier: "T1", priceUsdPerHr: 0.30, status: "offline", warmModels: [] },
    ],
  },
  {
    provider: "runpod",
    status: "amber",
    circuitBreaker: "half-open",
    cooldownRemainingSec: 45,
    lastPoll: "2024-06-15T14:30:00Z",
    consecutiveFailures: 3,
    nodes: [
      { nodeId: "rp-node-42a", gpu: "A100 40GB", vram: 40, tier: "T2", priceUsdPerHr: 1.20, status: "available", warmModels: ["flux"] },
      { nodeId: "rp-node-19b", gpu: "A100 80GB", vram: 80, tier: "T3", priceUsdPerHr: 1.90, status: "offline", warmModels: [] },
    ],
  },
  {
    provider: "fireworks",
    status: "green",
    circuitBreaker: "closed",
    lastPoll: "2024-06-15T14:32:05Z",
    consecutiveFailures: 0,
    nodes: [
      { nodeId: "fw-a100-03", gpu: "A100 80GB", vram: 80, tier: "T3", priceUsdPerHr: 1.75, status: "available", warmModels: ["llama-3-70b", "mistral-7b"] },
      { nodeId: "fw-a10-07", gpu: "A10", vram: 24, tier: "T1", priceUsdPerHr: 0.50, status: "busy", warmModels: ["llama-3-8b"] },
    ],
  },
];

const PROVIDER_COLORS: Record<Provider, string> = {
  fireworks: "text-[#A78BFA]",
  vastai: "text-[#60A5FA]",
  runpod: "text-[#FB923C]",
  "amd-cloud": "text-[#FF5470]",
};

const PROVIDER_BG: Record<Provider, string> = {
  fireworks: "border-[#A78BFA]/20",
  vastai: "border-[#60A5FA]/20",
  runpod: "border-[#FB923C]/20",
  "amd-cloud": "border-[#FF5470]/20",
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

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

function ProviderCard({ data }: { data: ProviderData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={cn("border-[#212930] bg-[#12171C] overflow-hidden", PROVIDER_BG[data.provider])}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StatusDot status={data.status} />
            <h3 className={cn("text-sm font-bold font-mono", PROVIDER_COLORS[data.provider])}>
              {data.provider}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "font-mono text-[10px]",
              data.circuitBreaker === "closed" && "border-[#3DDC97] text-[#3DDC97]",
              data.circuitBreaker === "half-open" && "border-[#F59E0B] text-[#F59E0B]",
              data.circuitBreaker === "open" && "border-[#FF5470] text-[#FF5470]"
            )}
          >
            {data.circuitBreaker}
            {data.cooldownRemainingSec != null && ` (${data.cooldownRemainingSec}s)`}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <span className="text-[#5C6670] block">Last Poll</span>
            <span className="font-mono text-[#8B96A1]">{formatTime(data.lastPoll)}</span>
          </div>
          <div>
            <span className="text-[#5C6670] block">Consecutive Failures</span>
            <span className={cn("font-mono", data.consecutiveFailures > 0 ? "text-[#FF5470]" : "text-[#8B96A1]")}>
              {data.consecutiveFailures}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-[#212930] text-[#8B96A1] hover:text-[#E7EDF2]">
            <RefreshCw className="h-3 w-3" />
            Force Poll
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-[#212930] text-[#8B96A1] hover:text-[#E7EDF2]">
            <RotateCcw className="h-3 w-3" />
            Reset Breaker
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-[#FF5470]/30 text-[#FF5470] hover:bg-[#FF5470]/10">
            <PowerOff className="h-3 w-3" />
            Disable
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 border-[#3DDC97]/30 text-[#3DDC97] hover:bg-[#3DDC97]/10">
            <Power className="h-3 w-3" />
            Re-enable
          </Button>
        </div>

        {/* Expand nodes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-[#8B96A1] hover:text-[#E7EDF2] transition-colors"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {data.nodes.length} nodes
        </button>
      </div>

      {/* Expandable node table */}
      {expanded && (
        <div className="border-t border-[#1A2026] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2026] hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Node ID</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">GPU</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">VRAM</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Tier</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">$/hr</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Status</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Warm Models</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.nodes.map((node) => (
                <TableRow key={node.nodeId} className="border-[#1A2026]">
                  <TableCell className="font-mono text-xs text-[#8B96A1]">{node.nodeId}</TableCell>
                  <TableCell className="text-xs">{node.gpu}</TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">{node.vram}GB</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        node.tier === "T1" && "border-[#3DDC97] text-[#3DDC97]",
                        node.tier === "T2" && "border-[#F59E0B] text-[#F59E0B]",
                        node.tier === "T3" && "border-[#FF5470] text-[#FF5470]"
                      )}
                    >
                      {node.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">${node.priceUsdPerHr.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px]",
                        node.status === "available" && "border-[#3DDC97] text-[#3DDC97]",
                        node.status === "busy" && "border-[#F59E0B] text-[#F59E0B]",
                        node.status === "offline" && "border-[#FF5470] text-[#FF5470]"
                      )}
                    >
                      {node.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-[#8B96A1] max-w-[150px] truncate">
                    {node.warmModels.length > 0 ? node.warmModels.join(", ") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export default function AdminProvidersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Providers (Admin)</h1>

      {/* Provider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {MOCK_PROVIDERS.map((p) => (
          <ProviderCard key={p.provider} data={p} />
        ))}
      </div>

      {/* Backend gap: per-tier inventory */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-2">Per-Tier Node Inventory & Price Cache Freshness</h3>
        <p className="text-xs text-[#5C6670] font-mono mb-2">
          Requires perTierInventory and priceCacheFreshness fields on /internal/health
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </Card>
    </div>
  );
}
