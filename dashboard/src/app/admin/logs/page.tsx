"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

// --- Types ---
type Severity = "info" | "warn" | "error" | "fatal";
type Service = "api-gateway" | "scheduler" | "estimator" | "billing" | "worker";

interface LogEntry {
  id: string;
  severity: Severity;
  service: Service;
  message: string;
  timestamp: string;
}

// --- Mock log data ---
const MOCK_LOGS: LogEntry[] = [
  { id: "log-001", severity: "error", service: "scheduler", message: "Node rp-node-19b unreachable after 3 retries", timestamp: "2024-06-15T14:32:10Z" },
  { id: "log-002", severity: "warn", service: "estimator", message: "Model flux VRAM estimate exceeded actual by 40%", timestamp: "2024-06-15T14:30:05Z" },
  { id: "log-003", severity: "info", service: "api-gateway", message: "Rate limit applied to developer dev-42 (free tier)", timestamp: "2024-06-15T14:28:00Z" },
  { id: "log-004", severity: "error", service: "billing", message: "Stripe webhook signature verification failed", timestamp: "2024-06-15T14:25:30Z" },
  { id: "log-005", severity: "fatal", service: "worker", message: "OOM killed on vast-3090-22 running stable-diffusion-xl", timestamp: "2024-06-15T14:20:00Z" },
  { id: "log-006", severity: "info", service: "api-gateway", message: "Health check passed for all subsystems", timestamp: "2024-06-15T14:15:00Z" },
  { id: "log-007", severity: "warn", service: "scheduler", message: "Circuit breaker half-open for runpod", timestamp: "2024-06-15T14:10:00Z" },
  { id: "log-008", severity: "error", service: "estimator", message: "Timeout fetching model registry for mistral-7b", timestamp: "2024-06-15T14:05:00Z" },
  { id: "log-009", severity: "info", service: "billing", message: "Auto top-up triggered for user carol@ml.org", timestamp: "2024-06-15T14:00:00Z" },
  { id: "log-010", severity: "warn", service: "worker", message: "GPU temperature exceeding threshold on amd-mi300-007", timestamp: "2024-06-15T13:55:00Z" },
];

// Top errors summary
const TOP_ERRORS = [
  { message: "Node unreachable after retries", count: 14, service: "scheduler" },
  { message: "Stripe webhook verification failed", count: 8, service: "billing" },
  { message: "Timeout fetching model registry", count: 6, service: "estimator" },
  { message: "OOM killed on worker node", count: 4, service: "worker" },
  { message: "Rate limit exceeded (free tier)", count: 3, service: "api-gateway" },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  info: "border-[#60A5FA] text-[#60A5FA]",
  warn: "border-[#F59E0B] text-[#F59E0B]",
  error: "border-[#FF5470] text-[#FF5470]",
  fatal: "border-[#A78BFA] text-[#A78BFA]",
};

export default function AdminLogsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filteredLogs = MOCK_LOGS.filter((log) => {
    if (severityFilter !== "all" && log.severity !== severityFilter) return false;
    if (serviceFilter !== "all" && log.service !== serviceFilter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold font-display">Logs</h1>

      {/* Filters */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] border-[#212930] bg-[#0A0D10] text-xs">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent className="border-[#212930] bg-[#12171C]">
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="fatal">Fatal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[150px] border-[#212930] bg-[#0A0D10] text-xs">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent className="border-[#212930] bg-[#12171C]">
              <SelectItem value="all">All Services</SelectItem>
              <SelectItem value="api-gateway">api-gateway</SelectItem>
              <SelectItem value="scheduler">scheduler</SelectItem>
              <SelectItem value="estimator">estimator</SelectItem>
              <SelectItem value="billing">billing</SelectItem>
              <SelectItem value="worker">worker</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[240px] border-[#212930] bg-[#0A0D10] text-xs placeholder:text-[#5C6670]"
          />
        </div>
      </Card>

      {/* Top errors summary */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-3">Top Errors (24h)</h3>
        <div className="space-y-2">
          {TOP_ERRORS.map((err, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[#8B96A1] w-4">{i + 1}.</span>
                <span className="text-[#E7EDF2]">{err.message}</span>
                <Badge variant="outline" className="font-mono text-[9px] border-[#212930] text-[#5C6670]">
                  {err.service}
                </Badge>
              </div>
              <span className="font-mono text-[#FF5470] font-bold">{err.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Log list */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <h3 className="text-sm font-semibold mb-3">Log Entries</h3>
        {filteredLogs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2026] hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Severity</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Timestamp</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Service</TableHead>
                <TableHead className="font-mono text-[10px] uppercase text-[#5C6670]">Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id} className="border-[#1A2026]">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-mono text-[10px]", SEVERITY_STYLES[log.severity])}
                    >
                      {log.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">{log.service}</TableCell>
                  <TableCell className="text-xs text-[#E7EDF2] max-w-[400px] truncate">{log.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState variant="no-filter-match" className="py-6" />
        )}
      </Card>

      {/* Backend gap notice */}
      <Card className="border-[#212930] bg-[#12171C] p-4">
        <p className="text-xs text-[#5C6670] font-mono mb-2">
          Live data requires admin logs endpoint (backend gap)
        </p>
        <EmptyState variant="unavailable" className="py-6" />
      </Card>
    </div>
  );
}
