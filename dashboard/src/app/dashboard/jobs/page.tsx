"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { JobStatusBadge } from "@/components/shared/JobStatusBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { ProviderBadge } from "@/components/shared/ProviderBadge";
import { CostDisplay } from "@/components/shared/CostDisplay";
import { SavingsPill } from "@/components/shared/SavingsPill";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import type { JobRow } from "@/lib/types";

// --- Sample data for MVP ---
const SAMPLE_JOBS: JobRow[] = [
  {
    id: "job_01HX3KDE6F7G8H9J0K1L2M3N",
    model: "llama-3-8b",
    tier: "T1",
    status: "complete",
    provider: "amd-cloud",
    hardware_vendor: "AMD",
    actual_cost_usd: 0.0048,
    runpod_a100_baseline_usd: 0.037,
    created_at: "2024-06-15T14:32:00Z",
  },
  {
    id: "job_01HX3KCD5E6F7G8H9J0K1L2M",
    model: "mistral-7b",
    tier: "T1",
    status: "failed",
    provider: "amd-cloud",
    hardware_vendor: "AMD",
    actual_cost_usd: 0,
    runpod_a100_baseline_usd: null,
    created_at: "2024-06-15T14:14:00Z",
  },
  {
    id: "job_01HX3KBC4D5E6F7G8H9J0K1L",
    model: "llama-3-70b",
    tier: "T3",
    status: "queued",
    provider: "amd-cloud",
    hardware_vendor: "AMD",
    actual_cost_usd: null,
    runpod_a100_baseline_usd: null,
    created_at: "2024-06-15T14:10:00Z",
  },
  {
    id: "job_01HX3KAB2C3D4E5F6G7H8J9K",
    model: "stable-diffusion-xl",
    tier: "T2",
    status: "running",
    provider: "vastai",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: null,
    runpod_a100_baseline_usd: null,
    created_at: "2024-06-15T14:08:00Z",
  },
  {
    id: "job_01HX3K9M7N2P4Q5R6S7T8U9V",
    model: "llama-3-8b",
    tier: "T1",
    status: "complete",
    provider: "amd-cloud",
    hardware_vendor: "AMD",
    actual_cost_usd: 0.0042,
    runpod_a100_baseline_usd: 0.044,
    created_at: "2024-06-15T13:30:00Z",
  },
  {
    id: "job_01HX3K8L6M1O3P4Q5R6S7T8U",
    model: "flux",
    tier: "T2",
    status: "complete",
    provider: "runpod",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0.018,
    runpod_a100_baseline_usd: 0.082,
    created_at: "2024-06-15T12:45:00Z",
  },
  {
    id: "job_01HX3K7K5L0N2O3P4Q5R6S7T",
    model: "llama-3-8b",
    tier: "T1",
    status: "complete",
    provider: "fireworks",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0.0031,
    runpod_a100_baseline_usd: 0.035,
    created_at: "2024-06-15T11:20:00Z",
  },
];

type StatusFilter = "all" | "running" | "complete" | "failed" | "queued";

const STATUS_PILLS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Running", value: "running" },
  { label: "Complete", value: "complete" },
  { label: "Failed", value: "failed" },
  { label: "Queued", value: "queued" },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modelSearch, setModelSearch] = useState("");
  const hasJobs = SAMPLE_JOBS.length > 0;

  const filteredJobs = useMemo(() => {
    return SAMPLE_JOBS.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (
        modelSearch &&
        !job.model.toLowerCase().includes(modelSearch.toLowerCase())
      )
        return false;
      return true;
    });
  }, [statusFilter, modelSearch]);

  if (!hasJobs) {
    return <EmptyState variant="no-jobs" />;
  }

  return (
    <div className="rounded-[10px] border border-[#212930] bg-[#12171C] overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[#1A2026]">
        {STATUS_PILLS.map((pill) => (
          <button
            key={pill.value}
            onClick={() => setStatusFilter(pill.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-mono transition-colors",
              statusFilter === pill.value
                ? "bg-[rgba(61,220,151,0.12)] border-[#3DDC97] text-[#3DDC97]"
                : "bg-[#0D1116] border-[#212930] text-[#8B96A1] hover:border-[#5C6670]"
            )}
          >
            {pill.label}
          </button>
        ))}
        <select className="rounded-md border border-[#212930] bg-[#0D1116] px-3 py-1.5 text-xs font-mono text-[#8B96A1]">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>All time</option>
        </select>
        <Input
          placeholder="Filter by model..."
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          className="h-8 w-[160px] bg-[#0D1116] border-[#212930] text-xs font-mono text-[#8B96A1] placeholder:text-[#5C6670]"
        />
      </div>

      {/* Table or empty state */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          variant="no-filter-match"
          onAction={() => {
            setStatusFilter("all");
            setModelSearch("");
          }}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-[#1A2026] hover:bg-transparent">
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Job ID
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Model
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Tier
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Provider
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Status
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Cost
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Saved
              </TableHead>
              <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                Submitted
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.map((job) => (
              <TableRow
                key={job.id}
                className="border-[#1A2026] hover:bg-[#161C22] cursor-pointer"
              >
                <TableCell className="font-mono text-xs text-[#8B96A1]">
                  {job.id.slice(0, 14)}...
                </TableCell>
                <TableCell className="text-sm">{job.model}</TableCell>
                <TableCell>
                  <TierBadge tier={job.tier} />
                </TableCell>
                <TableCell>
                  {job.provider && (
                    <ProviderBadge
                      provider={job.provider}
                      hardwareVendor={job.hardware_vendor}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell>
                  <CostDisplay
                    value={job.actual_cost_usd}
                    pending={
                      job.status === "queued" ||
                      job.status === "running" ||
                      job.status === "estimating"
                    }
                  />
                </TableCell>
                <TableCell>
                  <SavingsPill
                    actualCost={job.actual_cost_usd}
                    baselineCost={job.runpod_a100_baseline_usd}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs text-[#8B96A1]">
                  {formatRelativeTime(job.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
