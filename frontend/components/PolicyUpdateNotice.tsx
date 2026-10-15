"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

export function PolicyUpdateNotice() {
  const { user } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const latestVersion = useRef("");
  const storageKey = user ? `policiesLastSeenAt:${user.id}` : null;

  const checkForUpdates = useCallback(async (initial = false) => {
    if (!user || !storageKey) return;

    const response = await api.getPolicies<Array<{ key: string; updatedAt: string }>>();
    if (!response.success || !Array.isArray(response.data)) return;
    const latest = JSON.stringify(
      response.data
        .map((policy): [string, string] => [policy.key, policy.updatedAt])
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)),
    );
    latestVersion.current = latest;

    const storedValue = localStorage.getItem(storageKey);
    if (storedValue === null) {
      if (initial) localStorage.setItem(storageKey, latest);
      return;
    }
    setIsVisible(latest !== storedValue);
  }, [storageKey, user]);

  useEffect(() => {
    if (!user || !storageKey) {
      setIsVisible(false);
      return;
    }
    void checkForUpdates(true);
    const intervalId = window.setInterval(() => void checkForUpdates(), POLL_INTERVAL_MS);
    const handleFocus = () => void checkForUpdates();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkForUpdates, storageKey, user]);

  if (!isVisible) return null;

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, latestVersion.current);
    setIsVisible(false);
  };

  return (
    <div role="status" className="sticky top-0 z-[70] flex items-center justify-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100">
      <span>Policies have been updated. Please review the latest version.</span>
      <Link href="/policies" onClick={dismiss} className="font-semibold underline underline-offset-2 hover:text-white">
        Review policies
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss policy update notice" className="rounded p-1 text-amber-100/80 hover:bg-amber-100/10 hover:text-white">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
