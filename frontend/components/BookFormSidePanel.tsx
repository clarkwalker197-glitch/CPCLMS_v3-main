"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { ModalLayer } from "@/components/ModalLayer";

type BookFormSidePanelProps = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
};

export function BookFormSidePanel({
  open,
  onClose,
  ariaLabel,
  children,
}: BookFormSidePanelProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <ModalLayer>
      <div className="fixed inset-0 z-[60]">
        <button
          type="button"
          aria-label="Close form"
          onClick={onClose}
          className="cpc-side-panel-backdrop-enter absolute inset-0 bg-black/65"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className="cpc-side-panel-enter absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-zinc-100 shadow-2xl sm:max-w-[400px] sm:px-5"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="absolute right-4 top-4 z-10 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {children}
        </aside>
      </div>
    </ModalLayer>
  );
}
