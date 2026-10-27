"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ModalLayer } from "@/components/ModalLayer";

export const SIDE_PANEL_ANIMATION_DURATION_MS = 280;

export function getSidePanelAnimationDurationMs() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : SIDE_PANEL_ANIMATION_DURATION_MS;
}

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
  const [isMounted, setIsMounted] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    let openFrame: number | undefined;
    let closeTimer: number | undefined;

    if (open && !isMountedRef.current) {
      openFrame = window.requestAnimationFrame(() => {
        isMountedRef.current = true;
        setIsMounted(true);
      });
    } else if (!open && isMountedRef.current) {
      closeTimer = window.setTimeout(() => {
        isMountedRef.current = false;
        setIsMounted(false);
      }, getSidePanelAnimationDurationMs());
    }

    return () => {
      if (openFrame !== undefined) window.cancelAnimationFrame(openFrame);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const shouldRender = open || isMounted;
  const isClosing = !open && isMounted;
  if (!shouldRender) return null;

  return (
    <ModalLayer>
      <div className="fixed inset-0 z-[60]">
        <button
          type="button"
          aria-label="Close form"
          onClick={onClose}
          className={`absolute inset-0 bg-black/65 ${
            isClosing ? "cpc-side-panel-backdrop-exit" : "cpc-side-panel-backdrop-enter"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={`${isClosing ? "cpc-side-panel-exit" : "cpc-side-panel-enter"} absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 text-zinc-100 shadow-2xl sm:max-w-[400px] sm:px-5`}
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
