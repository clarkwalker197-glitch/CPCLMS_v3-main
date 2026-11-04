"use client";

import { Check } from "lucide-react";
import { SUCCESS_MESSAGE_DURATION } from "@/lib/useTimedMessage";

type SuccessNoticeProps = {
  message: string;
  tone?: "success" | "warning";
};

export function SuccessNotice({ message, tone = "success" }: SuccessNoticeProps) {
  if (!message) return null;

  const isWarning = tone === "warning";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`cpc-feedback-success fixed right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[100] flex w-[calc(100%-2rem)] max-w-md items-center gap-2 overflow-hidden rounded-xl border bg-zinc-900/95 p-4 text-sm shadow-2xl shadow-black/40 backdrop-blur sm:right-6 sm:top-6 ${
        isWarning
          ? "border-amber-500/30 text-amber-400"
          : "border-emerald-500/30 text-emerald-400"
      }`}
    >
      {isWarning ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
      ) : (
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
      <span
        className={`cpc-success-progress absolute inset-x-0 bottom-0 h-0.5 ${
          isWarning ? "bg-amber-400/80" : "bg-emerald-400/80"
        }`}
        style={{ animationDuration: `${SUCCESS_MESSAGE_DURATION}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}
