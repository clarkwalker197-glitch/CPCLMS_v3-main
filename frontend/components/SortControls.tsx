"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export type SortOption = {
  sort: string;
  order: "asc" | "desc";
  label: string;
};

export function SortSelect({
  options,
  sort,
  order,
  onChange,
}: {
  options: SortOption[];
  sort: string;
  order: "asc" | "desc";
  onChange: (sort: string, order: "asc" | "desc") => void;
}) {
  return (
    <select
      aria-label="Sort records"
      value={`${sort}:${order}`}
      onChange={(event) => {
        const [nextSort, nextOrder] = event.target.value.split(":");
        onChange(nextSort, nextOrder === "desc" ? "desc" : "asc");
      }}
      className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((option) => (
        <option key={`${option.sort}:${option.order}`} value={`${option.sort}:${option.order}`}>
          Sort: {option.label}
        </option>
      ))}
    </select>
  );
}

export function SortHeader({
  field,
  sort,
  order,
  onSort,
  children,
}: {
  field: string;
  sort: string;
  order: "asc" | "desc";
  onSort: (field: string) => void;
  children: React.ReactNode;
}) {
  const Icon = sort !== field ? ChevronsUpDown : order === "asc" ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1.5 text-left transition-colors hover:text-zinc-200"
      aria-label={`Sort by ${String(children)}`}
    >
      {children}
      <Icon className={`h-3.5 w-3.5 ${sort === field ? "text-blue-400" : "text-zinc-600"}`} aria-hidden="true" />
    </button>
  );
}

export function nextSortOrder(currentSort: string, currentOrder: "asc" | "desc", field: string) {
  return currentSort === field && currentOrder === "asc" ? "desc" : "asc";
}