'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { syncOfflineBorrowRequests } from '@/lib/offline-borrow-requests';
import { NETWORK_STATUS_EVENT } from '@/lib/network-status';
import { syncCatalogForOffline } from '@/lib/catalog-cache';

export function OfflineBorrowRequestSync() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || user.role === 'LIBRARIAN') return;

    const cacheCatalogs = () => {
      if (!navigator.onLine) return;
      void Promise.all([
        syncCatalogForOffline('books'),
        syncCatalogForOffline('ebooks'),
      ]).catch((error: unknown) => {
        console.error('[Offline] Could not synchronize catalogs:', error);
      });
    };
    const sync = () => {
      if (!navigator.onLine) return;
      void syncOfflineBorrowRequests(user.id).catch((error: unknown) => {
        console.error('[Offline] Could not sync queued borrow requests:', error);
      });
    };
    const syncWhenReachable = (event: Event) => {
      if ((event as CustomEvent<{ online?: boolean }>).detail?.online) sync();
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };

    if (navigator.onLine) {
      sync();
      cacheCatalogs();
    }
    const retryInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 30_000);
    window.addEventListener('online', sync);
    window.addEventListener('focus', retryWhenVisible);
    document.addEventListener('visibilitychange', retryWhenVisible);
    window.addEventListener('online', cacheCatalogs);
    window.addEventListener(NETWORK_STATUS_EVENT, syncWhenReachable);
    return () => {
      window.clearInterval(retryInterval);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', retryWhenVisible);
      document.removeEventListener('visibilitychange', retryWhenVisible);
      window.removeEventListener('online', cacheCatalogs);
      window.removeEventListener(NETWORK_STATUS_EVENT, syncWhenReachable);
    };
  }, [loading, user]);

  return null;
}
