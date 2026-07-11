"use client";

import { usePathname } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { DASHBOARD_NAV } from "./Sidebar";

function getPageTitle(pathname: string): string {
  if (pathname === "/dashboard") return "Home";
  const item = DASHBOARD_NAV.find(
    (n) => n.href !== "/dashboard" && pathname.startsWith(n.href)
  );
  if (item) return item.label;
  if (pathname.includes("/jobs/")) return "Job Detail";
  return "Dashboard";
}

export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 items-center justify-between border-b border-[#1A2026] px-7 flex-shrink-0">
      <h1 className="font-display text-[17px] font-semibold text-[#E7EDF2]">
        {title}
      </h1>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5C6670]" />
          <input
            type="text"
            placeholder="Search job ID or model..."
            className="h-8 w-[220px] rounded-md border border-[#212930] bg-[#12171C] pl-8 pr-3 text-xs font-mono text-[#5C6670] placeholder:text-[#5C6670] focus:outline-none focus:border-[#3DDC97]"
          />
        </div>
        <button className="relative text-[#8B96A1] hover:text-[#E7EDF2] transition-colors">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute -top-0.5 -right-0.5 h-[6px] w-[6px] rounded-full bg-[#FF5470]" />
        </button>
      </div>
    </header>
  );
}
