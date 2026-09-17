export type LocalRecord = {
  id: string;
  updatedAt?: string;
  syncedAt?: number;
  _pending?: boolean;
  [key: string]: unknown;
};

export type LocalBook = LocalRecord & {
  title?: string;
  author?: string;
  categoryId?: string;
};

export type LocalUser = LocalRecord & {
  libraryId?: string;
  firstName?: string;
  lastName?: string;
};

export type SyncMutationType =
  | 'CREATE_BORROW_REQUEST'
  | 'MARK_NOTIFICATION_READ'
  | 'MARK_ALL_NOTIFICATIONS_READ';

export type SyncMutation = {
  id: string;
  userId: string;
  type: SyncMutationType;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type SyncMeta = {
  key: string;
  value: string | number | boolean | null;
  updatedAt: number;
};

export type BorrowRequestMutation = {
  bookIds: string[];
  notes?: string;
  localRequestIds?: string[];
};
