"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileX, Search, Key, Receipt, AlertTriangle } from "lucide-react";

export type EmptyStateVariant =
  | "no-jobs"
  | "no-filter-match"
  | "no-keys"
  | "no-invoices"
  | "unavailable";

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  onAction?: () => void;
  className?: string;
}

const VARIANT_CONFIG: Record<
  EmptyStateVariant,
  {
    icon: React.ElementType;
    title: string;
    description: string;
    actionLabel?: string;
  }
> = {
  "no-jobs": {
    icon: FileX,
    title: "No jobs yet",
    description: "Submit your first job to see it here.",
    actionLabel: "Submit your first job",
  },
  "no-filter-match": {
    icon: Search,
    title: "No matching jobs",
    description: "No jobs match your current filters.",
    actionLabel: "Clear filters",
  },
  "no-keys": {
    icon: Key,
    title: "No API keys",
    description: "Create your first API key to get started.",
    actionLabel: "Create key",
  },
  "no-invoices": {
    icon: Receipt,
    title: "No invoices yet",
    description: "Invoices will appear here once you've been charged.",
  },
  unavailable: {
    icon: AlertTriangle,
    title: "Data unavailable",
    description: "This information is not available at the moment.",
  },
};

export function EmptyState({ variant, onAction, className }: EmptyStateProps) {
  const { icon: Icon, title, description, actionLabel } = VARIANT_CONFIG[variant];

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      <Icon className="h-10 w-10 text-muted-foreground/50 mb-4" />
      <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground mb-5 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
