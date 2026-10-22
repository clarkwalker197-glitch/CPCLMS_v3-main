"use client";

import { Check } from "lucide-react";
import { SUCCESS_MESSAGE_DURATION } from "@/lib/useTimedMessage";

type SuccessNoticeProps = {
  message: string;
};

export function SuccessNotice({ message }: SuccessNoticeProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="cpc-feedback-success relative mb-4 flex w-full items-center gap-2 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400"
    >
      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
      <span
        className="cpc-success-progress absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400/80"
        style={{ animationDuration: `${SUCCESS_MESSAGE_DURATION}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}
