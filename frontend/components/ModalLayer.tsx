"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

let activeModalLayers = 0;
let previousBodyOverflow = "";
let previousRootOverflow = "";

function acquireScrollLock() {
  if (activeModalLayers === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  activeModalLayers += 1;

  return () => {
    activeModalLayers = Math.max(0, activeModalLayers - 1);
    if (activeModalLayers === 0) {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    }
  };
}

export function ModalLayer({ children }: { children: React.ReactNode }) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const releaseScrollLock = acquireScrollLock();
    setPortalTarget(document.body);
    return releaseScrollLock;
  }, []);

  return portalTarget ? createPortal(children, portalTarget) : null;
}