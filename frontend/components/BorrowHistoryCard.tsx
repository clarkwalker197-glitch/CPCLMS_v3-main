interface BorrowHistoryCardProps {
  transaction: any;
  formatDate: (date?: string) => string;
  statusBadge: Record<string, string>;
  statusLabel: Record<string, string>;
  contextLabel?: string;
  contextValue?: string;
}

export default function BorrowHistoryCard({
  transaction,
  formatDate,
  statusBadge,
  statusLabel,
  contextLabel,
  contextValue,
}: BorrowHistoryCardProps) {
  const hasReturnDate = Boolean(transaction.returnDate);
  const hasFine = Number(transaction.fineAmount) > 0;
  const isBorrowed = transaction.status === "ACTIVE" || transaction.status === "OVERDUE";

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 shadow-lg shadow-black/10 transition-colors hover:border-zinc-700">
      <div className="border-b border-zinc-800/80 pb-3">
        <p className="break-words font-semibold text-zinc-100">{transaction.book?.title || "Unknown"}</p>
        <p className="mt-1 break-words text-sm text-zinc-500">{transaction.book?.author || "Unknown author"}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Accession: <span className="text-zinc-300">{transaction.book?.accessionNo || "—"}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Borrow Date</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{formatDate(transaction.borrowDate)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Due Date</p>
          <p className="mt-1 text-sm font-semibold text-zinc-200">{formatDate(transaction.dueDate)}</p>
        </div>
        {hasReturnDate && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Return Date</p>
            <p className="mt-1 text-sm font-semibold text-zinc-200">{formatDate(transaction.returnDate)}</p>
          </div>
        )}
        {hasFine && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Fine</p>
            <p className="mt-1 text-sm font-semibold text-amber-400">₱{transaction.fineAmount.toFixed(2)}</p>
          </div>
        )}
        {contextLabel && contextValue && (
          <div className="col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{contextLabel}</p>
            <p className="mt-1 break-words text-sm font-semibold text-zinc-200">{contextValue}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadge[transaction.status] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>
          {statusLabel[transaction.status] || transaction.status}
        </span>
      </div>
      {isBorrowed && (
        <p className="mt-3 text-xs text-zinc-500">Return via librarian at the library counter.</p>
      )}
    </article>
  );
}
