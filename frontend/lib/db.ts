import Dexie, { type Table } from 'dexie';
import type {
  LocalBook,
  LocalRecord,
  LocalUser,
  SyncMeta,
} from './offline-types';

export class CpclmsDatabase extends Dexie {
  books!: Table<LocalBook, string>;
  ebooks!: Table<LocalBook, string>;
  transactions!: Table<LocalRecord, string>;
  reservations!: Table<LocalRecord, string>;
  notifications!: Table<LocalRecord, string>;
  categories!: Table<LocalRecord, string>;
  users!: Table<LocalUser, string>;
  borrowRequests!: Table<LocalRecord, string>;
  dashboard!: Table<LocalRecord, string>;
  meta!: Table<SyncMeta, string>;

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
      syncQueue: 'id, userId, createdAt, type',
      meta: 'key, updatedAt',
    });
    this.version(2).stores({
      books: 'id, updatedAt, title, author, isbn, categoryId, classificationNumber',
      ebooks: 'id, updatedAt, title, author, isbn, categoryId, classificationNumber',
      categories: 'id, updatedAt, slug',
      users: 'id, updatedAt, libraryId',
      transactions: 'id, updatedAt, userId, status',
      borrowRequests: 'id, updatedAt, userId, status',
      reservations: 'id, updatedAt, userId, status',
      notifications: 'id, userId, createdAt, isRead',
      dashboard: 'id, updatedAt',
      syncQueue: 'id, userId, createdAt, type, status, nextAttemptAt',
      meta: 'key, updatedAt',
    });
    this.version(3).stores({
      books: 'id, updatedAt, title, author, isbn, categoryId, classificationNumber',
      ebooks: 'id, updatedAt, title, author, isbn, categoryId, classificationNumber',
      categories: 'id, updatedAt, slug',
      users: 'id, updatedAt, libraryId',
      transactions: 'id, updatedAt, userId, status',
      borrowRequests: 'id, updatedAt, userId, status',
      reservations: 'id, updatedAt, userId, status',
      notifications: 'id, userId, createdAt, isRead',
      dashboard: 'id, updatedAt',
      syncQueue: null,
      meta: 'key, updatedAt',
    });
  }
}

export const db = new CpclmsDatabase();

export function canUseOfflineStorage(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export async function clearOfflineData(): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await Promise.all([
    db.users.clear(),
    db.transactions.clear(),
    db.borrowRequests.clear(),
    db.reservations.clear(),
    db.notifications.clear(),
    db.dashboard.clear(),
    db.meta.filter((record) => record.key.startsWith('lastFullSyncAt:')).delete(),
  ]);
  if (typeof caches !== 'undefined') {
    const sensitiveCacheNames = (await caches.keys()).filter((name) =>
      /api-cache|cpc-library-shell/i.test(name)
    );
    await Promise.all(sensitiveCacheNames.map((name) => caches.delete(name)));
  }
}
