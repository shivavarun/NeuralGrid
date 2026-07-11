// Problem_Section data — waste from always using a full MI300X node
export interface WasteFactorRow {
  taskType: string;
  tierNeeded: string;
  tierTypicallyUsed: string;
  wasteFactor: string;
}

export const WASTE_FACTORS: WasteFactorRow[] = [
  { taskType: 'LLM inference, 7B model', tierNeeded: 'MI210 partition — T1', tierTypicallyUsed: 'Full MI300X — T3', wasteFactor: '5–10×' },
  { taskType: 'Image generation (SDXL-class)', tierNeeded: 'MI300X partition — T2', tierTypicallyUsed: 'Full MI300X — T3', wasteFactor: '3–5×' },
  { taskType: 'Fine-tune, small LLM', tierNeeded: 'MI300X partition — T2', tierTypicallyUsed: 'Full MI300X — T3', wasteFactor: '3–4×' },
  { taskType: 'Audio generation', tierNeeded: 'MI210 partition — T1', tierTypicallyUsed: 'Full MI300X — T3', wasteFactor: '5–8×' },
];
