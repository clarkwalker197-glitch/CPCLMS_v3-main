import api from './api';
import { canUseOfflineStorage, db, setSyncMeta } from './db';
import type { LocalRecord, SyncMutation } from './offline-types';

export const SYNC_EVENT = 'cpclms-sync';
const SYNC_BATCH_SIZE = 2;
const SYNC_BATCH_DELAY_MS = 150;
const MAX_SYNC_ATTEMPTS = 6;
const STUCK_SYNC_TIMEOUT_MS = 2 * 60_000;
let syncing = false;
let syncRequested = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function currentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.id || null;
  } catch {
    return null;
  }
}

function currentUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.role || null;
  } catch {
    return null;
  }
}

function notifySync(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const privateTables = ['transactions', 'borrowRequests', 'reservations', 'notifications'] as const;

async function replacePublicTable(
  table: 'books' | 'ebooks' | 'categories',
  records: unknown[]
): Promise<void> {
  const normalized = records.filter((record): record is LocalRecord =>
    Boolean(record && typeof record === 'object' && 'id' in record && typeof record.id === 'string')
  );
  const tableRef = db.table(table);
  const allIds = (await tableRef.toCollection().primaryKeys()) as string[];
  const pendingIds = new Set((await tableRef.filter((record: LocalRecord) => Boolean(record?._pending)).primaryKeys()) as string[]);
  const serverIds = new Set(normalized.map((record) => record.id));
  const staleIds = allIds.filter((id) => !serverIds.has(id) && !pendingIds.has(id));

  if (staleIds.length) await tableRef.bulkDelete(staleIds);
  const rowsToPut = normalized.filter((record) => !pendingIds.has(record.id));
  if (rowsToPut.length) await tableRef.bulkPut(rowsToPut);
}

async function replaceUserTable(
  table: (typeof privateTables)[number],
  records: unknown[],
  userId: string
): Promise<void> {
  const normalized = records
    .filter((record): record is LocalRecord =>
      Boolean(record && typeof record === 'object' && 'id' in record && typeof record.id === 'string')
    )
    .map((record) => ({ ...record, userId }));
  const tableRef = db.table(table);
  const currentIds = (await tableRef.where('userId').equals(userId).primaryKeys()) as string[];
  const pendingIds = new Set(
    (await tableRef.where('userId').equals(userId).filter((record: LocalRecord) =>
      Boolean(record?._pending || record?._syncStatus === 'FAILED' || record?._syncStatus === 'CONFLICT')
    ).primaryKeys()) as string[]
  );
  const serverIds = new Set(normalized.map((record) => record.id));
  const staleIds = currentIds.filter((id) => !serverIds.has(String(id)) && !pendingIds.has(String(id)));
  if (staleIds.length) await tableRef.bulkDelete(staleIds);
  const rowsToPut = normalized.filter((record) => !pendingIds.has(record.id));
  if (rowsToPut.length) await tableRef.bulkPut(rowsToPut);
}

async function fetchCatalog(
  type: 'books' | 'ebooks'
): Promise<LocalRecord[]> {
  const records: LocalRecord[] = [];
  const pageSize = 100;
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 100) {
    const response = type === 'books'
      ? await api.getBooks({ page: String(page), limit: String(pageSize) })
      : await api.getEBooks({ page: String(page), limit: String(pageSize) });
    if (!response.success || !response.data) {
      throw new Error(response.error || `Unable to synchronize ${type}.`);
    }
    records.push(...response.data);
    totalPages = Math.max(1, response.meta?.totalPages || 1);
    page += 1;
  }
  return records;
}

async function pullLatest(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;

  const books = await fetchCatalog('books');
  await replacePublicTable('books', books);
  const ebooks = await fetchCatalog('ebooks');
  await replacePublicTable('ebooks', ebooks);
  const catalogSyncedAt = Date.now();
  await db.meta.put({ key: 'booksLastSyncedAt', value: catalogSyncedAt, updatedAt: catalogSyncedAt });
  await db.meta.put({ key: 'ebooksLastSyncedAt', value: catalogSyncedAt, updatedAt: catalogSyncedAt });

  const [categoriesRes, profileRes, requestsRes, transactionsRes, reservationsRes, notificationsRes, dashboardRes] =
    await Promise.all([
      api.getCategories(),
      api.getMe(),
      api.getBorrowRequests({ limit: '100' }),
      api.getTransactions({ limit: '100' }),
      api.getReservations({ limit: '100' }),
      api.getNotifications({ limit: '50' }),
      currentUserRole() === 'LIBRARIAN'
        ? api.getDashboardStats()
        : api.getMyDashboardStats(),
    ]);

  const results = [categoriesRes, profileRes, requestsRes, transactionsRes, reservationsRes, notificationsRes, dashboardRes];
  const failed = results.find((response) => !response.success);
  if (failed) throw new Error(failed.error || 'Unable to synchronize account data.');

  const categories = categoriesRes.data || [];
  await replacePublicTable('categories', categories);

  if (profileRes.data) {
    const profile = profileRes.data;
    await db.users.put({
      id: userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      libraryId: profile.libraryId,
      department: profile.department,
      yearSection: profile.yearSection,
      updatedAt: new Date().toISOString(),
    });
  }

  await replaceUserTable('borrowRequests', requestsRes.data || [], userId);
  await replaceUserTable('transactions', transactionsRes.data || [], userId);
  await replaceUserTable('reservations', reservationsRes.data || [], userId);

  const notificationData = notificationsRes.data as { notifications?: unknown[] } | undefined;
  await replaceUserTable('notifications', notificationData?.notifications || [], userId);

  if (dashboardRes.data) {
    await db.dashboard.put({
      id: userId,
      userId,
      snapshot: dashboardRes.data,
      updatedAt: new Date().toISOString(),
      syncedAt: Date.now(),
    });
  }
  await setSyncMeta(`lastFullSyncAt:${userId}`, Date.now());
}

export async function pullBooks(): Promise<void> {
  const records = await fetchCatalog('books');
  await replacePublicTable('books', records);
}

export async function pullTransactions(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const response = await api.getTransactions({ limit: '100' });
  if (response.success && response.data) await replaceUserTable('transactions', response.data, userId);
}

export async function pullNotifications(): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;
  const response = await api.getNotifications({ limit: '50' });
  if (response.success && response.data) {
    const payload = response.data as { notifications?: unknown[] };
    await replaceUserTable('notifications', payload.notifications || [], userId);
  }
}

function mutationRequest(mutation: SyncMutation) {
  if (mutation.type === 'CREATE_BORROW_REQUEST') {
    return api.createBorrowRequest(
      mutation.payload as { bookIds: string[]; notes?: string },
      mutation.idempotencyKey
    );
  }
  if (mutation.type === 'CREATE_RESERVATION') {
    return api.reserveBook(String(mutation.payload.bookId), mutation.idempotencyKey);
  }
  if (mutation.type === 'MARK_NOTIFICATION_READ') {
    return api.markNotificationRead(String(mutation.payload.id));
  }
  return api.markAllNotificationsRead();
}

async function markLocalMutationFailed(mutation: SyncMutation, status: 'FAILED' | 'CONFLICT', message: string): Promise<void> {
  const ids = Array.isArray(mutation.payload.localRequestIds)
    ? mutation.payload.localRequestIds as string[]
    : mutation.payload.localReservationId
      ? [String(mutation.payload.localReservationId)]
      : [];
  const table = mutation.type === 'CREATE_RESERVATION' ? db.reservations : db.borrowRequests;
  await Promise.all(ids.map((id) => table.update(id, {
    _syncStatus: status,
    _syncError: message,
    _pending: false,
  })));
  if (mutation.type === 'MARK_NOTIFICATION_READ') {
    await db.notifications.update(String(mutation.payload.id), {
      isRead: Boolean(mutation.payload.previousIsRead),
      _pending: false,
      _syncStatus: status,
      _syncError: message,
    });
  }
  if (mutation.type === 'MARK_ALL_NOTIFICATIONS_READ') {
    const previousStates = Array.isArray(mutation.payload.previousStates)
      ? mutation.payload.previousStates as Array<{ id: string; isRead: boolean }>
      : [];
    await Promise.all(previousStates.map((record) => db.notifications.update(record.id, {
      isRead: record.isRead,
      _pending: false,
      _syncStatus: status,
      _syncError: message,
    })));
  }
}

async function pushMutation(mutation: SyncMutation): Promise<boolean> {
  const response = await mutationRequest(mutation);
  if (!response.success) {
    const attempts = mutation.attempts + 1;
    const transient = Boolean(response.networkError || response.rateLimited || (response.statusCode !== undefined && response.statusCode >= 500));
    const terminalStatus = response.statusCode === 409 ? 'CONFLICT' : 'FAILED';
    const shouldRetry = transient && attempts < MAX_SYNC_ATTEMPTS;
    const message = response.error || 'Synchronization failed.';

    if (shouldRetry) {
      const backoff = Math.min(5 * 60_000, 2_000 * 2 ** (attempts - 1));
      await db.syncQueue.update(mutation.id, {
        attempts,
        status: 'PENDING',
        nextAttemptAt: Date.now() + backoff,
        lastError: message,
      });
    } else {
      await db.syncQueue.update(mutation.id, {
        attempts,
        status: terminalStatus,
        lastError: message,
      });
      if (mutation.type === 'CREATE_BORROW_REQUEST' || mutation.type === 'CREATE_RESERVATION') {
        await markLocalMutationFailed(mutation, terminalStatus, message);
      }
    }
    notifySync();
    return false;
  }

  if (mutation.type === 'CREATE_BORROW_REQUEST') {
    const localIds = Array.isArray(mutation.payload.localRequestIds)
      ? mutation.payload.localRequestIds as string[]
      : [];
    const created = Array.isArray(response.data?.requests)
      ? response.data.requests
      : Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
    await Promise.all(localIds.map((id) => db.borrowRequests.delete(id)));
    if (created.length) {
      await db.borrowRequests.bulkPut(created.map((record: LocalRecord) => ({
        ...record,
        userId: mutation.userId,
        _pending: false,
      })));
    }
  } else if (mutation.type === 'CREATE_RESERVATION') {
    const localId = String(mutation.payload.localReservationId || '');
    if (localId) await db.reservations.delete(localId);
    if (response.data) {
      await db.reservations.put({
        ...response.data,
        userId: mutation.userId,
        _pending: false,
      });
    }
  } else if (mutation.type === 'MARK_NOTIFICATION_READ') {
    await db.notifications.update(String(mutation.payload.id), { isRead: true, _pending: false, _syncStatus: 'SYNCED' });
  } else if (mutation.type === 'MARK_ALL_NOTIFICATIONS_READ') {
    await db.notifications.where('userId').equals(mutation.userId).modify({
      isRead: true,
      _pending: false,
      _syncStatus: 'SYNCED',
    });
  }

  await db.syncQueue.delete(mutation.id);
  notifySync();
  return true;
}

type NewMutation = Omit<SyncMutation, 'id' | 'createdAt' | 'attempts' | 'idempotencyKey' | 'status'> &
  Partial<Pick<SyncMutation, 'idempotencyKey' | 'status'>>;

export async function enqueueMutation(input: NewMutation): Promise<void> {
  if (!canUseOfflineStorage()) throw new Error('Offline storage is unavailable on this device.');
  const mutation: SyncMutation = {
    ...input,
    id: crypto.randomUUID(),
    idempotencyKey: input.idempotencyKey || crypto.randomUUID(),
    status: 'PENDING',
    createdAt: Date.now(),
    attempts: 0,
  };
  await db.syncQueue.add(mutation);
  notifySync();

  if (typeof navigator === 'undefined' || navigator.onLine) {
    if (syncing) syncRequested = true;
    else void syncNow();
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const backgroundSync = (registration as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      }).sync;
      await backgroundSync?.register('cpclms-sync');
    } catch {
      // Reconnect and app-start sync remain available if Background Sync is unsupported.
    }
  }
}

export async function pendingMutationCount(): Promise<number> {
  const userId = currentUserId();
  if (!canUseOfflineStorage() || !userId) return 0;
  return db.syncQueue.where('userId').equals(userId).filter((mutation) =>
    mutation.status === 'PENDING' || mutation.status === 'SYNCING' || !mutation.status
  ).count();
}

async function scheduleQueueRetry(): Promise<void> {
  const userId = currentUserId();
  if (!userId || !canUseOfflineStorage() || !isOnline()) return;
  if (retryTimer) clearTimeout(retryTimer);
  const now = Date.now();
  const pendingMutations = await db.syncQueue.where('userId').equals(userId)
    .filter((mutation) =>
      mutation.status === 'PENDING' &&
      typeof mutation.nextAttemptAt === 'number' &&
      mutation.nextAttemptAt > now
    )
    .toArray();
  const nextAttemptAt = pendingMutations.reduce<number | undefined>((soonest, mutation) => {
    const attemptAt = mutation.nextAttemptAt;
    return typeof attemptAt === 'number'
      ? soonest === undefined ? attemptAt : Math.min(soonest, attemptAt)
      : soonest;
  }, undefined);
  if (nextAttemptAt === undefined) {
    retryTimer = undefined;
    return;
  }
  const delayMs = nextAttemptAt - now;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void syncNow();
  }, delayMs);
}

export async function failedMutationCount(): Promise<number> {
  const userId = currentUserId();
  if (!canUseOfflineStorage() || !userId) return 0;
  return db.syncQueue.where('userId').equals(userId).filter((mutation) =>
    mutation.status === 'FAILED' || mutation.status === 'CONFLICT'
  ).count();
}

export function isSyncing(): boolean {
  return syncing;
}

export async function lastSyncTime(): Promise<number | null> {
  const userId = currentUserId();
  if (!userId || !canUseOfflineStorage()) return null;
  const meta = await db.meta.get(`lastFullSyncAt:${userId}`);
  return typeof meta?.value === 'number' ? meta.value : null;
}

export async function pushQueue(): Promise<void> {
  const userId = currentUserId();
  if (!canUseOfflineStorage() || !userId) return;

  const push = async (): Promise<void> => {
    const now = Date.now();
    const storedMutations = await db.syncQueue.where('userId').equals(userId).toArray();
    const stuckMutations = storedMutations.filter((mutation) =>
      mutation.status === 'SYNCING' &&
      now - (mutation.lastAttemptAt ?? mutation.createdAt) >= STUCK_SYNC_TIMEOUT_MS
    );
    await Promise.all(stuckMutations.map((mutation) =>
      db.syncQueue.update(mutation.id, {
        status: 'PENDING',
        nextAttemptAt: undefined,
        lastAttemptAt: undefined,
      })
    ));

    const mutations = await db.syncQueue.where('userId').equals(userId).sortBy('createdAt');

    for (const storedMutation of mutations) {
      if (storedMutation.status === 'FAILED' || storedMutation.status === 'CONFLICT') continue;
      if (storedMutation.status === 'SYNCING') continue;
      if (storedMutation.nextAttemptAt && storedMutation.nextAttemptAt > Date.now()) continue;
      const mutation: SyncMutation = {
        ...storedMutation,
        idempotencyKey: storedMutation.idempotencyKey || crypto.randomUUID(),
        status: 'PENDING',
      };
      if (!storedMutation.idempotencyKey || !storedMutation.status) {
        await db.syncQueue.put(mutation);
      }
      await db.syncQueue.update(mutation.id, { status: 'SYNCING', lastAttemptAt: Date.now() });
      if (!(await pushMutation(mutation))) break;
    }
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('cpclms-sync', push);
  } else {
    await push();
  }
}

export async function syncNow(): Promise<void> {
  if (!canUseOfflineStorage() || !isOnline() || syncing || !currentUserId()) return;
  syncing = true;
  notifySync();
  try {
    await pushQueue();
    if (isOnline()) await pullLatest();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.warn('[Offline] Sync paused:', error);
  } finally {
    syncing = false;
    notifySync();
    void scheduleQueueRetry();
    if (syncRequested) {
      syncRequested = false;
      void syncNow();
    }
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
