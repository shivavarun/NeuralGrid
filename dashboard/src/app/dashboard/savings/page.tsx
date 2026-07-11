"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatCost } from "@/lib/format";

// Mock data for MVP
const MOCK_SAVINGS = {
  total_saved_usd: 41.28,
  job_count: 1204,
  avg_savings_pct: 85,
  per_model: [
    { model: "llama-3-8b", jobs: 680, avg_neuralgrid_usd: 0.0048, avg_a100_usd: 0.037, avg_savings_pct: 87 },
    { model: "mistral-7b", jobs: 310, avg_neuralgrid_usd: 0.0042, avg_a100_usd: 0.032, avg_savings_pct: 87 },
    { model: "llama-3-70b", jobs: 89, avg_neuralgrid_usd: 0.172, avg_a100_usd: 0.690, avg_savings_pct: 75 },
    { model: "stable-diffusion-xl", jobs: 95, avg_neuralgrid_usd: 0.018, avg_a100_usd: 0.098, avg_savings_pct: 82 },
    { model: "flux", jobs: 30, avg_neuralgrid_usd: 0.024, avg_a100_usd: 0.110, avg_savings_pct: 78 },
  ],
};

// What-If Calculator pricing (cost per job by model, mock)
const MODEL_PRICING: Record<string, { neuralgrid: number; a100: number; aws: number }> = {
  "llama-3-8b": { neuralgrid: 0.0048, a100: 0.037, aws: 0.045 },
  "mistral-7b": { neuralgrid: 0.0042, a100: 0.032, aws: 0.040 },
  "llama-3-70b": { neuralgrid: 0.172, a100: 0.690, aws: 0.820 },
  "stable-diffusion-xl": { neuralgrid: 0.018, a100: 0.098, aws: 0.120 },
  "flux": { neuralgrid: 0.024, a100: 0.110, aws: 0.135 },
};

const MODELS = Object.keys(MODEL_PRICING);

export default function SavingsPage() {
  return (
    <div className="space-y-6">
      {/* Hero Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#12171C] border-[#212930]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Total Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400 font-display">
              {formatCost(MOCK_SAVINGS.total_saved_usd)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              vs going direct to RunPod A100
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#12171C] border-[#212930]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Job Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground font-display">
              {MOCK_SAVINGS.job_count.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">since signup</p>
          </CardContent>
        </Card>

        <Card className="bg-[#12171C] border-[#212930]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Avg Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-400 font-display">
              {MOCK_SAVINGS.avg_savings_pct}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">below A100 baseline</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-model Breakdown Table */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Per-Model Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-[#212930] hover:bg-transparent">
                <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Model</TableHead>
                <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Jobs</TableHead>
                <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Avg NeuralGrid</TableHead>
                <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Avg A100</TableHead>
                <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Savings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_SAVINGS.per_model.map((row) => (
                <TableRow key={row.model} className="border-[#212930]">
                  <TableCell className="font-mono text-sm">{row.model}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.jobs}</TableCell>
                  <TableCell className="font-mono text-sm">{formatCost(row.avg_neuralgrid_usd)}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{formatCost(row.avg_a100_usd)}</TableCell>
                  <TableCell className="font-mono text-sm font-semibold text-green-400">{row.avg_savings_pct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Chart Placeholder */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Cumulative Savings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center rounded-lg border border-dashed border-[#212930] bg-[#0A0D10]">
            <p className="text-sm text-muted-foreground font-mono">
              Savings chart coming soon
            </p>
          </div>
        </CardContent>
      </Card>

      {/* What-If Calculator */}
      <WhatIfCalculator />
    </div>
  );
}


function WhatIfCalculator() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [monthlyJobs, setMonthlyJobs] = useState(500);

  const projection = useMemo(() => {
    const pricing = MODEL_PRICING[selectedModel] ?? MODEL_PRICING["llama-3-8b"];
    const count = Math.max(0, monthlyJobs || 0);
    const monthlyCostNg = pricing.neuralgrid * count;
    const monthlyCostA100 = pricing.a100 * count;
    const monthlyCostAws = pricing.aws * count;
    const annualSavings = (monthlyCostA100 - monthlyCostNg) * 12;
    return { monthlyCostNg, monthlyCostA100, monthlyCostAws, annualSavings };
  }, [selectedModel, monthlyJobs]);

  return (
    <Card className="bg-[#12171C] border-[#212930]">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">What-If Calculator</CardTitle>
        <p className="text-xs text-muted-foreground">
          Project your costs across providers. Works with zero history.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#3DDC97]"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              Monthly Jobs
            </label>
            <Input
              type="number"
              min={0}
              value={monthlyJobs}
              onChange={(e) => setMonthlyJobs(Number(e.target.value))}
              className="bg-[#0A0D10] border-[#212930]"
            />
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
          <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-3 text-center">
            <div className="text-xs text-muted-foreground font-mono uppercase mb-1">
              NeuralGrid / mo
            </div>
            <div className="text-lg font-bold text-[#3DDC97] font-mono">
              {formatCost(projection.monthlyCostNg)}
            </div>
          </div>
          <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-3 text-center">
            <div className="text-xs text-muted-foreground font-mono uppercase mb-1">
              Full MI300X / mo
            </div>
            <div className="text-lg font-bold text-foreground font-mono">
              {formatCost(projection.monthlyCostA100)}
            </div>
          </div>
          <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-3 text-center">
            <div className="text-xs text-muted-foreground font-mono uppercase mb-1">
              AWS / mo
            </div>
            <div className="text-lg font-bold text-foreground font-mono">
              {formatCost(projection.monthlyCostAws)}
            </div>
          </div>
          <div className="rounded-lg border border-[#3DDC97]/30 bg-[#3DDC97]/5 p-3 text-center">
            <div className="text-xs text-[#3DDC97] font-mono uppercase mb-1">
              Annual Savings
            </div>
            <div className="text-lg font-bold text-[#3DDC97] font-mono">
              {formatCost(projection.annualSavings)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
