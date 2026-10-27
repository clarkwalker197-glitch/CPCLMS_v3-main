"use client";

import { useEffect } from "react";
import { BookOpen, X } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import { ModalLayer } from "@/components/ModalLayer";

export type BookDetailsBook = {
  id: string;
  title: string;
  author: string;
  status?: string | null;
  coverImage?: string | null;
  availableCopies?: number | null;
  copies?: number | null;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  accessionNo?: string | null;
  classificationNumber?: string | null;
  category?: { name?: string | null } | null;
  _count?: { borrowTransactions: number };
  shelf?: string | null;
  row?: string | null;
};

type BookDetailsPanelProps = {
  book: BookDetailsBook;
  isAvailable: boolean;
  isLibrarian: boolean;
  inCart: boolean;
  alreadyRequested: boolean;
  alreadyReserved: boolean;
  cartLimitReached: boolean;
  loadingExistingActions: boolean;
  actionsLookupFailed: boolean;
  loadingReservation: boolean;
  error: string;
  onClose: () => void;
  onBorrow: () => void;
  onReserve: () => void;
  onRetryActionsCheck: () => void;
}

export function BookDetailsPanel({
  book,
  isAvailable,
  isLibrarian,
  inCart,
  alreadyRequested,
  alreadyReserved,
  cartLimitReached,
  loadingExistingActions,
  actionsLookupFailed,
  loadingReservation,
  error,
  onClose,
  onBorrow,
  onReserve,
  onRetryActionsCheck,
}: BookDetailsPanelProps) {
  const availableCopies = Number(book.availableCopies ?? 0);
  const copies = Number(book.copies ?? 0);
  const isCirculating = ["AVAILABLE", "BORROWED"].includes(book.status || "");
  const hasAvailableCopies = isCirculating && availableCopies > 0;
  const isReservable = isCirculating && availableCopies === 0;
  const borrowDisabled = !isAvailable || loadingExistingActions || alreadyRequested || (!inCart && cartLimitReached);
  const reserveDisabled = !isReservable || alreadyReserved || loadingExistingActions || loadingReservation;
  const actionLabel = actionsLookupFailed
    ? "Retry request check"
    : !hasAvailableCopies && !isReservable
      ? "Unavailable"
    : loadingExistingActions
    ? "Checking requests..."
    : alreadyRequested
      ? "Request already sent"
      : hasAvailableCopies
        ? inCart
          ? "Remove from Borrow Request"
          : "Add to Borrow Request"
        : loadingReservation
          ? "Reserving..."
          : alreadyReserved
            ? "Already reserved"
            : "Reserve";
  const actionDisabled = actionsLookupFailed
    ? false
    : loadingExistingActions || alreadyRequested || (hasAvailableCopies ? borrowDisabled : reserveDisabled);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <ModalLayer>
      <div className="fixed inset-0 z-[60]">
        <button
          type="button"
          aria-label="Close book details"
          onClick={onClose}
          className="cpc-side-panel-backdrop-enter absolute inset-0 bg-black/65"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-details-title"
          className="cpc-side-panel-enter absolute inset-y-0 right-0 flex h-full w-full flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl sm:max-w-[400px]"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-300">Book details</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close book details"
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="mx-auto aspect-[3/4] w-44 overflow-hidden rounded-xl bg-zinc-900 sm:w-48">
              {book.coverImage ? (
                <MediaImage
                  src={book.coverImage}
                  alt={book.title}
                  className="h-full w-full object-cover"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600/30 to-indigo-600/30">
                      <BookOpen className="h-8 w-8 text-blue-300/70" />
                    </div>
                  }
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600/30 to-indigo-600/30">
                  <BookOpen className="h-8 w-8 text-blue-300/70" />
                </div>
              )}
            </div>
            <div className="mt-5">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                isAvailable
                  ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                  : "bg-red-500/15 text-red-400 ring-red-500/30"
              }`}>
                {isAvailable ? "Available" : "Unavailable"}
              </span>
              <h1 id="book-details-title" className="mt-3 break-words text-xl font-bold text-white">
                {book.title}
              </h1>
              <p className="mt-1 break-words text-sm text-zinc-400">by {book.author}</p>
            </div>

            <dl className="mt-6 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4">
              {book.isbn && <Detail label="ISBN" value={book.isbn} />}
              {book.edition && <Detail label="Edition" value={book.edition} />}
              {book.publisher && <Detail label="Publisher" value={book.publisher} />}
              {book.accessionNo && <Detail label="Accession number" value={book.accessionNo} />}
              {book.classificationNumber && <Detail label="Dewey number" value={book.classificationNumber} />}
              <Detail label="Category" value={book.category?.name || "General"} />
              {(book.shelf || book.row) && (
                <Detail label="Shelf location" value={[book.shelf, book.row].filter(Boolean).join(" · ")} />
              )}
              <Detail label="Copies" value={`${availableCopies} of ${copies} available`} />
              {book._count && <Detail label="Times Borrowed" value={String(book._count.borrowTransactions)} />}
            </dl>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}
          </div>

          {!isLibrarian && (
            <footer className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={actionsLookupFailed
                  ? onRetryActionsCheck
                  : hasAvailableCopies ? onBorrow : isReservable ? onReserve : undefined}
                disabled={actionDisabled}
                className={`cpc-borrow-action min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  hasAvailableCopies
                    ? "bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {actionLabel}
              </button>
              {isReservable && alreadyReserved && (
                <p className="mt-2 text-center text-xs text-zinc-500">You already have an active reservation for this book.</p>
              )}
              {cartLimitReached && !inCart && isAvailable && !alreadyRequested && (
                <p className="mt-2 text-center text-xs text-amber-300">You can only borrow up to 3 books per transaction.</p>
              )}
            </footer>
          )}
        </aside>
      </div>
    </ModalLayer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className="break-words text-right text-zinc-200">{value}</dd>
    </div>
  );
}
