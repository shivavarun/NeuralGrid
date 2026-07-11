"use client";

import { cn } from "@/lib/utils";

export type SkeletonShape = "stat-card" | "table-rows" | "chart" | "detail-panel";

export interface SkeletonScreenProps {
  shape: SkeletonShape;
  rows?: number;
  className?: string;
}

function Pulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} style={style} />;
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <Pulse className="h-3 w-20" />
      <Pulse className="h-7 w-28" />
      <Pulse className="h-3 w-32" />
    </div>
  );
}

function TableRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex gap-4 px-4 py-2">
        <Pulse className="h-3 w-16" />
        <Pulse className="h-3 w-24" />
        <Pulse className="h-3 w-12" />
        <Pulse className="h-3 w-16" />
        <Pulse className="h-3 w-14" />
        <Pulse className="h-3 w-12" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-t border-border">
          <Pulse className="h-4 w-20" />
          <Pulse className="h-4 w-28" />
          <Pulse className="h-4 w-14" />
          <Pulse className="h-4 w-20" />
          <Pulse className="h-4 w-16" />
          <Pulse className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <Pulse className="h-3 w-32" />
      <div className="flex items-end gap-2 h-40">
        {Array.from({ length: 6 }).map((_, i) => (
          <Pulse
            key={i}
            className="flex-1"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function DetailPanelSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Pulse className="h-5 w-40" />
        <Pulse className="h-5 w-16" />
      </div>
      <Pulse className="h-4 w-full" />
      <Pulse className="h-4 w-3/4" />
      <div className="grid grid-cols-2 gap-4 pt-2">
        <Pulse className="h-20" />
        <Pulse className="h-20" />
      </div>
      <Pulse className="h-4 w-1/2" />
      <Pulse className="h-32" />
    </div>
  );
}

export function SkeletonScreen({ shape, rows, className }: SkeletonScreenProps) {
  return (
    <div className={cn(className)}>
      {shape === "stat-card" && <StatCardSkeleton />}
      {shape === "table-rows" && <TableRowsSkeleton rows={rows} />}
      {shape === "chart" && <ChartSkeleton />}
      {shape === "detail-panel" && <DetailPanelSkeleton />}
    </div>
  );
}
