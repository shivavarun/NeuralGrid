import { NextResponse } from "next/server";

const MODELS = ["llama-3-8b", "mistral-7b", "llama-3-70b", "stable-diffusion-xl", "flux"];
const STATUSES = ["complete", "running", "queued", "failed", "cancelled"] as const;
const TIERS = ["T1", "T1", "T2", "T3", "T2"] as const; // aligned with MODELS
const PROVIDERS = ["vastai", "amd-cloud", "fireworks", "runpod"] as const;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET() {
  const jobsToday = 47 + Math.floor(Math.random() * 6);
  const jobsFailed = 2 + Math.floor(Math.random() * 3);
  const jobsSucceeded = jobsToday - jobsFailed;

  const stats = {
    jobsToday,
    jobsSucceeded,
    jobsFailed,
    spendToday: parseFloat(rand(0.028, 0.045).toFixed(4)),
    spendBaseline: parseFloat(rand(0.2, 0.28).toFixed(4)),
    savedToday: parseFloat(rand(0.17, 0.23).toFixed(4)),
    savedPct: 82 + Math.floor(Math.random() * 8),
    balance: parseFloat(rand(3.8, 5.2).toFixed(2)),
    lastJobDaysAgo: 0,
  };

  const feed = Array.from({ length: 10 }, (_, i) => {
    const modelIdx = Math.floor(Math.random() * MODELS.length);
    const status = pickRandom(STATUSES);
    const hasCost = status === "complete";
    const baseCost = [0.0048, 0.0019, 0.172, 0.018, 0.024][modelIdx];
    const baselineUsd = [0.037, 0.032, 0.69, 0.098, 0.11][modelIdx];
    return {
      id: `job_${Date.now().toString(36)}_${i}`,
      model: MODELS[modelIdx],
      status,
      tier: TIERS[modelIdx],
      provider: pickRandom(PROVIDERS),
      hardware_vendor: "AMD",
      actual_cost_usd: hasCost ? parseFloat((baseCost * rand(0.8, 1.2)).toFixed(4)) : null,
      runpod_a100_baseline_usd: baselineUsd,
      created_at: new Date(Date.now() - i * 45000 - Math.random() * 30000).toISOString(),
    };
  });

  return NextResponse.json({ stats, feed });
}
