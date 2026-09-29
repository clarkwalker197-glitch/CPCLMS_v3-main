export type SortOrder = 'asc' | 'desc';

export function getSortParams<T extends string>(
  query: Record<string, unknown>,
  allowed: readonly T[],
  defaultSort: T,
  defaultOrder: SortOrder = 'asc'
): { sort: T; order: SortOrder } {
  const sort = typeof query.sort === 'string' && allowed.includes(query.sort as T)
    ? query.sort as T
    : defaultSort;
  const order = query.order === 'desc' || query.order === 'asc'
    ? query.order
    : defaultOrder;

  return { sort, order };
}