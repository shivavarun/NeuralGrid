"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Home,
  Layers,
  PlusCircle,
  PiggyBank,
  KeyRound,
  CreditCard,
  FileText,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  accent?: boolean;
}

export const DASHBOARD_NAV: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Jobs", href: "/dashboard/jobs", icon: Layers },
  { label: "Submit Job", href: "/dashboard/jobs/new", icon: PlusCircle, accent: true },
  { label: "Savings", href: "/dashboard/savings", icon: PiggyBank },
  { label: "API Keys", href: "/dashboard/api-keys", icon: KeyRound },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Docs", href: "/dashboard/docs", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-[240px] flex-col bg-[#12171C] border-r border-[#1A2026] p-5">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 pb-5">
        <img src="/logo-mark.svg" alt="NeuralGrid" className="h-7 w-7" />
        <span className="font-display text-[17px] font-bold tracking-tight">
          Neural<span className="text-[#3DDC97]">Grid</span>
        </span>
      </div>

      {/* New Job button */}
      <Link href="/dashboard/jobs/new" className="mb-4">
        <Button className="w-full justify-start gap-2 bg-[#3DDC97] text-[#06140D] hover:bg-[#3DDC97]/90 font-mono font-semibold text-[13px] rounded-[7px] py-[10px] px-3">
          <PlusCircle className="h-4 w-4" />
          + New Job
        </Button>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {DASHBOARD_NAV.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.accent) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                  isActive
                    ? "bg-[#3DDC97]/12 text-[#3DDC97]"
                    : "text-[#3DDC97] hover:bg-[#161C22]"
                )}
              >
                <Icon className="h-4 w-4 opacity-85 flex-shrink-0" />
                {item.label}
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "bg-[rgba(61,220,151,0.12)] text-[#3DDC97]"
                  : "text-[#8B96A1] hover:bg-[#161C22] hover:text-[#E7EDF2]"
              )}
            >
              <Icon className="h-4 w-4 opacity-85 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Upgrade card */}
      <div className="rounded-lg border border-[#212930] p-3 mb-3.5 text-xs text-[#8B96A1]">
        <div className="font-semibold text-[#E7EDF2] text-[12.5px] mb-1">
          Free plan — $2.00 credit
        </div>
        <div>10 req/min · 100 req/day</div>
        <a
          href="#"
          className="text-[#3DDC97] font-mono text-[11.5px] inline-flex items-center gap-1 mt-1"
        >
          Upgrade to Pro <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {/* User row */}
      <div className="flex items-center gap-2.5 border-t border-[#1A2026] pt-3.5 px-2">
        <div className="h-[26px] w-[26px] rounded-full bg-gradient-to-br from-[#3DDC97] to-[#7FD1FF] flex-shrink-0" />
        <div className="overflow-hidden text-xs leading-tight">
          <div className="truncate text-[#8B96A1] text-[11px]">alex@buildlabs.dev</div>
          <span className="font-mono text-[9px] text-[#5C6670] border border-[#212930] px-1.5 py-px rounded-full mt-0.5 inline-block">
            FREE
          </span>
        </div>
      </div>
    </div>
  );
}
