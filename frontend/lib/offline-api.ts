import api, { type ApiResponse } from './api';
import { canUseOfflineStorage, db } from './db';
import { enqueueMutation } from './offline-sync';
import type { BorrowRequestMutation, LocalBook } from './offline-types';

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
    await enqueueMutation({ userId, type: 'CREATE_BORROW_REQUEST', payload: data });
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
