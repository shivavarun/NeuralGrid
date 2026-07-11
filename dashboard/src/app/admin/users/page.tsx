"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { balanceColor, formatCost } from "@/lib/format";
import {
  CreditCard,
  ArrowUpDown,
  Ban,
  CheckCircle,
  UserCog,
} from "lucide-react";

// --- Mock users (backend gap: /v1/admin/users does not exist) ---
interface AdminUserRow {
  id: string;
  email: string;
  plan: "free" | "pro" | "enterprise";
  balance_usd: number;
  jobs_30d: number;
  spend_30d_usd: number;
  last_active: string;
  status: "active" | "suspended";
}

const MOCK_USERS: AdminUserRow[] = [
  { id: "dev_001", email: "alice@example.com", plan: "pro", balance_usd: 24.50, jobs_30d: 342, spend_30d_usd: 12.80, last_active: "2024-06-15T14:30:00Z", status: "active" },
  { id: "dev_002", email: "bob@startup.io", plan: "free", balance_usd: 0.35, jobs_30d: 78, spend_30d_usd: 4.20, last_active: "2024-06-15T13:00:00Z", status: "active" },
  { id: "dev_003", email: "charlie@dev.co", plan: "pro", balance_usd: 8.90, jobs_30d: 156, spend_30d_usd: 6.45, last_active: "2024-06-14T22:00:00Z", status: "active" },
  { id: "dev_004", email: "diana@corp.com", plan: "enterprise", balance_usd: 450.00, jobs_30d: 2310, spend_30d_usd: 89.20, last_active: "2024-06-15T14:32:00Z", status: "active" },
  { id: "dev_005", email: "eve@test.org", plan: "free", balance_usd: 0.00, jobs_30d: 3, spend_30d_usd: 0.50, last_active: "2024-06-10T10:00:00Z", status: "suspended" },
  { id: "dev_006", email: "frank@bigco.ai", plan: "pro", balance_usd: 2.10, jobs_30d: 89, spend_30d_usd: 5.70, last_active: "2024-06-15T11:00:00Z", status: "active" },
];

const PLAN_COLORS: Record<string, string> = {
  free: "border-[#5C6670] text-[#8B96A1]",
  pro: "border-[#3DDC97] text-[#3DDC97]",
  enterprise: "border-[#A78BFA] text-[#A78BFA]",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminUsersPage() {
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = MOCK_USERS.filter(
    (u) =>
      !searchQuery ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold font-display">Users (Admin)</h1>

      {/* Backend gap notice */}
      <EmptyState variant="unavailable" className="py-4" />

      {/* Search */}
      <Input
        placeholder="Search by email or ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-8 w-[240px] bg-[#0D1116] border-[#212930] text-xs font-mono"
      />

      {/* Users table */}
      <Card className="border-[#212930] bg-[#12171C] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1A2026]">
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Email</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Plan</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Balance</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Jobs 30d</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Spend 30d</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Last Active</th>
                <th className="text-left px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const bColor = balanceColor(user.balance_usd);
                return (
                  <tr
                    key={user.id}
                    className="border-b border-[#1A2026] last:border-0 hover:bg-[#161C22] cursor-pointer transition-colors"
                    onClick={() => setSelectedUser(user)}
                  >
                    <td className="px-4 py-2.5 text-sm text-[#E7EDF2]">{user.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={cn("font-mono text-[10px]", PLAN_COLORS[user.plan])}>
                        {user.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "font-mono text-sm",
                          bColor === "green" && "text-[#3DDC97]",
                          bColor === "amber" && "text-[#F59E0B]",
                          bColor === "red" && "text-[#FF5470]"
                        )}
                      >
                        {formatCost(user.balance_usd)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-sm text-[#8B96A1]">{user.jobs_30d}</td>
                    <td className="px-4 py-2.5 font-mono text-sm text-[#8B96A1]">{formatCost(user.spend_30d_usd)}</td>
                    <td className="px-4 py-2.5 text-xs text-[#8B96A1]">{formatDate(user.last_active)}</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px]",
                          user.status === "active"
                            ? "border-[#3DDC97] text-[#3DDC97]"
                            : "border-[#FF5470] text-[#FF5470]"
                        )}
                      >
                        {user.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User detail drawer (Sheet) */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="bg-[#12171C] border-[#212930] w-[400px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-[#E7EDF2] font-display">
              {selectedUser?.email}
            </SheetTitle>
          </SheetHeader>

          {selectedUser && (
            <div className="mt-6 space-y-6">
              {/* Account Info */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-[#5C6670]">Account Info</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#5C6670] text-xs block">ID</span>
                    <span className="font-mono text-xs">{selectedUser.id}</span>
                  </div>
                  <div>
                    <span className="text-[#5C6670] text-xs block">Plan</span>
                    <Badge variant="outline" className={cn("font-mono text-[10px]", PLAN_COLORS[selectedUser.plan])}>
                      {selectedUser.plan}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[#5C6670] text-xs block">Balance</span>
                    <span className={cn(
                      "font-mono text-xs",
                      balanceColor(selectedUser.balance_usd) === "red" && "text-[#FF5470]",
                      balanceColor(selectedUser.balance_usd) === "amber" && "text-[#F59E0B]",
                      balanceColor(selectedUser.balance_usd) === "green" && "text-[#3DDC97]",
                    )}>
                      {formatCost(selectedUser.balance_usd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#5C6670] text-xs block">Status</span>
                    <span className="text-xs">{selectedUser.status}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-[#5C6670]">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 border-[#212930] text-[#8B96A1] hover:text-[#E7EDF2]">
                    <CreditCard className="h-3.5 w-3.5" />
                    Grant Credit
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 border-[#212930] text-[#8B96A1] hover:text-[#E7EDF2]">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Change Plan
                  </Button>
                  {selectedUser.status === "active" ? (
                    <Button variant="outline" size="sm" className="gap-1.5 border-[#FF5470]/30 text-[#FF5470] hover:bg-[#FF5470]/10">
                      <Ban className="h-3.5 w-3.5" />
                      Suspend
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1.5 border-[#3DDC97]/30 text-[#3DDC97] hover:bg-[#3DDC97]/10">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Unsuspend
                    </Button>
                  )}
                </div>
              </div>

              {/* Detailed info — backend gap */}
              <div className="space-y-2 pt-4 border-t border-[#1A2026]">
                <h4 className="text-xs font-mono uppercase text-[#5C6670]">
                  Balance history / Job stats / API keys / Recent jobs
                </h4>
                <EmptyState variant="unavailable" className="py-6" />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
