"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { balanceColor, formatCost } from "@/lib/format";
import { cn } from "@/lib/utils";

// Mock data
const MOCK_BALANCE = 4.23;
const MOCK_SUMMARY = {
  jobs: 47,
  spend: 0.0342,
  savings_usd: 0.1968,
  savings_pct: 85,
  priciest_job_id: "job_01HX3KDE6F7G8H9J0K1L2M3N",
  mom_trend: 12, // % increase from last month
};
const MOCK_INVOICES: Array<{
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending";
}> = [];

const TOP_UP_PRESETS = [10, 25, 50, 100];

const BALANCE_COLOR_MAP: Record<ReturnType<typeof balanceColor>, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  red: "text-red-400",
};

export default function BillingPage() {
  const [autoTopUp, setAutoTopUp] = useState(false);
  const balance = MOCK_BALANCE;
  const color = balanceColor(balance);

  return (
    <div className="space-y-6">
      {/* Balance Panel */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Current Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("text-4xl font-bold font-display", BALANCE_COLOR_MAP[color])}>
            {formatCost(balance)}
          </div>
          {color === "red" && (
            <p className="text-xs text-red-400 mt-1 font-mono">
              Balance low — top up to continue running jobs
            </p>
          )}
          {color === "amber" && (
            <p className="text-xs text-amber-400 mt-1 font-mono">
              Balance below $5.00
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top-up Presets */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Add Funds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {TOP_UP_PRESETS.map((amount) => (
              <Button
                key={amount}
                variant="outline"
                className="font-mono border-[#212930] bg-[#0A0D10] hover:border-[#3DDC97] hover:text-[#3DDC97]"
              >
                ${amount}
              </Button>
            ))}
            <Button
              variant="outline"
              className="font-mono border-[#212930] bg-[#0A0D10] hover:border-[#3DDC97] hover:text-[#3DDC97]"
            >
              Custom...
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Auto Top-up Toggle */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground">Auto top-up</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically add funds when balance falls below $1.00
              </p>
            </div>
            <Switch
              checked={autoTopUp}
              onCheckedChange={setAutoTopUp}
            />
          </div>
        </CardContent>
      </Card>

      {/* Current Month Summary */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
                Jobs
              </div>
              <div className="text-lg font-semibold">{MOCK_SUMMARY.jobs}</div>
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
                Spend
              </div>
              <div className="text-lg font-semibold font-mono">
                {formatCost(MOCK_SUMMARY.spend)}
              </div>
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
                Saved vs A100
              </div>
              <div className="text-lg font-semibold text-green-400 font-mono">
                {formatCost(MOCK_SUMMARY.savings_usd)} ({MOCK_SUMMARY.savings_pct}%)
              </div>
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
                vs Last Month
              </div>
              <div className="text-lg font-semibold text-muted-foreground">
                +{MOCK_SUMMARY.mom_trend}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Invoice History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {MOCK_INVOICES.length === 0 ? (
            <EmptyState variant="no-invoices" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[#212930] hover:bg-transparent">
                  <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_INVOICES.map((inv) => (
                  <TableRow key={inv.id} className="border-[#212930]">
                    <TableCell className="text-sm">{inv.date}</TableCell>
                    <TableCell className="font-mono text-sm">{formatCost(inv.amount)}</TableCell>
                    <TableCell className="text-sm">{inv.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Saved Payment Methods Placeholder */}
      <Card className="bg-[#12171C] border-[#212930]">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center rounded-lg border border-dashed border-[#212930] bg-[#0A0D10]">
            <p className="text-sm text-muted-foreground font-mono">
              Stripe Elements integration — coming soon
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
