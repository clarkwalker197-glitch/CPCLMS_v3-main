import api from './api';
import { canUseOfflineStorage, offlineDb, type SyncMutation } from './offline-db';

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
  if (normalized.length) await offlineDb.table(table).bulkPut(normalized);
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
    await offlineDb.mutations.update(mutation.id, {
      attempts: mutation.attempts + 1,
      lastError: response.error || 'Sync failed',
    });
    return false;
  }

  await offlineDb.mutations.delete(mutation.id);
  return true;
}

export async function enqueueMutation(input: Omit<SyncMutation, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await offlineDb.mutations.add({
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
  return offlineDb.mutations.count();
}

export async function syncNow(): Promise<void> {
  if (!canUseOfflineStorage() || typeof navigator === 'undefined' || !navigator.onLine || syncing || !currentUserId()) return;
  syncing = true;
  try {
    const mutations = await offlineDb.mutations.orderBy('createdAt').toArray();
    for (const mutation of mutations) {
      const synced = await pushMutation(mutation);
      if (!synced) break;
    }
    await pullLatest();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('[Offline] Sync paused:', error);
  } finally {
    syncing = false;
    notifySync();
  }
}

export function subscribeToSync(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(SYNC_EVENT, listener);
  return () => window.removeEventListener(SYNC_EVENT, listener);
}

export { SYNC_EVENT };
