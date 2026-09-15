import api from './api';
import { canUseOfflineStorage, db, setSyncMeta } from './db';
import type { SyncMutation } from './offline-types';

const SYNC_EVENT = 'cpclms-sync';
let syncing = false;

function currentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.id || null;
  } catch {
    return null;
  }
}

function notifySync(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
}

async function replaceTable(table: 'books' | 'ebooks' | 'categories' | 'users' | 'transactions' | 'borrowRequests' | 'reservations' | 'notifications', records: unknown[]): Promise<void> {
  if (!records.length) return;
  const normalized = records.filter((record): record is { id: string } => Boolean(record && typeof record === 'object' && 'id' in record));
  if (normalized.length) await db.table(table).bulkPut(normalized);
}

async function pullLatest(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;

  const [books, ebooks, categories, me, requests, transactions, reservations, notifications] = await Promise.all([
    api.getBooks(),
    api.getEBooks(),
    api.getCategories(),
    api.getMe(),
    api.getBorrowRequests({ limit: '100' }),
    api.getTransactions({ limit: '100' }),
    api.getReservations({ limit: '100' }),
    api.getNotifications({ limit: '50' }),
  ]);

  if (books.success && books.data) await replaceTable('books', books.data);
  if (ebooks.success && ebooks.data) await replaceTable('ebooks', ebooks.data);
  if (categories.success && categories.data) await replaceTable('categories', categories.data);
  if (me.success && me.data) await replaceTable('users', [me.data]);
  if (requests.success && requests.data) await replaceTable('borrowRequests', requests.data);
  if (transactions.success && transactions.data) await replaceTable('transactions', transactions.data);
  if (reservations.success && reservations.data) await replaceTable('reservations', reservations.data);
  if (notifications.success && notifications.data) {
    const notificationData = notifications.data as { notifications?: unknown[] };
    await replaceTable('notifications', notificationData.notifications || []);
  }
  await setSyncMeta('lastFullSyncAt', Date.now());
}

export async function pullBooks(): Promise<void> {
  const response = await api.getBooks();
  if (response.success && response.data) await replaceTable('books', response.data);
}

export async function pullTransactions(): Promise<void> {
  const response = await api.getTransactions({ limit: '100' });
  if (response.success && response.data) await replaceTable('transactions', response.data);
}

export async function pullNotifications(): Promise<void> {
  const response = await api.getNotifications({ limit: '50' });
  if (response.success && response.data) {
    const payload = response.data as { notifications?: unknown[] };
    await replaceTable('notifications', payload.notifications || []);
  }
}

async function pushMutation(mutation: SyncMutation): Promise<boolean> {
  let response;
  if (mutation.type === 'CREATE_BORROW_REQUEST') {
    response = await api.createBorrowRequest(mutation.payload as { bookIds: string[]; notes?: string });
  } else if (mutation.type === 'MARK_NOTIFICATION_READ') {
    response = await api.markNotificationRead(String(mutation.payload.id));
  } else {
    response = await api.markAllNotificationsRead();
  }

  if (!response.success) {
    await db.syncQueue.update(mutation.id, {
      attempts: mutation.attempts + 1,
      lastError: response.error || 'Sync failed',
    });
    return false;
  }

  await db.syncQueue.delete(mutation.id);
  return true;
}

export async function enqueueMutation(input: Omit<SyncMutation, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await db.syncQueue.add({
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  });
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const backgroundSync = (registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }).sync;
      await backgroundSync?.register('cpclms-sync');
    } catch {
      // Reconnect and app-start sync remain available when Background Sync is unsupported.
    }
  }
  notifySync();
}

export async function pendingMutationCount(): Promise<number> {
  if (!canUseOfflineStorage()) return 0;
  return db.syncQueue.count();
}

export async function pushQueue(): Promise<void> {
  if (!canUseOfflineStorage()) return;
  const mutations = await db.syncQueue.orderBy('createdAt').toArray();
  for (const mutation of mutations) {
    if (!(await pushMutation(mutation))) break;
  }
}

export async function syncNow(): Promise<void> {
  if (!canUseOfflineStorage() || typeof navigator === 'undefined' || !navigator.onLine || syncing || !currentUserId()) return;
  syncing = true;
  try {
    await pushQueue();
    await pullLatest();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('[Offline] Sync paused:', error);
  } finally {
    syncing = false;
    notifySync();
  }
}

export const fullSync = syncNow;

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function subscribeToConnectivity(listener: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const online = () => listener(true);
  const offline = () => listener(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}

export function subscribeToSync(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(SYNC_EVENT, listener);
  return () => window.removeEventListener(SYNC_EVENT, listener);
}

export { SYNC_EVENT };
