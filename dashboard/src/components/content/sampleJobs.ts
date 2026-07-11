export type Tier = 'T1' | 'T2' | 'T3';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SampleJob {
  name: string;
  vramGb: number;       // 0.1–100
  confidence: ConfidenceLevel;
  tier: Tier;
  provider: string;
  costUsd: number;      // 0.0001–1.00
}

export const SAMPLE_JOBS: SampleJob[] = [
  { name: 'llama-3-8b · inference',    vramGb: 8.5,  confidence: 'HIGH',   tier: 'T1', provider: 'MI210 partition',    costUsd: 0.0023 },
  { name: 'sdxl · image gen',          vramGb: 8.0,  confidence: 'HIGH',   tier: 'T1', provider: 'MI210 partition',    costUsd: 0.0180 },
  { name: 'mistral-7b · fine-tune',    vramGb: 19.4, confidence: 'MEDIUM', tier: 'T2', provider: 'MI300X partition',   costUsd: 0.0410 },
  { name: 'llama-3-70b · inference',   vramGb: 62.0, confidence: 'HIGH',   tier: 'T3', provider: 'MI300X full node',   costUsd: 0.1720 },
  { name: 'musicgen-large · audio',    vramGb: 8.0,  confidence: 'MEDIUM', tier: 'T1', provider: 'MI210 partition',    costUsd: 0.0095 },
];
