'use client';

import { useEffect, useState } from 'react';
import { Check, Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  failedMutationCount,
  isSyncing,
  lastSyncTime,
  pendingMutationCount,
  subscribeToSync,
  syncNow,
} from '@/lib/offline-sync';
import { NETWORK_STATUS_EVENT } from '@/lib/network-status';

export function OfflineIndicator() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [justSynced, setJustSynced] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const displayDuration = 5000;
    let wasSyncing = isSyncing();
    let previousPending: number | null = null;
    let previousFailed: number | null = null;
    let completeTimer: ReturnType<typeof setTimeout> | undefined;
    let visibilityTimer: ReturnType<typeof setTimeout> | undefined;
    const showTemporarily = () => {
      setVisible(true);
      if (visibilityTimer) clearTimeout(visibilityTimer);
      visibilityTimer = setTimeout(() => setVisible(false), displayDuration);
    };
    let currentOnline = navigator.onLine;
    const update = async () => {
      const [nextPending, nextFailed, lastSync] = await Promise.all([
        pendingMutationCount(),
        failedMutationCount(),
        lastSyncTime(),
      ]);
      const nextSyncing = isSyncing();
      setPending(nextPending);
      setFailed(nextFailed);
      setLastSynced(lastSync);
      setSyncing(nextSyncing);
      if (
        wasSyncing !== nextSyncing ||
        (previousPending !== null && previousPending !== nextPending) ||
        (previousFailed !== null && previousFailed !== nextFailed)
      ) {
        showTemporarily();
      }
      if (wasSyncing && !nextSyncing && nextPending === 0 && nextFailed === 0) {
        setJustSynced(true);
        showTemporarily();
        if (completeTimer) clearTimeout(completeTimer);
        completeTimer = setTimeout(() => setJustSynced(false), displayDuration);
      }
      wasSyncing = nextSyncing;
      previousPending = nextPending;
      previousFailed = nextFailed;
    };
    const handleNetwork = (event: Event) => {
      const statusEvent = event as CustomEvent<{ online: boolean }>;
      if (currentOnline !== statusEvent.detail.online) {
        currentOnline = statusEvent.detail.online;
        setOnline(currentOnline);
        showTemporarily();
      }
      if (statusEvent.detail.online) void syncNow();
    };
    const handleOnline = () => {
      if (!currentOnline) {
        currentOnline = true;
        setOnline(true);
        showTemporarily();
      }
      void syncNow();
    };
    const handleOffline = () => {
      if (currentOnline) {
        currentOnline = false;
        setOnline(false);
        showTemporarily();
      }
    };
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CPCLMS_SYNC') void syncNow();
    };

    setOnline(currentOnline);
    showTemporarily();
    void update();
    void syncNow();
    const unsubscribe = subscribeToSync(() => void update());
    window.addEventListener(NETWORK_STATUS_EVENT, handleNetwork);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    return () => {
      unsubscribe();
      window.removeEventListener(NETWORK_STATUS_EVENT, handleNetwork);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
      if (completeTimer) clearTimeout(completeTimer);
      if (visibilityTimer) clearTimeout(visibilityTimer);
    };
  }, []);

  if (!visible) return null;

  const isOnline = online !== false;
  const message = failed > 0
    ? `${failed} change${failed === 1 ? '' : 's'} need attention`
    : syncing
      ? `Syncing${pending ? ` ${pending} pending` : ''}...`
      : !isOnline
        ? 'Offline — showing cached data'
        : justSynced
          ? 'Changes synchronized'
          : pending > 0
            ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync`
            : 'Online';
  const updatedLabel = lastSynced
    ? `Last sync ${new Date(lastSynced).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}`
    : '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur"
      title={updatedLabel}
    >
      {!isOnline
        ? <CloudOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        : syncing
          ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />
          : failed > 0
            ? <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
            : justSynced
              ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              : <Cloud className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
      <span className="truncate">{message}</span>
      {!isOnline && lastSynced && <span className="hidden text-zinc-500 sm:inline">{updatedLabel}</span>}
    </div>
  );
}
