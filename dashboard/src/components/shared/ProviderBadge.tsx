"use client";

import { type Provider, type HardwareVendor } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * AMD-only provider model. Shows instance type with AMD chip icon.
 * Instance types: MI210 partition, MI300X partition, MI300X full node.
 */
export type InstanceType = "MI210 partition" | "MI300X partition" | "MI300X full node";

export interface ProviderBadgeProps {
  provider: Provider;
  hardwareVendor?: HardwareVendor;
  instanceType?: InstanceType;
}

const PROVIDER_COLOR: Record<Provider, string> = {
  fireworks: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  vastai: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  runpod: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "amd-cloud": "bg-red-500/15 text-red-400 border-red-500/30",
};

function AmdChipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="0.75" fill="currentColor" opacity="0.6" />
      {/* pins */}
      <line x1="5" y1="1" x2="5" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="11" y1="1" x2="11" y2="3" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="13" x2="5" y2="15" stroke="currentColor" strokeWidth="1" />
      <line x1="8" y1="13" x2="8" y2="15" stroke="currentColor" strokeWidth="1" />
      <line x1="11" y1="13" x2="11" y2="15" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="5" x2="3" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="1" y1="11" x2="3" y2="11" stroke="currentColor" strokeWidth="1" />
      <line x1="13" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="13" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1" />
      <line x1="13" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function ProviderBadge({ provider, hardwareVendor, instanceType }: ProviderBadgeProps) {
  const colorClass = PROVIDER_COLOR[provider];
  const showAmdIcon = hardwareVendor === "AMD";
  const label = instanceType ?? provider;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        colorClass
      )}
    >
      {showAmdIcon && <AmdChipIcon className="h-3.5 w-3.5 flex-shrink-0" />}
      {label}
    </span>
  );
}
