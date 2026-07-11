"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCost } from "@/lib/format";
import {
  Rocket,
  ArrowRightLeft,
  BookOpen,
  Cpu,
  Code2,
  Bell,
  Play,
  Copy,
  Check,
} from "lucide-react";

// --- Mock model list (from GET /v1/models) ---
const MOCK_MODELS = [
  { id: "llama-3-8b", name: "Llama 3 8B", tier: "T1", type: "text" },
  { id: "llama-3-70b", name: "Llama 3 70B", tier: "T3", type: "text" },
  { id: "mistral-7b", name: "Mistral 7B", tier: "T1", type: "text" },
  { id: "stable-diffusion-xl", name: "Stable Diffusion XL", tier: "T2", type: "image" },
  { id: "flux", name: "Flux", tier: "T2", type: "image" },
  { id: "whisper-large-v3", name: "Whisper Large V3", tier: "T2", type: "audio" },
];

// --- API Endpoints reference ---
const API_ENDPOINTS = [
  { method: "POST", path: "/v1/jobs", description: "Submit a new inference job" },
  { method: "GET", path: "/v1/jobs/:id", description: "Get job status and result" },
  { method: "GET", path: "/v1/jobs", description: "List all jobs" },
  { method: "GET", path: "/v1/jobs/:id/cost-comparison", description: "Get cost comparison for a job" },
  { method: "GET", path: "/v1/models", description: "List available models" },
  { method: "GET", path: "/v1/models/:id/estimate", description: "Get cost estimate for a model" },
  { method: "POST", path: "/v1/keys", description: "Create a new API key" },
  { method: "POST", path: "/v1/keys/:id/revoke", description: "Revoke an API key" },
  { method: "GET", path: "/v1/analytics/savings", description: "Get savings analytics" },
  { method: "GET", path: "/v1/analytics/what-if", description: "What-if cost calculator" },
  { method: "GET", path: "/v1/billing/summary", description: "Get billing summary" },
  { method: "GET", path: "/v1/billing/invoices", description: "List invoices" },
];

// --- Section navigation ---
const SECTIONS = [
  { id: "quickstart", label: "Quickstart", icon: Rocket },
  { id: "migration", label: "OpenAI Migration", icon: ArrowRightLeft },
  { id: "api-reference", label: "API Reference", icon: BookOpen },
  { id: "models", label: "Models", icon: Cpu },
  { id: "code-samples", label: "Code Samples", icon: Code2 },
  { id: "webhooks", label: "Webhooks", icon: Bell },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// --- Code samples ---
const CURL_SAMPLE = `curl -X POST https://api.neuralgrid.ai/v1/jobs \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "llama-3-8b",
    "input": { "prompt": "Explain quantum computing in simple terms" },
    "output": { "max_tokens": 512 }
  }'`;

const PYTHON_SAMPLE = `import openai

client = openai.OpenAI(
    base_url="https://api.neuralgrid.ai/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="llama-3-8b",
    messages=[{"role": "user", "content": "Explain quantum computing"}],
    max_tokens=512,
)
print(response.choices[0].message.content)`;

const OPENAI_DIFF = `# OpenAI → NeuralGrid migration
# Change only the base URL and API key.

- import openai
+ import openai

  client = openai.OpenAI(
-     api_key="sk-...",
+     base_url="https://api.neuralgrid.ai/v1",
+     api_key="ng-...",
  )

  # All other code stays the same!
  response = client.chat.completions.create(
      model="llama-3-8b",  # Use NeuralGrid model names
      messages=[{"role": "user", "content": "Hello"}],
  )`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1.5 rounded bg-[#1A2026] text-[#8B96A1] hover:text-[#E7EDF2] transition-colors"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("quickstart");
  const [codeTab, setCodeTab] = useState<"curl" | "python">("curl");

  // --- API Explorer state ---
  const [explorerModel, setExplorerModel] = useState<string>("");
  const [explorerPrompt, setExplorerPrompt] = useState("");
  const [explorerMaxTokens, setExplorerMaxTokens] = useState("512");

  const canRun = explorerModel !== "" && explorerPrompt.trim().length > 0;

  const estimatedCost = useMemo(() => {
    if (!explorerModel || !explorerPrompt) return null;
    // Mock estimate based on model tier
    const model = MOCK_MODELS.find((m) => m.id === explorerModel);
    if (!model) return null;
    const inputTokens = Math.ceil(explorerPrompt.length / 4);
    const maxTokens = parseInt(explorerMaxTokens) || 512;
    const ratePerToken = model.tier === "T1" ? 0.000001 : model.tier === "T2" ? 0.000003 : 0.00001;
    return (inputTokens + maxTokens) * ratePerToken;
  }, [explorerModel, explorerPrompt, explorerMaxTokens]);

  return (
    <div className="flex gap-6 min-h-[calc(100vh-56px)]">
      {/* Left section nav */}
      <nav className="hidden lg:flex flex-col w-[200px] shrink-0 sticky top-0 pt-1">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#5C6670] mb-3 px-2">
          Documentation
        </h2>
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-[13px] font-medium text-left transition-colors",
                activeSection === section.id
                  ? "bg-[rgba(61,220,151,0.12)] text-[#3DDC97]"
                  : "text-[#8B96A1] hover:bg-[#161C22] hover:text-[#E7EDF2]"
              )}
            >
              <Icon className="h-4 w-4 opacity-80" />
              {section.label}
            </button>
          );
        })}
      </nav>

      {/* Right content */}
      <div className="flex-1 max-w-4xl space-y-8">
        {/* Quickstart */}
        {activeSection === "quickstart" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">Quickstart</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              Get up and running with NeuralGrid in under 2 minutes. OpenAI-compatible API — change your base URL and go.
            </p>

            <div className="space-y-4">
              <Card className="border-[#212930] bg-[#12171C] p-5">
                <h3 className="text-sm font-semibold mb-3">1. Get your API key</h3>
                <p className="text-[#8B96A1] text-sm">
                  Head to <span className="text-[#3DDC97] font-mono">/dashboard/api-keys</span> and create a new key.
                  Copy it immediately — it won&apos;t be shown again.
                </p>
              </Card>
              <Card className="border-[#212930] bg-[#12171C] p-5">
                <h3 className="text-sm font-semibold mb-3">2. Make your first request</h3>
                <p className="text-[#8B96A1] text-sm mb-3">
                  Point any OpenAI-compatible client at <span className="font-mono text-[#3DDC97]">https://api.neuralgrid.ai/v1</span>
                </p>
                <div className="relative rounded-md bg-[#0A0D10] border border-[#1A2026] p-4 font-mono text-xs text-[#8B96A1] overflow-x-auto">
                  <CopyButton text={CURL_SAMPLE} />
                  <pre className="whitespace-pre-wrap">{CURL_SAMPLE}</pre>
                </div>
              </Card>
              <Card className="border-[#212930] bg-[#12171C] p-5">
                <h3 className="text-sm font-semibold mb-3">3. Check your savings</h3>
                <p className="text-[#8B96A1] text-sm">
                  After your job completes, check the cost comparison at{" "}
                  <span className="font-mono text-[#3DDC97]">/dashboard/savings</span>.
                  NeuralGrid automatically routes to the cheapest provider.
                </p>
              </Card>
            </div>
          </section>
        )}

        {/* OpenAI Migration */}
        {activeSection === "migration" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">OpenAI Migration</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              Switch from OpenAI in 2 lines. NeuralGrid is fully compatible with the OpenAI SDK.
            </p>
            <div className="relative rounded-md bg-[#0A0D10] border border-[#1A2026] p-4 font-mono text-xs overflow-x-auto">
              <CopyButton text={OPENAI_DIFF} />
              <pre className="whitespace-pre-wrap">
                {OPENAI_DIFF.split("\n").map((line, i) => (
                  <span
                    key={i}
                    className={cn(
                      "block",
                      line.startsWith("+") && "text-[#3DDC97] bg-[rgba(61,220,151,0.08)]",
                      line.startsWith("-") && "text-[#FF5470] bg-[rgba(255,84,112,0.08)]",
                      !line.startsWith("+") && !line.startsWith("-") && "text-[#8B96A1]"
                    )}
                  >
                    {line}
                  </span>
                ))}
              </pre>
            </div>
          </section>
        )}

        {/* API Reference */}
        {activeSection === "api-reference" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">API Reference</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              All endpoints follow REST conventions. Base URL: <span className="font-mono text-[#3DDC97]">https://api.neuralgrid.ai</span>
            </p>
            <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1A2026]">
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Method</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Path</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {API_ENDPOINTS.map((ep) => (
                    <tr key={`${ep.method}-${ep.path}`} className="border-b border-[#1A2026] last:border-0">
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px]",
                            ep.method === "POST" ? "border-[#3DDC97] text-[#3DDC97]" : "border-[#60A5FA] text-[#60A5FA]"
                          )}
                        >
                          {ep.method}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[#E7EDF2]">{ep.path}</td>
                      <td className="px-4 py-2.5 text-[#8B96A1] text-xs">{ep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Models */}
        {activeSection === "models" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">Models</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              Available models, routed automatically to the cheapest provider with sufficient VRAM.
            </p>
            <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1A2026]">
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Model ID</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Name</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Tier</th>
                    <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_MODELS.map((m) => (
                    <tr key={m.id} className="border-b border-[#1A2026] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#E7EDF2]">{m.id}</td>
                      <td className="px-4 py-2.5 text-[#8B96A1]">{m.name}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px]",
                            m.tier === "T1" && "border-[#3DDC97] text-[#3DDC97]",
                            m.tier === "T2" && "border-[#F59E0B] text-[#F59E0B]",
                            m.tier === "T3" && "border-[#FF5470] text-[#FF5470]"
                          )}
                        >
                          {m.tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-[#8B96A1] text-xs">{m.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        )}

        {/* Code Samples */}
        {activeSection === "code-samples" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">Code Samples</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              Copy-paste examples to get started quickly.
            </p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCodeTab("curl")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-mono transition-colors",
                  codeTab === "curl"
                    ? "bg-[rgba(61,220,151,0.12)] border-[#3DDC97] text-[#3DDC97]"
                    : "bg-[#0D1116] border-[#212930] text-[#8B96A1] hover:border-[#5C6670]"
                )}
              >
                cURL
              </button>
              <button
                onClick={() => setCodeTab("python")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-mono transition-colors",
                  codeTab === "python"
                    ? "bg-[rgba(61,220,151,0.12)] border-[#3DDC97] text-[#3DDC97]"
                    : "bg-[#0D1116] border-[#212930] text-[#8B96A1] hover:border-[#5C6670]"
                )}
              >
                Python
              </button>
            </div>
            <div className="relative rounded-md bg-[#0A0D10] border border-[#1A2026] p-4 font-mono text-xs text-[#8B96A1] overflow-x-auto">
              <CopyButton text={codeTab === "curl" ? CURL_SAMPLE : PYTHON_SAMPLE} />
              <pre className="whitespace-pre-wrap">
                {codeTab === "curl" ? CURL_SAMPLE : PYTHON_SAMPLE}
              </pre>
            </div>
          </section>
        )}

        {/* Webhooks */}
        {activeSection === "webhooks" && (
          <section>
            <h1 className="text-2xl font-bold font-display mb-2">Webhooks</h1>
            <p className="text-[#8B96A1] text-sm mb-6">
              Receive real-time notifications when jobs complete or fail.
            </p>
            <Card className="border-[#212930] bg-[#12171C] p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Setup</h3>
                <p className="text-[#8B96A1] text-sm">
                  Configure a webhook URL in your{" "}
                  <span className="font-mono text-[#3DDC97]">/dashboard/settings</span> page.
                  NeuralGrid will POST a JSON payload to your endpoint on job state changes.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Events</h3>
                <ul className="text-[#8B96A1] text-sm space-y-1.5">
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] border-[#3DDC97] text-[#3DDC97]">job.complete</Badge>
                    Job finished successfully
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] border-[#FF5470] text-[#FF5470]">job.failed</Badge>
                    Job failed (includes failure reason)
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] border-[#60A5FA] text-[#60A5FA]">job.started</Badge>
                    Job picked up by a provider
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Payload</h3>
                <div className="relative rounded-md bg-[#0A0D10] border border-[#1A2026] p-4 font-mono text-xs text-[#8B96A1]">
                  <pre className="whitespace-pre-wrap">{`{
  "event": "job.complete",
  "job_id": "job_01HX...",
  "model": "llama-3-8b",
  "status": "complete",
  "actual_cost_usd": "0.0048",
  "completed_at": "2024-06-15T14:35:00Z"
}`}</pre>
                </div>
              </div>
            </Card>
          </section>
        )}

        {/* Interactive API Explorer */}
        <Card className="border-[#212930] bg-[#12171C] p-5 mt-8">
          <h2 className="text-lg font-bold font-display mb-1">API Explorer</h2>
          <p className="text-[#8B96A1] text-xs mb-4">
            Test the API directly. Select a model, enter a prompt, and run.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-mono text-[#5C6670] block mb-1.5">Model</label>
              <Select value={explorerModel} onValueChange={setExplorerModel}>
                <SelectTrigger className="bg-[#0A0D10] border-[#212930] text-sm">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.tier})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-mono text-[#5C6670] block mb-1.5">Max Tokens</label>
              <Input
                value={explorerMaxTokens}
                onChange={(e) => setExplorerMaxTokens(e.target.value)}
                className="bg-[#0A0D10] border-[#212930] text-sm"
                type="number"
                min={1}
                max={4096}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-mono text-[#5C6670] block mb-1.5">Prompt</label>
            <textarea
              value={explorerPrompt}
              onChange={(e) => setExplorerPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="w-full rounded-md border border-[#212930] bg-[#0A0D10] px-3 py-2 text-sm min-h-[80px] resize-y placeholder:text-[#5C6670] focus:outline-none focus:ring-1 focus:ring-[#3DDC97]"
            />
          </div>

          {/* Estimate display */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-[#8B96A1]">
              {estimatedCost !== null ? (
                <span>
                  Estimated cost:{" "}
                  <span className="font-mono text-[#3DDC97]">{formatCost(estimatedCost)}</span>
                </span>
              ) : (
                <span className="italic text-[#5C6670]">
                  {!canRun ? "Select a model and enter a prompt to see estimate" : "Calculating..."}
                </span>
              )}
            </div>
            <Button
              disabled={!canRun}
              className={cn(
                "gap-2",
                canRun
                  ? "bg-[#3DDC97] text-[#0A0D10] hover:bg-[#34C888]"
                  : "bg-[#212930] text-[#5C6670] cursor-not-allowed"
              )}
            >
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
          </div>
          {!canRun && (
            <p className="text-[10.5px] text-[#F59E0B] mt-2 font-mono">
              ⚠ Setup incomplete — select a model and enter a prompt to enable Run
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
