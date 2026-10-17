import api from './api';
import { offlineDb } from './offline-db';
import type { OfflineBorrowRequest } from './offline-types';

export const OFFLINE_BORROW_REQUESTS_UPDATED = 'cpclms-offline-borrow-requests-updated';

type Borrower = {
  id: string;
  firstName: string;
  lastName: string;
  libraryId: string;
  role: string;
};

type BorrowableBook = {
  id: string;
  title: string;
  author?: string | null;
  accessionNo?: string | null;
};

type QueueBorrowRequestInput = {
  user: Borrower;
  books: BorrowableBook[];
  notes?: string;
  idempotencyKey?: string;
};

function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

function getLocalRequest(queueItem: OfflineBorrowRequest, syncStatus: 'QUEUED' | 'SYNC_FAILED', error?: string) {
  return {
    id: queueItem.id,
    userId: queueItem.userId,
    requestBatchId: queueItem.id,
    requestDate: queueItem.createdAt,
    createdAt: queueItem.createdAt,
    notes: queueItem.notes,
    status: 'PENDING',
    syncStatus,
    syncError: error,
    user: queueItem.user,
    books: queueItem.books,
  };
}

export async function queueOfflineBorrowRequest(input: QueueBorrowRequestInput): Promise<void> {
  if (!input.books.length || input.books.length > 3) {
    throw new Error('Offline borrow requests must include between 1 and 3 books.');
  }
  const idempotencyKey = input.idempotencyKey || createIdempotencyKey();
  const createdAt = new Date().toISOString();
  const queueItem: OfflineBorrowRequest = {
    id: `local-borrow-${idempotencyKey}`,
    userId: input.user.id,
    createdAt,
    type: 'BORROW_REQUEST',
    status: 'QUEUED',
    idempotencyKey,
    bookIds: input.books.map((book) => book.id),
    books: input.books.map((book) => ({
      ...book,
      requestId: `local-${idempotencyKey}-${book.id}`,
      status: 'PENDING',
    })),
    notes: input.notes,
    user: {
      firstName: input.user.firstName,
      lastName: input.user.lastName,
      libraryId: input.user.libraryId,
      role: input.user.role,
    },
  };

  await offlineDb.transaction('rw', offlineDb.syncQueue, offlineDb.borrowRequests, async () => {
    await offlineDb.syncQueue.put(queueItem);
    await offlineDb.borrowRequests.put(getLocalRequest(queueItem, 'QUEUED'));
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_BORROW_REQUESTS_UPDATED));
  }
}

let activeSync: Promise<void> | null = null;

export function syncOfflineBorrowRequests(userId: string): Promise<void> {
  if (activeSync) return activeSync;
  activeSync = syncQueuedBorrowRequests(userId).finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function syncQueuedBorrowRequests(userId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  const queue = await offlineDb.syncQueue
    .where('userId')
    .equals(userId)
    .filter((request) => request.type === 'BORROW_REQUEST' && request.status === 'QUEUED')
    .sortBy('createdAt');

  for (const request of queue) {
    if (!navigator.onLine) return;
    const response = await api.createBorrowRequest({
      bookIds: request.bookIds,
      notes: request.notes,
    }, request.idempotencyKey);

    if (response.success) {
      await offlineDb.transaction('rw', offlineDb.syncQueue, offlineDb.borrowRequests, async () => {
        await offlineDb.syncQueue.delete(request.id);
        await offlineDb.borrowRequests.delete(request.id);
      });
      notifyBorrowRequestUpdate();
      continue;
    }

    if (response.networkError || response.rateLimited || !response.statusCode || response.statusCode >= 500) {
      return;
    }

    await offlineDb.transaction('rw', offlineDb.syncQueue, offlineDb.borrowRequests, async () => {
      await offlineDb.syncQueue.delete(request.id);
      await offlineDb.borrowRequests.put(getLocalRequest(request, 'SYNC_FAILED', response.error || 'The server could not accept this request.'));
    });
    notifyBorrowRequestUpdate();
  }
}

function notifyBorrowRequestUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_BORROW_REQUESTS_UPDATED));
  }
}
