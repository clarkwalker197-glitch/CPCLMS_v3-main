import api from './api';
import { canUseOfflineStorage, db, setSyncMeta } from './db';
import type { SyncMutation } from './offline-types';

const SYNC_EVENT = 'cpclms-sync';
const SYNC_BATCH_SIZE = 2;
const SYNC_BATCH_DELAY_MS = 150;
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function replaceTable(table: 'books' | 'ebooks' | 'categories' | 'users' | 'transactions' | 'borrowRequests' | 'reservations' | 'notifications', records: unknown[]): Promise<void> {
  const normalized = records.filter((record): record is { id: string; _pending?: boolean } => Boolean(record && typeof record === 'object' && 'id' in record));
  const tableRef = db.table(table);
  const allIds = (await tableRef.toCollection().primaryKeys()) as string[];
  const pendingIds = new Set((await tableRef.filter((record: any) => Boolean(record?._pending)).primaryKeys()) as string[]);
  const serverIds = new Set(normalized.map((record) => record.id));
  const staleIds = allIds.filter((id: string) => !serverIds.has(id) && !pendingIds.has(id));

  if (staleIds.length) {
    await tableRef.bulkDelete(staleIds);
  }

  const rowsToPut = normalized.filter((record) => !pendingIds.has(record.id));
  if (rowsToPut.length) {
    await tableRef.bulkPut(rowsToPut);
  }
}

async function pullLatest(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;

  const jobs = [
    { table: 'books' as const, fetch: () => api.getBooks(), transform: (payload: unknown) => payload as any[] },
    { table: 'ebooks' as const, fetch: () => api.getEBooks(), transform: (payload: unknown) => payload as any[] },
    { table: 'categories' as const, fetch: () => api.getCategories(), transform: (payload: unknown) => payload as any[] },
    { table: 'users' as const, fetch: () => api.getMe(), transform: (payload: unknown) => (payload ? [payload] : []) },
    { table: 'borrowRequests' as const, fetch: () => api.getBorrowRequests({ limit: '100' }), transform: (payload: unknown) => (payload as any[] | undefined) ?? [] },
    { table: 'transactions' as const, fetch: () => api.getTransactions({ limit: '100' }), transform: (payload: unknown) => (payload as any[] | undefined) ?? [] },
    { table: 'reservations' as const, fetch: () => api.getReservations({ limit: '100' }), transform: (payload: unknown) => (payload as any[] | undefined) ?? [] },
    { table: 'notifications' as const, fetch: () => api.getNotifications({ limit: '50' }), transform: (payload: unknown) => { const notificationData = payload as { notifications?: unknown[] } | undefined; return notificationData?.notifications ?? []; } },
  ];

  for (let i = 0; i < jobs.length; i += SYNC_BATCH_SIZE) {
    const batch = jobs.slice(i, i + SYNC_BATCH_SIZE);
    await Promise.all(
      batch.map(async (job) => {
        const response = await job.fetch();
        if (response.success && response.data) {
          await replaceTable(job.table, job.transform(response.data));
        }
      })
    );

    if (i + SYNC_BATCH_SIZE < jobs.length) {
      await delay(SYNC_BATCH_DELAY_MS);
    }
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
    response = await api.createBorrowRequest(mutation.payload as { bookIds: string[]; notes?: string; localRequestIds?: string[] });
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

  if (mutation.type === 'CREATE_BORROW_REQUEST') {
    const localIds = Array.isArray(mutation.payload.localRequestIds)
      ? (mutation.payload.localRequestIds as string[])
      : [];
    const created = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];

    await Promise.all(localIds.map((id) => db.borrowRequests.delete(id)));
    if (created.length) {
      await db.borrowRequests.bulkPut(created.map((record: any) => ({ ...record, _pending: false })));
    }
  }

  if (mutation.type === 'MARK_NOTIFICATION_READ') {
    await db.notifications.update(String(mutation.payload.id), { _pending: false });
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
