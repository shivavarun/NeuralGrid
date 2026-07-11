"use client";

import { usePolling } from "@/lib/usePolling";
import { balanceColor } from "@/lib/format";
import { CostDisplay } from "@/components/shared/CostDisplay";
import { SavingsPill } from "@/components/shared/SavingsPill";
import { JobStatusBadge } from "@/components/shared/JobStatusBadge";
import { TierBadge } from "@/components/shared/TierBadge";
import { ProviderBadge } from "@/components/shared/ProviderBadge";
import { SkeletonScreen } from "@/components/shared/SkeletonScreen";
import { cn } from "@/lib/utils";
import { Zap, DollarSign, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { UiJobStatus, Tier, Provider, HardwareVendor } from "@/lib/types";

// --- Mock data (backend not wired yet) ---
interface HomeStats {
  jobsToday: number;
  jobsSucceeded: number;
  jobsFailed: number;
  spendToday: number;
  spendBaseline: number;
  savedToday: number;
  savedPct: number;
  balance: number;
  lastJobDaysAgo: number;
}

async function fetchHomeStats(): Promise<HomeStats> {
  // Mock — replace with real API call when backend is ready
  return {
    jobsToday: 47,
    jobsSucceeded: 44,
    jobsFailed: 3,
    spendToday: 0.0342,
    spendBaseline: 0.231,
    savedToday: 0.1968,
    savedPct: 85,
    balance: 4.23,
    lastJobDaysAgo: 0,
  };
}

// --- Live job feed mock ---
interface FeedJob {
  id: string;
  model: string;
  status: UiJobStatus;
  tier: Tier;
  provider: Provider;
  hardware_vendor: HardwareVendor;
  actual_cost_usd: number | null;
  runpod_a100_baseline_usd: number | null;
  created_at: string;
}

const MOCK_FEED: FeedJob[] = [
  { id: "job_01HX3K01", model: "llama-3-8b", status: "complete", tier: "T1", provider: "vastai", hardware_vendor: "AMD", actual_cost_usd: 0.0048, runpod_a100_baseline_usd: 0.037, created_at: new Date(Date.now() - 30_000).toISOString() },
  { id: "job_01HX3K02", model: "mistral-7b", status: "running", tier: "T1", provider: "vastai", hardware_vendor: "AMD", actual_cost_usd: null, runpod_a100_baseline_usd: null, created_at: new Date(Date.now() - 60_000).toISOString() },
  { id: "job_01HX3K03", model: "llama-3-70b", status: "complete", tier: "T2", provider: "amd-cloud", hardware_vendor: "AMD", actual_cost_usd: 0.172, runpod_a100_baseline_usd: 0.69, created_at: new Date(Date.now() - 120_000).toISOString() },
  { id: "job_01HX3K04", model: "stable-diffusion-xl", status: "failed", tier: "T1", provider: "runpod", hardware_vendor: "NVIDIA", actual_cost_usd: 0.0, runpod_a100_baseline_usd: 0.098, created_at: new Date(Date.now() - 180_000).toISOString() },
  { id: "job_01HX3K05", model: "flux", status: "complete", tier: "T2", provider: "vastai", hardware_vendor: "AMD", actual_cost_usd: 0.024, runpod_a100_baseline_usd: 0.11, created_at: new Date(Date.now() - 300_000).toISOString() },
  { id: "job_01HX3K06", model: "llama-3-8b", status: "complete", tier: "T1", provider: "fireworks", hardware_vendor: "AMD", actual_cost_usd: 0.0052, runpod_a100_baseline_usd: 0.037, created_at: new Date(Date.now() - 600_000).toISOString() },
  { id: "job_01HX3K07", model: "mistral-7b", status: "queued", tier: "T1", provider: "vastai", hardware_vendor: "AMD", actual_cost_usd: null, runpod_a100_baseline_usd: null, created_at: new Date(Date.now() - 900_000).toISOString() },
  { id: "job_01HX3K08", model: "llama-3-70b", status: "complete", tier: "T3", provider: "amd-cloud", hardware_vendor: "AMD", actual_cost_usd: 0.31, runpod_a100_baseline_usd: 1.2, created_at: new Date(Date.now() - 1200_000).toISOString() },
  { id: "job_01HX3K09", model: "stable-diffusion-xl", status: "complete", tier: "T1", provider: "vastai", hardware_vendor: "AMD", actual_cost_usd: 0.018, runpod_a100_baseline_usd: 0.098, created_at: new Date(Date.now() - 1800_000).toISOString() },
  { id: "job_01HX3K10", model: "llama-3-8b", status: "cancelled", tier: "T1", provider: "runpod", hardware_vendor: "NVIDIA", actual_cost_usd: 0.0, runpod_a100_baseline_usd: 0.037, created_at: new Date(Date.now() - 3600_000).toISOString() },
];

async function fetchJobFeed(): Promise<FeedJob[]> {
  return MOCK_FEED;
}

// --- 6-month spend chart mock ---
interface MonthlySpend {
  month: string;
  neuralgrid: number;
  a100: number;
}

const MOCK_MONTHLY: MonthlySpend[] = [
  { month: "Aug", neuralgrid: 1.2, a100: 8.4 },
  { month: "Sep", neuralgrid: 2.8, a100: 18.2 },
  { month: "Oct", neuralgrid: 4.1, a100: 27.6 },
  { month: "Nov", neuralgrid: 3.6, a100: 24.1 },
  { month: "Dec", neuralgrid: 5.9, a100: 38.4 },
  { month: "Jan", neuralgrid: 6.8, a100: 44.2 },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function StatCard({
  label,
  value,
  sub,
  subPositive,
  icon: Icon,
  live,
  balanceColorClass,
}: {
  label: string;
  value: string;
  sub: string;
  subPositive?: boolean;
  icon: React.ElementType;
  live?: boolean;
  balanceColorClass?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[#212930] bg-[#12171C] p-4 relative">
      {live && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 text-[9.5px] text-[#3DDC97] font-mono">
          <span className="h-[5px] w-[5px] rounded-full bg-[#3DDC97] animate-pulse" />
          live
        </span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-[#5C6670]" />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
          {label}
        </span>
      </div>
      <div
        className={cn(
          "font-display text-2xl font-semibold mb-1",
          balanceColorClass
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "text-xs",
          subPositive ? "text-[#3DDC97]" : "text-[#8B96A1]"
        )}
      >
        {sub}
      </div>
    </div>
  );
}

function QuickActionPanel() {
  return (
    <div className="rounded-[10px] border border-[#212930] bg-[#12171C] p-5">
      <h3 className="font-display text-sm font-semibold mb-2">
        Ready to get started?
      </h3>
      <p className="text-xs text-[#8B96A1] mb-4">
        You haven&apos;t submitted a job in over 7 days. Pick up where you left
        off.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard/jobs/new"
          className="inline-flex items-center gap-2 rounded-md bg-[#3DDC97] px-4 py-2 text-xs font-mono font-semibold text-[#06140D] hover:bg-[#3DDC97]/90 transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          Submit a Job
        </Link>
        <Link
          href="/dashboard/docs"
          className="inline-flex items-center rounded-md border border-[#212930] bg-[#0D1116] px-4 py-2 text-xs font-mono text-[#8B96A1] hover:text-[#E7EDF2] hover:border-[#5C6670] transition-colors"
        >
          View Docs
        </Link>
      </div>
    </div>
  );
}

const BALANCE_COLOR_MAP: Record<string, string> = {
  green: "text-[#3DDC97]",
  amber: "text-[#F5A623]",
  red: "text-[#FF5470]",
};

export default function HomePage() {
  const router = useRouter();
  const { data: stats } = usePolling(fetchHomeStats, 5000);
  const { data: feed } = usePolling(fetchJobFeed, 5000);

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonScreen key={i} shape="stat-card" />
        ))}
      </div>
    );
  }

  const bColor = balanceColor(stats.balance);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Jobs today"
          value={String(stats.jobsToday)}
          sub={`${stats.jobsSucceeded} succeeded, ${stats.jobsFailed} failed`}
          icon={Zap}
          live
        />
        <StatCard
          label="Spend today"
          value={`$${stats.spendToday.toFixed(4)}`}
          sub={`vs $${stats.spendBaseline.toFixed(4)} without NeuralGrid`}
          icon={DollarSign}
          live
        />
        <StatCard
          label="Saved today"
          value={`$${stats.savedToday.toFixed(4)}`}
          sub={`${stats.savedPct}% below baseline`}
          subPositive
          icon={PiggyBank}
          live
        />
        <StatCard
          label="Balance"
          value={`$${stats.balance.toFixed(2)}`}
          sub="Top up if under $1.00"
          icon={Wallet}
          balanceColorClass={BALANCE_COLOR_MAP[bColor]}
        />
      </div>

      {/* Quick-action panel — shown only if no job in last 7 days */}
      {stats.lastJobDaysAgo >= 7 && <QuickActionPanel />}

      {/* Live Job Feed */}
      <div className="rounded-[10px] border border-[#212930] bg-[#12171C] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#212930] flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Jobs</h3>
          <span className="inline-flex items-center gap-1.5 text-[9.5px] text-[#3DDC97] font-mono">
            <span className="h-[5px] w-[5px] rounded-full bg-[#3DDC97] animate-pulse" />
            live
          </span>
        </div>
        {!feed ? (
          <div className="p-4">
            <SkeletonScreen shape="table-rows" rows={5} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#212930] text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Model</th>
                  <th className="text-left px-4 py-2">Tier</th>
                  <th className="text-left px-4 py-2">Provider</th>
                  <th className="text-left px-4 py-2">Cost</th>
                  <th className="text-left px-4 py-2">Saved</th>
                  <th className="text-right px-4 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {feed.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => router.push(`/dashboard/jobs/${job.id}`)}
                    className="border-b border-[#212930] last:border-b-0 hover:bg-[#1A2028] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <JobStatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {job.model}
                    </td>
                    <td className="px-4 py-2.5">
                      <TierBadge tier={job.tier} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ProviderBadge
                        provider={job.provider}
                        hardwareVendor={job.hardware_vendor}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <CostDisplay value={job.actual_cost_usd} />
                    </td>
                    <td className="px-4 py-2.5">
                      <SavingsPill
                        actualCost={job.actual_cost_usd}
                        baselineCost={job.runpod_a100_baseline_usd}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground font-mono">
                      {relativeTime(job.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6-Month Spend Chart */}
      <div className="rounded-[10px] border border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-4">
          6-Month Spend: NeuralGrid vs A100 Equivalent
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={MOCK_MONTHLY} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis dataKey="month" tick={{ fill: "#8B96A1", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#8B96A1", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#12171C", border: "1px solid #212930", borderRadius: 8 }}
              labelStyle={{ color: "#E7EDF2" }}
              formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "neuralgrid" ? "NeuralGrid" : "A100 Equivalent"]}
            />
            <Legend
              formatter={(value: string) => (value === "neuralgrid" ? "NeuralGrid" : "A100 Equivalent")}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="neuralgrid" fill="#3DDC97" radius={[4, 4, 0, 0]} />
            <Bar dataKey="a100" fill="#5C6670" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
