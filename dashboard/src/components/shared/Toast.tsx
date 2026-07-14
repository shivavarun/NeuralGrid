"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ToastType = "success" | "error";

interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

let toastId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

/** Fire a global toast from anywhere */
export function toast(type: ToastType, text: string) {
  const msg: ToastMessage = { id: ++toastId, type, text };
  listeners.forEach((fn) => fn(msg));
}

export function ToastProvider() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const latest = messages[messages.length - 1];
    const timer = setTimeout(() => dismiss(latest.id), 4000);
    return () => clearTimeout(timer);
  }, [messages, dismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-xl text-sm font-mono animate-in slide-in-from-bottom-2",
            msg.type === "success"
              ? "bg-[#12171C] border-[#3DDC97]/40 text-[#3DDC97]"
              : "bg-[#12171C] border-[#FF5470]/40 text-[#FF5470]"
          )}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="text-[#E7EDF2]">{msg.text}</span>
          <button
            onClick={() => dismiss(msg.id)}
            className="ml-2 text-[#5C6670] hover:text-[#E7EDF2]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
