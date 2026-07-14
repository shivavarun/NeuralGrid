import { NextResponse, type NextRequest } from "next/server";

interface ModelSpec {
  tier: "T1" | "T2" | "T3";
  vram: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  routesTo: string;
  costPerCall: number;
  savingsPct: number;
}

const MODEL_MAP: Record<string, ModelSpec> = {
  "llama-3-8b": { tier: "T1", vram: 8.5, confidence: "HIGH", routesTo: "MI210 partition", costPerCall: 0.0023, savingsPct: 92 },
  "mistral-7b": { tier: "T1", vram: 7.8, confidence: "HIGH", routesTo: "MI210 partition", costPerCall: 0.0019, savingsPct: 94 },
  "llama-3-70b": { tier: "T3", vram: 62, confidence: "HIGH", routesTo: "MI300X full node", costPerCall: 0.172, savingsPct: 75 },
  "stable-diffusion-xl": { tier: "T2", vram: 8, confidence: "HIGH", routesTo: "MI300X partition", costPerCall: 0.018, savingsPct: 82 },
  "flux": { tier: "T2", vram: 12, confidence: "MEDIUM", routesTo: "MI300X partition", costPerCall: 0.024, savingsPct: 78 },
};

// Quantization adjustments (multiplicative on VRAM)
const QUANT_VRAM_FACTOR: Record<string, number> = {
  fp16: 1.0,
  int8: 0.55,
  int4: 0.3,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const model = searchParams.get("model") || "";
  const quantization = searchParams.get("quantization") || "fp16";

  const spec = MODEL_MAP[model];
  if (!spec) {
    return NextResponse.json({ error: "unknown_model" }, { status: 400 });
  }

  const vramFactor = QUANT_VRAM_FACTOR[quantization] ?? 1.0;
  const adjustedVram = parseFloat((spec.vram * vramFactor).toFixed(1));

  // int4 can potentially drop a tier
  let { tier, routesTo, confidence } = spec;
  if (quantization === "int4" && spec.tier === "T2" && adjustedVram <= 16) {
    tier = "T1";
    routesTo = "MI210 partition";
  }
  if (quantization === "int4" && spec.tier === "T3" && adjustedVram <= 64) {
    tier = "T2";
    routesTo = "MI300X partition";
  }

  // Cost scales with quantization (less VRAM = cheaper)
  const costFactor = quantization === "int8" ? 0.7 : quantization === "int4" ? 0.5 : 1.0;
  const cost = parseFloat((spec.costPerCall * costFactor).toFixed(4));

  return NextResponse.json({
    model,
    quantization,
    tier,
    vram: adjustedVram,
    confidence,
    routesTo,
    costPerCall: cost,
    savingsPct: spec.savingsPct,
  });
}
