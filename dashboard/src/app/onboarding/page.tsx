"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Copy, Check, Zap, Sparkles, Rocket } from "lucide-react";
import { formatCost } from "@/lib/format";

// Mock: check onboarding status
function useOnboardingGuard() {
  const router = useRouter();
  useEffect(() => {
    const completed =
      localStorage.getItem("onboarding_completed") === "true";
    if (completed) {
      router.replace("/dashboard");
    }
  }, [router]);
}

// Mock generated API key
const MOCK_API_KEY = "ng_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0";

export default function OnboardingPage() {
  useOnboardingGuard();

  const router = useRouter();
  const [step, setStep] = useState(1);
  const [keyCopied, setKeyCopied] = useState(false);
  const [jobSubmitted, setJobSubmitted] = useState(false);
  const [jobComplete, setJobComplete] = useState(false);

  const copyKey = async () => {
    await navigator.clipboard.writeText(MOCK_API_KEY);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const submitTestJob = async () => {
    setJobSubmitted(true);
    // Simulate job progress
    await new Promise((r) => setTimeout(r, 2500));
    setJobComplete(true);
  };

  const completeOnboarding = () => {
    // Best-effort: write to localStorage, fire PATCH (don't block on failure)
    try {
      localStorage.setItem("onboarding_completed", "true");
    } catch {
      // swallow
    }
    // Mock PATCH /v1/account — fire and forget
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0D10] p-4">
      <Card className="w-full max-w-lg bg-[#12171C] border-[#212930]">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-8 rounded-full transition-colors ${
                s === step
                  ? "bg-[#3DDC97]"
                  : s < step
                  ? "bg-[#3DDC97]/40"
                  : "bg-[#212930]"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <>
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#3DDC97]/15 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-[#3DDC97]" />
              </div>
              <CardTitle className="text-xl font-display text-foreground">
                Welcome to NeuralGrid
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                You have <span className="text-[#3DDC97] font-semibold">$5.00 free credit</span> to
                get started. Run AI models on AMD Instinct hardware at up to 87% less than A100
                pricing.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => setStep(2)}
                className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
              >
                <Rocket className="h-4 w-4 mr-2" />
                Run example job
              </Button>
              <Button
                onClick={completeOnboarding}
                variant="outline"
                className="w-full border-[#212930] text-muted-foreground hover:text-foreground"
              >
                I&apos;ll explore myself
              </Button>
            </CardContent>
          </>
        )}

        {/* Step 2: API Key Reveal */}
        {step === 2 && (
          <>
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-500/15 flex items-center justify-center">
                <Zap className="h-7 w-7 text-blue-400" />
              </div>
              <CardTitle className="text-xl font-display text-foreground">
                Your API Key
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Copy this key now — it <span className="text-foreground font-medium">will not be shown in full again</span>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Input
                  readOnly
                  value={MOCK_API_KEY}
                  className="bg-[#0A0D10] border-[#212930] font-mono text-xs pr-10"
                />
                <button
                  onClick={copyKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {keyCopied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button
                onClick={() => setStep(3)}
                className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
              >
                Continue
              </Button>
            </CardContent>
          </>
        )}

        {/* Step 3: Test Job */}
        {step === 3 && (
          <>
            <CardHeader className="text-center space-y-3">
              <CardTitle className="text-lg font-display text-foreground">
                Run your first job
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pre-filled with llama-3-8b — just hit submit.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  Model
                </label>
                <Input
                  readOnly
                  value="llama-3-8b"
                  className="bg-[#0A0D10] border-[#212930] font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  Prompt
                </label>
                <Input
                  readOnly
                  value="Explain quantum computing in one sentence."
                  className="bg-[#0A0D10] border-[#212930] text-sm"
                />
              </div>

              {!jobSubmitted && (
                <Button
                  onClick={submitTestJob}
                  className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
                >
                  Submit Job
                </Button>
              )}

              {jobSubmitted && !jobComplete && (
                <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-4 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-sm text-blue-400 font-mono">
                      Running...
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Routing to AMD MI210 via Vast.ai
                  </p>
                </div>
              )}

              {jobComplete && (
                <div className="rounded-lg border border-[#212930] bg-[#0A0D10] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">
                      Complete
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">
                        Cost
                      </div>
                      <div className="text-sm font-bold font-mono">
                        {formatCost(0.0048)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">
                        A100 equiv
                      </div>
                      <div className="text-sm font-mono text-muted-foreground">
                        {formatCost(0.037)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-mono uppercase">
                        Saved
                      </div>
                      <div className="text-sm font-bold text-green-400 font-mono">
                        87%
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={completeOnboarding}
                    className="w-full bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-semibold"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
