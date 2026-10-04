import api, { type ApiResponse } from './api';
import { canUseOfflineStorage, db } from './db';
import { enqueueMutation } from './offline-sync';
import type { BorrowRequestMutation, LocalBook, LocalRecord } from './offline-types';

async function createPendingBorrowRecords(userId: string, data: BorrowRequestMutation): Promise<string[]> {
  if (!canUseOfflineStorage() || !data.bookIds.length) return [];

  const localIds = data.bookIds.map((bookId) => `local-borrow-${crypto.randomUUID()}-${bookId}`);
  const now = Date.now();
  const localBatchId = `local-batch-${crypto.randomUUID()}`;
  const user = await db.users.get(userId);
  const pendingRecords = await Promise.all(data.bookIds.map(async (bookId, index) => {
    const book = await db.books.get(bookId);
    return {
      id: localIds[index],
      userId,
      bookId,
      requestBatchId: localBatchId,
      status: 'PENDING',
      notes: data.notes ?? '',
      requestDate: new Date(now).toISOString(),
      createdAt: now,
      updatedAt: new Date(now).toISOString(),
      _pending: true,
      _syncStatus: 'PENDING',
      books: book ? [{ id: book.id, title: book.title, author: book.author, accessionNo: book.accessionNo }] : [],
      ...(user ? { user: { firstName: user.firstName, lastName: user.lastName, libraryId: user.libraryId } } : {}),
    };
  }));
  await db.borrowRequests.bulkPut(pendingRecords);
  return localIds;
}

export function searchCachedBooks(
  books: LocalBook[],
  params?: Record<string, string>,
  categories: LocalRecord[] = []
): LocalBook[] {
  const get = (key: string) => params?.[key]?.trim().toLocaleLowerCase() || '';
  const search = get('search');
  const categoryId = params?.categoryId || '';
  const categoryMain = params?.categoryMain || '';
  const classification = get('classificationNumber');
  const categoryIds = new Set<string>();
  if (categoryId) {
    categoryIds.add(categoryId);
    let currentIds = [categoryId];
    while (currentIds.length) {
      const children = categories
        .filter((category) => currentIds.includes(String(category.parentId || '')))
        .map((category) => category.id)
        .filter((id) => !categoryIds.has(id));
      children.forEach((id) => categoryIds.add(id));
      currentIds = children;
    }
  }
  const filtered = books.filter((book) => {
    const category = book.category as Record<string, unknown> | undefined;
    const searchable = [
      book.title,
      book.author,
      book.isbn,
      book.classificationNumber,
      category?.name,
      category?.slug,
    ].map((value) => String(value || '').toLocaleLowerCase());
    if (search && !searchable.some((value) => value.includes(search))) return false;
    if (classification && !String(book.classificationNumber || '').toLocaleLowerCase().includes(classification)) return false;
    if (categoryId && !categoryIds.has(String(book.categoryId || ''))) return false;
    if (categoryMain) {
      const mainCode = categoryMain.padStart(3, '0')[0];
      const bookCode = String(book.classificationNumber || '').trim()[0];
      if (bookCode !== mainCode) return false;
    }
    return true;
  });

  const sort = params?.sort || 'title';
  const direction = params?.order === 'desc' ? -1 : 1;
  filtered.sort((left, right) => {
    const sortField = sort === 'classification' ? 'classificationNumber' : sort;
    const leftValue = sort === 'availability'
      ? Number(left.availableCopies || 0)
      : String(left[sortField] || '');
    const rightValue = sort === 'availability'
      ? Number(right.availableCopies || 0)
      : String(right[sortField] || '');
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * direction;
  });

  return filtered;
}

export async function getBooksLocalFirst(
  params?: Record<string, string>
): Promise<{ cached: LocalBook[]; response: ApiResponse<any[]>; offline: boolean; cachedAt: number | null }> {
  const cached = canUseOfflineStorage() ? await db.books.toArray() : [];
  const lastUpdated = canUseOfflineStorage() ? await db.meta.get('booksLastSyncedAt') : undefined;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      cached,
      response: { success: true, data: searchCachedBooks(cached, params) },
      offline: true,
      cachedAt: typeof lastUpdated?.value === 'number' ? lastUpdated.value : null,
    };
  }

  const response = await api.getBooks(params);
  if (response.success && response.data && canUseOfflineStorage() && !params?.search && !params?.categoryId && !params?.categoryMain && !params?.classificationNumber) {
    await db.books.bulkPut(response.data);
    await db.meta.put({ key: 'booksLastSyncedAt', value: Date.now(), updatedAt: Date.now() });
  }
  if (!response.success && response.networkError && cached.length) {
    return {
      cached,
      response: { success: true, data: searchCachedBooks(cached, params) },
      offline: true,
      cachedAt: typeof lastUpdated?.value === 'number' ? lastUpdated.value : null,
    };
  }
  return {
    cached,
    response,
    offline: false,
    cachedAt: typeof lastUpdated?.value === 'number' ? lastUpdated.value : null,
  };
}

async function queueBorrowRequest(userId: string, data: BorrowRequestMutation, idempotencyKey: string) {
  if (!canUseOfflineStorage()) {
    return { success: false, error: 'Offline storage is unavailable on this device.' } as ApiResponse<any> & { queued?: boolean };
  }
  const localRequestIds = await createPendingBorrowRecords(userId, data);
  await enqueueMutation({
    userId,
    type: 'CREATE_BORROW_REQUEST',
    payload: { ...data, localRequestIds },
    idempotencyKey,
  });
  return { success: true, queued: true, message: 'Borrow request saved as pending synchronization.' } as ApiResponse<any> & { queued?: boolean };
}

export async function createBorrowRequestLocalFirst(
  userId: string,
  data: BorrowRequestMutation
): Promise<ApiResponse<any> & { queued?: boolean }> {
  const idempotencyKey = crypto.randomUUID();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueBorrowRequest(userId, data, idempotencyKey);
  }

  const response = await api.createBorrowRequest(data, idempotencyKey);
  if (response.success && response.data && canUseOfflineStorage()) {
    const records = Array.isArray(response.data.requests)
      ? response.data.requests
      : Array.isArray(response.data) ? response.data : [response.data];
    await db.borrowRequests.bulkPut(records.map((record: LocalRecord) => ({ ...record, userId })));
    return response;
  }
  if (response.networkError || (response.statusCode !== undefined && response.statusCode >= 500)) {
    return queueBorrowRequest(userId, data, idempotencyKey);
  }
  return response;
}

export async function createReservationLocalFirst(
  userId: string,
  book: LocalBook
): Promise<ApiResponse<any> & { queued?: boolean }> {
  const idempotencyKey = crypto.randomUUID();
  const localReservationId = `local-reservation-${crypto.randomUUID()}`;
  const queueReservation = async () => {
    if (!canUseOfflineStorage()) {
      return { success: false, error: 'Offline storage is unavailable on this device.' } as ApiResponse<any> & { queued?: boolean };
    }
    await db.reservations.put({
      id: localReservationId,
      userId,
      bookId: book.id,
      status: 'PENDING',
      queuePosition: null,
      reservationDate: new Date().toISOString(),
      createdAt: Date.now(),
      updatedAt: new Date().toISOString(),
      _pending: true,
      _syncStatus: 'PENDING',
      book: { id: book.id, title: book.title, author: book.author, accessionNo: book.accessionNo },
    });
    await enqueueMutation({
      userId,
      type: 'CREATE_RESERVATION',
      payload: { bookId: book.id, localReservationId },
      idempotencyKey,
    });
    return { success: true, queued: true, message: 'Reservation intent saved as pending synchronization.' } as ApiResponse<any> & { queued?: boolean };
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) return queueReservation();
  const response = await api.reserveBook(book.id, idempotencyKey);
  if (response.success && response.data && canUseOfflineStorage()) {
    await db.reservations.put({ ...response.data, userId });
    return response;
  }
  if (response.networkError || (response.statusCode !== undefined && response.statusCode >= 500)) {
    return queueReservation();
  }
  return response;
}

export async function markNotificationReadLocalFirst(userId: string, id: string): Promise<ApiResponse<any>> {
  const existing = canUseOfflineStorage() ? await db.notifications.get(id) : undefined;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (!canUseOfflineStorage()) return { success: false, error: 'Offline storage is unavailable on this device.' };
    await db.notifications.update(id, { isRead: true, _pending: true, _syncStatus: 'PENDING' });
    await enqueueMutation({
      userId,
      type: 'MARK_NOTIFICATION_READ',
      payload: { id, previousIsRead: Boolean(existing?.isRead) },
    });
    return { success: true, queued: true } as ApiResponse<any> & { queued?: boolean };
  }

  const response = await api.markNotificationRead(id);
  if (response.success && canUseOfflineStorage()) {
    await db.notifications.update(id, { isRead: true, _pending: false });
  } else if (response.networkError && canUseOfflineStorage()) {
    await db.notifications.update(id, { isRead: true, _pending: true, _syncStatus: 'PENDING' });
    await enqueueMutation({
      userId,
      type: 'MARK_NOTIFICATION_READ',
      payload: { id, previousIsRead: Boolean(existing?.isRead) },
    });
    return { success: true, queued: true } as ApiResponse<any> & { queued?: boolean };
  } else if (canUseOfflineStorage()) {
    await db.notifications.update(id, { isRead: Boolean(existing?.isRead), _pending: false });
  }
  return response;
}

export async function markAllNotificationsReadLocalFirst(userId: string): Promise<ApiResponse<any>> {
  const cached = canUseOfflineStorage()
    ? await db.notifications.where('userId').equals(userId).toArray()
    : [];
  const previousStates = cached.map((notification) => ({
    id: notification.id,
    isRead: Boolean(notification.isRead),
  }));

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (!canUseOfflineStorage()) return { success: false, error: 'Offline storage is unavailable on this device.' };
    await db.notifications.where('userId').equals(userId).modify({
      isRead: true,
      _pending: true,
      _syncStatus: 'PENDING',
    });
    await enqueueMutation({
      userId,
      type: 'MARK_ALL_NOTIFICATIONS_READ',
      payload: { previousStates },
    });
    return { success: true, queued: true } as ApiResponse<any> & { queued?: boolean };
  }

  const response = await api.markAllNotificationsRead();
  if (response.success && canUseOfflineStorage()) {
    await db.notifications.where('userId').equals(userId).modify({ isRead: true, _pending: false });
  } else if (response.networkError && canUseOfflineStorage()) {
    await db.notifications.where('userId').equals(userId).modify({
      isRead: true,
      _pending: true,
      _syncStatus: 'PENDING',
    });
    await enqueueMutation({
      userId,
      type: 'MARK_ALL_NOTIFICATIONS_READ',
      payload: { previousStates },
    });
    return { success: true, queued: true } as ApiResponse<any> & { queued?: boolean };
  }
  return response;
}
