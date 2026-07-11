"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

export function AdminShellClient({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#0A0D10] text-[#E7EDF2]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-30">
        <AdminSidebar />
      </aside>

      {/* Mobile sidebar */}
      <div className="md:hidden fixed top-0 left-0 z-40 p-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="text-[#8B96A1] hover:text-[#E7EDF2]">
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="p-0 w-[240px] bg-[#12171C] border-[#1A2026]"
          >
            <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
            <AdminSidebar />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:ml-[240px]">
        <main className="flex-1 overflow-y-auto p-7">{children}</main>
      </div>
    </div>
  );
}
