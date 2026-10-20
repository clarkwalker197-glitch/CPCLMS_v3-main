export type PageRangeItem = number | "start-ellipsis" | "end-ellipsis";

export function getPageRange(
  totalPages: number,
  currentPage: number,
  siblingCount = 1,
  compact = false
): PageRangeItem[] {
  const pageCount = Math.max(1, Math.floor(totalPages));
  const page = Math.min(pageCount, Math.max(1, Math.floor(currentPage)));
  const siblings = Math.max(0, Math.floor(siblingCount));
  const boundaryCount = compact
    ? page + siblings
    : siblings * 2 + 3;
  const allPages = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index);

  if (pageCount <= (compact ? siblings * 2 + 3 : siblings * 2 + 5)) {
    return allPages(1, pageCount);
  }

  if (page <= siblings + 2) {
    return [...allPages(1, Math.min(pageCount - 1, boundaryCount)), "end-ellipsis", pageCount];
  }

  if (page >= pageCount - siblings - 1) {
    const start = compact
      ? Math.max(2, page - siblings)
      : Math.max(2, Math.min(pageCount - boundaryCount + 1, page - siblings));
    return ["start-ellipsis", ...allPages(start, pageCount)];
  }

  return [
    1,
    "start-ellipsis",
    ...allPages(page - siblings, page + siblings),
    "end-ellipsis",
    pageCount,
  ];
}
