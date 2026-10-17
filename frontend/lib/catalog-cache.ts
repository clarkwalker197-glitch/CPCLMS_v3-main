import api from './api';
import { offlineDb } from './offline-db';

type CatalogType = 'books' | 'ebooks';

const PAGE_LIMIT = 100;
const PAGE_BATCH_SIZE = 4;
const activeCatalogSync = new Map<CatalogType, Promise<void>>();

export function syncCatalogForOffline(type: CatalogType): Promise<void> {
  const active = activeCatalogSync.get(type);
  if (active) return active;

  const sync = cacheCatalogPages(type).finally(() => {
    activeCatalogSync.delete(type);
  });
  activeCatalogSync.set(type, sync);
  return sync;
}

async function cacheCatalogPages(type: CatalogType): Promise<void> {
  const getPage = type === 'books' ? api.getBooks.bind(api) : api.getEBooks.bind(api);
  const store = type === 'books' ? offlineDb.books : offlineDb.ebooks;
  const firstResponse = await getPage({
    page: '1',
    limit: String(PAGE_LIMIT),
    sort: 'title',
    order: 'asc',
  });
  if (!firstResponse.success || !firstResponse.data) {
    throw new Error(firstResponse.error || `Could not synchronize the ${type} catalog for offline browsing.`);
  }

  await store.bulkPut(firstResponse.data);
  const syncedIds = new Set(firstResponse.data.map((record) => record.id));
  const totalPages = firstResponse.meta?.totalPages ?? 1;
  for (let firstPage = 2; firstPage <= totalPages; firstPage += PAGE_BATCH_SIZE) {
    const pageNumbers = Array.from(
      { length: Math.min(PAGE_BATCH_SIZE, totalPages - firstPage + 1) },
      (_, index) => firstPage + index
    );
    const responses = await Promise.all(pageNumbers.map((page) => getPage({
      page: String(page),
      limit: String(PAGE_LIMIT),
      sort: 'title',
      order: 'asc',
    })));
    const failedResponse = responses.find((response) => !response.success || !response.data);
    if (failedResponse) {
      throw new Error(failedResponse.error || `Could not synchronize all pages of the ${type} catalog.`);
    }
    const pageRecords = responses.flatMap((response) => response.data || []);
    pageRecords.forEach((record) => syncedIds.add(record.id));
    await store.bulkPut(pageRecords);
  }

  const cachedIds = await store.toCollection().primaryKeys();
  const removedIds = cachedIds.filter((id): id is string => typeof id === 'string' && !syncedIds.has(id));
  if (removedIds.length) {
    await store.bulkDelete(removedIds);
  }

  const syncedAt = Date.now();
  await offlineDb.meta.put({
    key: `${type}LastSyncedAt`,
    value: syncedAt,
    updatedAt: syncedAt,
  });
}
