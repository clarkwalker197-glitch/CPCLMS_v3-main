"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { Search } from "lucide-react";

function TransactionLookupContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const transactionId = params.get("transactionId")?.trim() || "";
  const [manualId, setManualId] = useState(/^\d{0,8}$/.test(transactionId) ? transactionId : "");
  const [transaction, setTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setManualId(/^\d{0,8}$/.test(transactionId) ? transactionId : "");
    setTransaction(null);
    setError("");
    if (!transactionId || authLoading || !isAuthenticated) return;

    let cancelled = false;
    setLoading(true);
    api.getBorrowRequestBatch(transactionId)
      .then((response) => {
        if (cancelled) return;
        if (response.success && response.data) setTransaction(response.data);
        else setError(response.error || "No transaction found for that ID.");
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load this transaction.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, transactionId]);

  const submitLookup = (event: React.FormEvent) => {
    event.preventDefault();
    const value = manualId.trim();
    if (/^\d{8}$/.test(value)) router.push(`/transactions/lookup?transactionId=${encodeURIComponent(value)}`);
    else setError("Enter the 8-digit Transaction ID.");
  };

  const formatDate = (value?: string | null) => value
    ? new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const returnTo = `/transactions/lookup?transactionId=${encodeURIComponent(transactionId)}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
      {isAuthenticated && <Sidebar />}
      <main className="min-w-0 flex-1">
        <div className={`mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 ${isAuthenticated ? "pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] lg:pb-10" : ""}`}>
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase text-blue-300">CPC Library</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Transaction details</h1>
            <p className="mt-1 text-sm text-zinc-400">Read-only status and book information.</p>
          </header>

          {!isAuthenticated && !authLoading && (
            <section className="border-y border-zinc-800 py-6">
              <p className="text-sm text-zinc-300">Sign in with the account that submitted this request to view its details.</p>
              <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Sign in to view
              </Link>
            </section>
          )}

          {(isAuthenticated || authLoading) && (
            <>
              <form onSubmit={submitLookup} className="mb-6 flex flex-col gap-3 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="transaction-id" className="mb-2 block text-sm font-medium text-zinc-300">Transaction ID</label>
                  <input id="transaction-id" value={manualId} onChange={(event) => setManualId(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" pattern="[0-9]*" maxLength={8} placeholder="12345678" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <button type="submit" disabled={!/^\d{8}$/.test(manualId.trim()) || authLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  <Search className="h-4 w-4" /> Find
                </button>
              </form>

              {authLoading && <p className="py-8 text-center text-sm text-zinc-400">Checking your session...</p>}
              {loading && <p className="py-8 text-center text-sm text-zinc-400">Loading transaction...</p>}
              {error && <p role="alert" className="border-y border-red-500/30 py-4 text-sm text-red-300">{error}</p>}

              {transaction && (
                <section aria-label="Transaction details">
                  <div className="grid grid-cols-2 gap-4 border-y border-zinc-800 py-5 text-sm">
                    <div><p className="text-xs text-zinc-500">Transaction ID</p><p className="mt-1 break-all font-mono text-blue-300">{transaction.transactionId}</p></div>
                    <div><p className="text-xs text-zinc-500">Status</p><p className="mt-1 font-medium text-emerald-300">{transaction.status}</p></div>
                    <div><p className="text-xs text-zinc-500">Member</p><p className="mt-1 text-zinc-200">{transaction.user?.firstName} {transaction.user?.lastName}</p></div>
                    <div><p className="text-xs text-zinc-500">Library ID</p><p className="mt-1 text-zinc-200">{transaction.user?.libraryId || "—"}</p></div>
                  </div>
                  <h2 className="mt-6 text-sm font-semibold text-zinc-200">Books in this transaction</h2>
                  <div className="mt-2 divide-y divide-zinc-800 border-y border-zinc-800">
                    {(transaction.books || []).map((book: any) => (
                      <article key={book.bookId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-medium text-white">{book.title}</h3>
                          <p className="mt-1 text-xs text-zinc-500">Accession: {book.accessionNo || "—"}</p>
                        </div>
                        <div className="flex shrink-0 gap-6 text-sm">
                          <div><p className="text-xs text-zinc-500">Due date</p><p className="mt-1 text-zinc-200">{formatDate(book.dueDate)}</p></div>
                          <div><p className="text-xs text-zinc-500">Status</p><p className="mt-1 text-zinc-200">{book.status}</p></div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {user && <p className="mt-8 text-xs text-zinc-600">Signed in as {user.firstName} {user.lastName}</p>}
        </div>
      </main>
    </div>
  );
}

export default function TransactionLookupPage() {
  return <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}><TransactionLookupContent /></Suspense>;
}