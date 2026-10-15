"use client";

import { useEffect } from "react";
import { BookOpen, X } from "lucide-react";
import MediaImage from "@/components/MediaImage";
import { ModalLayer } from "@/components/ModalLayer";

export type BookDetailsBook = {
  id: string;
  title: string;
  author: string;
  coverImage?: string | null;
  availableCopies?: number | null;
  copies?: number | null;
  isbn?: string | null;
  accessionNo?: string | null;
  category?: { name?: string | null } | null;
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
  loadingReservation: boolean;
  error: string;
  onClose: () => void;
  onBorrow: () => void;
  onReserve: () => void;
};

export function BookDetailsPanel({
  book,
  isAvailable,
  isLibrarian,
  inCart,
  alreadyRequested,
  alreadyReserved,
  cartLimitReached,
  loadingExistingActions,
  loadingReservation,
  error,
  onClose,
  onBorrow,
  onReserve,
}: BookDetailsPanelProps) {
  const availableCopies = Number(book.availableCopies ?? 0);
  const copies = Number(book.copies ?? 0);
  const borrowDisabled = !isAvailable || loadingExistingActions || (!inCart && (alreadyRequested || cartLimitReached));
  const reserveDisabled = isAvailable || alreadyReserved || loadingExistingActions || loadingReservation;

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
          className="absolute inset-0 bg-black/65"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-details-title"
          className="absolute inset-y-0 right-0 flex h-full w-full flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl sm:max-w-[400px]"
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
              {book.accessionNo && <Detail label="Accession number" value={book.accessionNo} />}
              <Detail label="Category" value={book.category?.name || "General"} />
              {(book.shelf || book.row) && (
                <Detail label="Shelf location" value={[book.shelf, book.row].filter(Boolean).join(" · ")} />
              )}
              <Detail label="Copies" value={`${availableCopies} of ${copies} available`} />
            </dl>

            {error && (
              <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}
          </div>

          {!isLibrarian && (
            <footer className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onBorrow}
                  disabled={borrowDisabled}
                  className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {loadingExistingActions
                    ? "Checking requests..."
                    : alreadyRequested && !inCart
                    ? "Request already sent"
                    : inCart
                      ? "Remove from Borrow Request"
                      : "Add to Borrow Request"}
                </button>
                <button
                  type="button"
                  onClick={onReserve}
                  disabled={reserveDisabled}
                  className="min-h-11 flex-1 rounded-xl bg-zinc-800 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingReservation ? "Reserving..." : alreadyReserved ? "Already reserved" : "Reserve"}
                </button>
              </div>
              {isAvailable ? (
                <p className="mt-2 text-center text-xs text-zinc-500">Reserve is only available when no copy is free.</p>
              ) : alreadyReserved ? (
                <p className="mt-2 text-center text-xs text-zinc-500">You already have an active reservation for this book.</p>
              ) : null}
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
