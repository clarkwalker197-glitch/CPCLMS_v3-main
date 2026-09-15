import Dexie, { type Table } from 'dexie';

export interface CachedBook {
  id: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CachedRecord {
  id: string;
  updatedAt?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface SyncMutation {
  id: string;
  userId: string;
  type: 'CREATE_BORROW_REQUEST' | 'MARK_NOTIFICATION_READ' | 'MARK_ALL_NOTIFICATIONS_READ';
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export class OfflineDatabase extends Dexie {
  books!: Table<CachedBook, string>;
  ebooks!: Table<CachedBook, string>;
  categories!: Table<CachedRecord, string>;
  users!: Table<CachedRecord, string>;
  transactions!: Table<CachedRecord, string>;
  borrowRequests!: Table<CachedRecord, string>;
  reservations!: Table<CachedRecord, string>;
  notifications!: Table<CachedRecord, string>;
  mutations!: Table<SyncMutation, string>;

  constructor() {
    super('cpclms-offline');
    this.version(1).stores({
      books: 'id, updatedAt, title, author, categoryId',
      ebooks: 'id, updatedAt, title, author, categoryId',
      categories: 'id, updatedAt, slug',
      users: 'id, updatedAt, libraryId',
      transactions: 'id, updatedAt, userId, status',
      borrowRequests: 'id, updatedAt, userId, status',
      reservations: 'id, updatedAt, userId, status',
      notifications: 'id, createdAt, isRead',
      mutations: 'id, userId, createdAt, type',
    });
  }
}

export const offlineDb = new OfflineDatabase();

export function canUseOfflineStorage(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export async function clearOfflineData(): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await Promise.all([
    offlineDb.books.clear(),
    offlineDb.ebooks.clear(),
    offlineDb.categories.clear(),
    offlineDb.users.clear(),
    offlineDb.transactions.clear(),
    offlineDb.borrowRequests.clear(),
    offlineDb.reservations.clear(),
    offlineDb.notifications.clear(),
    offlineDb.mutations.clear(),
  ]);
}
