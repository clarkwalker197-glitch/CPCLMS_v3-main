"use client";

import { useState } from "react";
import { ModalLayer } from "@/components/ModalLayer";
import { X } from "lucide-react";

interface BorrowHistoryCardProps {
  transaction: any;
  formatDate: (date?: string) => string;
  statusBadge: Record<string, string>;
  statusLabel: Record<string, string>;
  contextLabel?: string;
  contextValue?: string;
  onReturn?: () => void | Promise<void>;
  onMissing?: () => void | Promise<void>;
  onPayFine?: (amount: number) => void | Promise<void>;
}

export default function BorrowHistoryCard({
  transaction,
  formatDate,
  statusBadge,
  statusLabel,
  contextLabel,
  contextValue,
  onReturn,
  onMissing,
  onPayFine,
}: BorrowHistoryCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(String(Number(transaction.fineAmount || 0)));
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const borrower = contextValue
    || [transaction.user?.firstName, transaction.user?.lastName].filter(Boolean).join(" ")
    || "";
  const hasFine = Number(transaction.fineAmount) > 0;
  const isBorrowed = transaction.status === "ACTIVE" || transaction.status === "OVERDUE";
  const fineAmount = Number(transaction.fineAmount || 0);

  const submitFinePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount < fineAmount) {
      setPaymentError(`Enter at least ₱${fineAmount.toFixed(2)}.`);
      return;
    }
    if (!onPayFine) return;
    setPaymentLoading(true);
    setPaymentError("");
    try {
      await onPayFine(amount);
      setDetailsOpen(false);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to record fine payment.");
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        aria-label={`View transaction details for ${transaction.book?.title || "Unknown book"}`}
        className="block w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-4 text-left shadow-lg shadow-black/10 transition-colors hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words font-semibold text-zinc-100">{transaction.book?.title || "Unknown"}</p>
            {borrower && <p className="mt-1 break-words text-sm text-zinc-400">{borrower}</p>}
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadge[transaction.status] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>
            {statusLabel[transaction.status] || transaction.status}
          </span>
        </div>
        {hasFine && (
          <p className={`mt-3 text-sm font-semibold ${transaction.finePaid ? "text-emerald-400" : "text-orange-400"}`}>
            Fine: ₱{fineAmount.toFixed(2)} · {transaction.finePaid ? "Paid" : "Unpaid"}
          </p>
        )}
      </button>

      {detailsOpen && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <button type="button" aria-label="Close transaction details" className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDetailsOpen(false)} />
            <section role="dialog" aria-modal="true" aria-labelledby="transaction-details-title" className="relative z-50 max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/50 sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="transaction-details-title" className="break-words text-lg font-semibold text-white">{transaction.book?.title || "Unknown book"}</h2>
                  <p className="mt-1 break-words text-sm text-zinc-400">{transaction.book?.author || "Author not recorded"}</p>
                </div>
                <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Close transaction details" className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
              </div>

              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Accession number</dt><dd className="mt-1 break-words text-zinc-200">{transaction.book?.accessionNo || "—"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{contextLabel || "Borrower"}</dt><dd className="mt-1 break-words text-zinc-200">{borrower || "—"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Student ID</dt><dd className="mt-1 break-words text-zinc-200">{transaction.user?.libraryId || transaction.libraryId || "—"}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Borrow date</dt><dd className="mt-1 text-zinc-200">{formatDate(transaction.borrowDate || transaction.requestDate)}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Due date</dt><dd className="mt-1 text-zinc-200">{formatDate(transaction.dueDate)}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{transaction.status === "MISSING" ? "Missing date" : "Return date"}</dt><dd className="mt-1 text-zinc-200">{formatDate(transaction.returnDate)}</dd></div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fine / payment status</dt>
                  <dd className={`mt-1 font-semibold ${hasFine ? transaction.finePaid ? "text-emerald-400" : "text-orange-400" : "text-zinc-300"}`}>
                    {hasFine ? `₱${fineAmount.toFixed(2)} · ${transaction.finePaid ? "Paid" : "Unpaid"}` : "No fine"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Current status</dt>
                  <dd className="mt-1"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadge[transaction.status] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>{statusLabel[transaction.status] || transaction.status}</span></dd>
                </div>
              </dl>

              {paymentError && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{paymentError}</p>}
              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setDetailsOpen(false)} className="min-h-10 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800">Close</button>
                {onReturn && isBorrowed && (
                  <button type="button" onClick={() => void onReturn()} className="min-h-10 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">Mark as Returned</button>
                )}
                {onMissing && isBorrowed && (
                  <button type="button" onClick={() => void onMissing()} className="min-h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20">Mark Missing</button>
                )}
              </div>
              {onPayFine && hasFine && !transaction.finePaid && (
                <form onSubmit={(event) => void submitFinePayment(event)} className="mt-4 border-t border-zinc-800 pt-4">
                  <label htmlFor={`fine-payment-${transaction.id}`} className="mb-2 block text-sm font-medium text-zinc-300">Record fine payment</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id={`fine-payment-${transaction.id}`} type="number" min={fineAmount} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    <button type="submit" disabled={paymentLoading} className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50">{paymentLoading ? "Processing..." : "Pay Fine"}</button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </ModalLayer>
      )}
    </>
  );
}
