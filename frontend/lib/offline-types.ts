export type LocalRecord = {
  id: string;
  updatedAt?: string;
  syncedAt?: number;
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

export type SyncMeta = {
  key: string;
  value: string | number | boolean | null;
  updatedAt: number;
};

export type OfflineBorrowRequest = LocalRecord & {
  userId: string;
  createdAt: string;
  type: 'BORROW_REQUEST';
  status: 'QUEUED' | 'SYNC_FAILED';
  idempotencyKey: string;
  bookIds: string[];
  books: Array<{
    id: string;
    requestId: string;
    title: string;
    author?: string | null;
    accessionNo?: string | null;
    status: string;
  }>;
  user: {
    firstName: string;
    lastName: string;
    libraryId: string;
    role: string;
  };
  notes?: string;
  error?: string;
};
