"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Copy, Plus } from "lucide-react";

interface ApiKey {
  id: string;
  label: string;
  prefix: string;
  created: string;
  lastUsed: string;
  status: "active" | "revoked";
}

// Sample data
const INITIAL_KEYS: ApiKey[] = [
  {
    id: "key_1",
    label: "Production",
    prefix: "ngr_live_••••••••3f2a",
    created: "Jun 12, 2026",
    lastUsed: "2m ago",
    status: "active",
  },
  {
    id: "key_2",
    label: "Local dev",
    prefix: "ngr_test_••••••••9b1c",
    created: "May 28, 2026",
    lastUsed: "3d ago",
    status: "active",
  },
];

function generateFakeKey(): string {
  const chars = "abcdef0123456789";
  let key = "ngr_live_";
  for (let i = 0; i < 24; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>(INITIAL_KEYS);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateStep, setGenerateStep] = useState<1 | 2>(1);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [copied, setCopied] = useState(false);

  function openGenerateModal() {
    setShowGenerateModal(true);
    setGenerateStep(1);
    setNewKeyLabel("");
    setGeneratedKey("");
    setCopied(false);
  }

  function handleGenerate() {
    const fullKey = generateFakeKey();
    setGeneratedKey(fullKey);
    setGenerateStep(2);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(generatedKey);
    setCopied(true);
  }

  function handleConfirmCopied() {
    // Add the new key to the list
    const prefix =
      generatedKey.slice(0, 9) + "••••••••" + generatedKey.slice(-4);
    setKeys((prev) => [
      {
        id: `key_${Date.now()}`,
        label: newKeyLabel || "Untitled",
        prefix,
        created: "Just now",
        lastUsed: "Never",
        status: "active",
      },
      ...prev,
    ]);
    setShowGenerateModal(false);
  }

  function handleRevoke(id: string) {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: "revoked" as const } : k))
    );
  }

  const hasKeys = keys.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">API Keys</h2>
        <Button
          onClick={openGenerateModal}
          className="gap-2 bg-[#3DDC97] text-[#06140D] font-mono font-semibold text-xs hover:bg-[#3DDC97]/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Generate API key
        </Button>
      </div>

      {/* Table or empty state */}
      {!hasKeys ? (
        <EmptyState variant="no-keys" onAction={openGenerateModal} />
      ) : (
        <div className="rounded-[10px] border border-[#212930] bg-[#12171C] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2026] hover:bg-transparent">
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                  Label
                </TableHead>
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                  Key
                </TableHead>
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                  Created
                </TableHead>
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                  Last used
                </TableHead>
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]">
                  Status
                </TableHead>
                <TableHead className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C6670]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow
                  key={key.id}
                  className="border-[#1A2026] hover:bg-[#161C22]"
                >
                  <TableCell className="text-sm font-medium">
                    {key.label}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">
                    {key.prefix}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">
                    {key.created}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-[#8B96A1]">
                    {key.lastUsed}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        key.status === "active"
                          ? "inline-flex items-center rounded-full bg-[rgba(61,220,151,0.12)] px-2.5 py-0.5 text-xs font-mono font-semibold text-[#3DDC97]"
                          : "inline-flex items-center rounded-full bg-[rgba(139,150,161,0.12)] px-2.5 py-0.5 text-xs font-mono font-semibold text-[#8B96A1] line-through"
                      }
                    >
                      {key.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {key.status === "active" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[#FF5470] border-[#FF5470]/30 bg-[rgba(255,84,112,0.08)] hover:bg-[rgba(255,84,112,0.15)] text-xs font-mono"
                          >
                            Revoke
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[#161C22] border-[#212930]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[#E7EDF2]">
                              Revoke API Key
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-[#8B96A1]">
                              Are you sure you want to revoke &quot;{key.label}
                              &quot;? This action cannot be undone. Any
                              applications using this key will stop working
                              immediately.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="border-[#212930] text-[#8B96A1]">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRevoke(key.id)}
                              className="bg-[#FF5470] text-white hover:bg-[#FF5470]/90"
                            >
                              Revoke Key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Generate API Key Dialog */}
      <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
        <DialogContent className="bg-[#161C22] border-[#212930] sm:max-w-md">
          {generateStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#E7EDF2] font-display">
                  Generate API key
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-mono uppercase tracking-wider text-[#5C6670]">
                    Label
                  </Label>
                  <Input
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="e.g. Production, Local dev"
                    className="bg-[#0A0D10] border-[#212930] text-[#E7EDF2] placeholder:text-[#5C6670]"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowGenerateModal(false)}
                  className="border-[#212930] text-[#8B96A1]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  className="bg-[#3DDC97] text-[#06140D] font-mono font-semibold hover:bg-[#3DDC97]/90"
                >
                  Generate
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#E7EDF2] font-display">
                  Copy your key now
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[#3DDC97] bg-[#0A0D10] p-3">
                  <code className="text-xs text-[#3DDC97] font-mono break-all">
                    {generatedKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="border-[#212930] text-[#8B96A1] flex-shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="rounded-md bg-[rgba(245,166,35,0.1)] border border-[rgba(245,166,35,0.2)] p-3 text-xs text-[#F5A623]">
                  You won&apos;t be able to see this key again after closing
                  this window.
                </div>
                {copied && (
                  <p className="text-xs text-[#3DDC97] font-mono">
                    ✓ Copied to clipboard
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleConfirmCopied}
                  className="bg-[#3DDC97] text-[#06140D] font-mono font-semibold hover:bg-[#3DDC97]/90"
                >
                  I&apos;ve copied my key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
