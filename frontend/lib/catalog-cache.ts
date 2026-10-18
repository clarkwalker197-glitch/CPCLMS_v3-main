import api from './api';
import { offlineDb } from './offline-db';

type CatalogType = 'books' | 'ebooks';

const PAGE_LIMIT = 100;
const SYNC_FRESHNESS_MS = 5 * 60 * 1000;
const RATE_LIMIT_FALLBACK_MS = 60 * 1000;
const activeCatalogSync = new Map<CatalogType, Promise<void>>();
const catalogCooldownUntil = new Map<CatalogType, number>();

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
  const now = Date.now();
  if ((catalogCooldownUntil.get(type) ?? 0) > now) return;

  const lastSync = await offlineDb.meta.get(`${type}LastSyncedAt`);
  if (typeof lastSync?.value === 'number' && now - lastSync.value < SYNC_FRESHNESS_MS) return;

  const getPage = type === 'books' ? api.getBooks.bind(api) : api.getEBooks.bind(api);
  const store = type === 'books' ? offlineDb.books : offlineDb.ebooks;

  const deferIfRateLimited = (response: { rateLimited?: boolean; retryAfterMs?: number }) => {
    if (!response.rateLimited) return false;
    catalogCooldownUntil.set(
      type,
      Date.now() + Math.max(response.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS, RATE_LIMIT_FALLBACK_MS)
    );
    return true;
  };

  const firstResponse = await getPage({
    page: '1',
    limit: String(PAGE_LIMIT),
    sort: 'title',
    order: 'asc',
  });
  if (deferIfRateLimited(firstResponse)) return;
  if (!firstResponse.success || !firstResponse.data) {
    throw new Error(firstResponse.error || `Could not synchronize the ${type} catalog for offline browsing.`);
  }

  await store.bulkPut(firstResponse.data);
  const syncedIds = new Set(firstResponse.data.map((record) => record.id));
  const totalPages = firstResponse.meta?.totalPages ?? 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const response = await getPage({
      page: String(page),
      limit: String(PAGE_LIMIT),
      sort: 'title',
      order: 'asc',
    });
    if (deferIfRateLimited(response)) return;
    if (!response.success || !response.data) {
      throw new Error(response.error || `Could not synchronize all pages of the ${type} catalog.`);
    }
    response.data.forEach((record) => syncedIds.add(record.id));
    await store.bulkPut(response.data);
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
