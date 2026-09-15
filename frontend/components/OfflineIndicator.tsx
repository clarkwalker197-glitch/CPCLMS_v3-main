'use client';

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { pendingMutationCount, subscribeToSync, syncNow } from '@/lib/sync';

export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const update = async () => setPending(await pendingMutationCount());
    const handleOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const handleOffline = () => setOnline(false);

    setOnline(navigator.onLine);
    void update();
    void syncNow();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribe = subscribeToSync(update);
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-xs text-zinc-200 shadow-xl backdrop-blur">
      {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <CloudOff className="h-3.5 w-3.5 text-amber-400" />}
      <span>{online ? `${pending} action${pending === 1 ? '' : 's'} waiting to sync` : 'Offline mode'}</span>
      {online && <Cloud className="h-3.5 w-3.5 text-emerald-400" />}
    </div>
  );
}
