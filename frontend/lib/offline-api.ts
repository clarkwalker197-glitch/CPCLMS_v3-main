import api, { type ApiResponse } from './api';
import { canUseOfflineStorage, db } from './db';
import { enqueueMutation } from './offline-sync';
import type { BorrowRequestMutation, LocalBook } from './offline-types';

async function createPendingBorrowRecords(userId: string, data: BorrowRequestMutation): Promise<string[]> {
  if (!canUseOfflineStorage() || !data.bookIds.length) return [];

  const localIds = data.bookIds.map((bookId) => `local-borrow-${crypto.randomUUID()}-${bookId}`);
  const now = Date.now();

  const pendingRecords = await Promise.all(
    data.bookIds.map(async (bookId, index) => {
      const book = await db.books.get(bookId);
      return {
        id: localIds[index],
        userId,
        bookId,
        status: 'PENDING',
        notes: data.notes ?? '',
        requestDate: new Date(now).toISOString(),
        createdAt: now,
        updatedAt: new Date(now).toISOString(),
        _pending: true,
        ...(book ? { book: { id: book.id, title: book.title, author: book.author } } : {}),
      };
    })
  );

  await db.borrowRequests.bulkPut(pendingRecords);
  return localIds;
}

export async function getBooksLocalFirst(
  params?: Record<string, string>
): Promise<{ cached: LocalBook[]; response: ApiResponse<any[]> }> {
  const cached = canUseOfflineStorage() ? await db.books.toArray() : [];
  const response = await api.getBooks(params);
  if (response.success && response.data && canUseOfflineStorage()) {
    await db.books.bulkPut(response.data);
  }
  return { cached, response };
}

export async function createBorrowRequestLocalFirst(
  userId: string,
  data: BorrowRequestMutation
): Promise<ApiResponse<any> & { queued?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (!canUseOfflineStorage()) {
      return { success: false, error: 'Offline storage is unavailable on this device.' };
    }

    const localRequestIds = await createPendingBorrowRecords(userId, data);
    await enqueueMutation({
      userId,
      type: 'CREATE_BORROW_REQUEST',
      payload: { ...data, localRequestIds },
    });
    return { success: true, queued: true, message: 'Borrow request queued for sync.' };
  }

  const response = await api.createBorrowRequest(data);
  if (response.success && response.data && canUseOfflineStorage()) {
    const records = Array.isArray(response.data) ? response.data : [response.data];
    await db.borrowRequests.bulkPut(records);
  }
  return response;
}

export async function markNotificationReadLocalFirst(userId: string, id: string): Promise<void> {
  if (canUseOfflineStorage()) await db.notifications.update(id, { isRead: true, _pending: true });
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueMutation({ userId, type: 'MARK_NOTIFICATION_READ', payload: { id } });
    return;
  }
  const response = await api.markNotificationRead(id);
  if (response.success && canUseOfflineStorage()) await db.notifications.update(id, { _pending: false });
}
