"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Layers,
  Users,
  Server,
  DollarSign,
  Activity,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Home", href: "/admin", icon: Home },
  { label: "Jobs", href: "/admin/jobs", icon: Layers },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Providers", href: "/admin/providers", icon: Server },
  { label: "Revenue", href: "/admin/billing", icon: DollarSign },
  { label: "Estimator", href: "/admin/estimator", icon: Activity },
  { label: "Logs", href: "/admin/logs", icon: ScrollText },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-[240px] flex-col bg-[#12171C] border-r border-[#1A2026] p-5">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 pb-5 font-bold text-[17px] tracking-tight">
        <span className="h-[7px] w-[7px] rounded-sm bg-[#FF5470] shadow-[0_0_6px_#FF5470]" />
        <span className="font-display">NeuralGrid</span>
        <span className="ml-1 text-[10px] font-mono text-[#FF5470] border border-[#FF5470]/30 rounded px-1.5 py-px">
          ADMIN
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {ADMIN_NAV.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "bg-[rgba(255,84,112,0.12)] text-[#FF5470]"
                  : "text-[#8B96A1] hover:bg-[#161C22] hover:text-[#E7EDF2]"
              )}
            >
              <Icon className="h-4 w-4 opacity-85 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* System info */}
      <div className="rounded-lg border border-[#212930] p-3 text-xs text-[#8B96A1]">
        <div className="font-semibold text-[#E7EDF2] text-[12.5px] mb-1">
          System Status
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#3DDC97]" />
          All systems operational
        </div>
      </div>
    </div>
  );
}
