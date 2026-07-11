"use client";

import { Card } from "@/components/ui/card";
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
import { estimatorAlertState, type AccuracyRecord } from "@/lib/format";
import { AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";

// --- Mock 7-day accuracy data ---
const MOCK_ACCURACY_RECORDS: AccuracyRecord[] = [
  ...Array(72).fill({ classification: "correct" as const }),
  ...Array(18).fill({ classification: "over" as const }),
  ...Array(10).fill({ classification: "under" as const }),
];

const totalJobs = MOCK_ACCURACY_RECORDS.length;
const correctCount = MOCK_ACCURACY_RECORDS.filter((r) => r.classification === "correct").length;
const overCount = MOCK_ACCURACY_RECORDS.filter((r) => r.classification === "over").length;
const underCount = MOCK_ACCURACY_RECORDS.filter((r) => r.classification === "under").length;

const correctRate = ((correctCount / totalJobs) * 100).toFixed(1);
const overRate = ((overCount / totalJobs) * 100).toFixed(1);
const underRate = ((underCount / totalJobs) * 100).toFixed(1);

const alertState = estimatorAlertState(MOCK_ACCURACY_RECORDS);

// Per-model accuracy table data
const MOCK_MODEL_ACCURACY = [
  { model: "llama-3-70b", jobs: 32, correct: 26, over: 4, under: 2 },
  { model: "llama-3-8b", jobs: 25, correct: 20, over: 3, under: 2 },
  { model: "mistral-7b", jobs: 18, correct: 14, over: 3, under: 1 },
  { model: "stable-diffusion-xl", jobs: 15, correct: 8, over: 5, under: 2 },
  { model: "flux", jobs: 10, correct: 4, over: 3, under: 3 },
];

function AlertBanner({ state }: { state: "no-data" | "ok" | "alert" }) {
  if (state === "no-data") {
    return (
      <Card className="border-[#212930] bg-[#12171C] p-4 flex items-center gap-3">
        <TrendingDown className="h-5 w-5 text-[#5C6670]" />
        <div>
          <p className="text-sm font-semibold text-[#8B96A1]">No accuracy data</p>
          <p className="text-xs text-[#5C6670]">
            No estimator records available for analysis.
          </p>
        </div>
      </Card>
    );
  }

  if (state === "alert") {
    return (
      <Card className="border-[#FF5470]/30 bg-[#FF5470]/5 p-4 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-[#FF5470]" />
        <div>
          <p className="text-sm font-semibold text-[#FF5470]">Under-estimation alert</p>
          <p className="text-xs text-[#8B96A1]">
            Under-estimation rate exceeds 5% threshold. Jobs may be under-provisioned.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[#3DDC97]/30 bg-[#3DDC97]/5 p-4 flex items-center gap-3">
      <CheckCircle className="h-5 w-5 text-[#3DDC97]" />
      <div>
        <p className="text-sm font-semibold text-[#3DDC97]">Estimator healthy</p>
        <p className="text-xs text-[#8B96A1]">
          Under-estimation rate is within acceptable limits (≤ 5%).
        </p>
      </div>
    </Card>
  );
}

export default function AdminEstimatorPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Estimator Accuracy</h1>

      {/* Alert banner */}
      <AlertBanner state={alertState} />

      {/* 7-day accuracy stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Total Jobs (7d)</p>
          <p className="text-lg font-bold font-mono text-[#E7EDF2]">{totalJobs}</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Correct Rate</p>
          <p className="text-lg font-bold font-mono text-[#3DDC97]">{correctRate}%</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Over-estimation</p>
          <p className="text-lg font-bold font-mono text-[#F59E0B]">{overRate}%</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Under-estimation</p>
          <p className="text-lg font-bold font-mono text-[#FF5470]">{underRate}%</p>
        </Card>
      </div>

      {/* Per-model accuracy table */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-3">Per-Model Accuracy</h3>
        <Table>
          <TableHeader>
            <TableRow className="border-[#1A2026] hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Model</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Jobs</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Correct</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Over</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Under</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_MODEL_ACCURACY.map((row) => (
              <TableRow key={row.model} className="border-[#1A2026]">
                <TableCell className="font-mono text-xs text-[#E7EDF2]">{row.model}</TableCell>
                <TableCell className="font-mono text-xs text-[#8B96A1]">{row.jobs}</TableCell>
                <TableCell className="font-mono text-xs text-[#3DDC97]">{row.correct}</TableCell>
                <TableCell className="font-mono text-xs text-[#F59E0B]">{row.over}</TableCell>
                <TableCell className="font-mono text-xs text-[#FF5470]">{row.under}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Model Registry Editor placeholder */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-2">Model Registry Editor</h3>
        <p className="text-xs text-[#5C6670] font-mono mb-2">
          Requires model registry CRUD endpoints (backend gap)
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </Card>
    </div>
  );
}
