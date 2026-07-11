import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { UiJobStatus } from "@/lib/types";

const jobStatusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        queued: "border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        estimating: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        dispatched: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        running: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        complete: "border-transparent bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
        failed: "border-transparent bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        cancelled: "border-transparent bg-gray-100 text-gray-500 line-through dark:bg-gray-800 dark:text-gray-400",
      },
    },
    defaultVariants: {
      status: "queued",
    },
  }
);

const STATUS_LABELS: Record<UiJobStatus, string> = {
  queued: "Queued",
  estimating: "Estimating",
  dispatched: "Dispatched",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

export interface JobStatusBadgeProps {
  status: UiJobStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  return (
    <span className={cn(jobStatusBadgeVariants({ status }), className)}>
      {status === "running" && (
        <span
          className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse"
          aria-hidden="true"
        />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}
