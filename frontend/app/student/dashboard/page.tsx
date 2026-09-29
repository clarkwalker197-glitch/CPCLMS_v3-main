"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import ProtectedRoute from "@/components/ProtectedRoute";
import NotificationBell from "@/components/NotificationBell";
import UserAvatar from "@/components/UserAvatar";
import Sidebar from "@/components/Sidebar";
import ResponsiveTable from "@/components/ResponsiveTable";
import { StatCard } from "@/components/StatCard";
import BorrowHistoryCard from "@/components/BorrowHistoryCard";
import api from "@/lib/api";
import { offlineDb } from "@/lib/offline-db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookMarked,
  Clock,
  Coins,
  Search,
} from "lucide-react";

const statusBadge: Record<string, string> = {
  ACTIVE: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  RETURNED: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  OVERDUE: "bg-red-500/15 text-red-400 ring-red-500/30",
  PENDING: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-400 ring-red-500/30",
  CANCELLED: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
};

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [dueSoon, setDueSoon] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionLookupId, setTransactionLookupId] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [cachedTransactions, cachedRequests] = await Promise.all([
          offlineDb.transactions.orderBy("updatedAt").reverse().limit(5).toArray(),
          offlineDb.borrowRequests.orderBy("updatedAt").reverse().toArray(),
        ]);
        if (cachedTransactions.length) setRecentTransactions(cachedTransactions);
        if (cachedTransactions.length || cachedRequests.length) {
          setStats({
            myBorrowed: cachedTransactions.filter((transaction) => ["ACTIVE", "OVERDUE"].includes(String(transaction.status))).length,
            myPendingRequests: cachedRequests.filter((request) => request.status === "PENDING").length,
            myFines: cachedTransactions.reduce((total, transaction) => total + (!transaction.finePaid && !transaction.fineWaived && !transaction.returnDate && ["ACTIVE", "OVERDUE"].includes(String(transaction.status)) && Number(transaction.fineAmount || 0) > 0 ? Number(transaction.fineAmount || 0) : 0), 0),
          });
          setLoading(false);
        }

const [statsRes, txRes] = await Promise.all([
          api.getMyDashboardStats(),
          api.getTransactions({ limit: "5" }),
        ]);
        if (statsRes.success) setStats(statsRes.data);
        if (statsRes.success) setDueSoon(statsRes.data?.dueSoon || []);
        if (txRes.success) {
          const nextTransactions = txRes.data || [];
          setRecentTransactions(nextTransactions);
          await offlineDb.transactions.bulkPut(nextTransactions);
        }
      } catch {
        // silent fail for demo
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const role = user?.role || "STUDENT";
  const isFaculty = role === "FACULTY";

const statsCards = [
    { title: "Currently Borrowed", value: stats?.myBorrowed ?? "-", icon: BookMarked, accent: "bg-blue-500/15 text-blue-400" },
    { title: "Pending Requests", value: stats?.myPendingRequests ?? "-", icon: Clock, accent: "bg-amber-500/15 text-amber-400" },
    { title: "Overdue Fines", value: `₱${stats?.myFines ?? 0}`, icon: Coins, accent: "bg-red-500/15 text-red-400" },
  ];

const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const handleTransactionLookup = (event: React.FormEvent) => {
    event.preventDefault();
    const transactionId = transactionLookupId.trim();
    if (transactionId) {
      router.push(`/transactions/lookup?transactionId=${encodeURIComponent(transactionId)}`);
    }
  };
  const displayStatus = (tx: any) => tx.status === "ACTIVE" && tx.dueDate && new Date(tx.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) ? "OVERDUE" : tx.status;

  return (
    <ProtectedRoute roles={["STUDENT", "FACULTY"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
        <Sidebar />

        <div className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Welcome, {user?.firstName || "Student"}
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  {isFaculty ? "Faculty Library Portal" : "Student Library Portal"}
                  <span className="ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 bg-blue-500/15 text-blue-400 ring-blue-500/30">
                    {isFaculty ? "Faculty" : "Student"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />

                <Link
                  href="/profile"
                  aria-label="Open profile"
                  className="ml-1 flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700"
                >
                    <UserAvatar firstName={user?.firstName} lastName={user?.lastName} avatar={user?.avatar} className="h-10 w-10" />
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8 md:grid-cols-3">
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-32 rounded-2xl bg-zinc-900 animate-pulse" />
                  ))
                : statsCards.map((card) => (
                    <StatCard key={card.title} {...card} />
                  ))}
            </div>

            <form onSubmit={handleTransactionLookup} className="mb-8 flex flex-col gap-3 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="transaction-lookup" className="mb-2 block text-sm font-medium text-zinc-200">Look up a transaction</label>
                <input
                  id="transaction-lookup"
                  value={transactionLookupId}
                  onChange={(event) => setTransactionLookupId(event.target.value)}
                  placeholder="Enter Transaction ID"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <button type="submit" disabled={!transactionLookupId.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Search className="h-4 w-4" /> Find
              </button>
            </form>

            {/* Content */}
            <div className="grid grid-cols-1 gap-6">
              {/* Recent Transactions */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
<div>
                    <h2 className="text-base font-semibold text-white">Recent Transactions</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Your latest borrowing activity</p>
                  </div>
                  <Link href="/requests" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    View all
                  </Link>
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-6 py-3 font-medium">Book</th>
                        <th className="px-6 py-3 font-medium">Borrow Date</th>
                        <th className="px-6 py-3 font-medium">Due Date</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                            No recent transactions
                          </td>
                        </tr>
                      ) : (
                        recentTransactions.map((tx: any) => (
                          <tr key={tx.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-zinc-100 font-medium">{tx.book?.title || "Unknown Book"}</p>
                              <p className="text-xs text-zinc-500">{tx.book?.author || ""}</p>
                            </td>
                            <td className="px-6 py-4 text-zinc-400">{formatDate(tx.borrowDate)}</td>
                            <td className="px-6 py-4 text-zinc-400">{formatDate(tx.dueDate)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadge[displayStatus(tx)] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>
                                {displayStatus(tx)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <ResponsiveTable mobile={
                  recentTransactions.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-10 text-center text-zinc-500">No recent transactions</div>
                  ) : recentTransactions.map((tx: any) => (
                    <BorrowHistoryCard key={tx.id} transaction={{ ...tx, status: displayStatus(tx) }} formatDate={formatDate} statusBadge={statusBadge} statusLabel={{}} />
                  ))
                } />
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="px-6 py-5 border-b border-zinc-800"><h2 className="text-base font-semibold text-white">Due Soon</h2><p className="text-xs text-zinc-500 mt-0.5">Books due within the next 3 days</p></div>
                {dueSoon.length === 0 ? <p className="px-6 py-6 text-sm text-zinc-500">Nothing due in the next 3 days.</p> : <div className="divide-y divide-zinc-800/60">{dueSoon.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-4 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{transaction.book?.title || "Unknown book"}</p><p className="text-xs text-zinc-500">{transaction.book?.author || ""}</p></div><span className="shrink-0 text-sm text-amber-400">Due {formatDate(transaction.dueDate)}</span></div>)}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
