"use client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import type { AdminSettings } from "@/lib/types";

// Default placeholder values (all fields disabled — backend gap)
const DEFAULTS: AdminSettings = {
  routing: {
    t1VramCeiling: 24,
    t2VramCeiling: 80,
    t3VramFloor: 80,
    maxRetries: 3,
    timeoutMultiplier: 1.5,
    lowConfidenceBump: true,
  },
  provider: {
    pricePollIntervalSec: 60,
    priceCacheTtlSec: 300,
    breakerThreshold: 5,
    breakerCooldownSec: 120,
    amdBonusPct: 10,
  },
  billing: {
    marginPct: 15,
    freeTierCreditUsd: "5.00",
    lowBalanceWarnUsd: "2.00",
    autoTopUpMinUsd: "10.00",
    maxJobCostUsd: "100.00",
  },
  rateLimits: {
    free: { perMin: 5, perDay: 100 },
    pro: { perMin: 30, perDay: 1000 },
    enterprise: { perMin: 120, perDay: 10000 },
  },
};

function FieldRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-xs text-[#8B96A1]">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          disabled
          value={value}
          className="w-[100px] border-[#212930] bg-[#0A0D10] text-xs text-[#5C6670] text-right"
        />
        {unit && <span className="text-[10px] text-[#5C6670] font-mono w-8">{unit}</span>}
      </div>
    </div>
  );
}

function SwitchRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-xs text-[#8B96A1]">{label}</Label>
      <Switch disabled checked={checked} />
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Platform Settings</h1>

      {/* Backend gap banner */}
      <Card className="border-[#F59E0B]/20 bg-[#F59E0B]/5 p-3">
        <p className="text-xs text-[#F59E0B]">
          All fields are read-only. The /v1/admin/settings endpoint does not exist yet (backend gap).
        </p>
      </Card>

      <Tabs defaultValue="routing" className="w-full">
        <TabsList className="bg-[#12171C] border border-[#212930]">
          <TabsTrigger value="routing" className="text-xs data-[state=active]:bg-[#1A2026]">Routing</TabsTrigger>
          <TabsTrigger value="provider" className="text-xs data-[state=active]:bg-[#1A2026]">Provider</TabsTrigger>
          <TabsTrigger value="billing" className="text-xs data-[state=active]:bg-[#1A2026]">Billing</TabsTrigger>
          <TabsTrigger value="rate-limits" className="text-xs data-[state=active]:bg-[#1A2026]">Rate Limits</TabsTrigger>
        </TabsList>

        {/* Routing tab */}
        <TabsContent value="routing">
          <Card className="border-[#212930] bg-[#12171C] p-4">
            <h3 className="text-sm font-semibold mb-4">Routing Configuration</h3>
            <div className="divide-y divide-[#1A2026]">
              <FieldRow label="T1 VRAM Ceiling" value={DEFAULTS.routing.t1VramCeiling} unit="GB" />
              <FieldRow label="T2 VRAM Ceiling" value={DEFAULTS.routing.t2VramCeiling} unit="GB" />
              <FieldRow label="T3 VRAM Floor" value={DEFAULTS.routing.t3VramFloor} unit="GB" />
              <FieldRow label="Max Retries" value={DEFAULTS.routing.maxRetries} />
              <FieldRow label="Timeout Multiplier" value={DEFAULTS.routing.timeoutMultiplier} unit="x" />
              <SwitchRow label="Low-Confidence Bump" checked={DEFAULTS.routing.lowConfidenceBump} />
            </div>
          </Card>
        </TabsContent>

        {/* Provider tab */}
        <TabsContent value="provider">
          <Card className="border-[#212930] bg-[#12171C] p-4">
            <h3 className="text-sm font-semibold mb-4">Provider Configuration</h3>
            <div className="divide-y divide-[#1A2026]">
              <FieldRow label="Price Poll Interval" value={DEFAULTS.provider.pricePollIntervalSec} unit="sec" />
              <FieldRow label="Price Cache TTL" value={DEFAULTS.provider.priceCacheTtlSec} unit="sec" />
              <FieldRow label="Breaker Threshold" value={DEFAULTS.provider.breakerThreshold} />
              <FieldRow label="Breaker Cooldown" value={DEFAULTS.provider.breakerCooldownSec} unit="sec" />
              <FieldRow label="AMD Bonus" value={DEFAULTS.provider.amdBonusPct} unit="%" />
            </div>
          </Card>
        </TabsContent>

        {/* Billing tab */}
        <TabsContent value="billing">
          <Card className="border-[#212930] bg-[#12171C] p-4">
            <h3 className="text-sm font-semibold mb-4">Billing Configuration</h3>
            <div className="divide-y divide-[#1A2026]">
              <FieldRow label="Margin" value={DEFAULTS.billing.marginPct} unit="%" />
              <FieldRow label="Free Tier Credit" value={`$${DEFAULTS.billing.freeTierCreditUsd}`} />
              <FieldRow label="Low Balance Warning" value={`$${DEFAULTS.billing.lowBalanceWarnUsd}`} />
              <FieldRow label="Auto Top-Up Minimum" value={`$${DEFAULTS.billing.autoTopUpMinUsd}`} />
              <FieldRow label="Max Job Cost" value={`$${DEFAULTS.billing.maxJobCostUsd}`} />
            </div>
          </Card>
        </TabsContent>

        {/* Rate Limits tab */}
        <TabsContent value="rate-limits">
          <Card className="border-[#212930] bg-[#12171C] p-4">
            <h3 className="text-sm font-semibold mb-4">Rate Limits</h3>
            {(["free", "pro", "enterprise"] as const).map((tier) => (
              <div key={tier} className="mb-4 last:mb-0">
                <p className="text-xs font-semibold text-[#E7EDF2] mb-2 capitalize">{tier}</p>
                <div className="divide-y divide-[#1A2026] pl-3">
                  <FieldRow label="Per Minute" value={DEFAULTS.rateLimits[tier].perMin} unit="req" />
                  <FieldRow label="Per Day" value={DEFAULTS.rateLimits[tier].perDay} unit="req" />
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {/* EmptyState for backend gap */}
      <EmptyState variant="unavailable" className="py-4" />
    </div>
  );
}
