import Dexie, { type Table } from 'dexie';
import type {
  BorrowRequestMutation,
  LocalBook,
  LocalRecord,
  LocalUser,
  SyncMeta,
  SyncMutation,
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
  syncQueue!: Table<SyncMutation, string>;
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
  }
}

export const db = new CpclmsDatabase();

export function canUseOfflineStorage(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export async function setSyncMeta(key: string, value: SyncMeta['value']): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await db.meta.put({ key, value, updatedAt: Date.now() });
}

export async function clearOfflineData(): Promise<void> {
  if (!canUseOfflineStorage()) return;
  await Promise.all([
    db.books.clear(),
    db.ebooks.clear(),
    db.categories.clear(),
    db.users.clear(),
    db.transactions.clear(),
    db.borrowRequests.clear(),
    db.reservations.clear(),
    db.notifications.clear(),
    db.syncQueue.clear(),
    db.meta.clear(),
  ]);
}

export type { BorrowRequestMutation };
