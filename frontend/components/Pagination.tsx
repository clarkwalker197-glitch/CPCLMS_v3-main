"use client";

import { useEffect, useState } from "react";
import { getPageRange } from "@/lib/pagination";

type PaginationProps = {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  siblingCount?: number;
};

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];
const buttonClassName =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export default function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  siblingCount = 1,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(totalPages, Math.max(1, currentPage));
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const updateCompact = () => setCompact(media.matches);
    updateCompact();
    media.addEventListener("change", updateCompact);
    return () => media.removeEventListener("change", updateCompact);
  }, []);

  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex min-w-0 flex-col items-center justify-between gap-4 overflow-x-hidden sm:flex-row sm:flex-wrap"
    >
      <p className="shrink-0 whitespace-nowrap text-sm text-zinc-500">
        Showing <span className="text-zinc-300">{firstItem}–{lastItem}</span> of{" "}
        <span className="text-zinc-300">{totalItems}</span> logs
      </p>

      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:justify-end">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            className={buttonClassName}
            aria-label="First page"
            title="First page"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className={buttonClassName}
            aria-label="Previous page"
            title="Previous page"
          >
            ‹
          </button>

          {getPageRange(totalPages, page, siblingCount, compact).map((item, index) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={`${buttonClassName} ${
                  item === page
                    ? "border-blue-500 bg-blue-500 text-white hover:border-blue-400 hover:bg-blue-400"
                    : ""
                }`}
              >
                {item}
              </button>
            ) : (
              <span
                key={`${item}-${index}`}
                aria-label="More pages"
                className="inline-flex h-9 w-6 items-center justify-center text-zinc-500"
              >
                …
              </span>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className={buttonClassName}
            aria-label="Next page"
            title="Next page"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            className={buttonClassName}
            aria-label="Last page"
            title="Last page"
          >
            »
          </button>
        </div>

        <label className="ml-1 flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-zinc-400">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-200 outline-none transition-colors focus:border-blue-500"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </nav>
  );
}
