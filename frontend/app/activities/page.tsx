"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import ResponsiveTable from "@/components/ResponsiveTable";
import {
  Search,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { ModalLayer } from "@/components/ModalLayer";

const PAGE_SIZE = 15;

const ACTION_OPTIONS = [
  "LOGIN",
  "REGISTER",
  "BORROW_REQUEST",
  "APPROVE_REQUEST",
  "REJECT_REQUEST",
  "RETURN_BOOK",
  "RESERVE_BOOK",
  "CANCEL_RESERVATION",
  "CREATE_USER",
  "UPDATE_BOOK",
  "DELETE_USER",
];

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      };
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      if (dateFilter !== "all") {
        const from = new Date();
        if (dateFilter === "today") {
          from.setHours(0, 0, 0, 0);
        } else if (dateFilter === "7") {
          from.setDate(from.getDate() - 6);
          from.setHours(0, 0, 0, 0);
        } else if (dateFilter === "30") {
          from.setDate(from.getDate() - 29);
          from.setHours(0, 0, 0, 0);
        } else if (dateFilter === "month") {
          from.setDate(1);
          from.setHours(0, 0, 0, 0);
        }
        params.fromDate = from.toISOString();
      }

      const res = await api.get<any>(`/activities?${new URLSearchParams(params).toString()}`);
      if (res.success) {
        setActivities((res.data as any[]) || []);
        setTotal(res.meta?.total ?? ((res.data as any[]) || []).length);
      }
    } catch {
      setError("Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  }, [search, actionFilter, dateFilter, currentPage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, actionFilter, dateFilter]);

  const formatTimestamp = (d?: string) => {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
      " · " + date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  };

  const formatAction = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const actorName = (log: any) => log.user
    ? `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim() || "Unknown user"
    : "System";

  const openActivityDetails = async (log: any) => {
    setSelectedActivity(log);
    setDetailLoading(true);
    setDetailError("");
    try {
      const response = await api.get<any>(`/activities/${encodeURIComponent(log.id)}`);
      if (response.success && response.data) setSelectedActivity(response.data);
      else setDetailError(response.error || "Unable to load full activity details.");
    } catch {
      setDetailError("Unable to load full activity details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const actionBadge: Record<string, string> = {
    LOGIN: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
    LOGIN_GOOGLE: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
    REGISTER: "bg-sky-500/15 text-sky-400 ring-sky-500/30",
    TOKEN_REFRESH: "bg-indigo-500/15 text-indigo-400 ring-indigo-500/30",
    LOGOUT: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
    BORROW_REQUEST: "bg-cyan-500/15 text-cyan-400 ring-cyan-500/30",
    APPROVE_REQUEST: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
    REJECT_REQUEST: "bg-red-500/15 text-red-400 ring-red-500/30",
    RETURN_BOOK: "bg-purple-500/15 text-purple-400 ring-purple-500/30",
    RESERVE_BOOK: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
    CANCEL_RESERVATION: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
    CREATE_USER: "bg-teal-500/15 text-teal-400 ring-teal-500/30",
    UPDATE_BOOK: "bg-violet-500/15 text-violet-400 ring-violet-500/30",
    DELETE_USER: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
    SYSTEM: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
  };

  const formatDetails = (action: string, details?: any) => {
    if (!details) {
      if (action === "LOGIN" || action === "LOGIN_GOOGLE") return "Successful login";
      return "No additional details";
    }

    if (typeof details === "string") return details;

    const readableDate = (value: unknown) => {
      if (!value) return "";
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-PH");
    };

    switch (action) {
      case "BORROW_REQUEST":
        return details.bookTitle ? `Book: ${details.bookTitle}` : "Borrow request submitted";
      case "APPROVE_REQUEST":
        return [
          details.bookTitle && `Book: ${details.bookTitle}`,
          details.borrowerName && `Borrower: ${details.borrowerName}`,
        ].filter(Boolean).join(" · ") || "Borrow request approved";
      case "RETURN_BOOK":
        return details.bookTitle ? `Book: ${details.bookTitle}` : "Book returned";
      case "LOGIN":
      case "LOGIN_GOOGLE":
        return "Successful login";
      case "EMAIL_SENT":
        return details.to ? `Sent to: ${details.to}` : "Email sent successfully";
      default: {
        const labels: Record<string, string> = {
          bookTitle: "Book",
          borrowerName: "Borrower",
          reason: "Reason",
          fineAmount: "Fine",
          dueDate: "Due",
          isOverdue: "Overdue",
          subject: "Subject",
          to: "Recipient",
          message: "Message",
        };
        const summary = Object.entries(details)
          .filter(([key, value]) => value !== undefined && value !== null && !/id|token|code|accession/i.test(key))
          .map(([key, value]) => {
            const label = labels[key] || formatAction(key);
            const displayValue = key.toLowerCase().includes("date") ? readableDate(value) : String(value);
            return `${label}: ${displayValue}`;
          })
          .join(" · ");
        return summary || "Activity recorded";
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const getPageNumbers = () => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
          {error && (
            <div className="p-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Activity Logs</h1>
              <p className="text-sm text-zinc-400 mt-1">
                Track all system activities and user actions ({total} total)
              </p>
            </div>
            {(search || actionFilter || dateFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setActionFilter("");
                  setDateFilter("all");
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Filter className="w-4 h-4" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search activities..."
                  className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label="Filter by action"
                className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none"
              >
                <option value="" className="bg-zinc-900 text-white">All Actions</option>
                {ACTION_OPTIONS.map((a) => (
                  <option key={a} value={a} className="bg-zinc-900 text-white">
                    {formatAction(a)}
                  </option>
                ))}
              </select>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Filter by date"
                className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none"
              >
                <option value="all" className="bg-zinc-900 text-white">All Time</option>
                <option value="today" className="bg-zinc-900 text-white">Today</option>
                <option value="7" className="bg-zinc-900 text-white">Last 7 days</option>
                <option value="30" className="bg-zinc-900 text-white">Last 30 days</option>
                <option value="month" className="bg-zinc-900 text-white">This Month</option>
              </select>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="hidden sm:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-16 bg-zinc-900 animate-pulse border-b border-zinc-800/40" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && activities.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-20 text-center">
              <ScrollText className="w-12 h-12 text-zinc-600 mb-4" />
              <p className="text-zinc-300 font-medium">No activity logs found</p>
              <p className="text-sm text-zinc-500 mt-1">
                {search || actionFilter || dateFilter !== "all"
                  ? "Try adjusting your search or filters"
                  : "System activities will appear here"}
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && activities.length > 0 && (
            <>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-6 py-3 font-medium">Timestamp</th>
                      <th className="px-6 py-3 font-medium">User</th>
                      <th className="px-6 py-3 font-medium">Action</th>
                      <th className="px-6 py-3 font-medium hidden lg:table-cell">Details</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((log: any) => (
                      <tr key={log.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-6 py-4 text-zinc-400 whitespace-nowrap">{formatTimestamp(log.createdAt)}</td>
                        <td className="px-6 py-4">
                          <p className="text-zinc-100 font-medium">{actorName(log)}</p>
                          <p className="text-xs text-zinc-500">{log.user?.libraryId || "—"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${actionBadge[log.action] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-400 max-w-[420px] hidden lg:table-cell">
                          <button type="button" onClick={() => void openActivityDetails(log)} title="View full activity details" className="block max-w-[380px] truncate text-left transition-colors hover:text-blue-300">
                            {formatDetails(log.action, log.details)}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 bg-emerald-500/15 text-emerald-400 ring-emerald-500/30">
                            Success
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <ResponsiveTable mobile={
              activities.map((log: any) => (
                <article key={log.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <p className="font-semibold text-zinc-100 break-words">{actorName(log)}</p>
                    <p className="mt-1 text-xs text-zinc-500">{log.user?.libraryId || "—"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-4 text-sm">
                    <div><p className="text-xs text-zinc-500">Timestamp</p><p className="mt-1 text-zinc-300">{formatTimestamp(log.createdAt)}</p></div>
                    <div className="col-span-2"><p className="text-xs text-zinc-500">Details</p><button type="button" onClick={() => void openActivityDetails(log)} className="mt-1 break-words text-left text-zinc-300 hover:text-blue-300">{formatDetails(log.action, log.details)}</button></div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                    <span className={`inline-flex max-w-[70%] items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${actionBadge[log.action] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>{formatAction(log.action)}</span>
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">Success</span>
                  </div>
                </article>
              ))
            } />
            </>
          )}

          {/* Pagination */}
          {!loading && activities.length > 0 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-zinc-500">
                Showing{" "}
                <span className="text-zinc-300">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, total)}
                </span>{" "}
                of <span className="text-zinc-300">{total}</span> logs
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getPageNumbers().map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                      page === currentPage
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {selectedActivity && (
            <ModalLayer>
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <button type="button" aria-label="Close activity details" className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedActivity(null)} />
                <section role="dialog" aria-modal="true" aria-labelledby="activity-details-title" className="relative z-50 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h2 id="activity-details-title" className="text-lg font-semibold text-white">Activity Details</h2>
                      <p className="mt-1 text-sm text-zinc-400">Complete audit record</p>
                    </div>
                    <button type="button" onClick={() => setSelectedActivity(null)} aria-label="Close activity details" className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
                  </div>
                  {detailError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{detailError}</div>}
                  {detailLoading ? <div className="h-24 animate-pulse rounded-xl bg-zinc-800" /> : (() => {
                    const details = selectedActivity.details && typeof selectedActivity.details === "object" && !Array.isArray(selectedActivity.details)
                      ? selectedActivity.details
                      : selectedActivity.details == null ? {} : { notes: selectedActivity.details };
                    const device = details.device || details.browser || details.userAgent || "Not recorded";
                    const statusLabel = details.status || ({
                      BORROW_REQUEST: "Pending",
                      APPROVE_REQUEST: "Awaiting borrower verification",
                      REJECT_REQUEST: "Rejected",
                      RETURN_BOOK: "Returned",
                      RESERVE_BOOK: "Reserved",
                      CANCEL_RESERVATION: "Cancelled",
                      CREATE_USER: "Created",
                      UPDATE_BOOK: "Updated",
                      DELETE_USER: "Archived",
                      REGISTER: "Registered",
                      LOGIN: "Successful",
                      LOGIN_GOOGLE: "Successful",
                    } as Record<string, string>)[selectedActivity.action] || "Success";
                    const additionalDetails = Object.entries(details).filter(([key]) => !["device", "browser", "userAgent", "status"].includes(key));
                    const formatValue = (value: any) => Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
                    return <>
                      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Full timestamp</dt><dd className="mt-1 text-sm text-zinc-200">{selectedActivity.createdAt ? new Date(selectedActivity.createdAt).toLocaleString("en-PH", { dateStyle: "full", timeStyle: "long" }) : "—"}</dd></div>
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">User</dt><dd className="mt-1 text-sm text-zinc-200">{actorName(selectedActivity)} <span className="text-zinc-400">({selectedActivity.user?.libraryId || "—"})</span></dd></div>
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Action</dt><dd className="mt-1 text-sm text-zinc-200">{formatAction(selectedActivity.action)}</dd></div>
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</dt><dd className="mt-1 text-sm text-emerald-400">{formatAction(String(statusLabel))}</dd></div>
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">IP address</dt><dd className="mt-1 break-all text-sm text-zinc-200">{selectedActivity.ipAddress || "Not recorded"}</dd></div>
                        <div><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Device / Browser</dt><dd className="mt-1 break-words text-sm text-zinc-200">{String(device)}</dd></div>
                        <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Related record</dt><dd className="mt-1 break-words text-sm text-zinc-200">{selectedActivity.entity || "—"}{selectedActivity.entityId ? ` · ${selectedActivity.entityId}` : ""}</dd></div>
                      </dl>
                      <div className="mt-5 border-t border-zinc-800 pt-4">
                        <h3 className="text-sm font-medium text-zinc-200">Additional details / notes</h3>
                        {additionalDetails.length ? <dl className="mt-3 space-y-2">{additionalDetails.map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-3 text-sm"><dt className="text-zinc-500">{formatAction(key)}</dt><dd className="break-words text-zinc-300">{formatValue(value)}</dd></div>)}</dl> : <p className="mt-2 text-sm text-zinc-500">No additional details recorded.</p>}
                      </div>
                    </>;
                  })()}
                </section>
              </div>
            </ModalLayer>
          )}
        </div>
      </div>
    </div>
  );
}
