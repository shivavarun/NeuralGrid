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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/shared/JobStatusBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { ProviderBadge } from "@/components/shared/ProviderBadge";
import { CostDisplay } from "@/components/shared/CostDisplay";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { computeMargin, formatCost } from "@/lib/format";
import { Download, X } from "lucide-react";
import type { Tier, Provider, HardwareVendor, UiJobStatus } from "@/lib/types";

// --- Extended admin job row ---
interface AdminJobRow {
  id: string;
  model: string;
  tier: Tier;
  status: UiJobStatus;
  provider?: Provider;
  hardware_vendor?: HardwareVendor;
  actual_cost_usd?: number | null;
  runpod_a100_baseline_usd?: number | null;
  created_at: string;
  // Admin-only fields
  developer_email: string;
  provider_node_id?: string; // backend gap for some
  internal_cost_usd?: number | null; // backend gap
  billed_cost_usd?: number | null; // backend gap
  failure_reason?: string;
}

// --- Mock data ---
const MOCK_ADMIN_JOBS: AdminJobRow[] = [
  {
    id: "job_01HX3KDE6F7G8H9J0K1L2M3N",
    model: "llama-3-70b",
    tier: "T3",
    status: "failed",
    provider: "runpod",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0,
    created_at: "2024-06-15T14:32:00Z",
    developer_email: "alice@example.com",
    provider_node_id: "rp-node-42a",
    internal_cost_usd: 0.0320,
    billed_cost_usd: 0.0410,
    failure_reason: "GPU OOM",
  },
  {
    id: "job_01HX3KCD5E6F7G8H9J0K1L2M",
    model: "llama-3-8b",
    tier: "T1",
    status: "complete",
    provider: "amd-cloud",
    hardware_vendor: "AMD",
    actual_cost_usd: 0.0048,
    runpod_a100_baseline_usd: 0.037,
    created_at: "2024-06-15T14:14:00Z",
    developer_email: "bob@startup.io",
    provider_node_id: "amd-mi300-007",
    internal_cost_usd: 0.0035,
    billed_cost_usd: 0.0048,
  },
  {
    id: "job_01HX3KBC4D5E6F7G8H9J0K1L",
    model: "stable-diffusion-xl",
    tier: "T2",
    status: "complete",
    provider: "vastai",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0.018,
    runpod_a100_baseline_usd: 0.082,
    created_at: "2024-06-15T14:10:00Z",
    developer_email: "alice@example.com",
    provider_node_id: "vast-4090-12",
    internal_cost_usd: 0.0120,
    billed_cost_usd: 0.018,
  },
  {
    id: "job_01HX3KAB2C3D4E5F6G7H8J9K",
    model: "mistral-7b",
    tier: "T1",
    status: "running",
    provider: "fireworks",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: null,
    created_at: "2024-06-15T14:08:00Z",
    developer_email: "charlie@dev.co",
    provider_node_id: "fw-a100-03",
    internal_cost_usd: null,
    billed_cost_usd: null,
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
    developer_email: "bob@startup.io",
    provider_node_id: "amd-mi300-003",
    internal_cost_usd: 0.0028,
    billed_cost_usd: 0.0042,
  },
  {
    id: "job_01HX3K8L6M1O3P4Q5R6S7T8U",
    model: "flux",
    tier: "T2",
    status: "failed",
    provider: "runpod",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0,
    created_at: "2024-06-15T12:45:00Z",
    developer_email: "diana@corp.com",
    provider_node_id: "rp-node-19b",
    internal_cost_usd: 0.0085,
    billed_cost_usd: 0.0000,
    failure_reason: "Provider timeout",
  },
  {
    id: "job_01HX3K7K5L0N2O3P4Q5R6S7T",
    model: "llama-3-70b",
    tier: "T3",
    status: "complete",
    provider: "vastai",
    hardware_vendor: "NVIDIA",
    actual_cost_usd: 0.089,
    runpod_a100_baseline_usd: 0.142,
    created_at: "2024-06-15T11:20:00Z",
    developer_email: "charlie@dev.co",
    provider_node_id: "vast-a100-08",
    internal_cost_usd: 0.0650,
    billed_cost_usd: 0.089,
  },
];

// --- Detail view ---
function AdminJobDetail({
  job,
  onClose,
}: {
  job: AdminJobRow;
  onClose: () => void;
}) {
  const margin =
    job.billed_cost_usd != null && job.internal_cost_usd != null
      ? computeMargin(job.billed_cost_usd, job.internal_cost_usd)
      : null;

  return (
    <Card className="border-[#212930] bg-[#12171C] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold font-display">Job Detail (Admin)</h3>
        <button onClick={onClose} className="text-[#8B96A1] hover:text-[#E7EDF2]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-[#5C6670] text-xs block">Job ID</span>
          <span className="font-mono text-xs">{job.id}</span>
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Developer</span>
          <span className="text-xs">{job.developer_email}</span>
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Model</span>
          <span className="text-xs">{job.model}</span>
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Provider Node</span>
          <span className="font-mono text-xs">{job.provider_node_id ?? "—"}</span>
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Internal Cost</span>
          {job.internal_cost_usd != null ? (
            <span className="font-mono text-xs">{formatCost(job.internal_cost_usd)}</span>
          ) : (
            <span className="text-xs italic text-[#5C6670]">pending</span>
          )}
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Billed Cost</span>
          {job.billed_cost_usd != null ? (
            <span className="font-mono text-xs">{formatCost(job.billed_cost_usd)}</span>
          ) : (
            <span className="text-xs italic text-[#5C6670]">pending</span>
          )}
        </div>
        <div>
          <span className="text-[#5C6670] text-xs block">Margin</span>
          {margin ? (
            <span
              className={cn(
                "font-mono text-xs",
                margin.dollars >= 0 ? "text-[#3DDC97]" : "text-[#FF5470]"
              )}
            >
              {margin.dollars >= 0 ? "+" : ""}
              {formatCost(margin.dollars)}{" "}
              {margin.pct !== null && `(${margin.pct >= 0 ? "+" : ""}${margin.pct.toFixed(1)}%)`}
            </span>
          ) : (
            <span className="text-xs italic text-[#5C6670]">—</span>
          )}
        </div>
        {job.failure_reason && (
          <div>
            <span className="text-[#5C6670] text-xs block">Failure Reason</span>
            <span className="text-xs text-[#FF5470]">{job.failure_reason}</span>
          </div>
        )}
      </div>

      {/* Backend gap fields */}
      <div className="pt-2 border-t border-[#1A2026]">
        <p className="text-[10.5px] text-[#5C6670] mb-2 font-mono">
          Internal timeline / Estimator debug / Retry history
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </div>
    </Card>
  );
}

export default function AdminJobsPage() {
  const [devFilter, setDevFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [failureFilter, setFailureFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<AdminJobRow | null>(null);

  const filteredJobs = useMemo(() => {
    return MOCK_ADMIN_JOBS.filter((job) => {
      if (devFilter && !job.developer_email.toLowerCase().includes(devFilter.toLowerCase()))
        return false;
      if (providerFilter && job.provider !== providerFilter) return false;
      if (failureFilter && !(job.failure_reason || "").toLowerCase().includes(failureFilter.toLowerCase()))
        return false;
      return true;
    });
  }, [devFilter, providerFilter, failureFilter]);

  const handleExportCSV = () => {
    const headers = [
      "Job ID",
      "Developer",
      "Model",
      "Tier",
      "Status",
      "Provider",
      "Node ID",
      "Internal Cost",
      "Billed Cost",
      "Margin $",
      "Margin %",
      "Failure Reason",
    ];
    const rows = filteredJobs.map((j) => {
      const m =
        j.billed_cost_usd != null && j.internal_cost_usd != null
          ? computeMargin(j.billed_cost_usd, j.internal_cost_usd)
          : null;
      return [
        j.id,
        j.developer_email,
        j.model,
        j.tier,
        j.status,
        j.provider ?? "",
        j.provider_node_id ?? "",
        j.internal_cost_usd?.toFixed(4) ?? "",
        j.billed_cost_usd?.toFixed(4) ?? "",
        m ? m.dollars.toFixed(4) : "",
        m?.pct != null ? m.pct.toFixed(1) : "",
        j.failure_reason ?? "",
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin-jobs-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold font-display">All Jobs (Admin)</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-[#212930] text-[#8B96A1] hover:text-[#E7EDF2]"
          onClick={handleExportCSV}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Admin Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Developer email..."
          value={devFilter}
          onChange={(e) => setDevFilter(e.target.value)}
          className="h-8 w-[180px] bg-[#0D1116] border-[#212930] text-xs font-mono"
        />
        <Input
          placeholder="Provider..."
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="h-8 w-[130px] bg-[#0D1116] border-[#212930] text-xs font-mono"
        />
        <Input
          placeholder="Failure reason..."
          value={failureFilter}
          onChange={(e) => setFailureFilter(e.target.value)}
          className="h-8 w-[160px] bg-[#0D1116] border-[#212930] text-xs font-mono"
        />
      </div>

      {/* Selected job detail */}
      {selectedJob && (
        <AdminJobDetail job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}

      {/* Table */}
      <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
        {filteredJobs.length === 0 ? (
          <EmptyState variant="no-filter-match" onAction={() => { setDevFilter(""); setProviderFilter(""); setFailureFilter(""); }} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1A2026] hover:bg-transparent">
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Developer</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Job ID</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Model</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Tier</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Provider</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Node</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Status</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Internal</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Billed</TableHead>
                  <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => {
                  const margin =
                    job.billed_cost_usd != null && job.internal_cost_usd != null
                      ? computeMargin(job.billed_cost_usd, job.internal_cost_usd)
                      : null;
                  return (
                    <TableRow
                      key={job.id}
                      className="border-[#1A2026] hover:bg-[#161C22] cursor-pointer"
                      onClick={() => setSelectedJob(job)}
                    >
                      <TableCell className="text-xs text-[#8B96A1] max-w-[140px] truncate">
                        {job.developer_email}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#8B96A1]">
                        {job.id.slice(0, 18)}...
                      </TableCell>
                      <TableCell className="text-sm">{job.model}</TableCell>
                      <TableCell><TierBadge tier={job.tier} /></TableCell>
                      <TableCell>
                        {job.provider && (
                          <ProviderBadge provider={job.provider} hardwareVendor={job.hardware_vendor} />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[#8B96A1]">
                        {job.provider_node_id ?? "—"}
                      </TableCell>
                      <TableCell><JobStatusBadge status={job.status} /></TableCell>
                      <TableCell>
                        <CostDisplay value={job.internal_cost_usd} pending={job.internal_cost_usd == null} />
                      </TableCell>
                      <TableCell>
                        <CostDisplay value={job.billed_cost_usd} pending={job.billed_cost_usd == null} />
                      </TableCell>
                      <TableCell>
                        {margin ? (
                          <span
                            className={cn(
                              "font-mono text-xs",
                              margin.dollars >= 0 ? "text-[#3DDC97]" : "text-[#FF5470]"
                            )}
                          >
                            {margin.dollars >= 0 ? "+" : ""}
                            {formatCost(margin.dollars)}
                            {margin.pct !== null && (
                              <span className="text-[#5C6670] ml-1">
                                ({margin.pct >= 0 ? "+" : ""}{margin.pct.toFixed(0)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs italic text-[#5C6670]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* EmptyState for fields backend doesn't return */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <p className="text-xs font-mono text-[#5C6670] mb-2">
          Revenue breakdown / Internal timeline / Estimator debug — requires /v1/admin/jobs endpoint
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </Card>
    </div>
  );
}
