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
