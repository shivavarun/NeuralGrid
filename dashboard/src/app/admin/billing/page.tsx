"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCost, computeMargin } from "@/lib/format";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// --- Mock data for revenue chart (30 days) ---
function generateRevenueData() {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const revenue = 180 + Math.random() * 120;
    const cost = 90 + Math.random() * 60;
    data.push({
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: Number(revenue.toFixed(2)),
      cost: Number(cost.toFixed(2)),
    });
  }
  return data;
}

const REVENUE_DATA = generateRevenueData();

// Mock billing events
const MOCK_BILLING_EVENTS = [
  { id: "evt-001", user: "alice@corp.io", type: "charge", amount: 12.4500, status: "success", timestamp: "2024-06-15T13:22:00Z" },
  { id: "evt-002", user: "bob@dev.co", type: "charge", amount: 3.2100, status: "success", timestamp: "2024-06-15T12:48:00Z" },
  { id: "evt-003", user: "carol@ml.org", type: "top-up", amount: 50.0000, status: "success", timestamp: "2024-06-15T11:30:00Z" },
  { id: "evt-004", user: "dave@ai.com", type: "charge", amount: 8.7300, status: "success", timestamp: "2024-06-15T10:15:00Z" },
  { id: "evt-005", user: "eve@labs.io", type: "refund", amount: 2.1000, status: "success", timestamp: "2024-06-15T09:05:00Z" },
];

// Mock failed payments
const MOCK_FAILED_PAYMENTS = [
  { id: "fp-001", user: "frank@startup.io", amount: 25.0000, reason: "Insufficient balance", attempts: 3, lastAttempt: "2024-06-15T14:10:00Z" },
  { id: "fp-002", user: "grace@ml.dev", amount: 8.5000, reason: "Card declined", attempts: 1, lastAttempt: "2024-06-14T22:30:00Z" },
];

// Compute mock metrics
const totalRevenueToday = REVENUE_DATA[REVENUE_DATA.length - 1]?.revenue ?? 0;
const totalCostToday = REVENUE_DATA[REVENUE_DATA.length - 1]?.cost ?? 0;
const totalRevenue30d = REVENUE_DATA.reduce((s, d) => s + d.revenue, 0);
const mrr = totalRevenue30d; // simplified: 30d revenue ≈ MRR
const margin = computeMargin(totalRevenueToday, totalCostToday);

export default function AdminRevenuePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Revenue</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">MRR (30d)</p>
          <p className="text-lg font-bold font-mono text-[#E7EDF2]">{formatCost(mrr)}</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Revenue Today</p>
          <p className="text-lg font-bold font-mono text-[#3DDC97]">{formatCost(totalRevenueToday)}</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Provider Cost Today</p>
          <p className="text-lg font-bold font-mono text-[#F59E0B]">{formatCost(totalCostToday)}</p>
        </Card>
        <Card className="border-[#212930] bg-[#12171C] p-4">
          <p className="text-[10px] font-mono uppercase text-[#5C6670] mb-1">Gross Margin</p>
          <p className="text-lg font-bold font-mono text-[#E7EDF2]">
            {margin.pct != null ? `${margin.pct.toFixed(1)}%` : "—"}
          </p>
        </Card>
      </div>

      {/* 30-day revenue vs cost chart */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-4">Revenue vs Provider Cost (30d)</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={REVENUE_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2026" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5C6670" }} />
              <YAxis tick={{ fontSize: 10, fill: "#5C6670" }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#12171C", border: "1px solid #212930", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#8B96A1" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="revenue" stroke="#3DDC97" strokeWidth={2} dot={false} name="Revenue" />
              <Line type="monotone" dataKey="cost" stroke="#F59E0B" strokeWidth={2} dot={false} name="Provider Cost" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Billing events table */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-3">Recent Billing Events</h3>
        <Table>
          <TableHeader>
            <TableRow className="border-[#1A2026] hover:bg-transparent">
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">ID</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">User</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Type</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Amount</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Status</TableHead>
              <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_BILLING_EVENTS.map((evt) => (
              <TableRow key={evt.id} className="border-[#1A2026]">
                <TableCell className="font-mono text-xs text-[#8B96A1]">{evt.id}</TableCell>
                <TableCell className="text-xs">{evt.user}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px] border-[#212930] text-[#8B96A1]">
                    {evt.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-[#E7EDF2]">{formatCost(evt.amount)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[10px] border-[#3DDC97] text-[#3DDC97]">
                    {evt.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-[#8B96A1]">
                  {new Date(evt.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Failed payments table */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-3">Failed Payments</h3>
        {MOCK_FAILED_PAYMENTS.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2026] hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">ID</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">User</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Amount</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Reason</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Attempts</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Last Attempt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_FAILED_PAYMENTS.map((fp) => (
                <TableRow key={fp.id} className="border-[#1A2026]">
                  <TableCell className="font-mono text-xs text-[#8B96A1]">{fp.id}</TableCell>
                  <TableCell className="text-xs">{fp.user}</TableCell>
                  <TableCell className="font-mono text-xs text-[#FF5470]">{formatCost(fp.amount)}</TableCell>
                  <TableCell className="text-xs text-[#8B96A1]">{fp.reason}</TableCell>
                  <TableCell className="font-mono text-xs text-[#F59E0B]">{fp.attempts}</TableCell>
                  <TableCell className="text-xs text-[#8B96A1]">
                    {new Date(fp.lastAttempt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState variant="unavailable" className="py-6" />
        )}
      </Card>

      {/* Backend gap notice */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <p className="text-xs text-[#5C6670] font-mono mb-2">
          Live data requires /v1/admin/revenue endpoint (backend gap)
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </Card>
    </div>
  );
}
