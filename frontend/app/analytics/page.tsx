"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, BookMarked, ClipboardList, Coins, Download, Package, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { getDepartmentColor } from "@/lib/department-colors";

const ranges = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["semester", "This semester"],
  ["all", "All time"],
] as const;

const chartStyle = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: "12px",
  color: "#fff",
};

const departmentPalette = [
  { code: "BSIT", color: "#FACC15" },
  { code: "BSHM", color: "#F97316" },
  { code: "BEED", color: "#22D3EE" },
  { code: "BSED", color: "#3B82F6" },
];

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 ${className}`}>
      <h2 className="mb-5 text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [range, setRange] = useState("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [topBooks, setTopBooks] = useState<any[]>([]);
  const [fines, setFines] = useState<any>({ paid: 0, unpaid: 0, monthly: [] });
  const [returns, setReturns] = useState<any>({ onTimeRate: 0 });
  const [requests, setRequests] = useState<any>({});
  const [inventory, setInventory] = useState<any>({ lowStock: [], neverBorrowed: [] });
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departmentBooks, setDepartmentBooks] = useState<any[]>([]);
  const [showAllInventory, setShowAllInventory] = useState(false);
  const [error, setError] = useState("");

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    setError("");
    try {
      await api.downloadReport("monthly", "xlsx");
    } catch {
      setError("Unable to download the monthly report right now.");
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (user && user.role !== "LIBRARIAN") {
      router.replace("/student/dashboard");
      return;
    }

    async function loadAnalytics() {
      setLoading(true);
      setError("");
      if (!navigator.onLine) {
        setError("Internet connection required to load authoritative analytics.");
        setLoading(false);
        return;
      }
      try {
        const results = await Promise.all([
          api.getDashboardStats(),
          api.get(`/analytics/monthly-trends?months=6&range=${encodeURIComponent(range)}`),
          api.get(`/analytics/most-borrowed-categories?range=${encodeURIComponent(range)}&limit=10`),
          api.getDepartmentDistribution(range),
          api.getTopBorrowedBooks(range, 10),
          api.getOverdueFinesSummary(range),
          api.getReturnPerformance(range),
          api.getRequestPipeline(range),
          api.getInventoryHealth(),
          api.getMostBorrowedByDepartment(range, departmentFilter, 10),
        ]);
        const [dashboard, trend, category, department, books, fine, performance, pipeline, health, departmentBooksResponse] = results;
        if (!dashboard.success || !trend.success || !category.success || !department.success || !books.success || !fine.success || !performance.success || !pipeline.success || !health.success || !departmentBooksResponse.success) {
          setError("Some analytics could not be loaded. Try refreshing the page.");
        }
        if (dashboard.success) setStats(dashboard.data);
        if (trend.success) setTrends(Array.isArray(trend.data) ? trend.data : []);
        if (category.success) setCategories((category.data as any)?.data || []);
        if (department.success) setDepartments(Array.isArray(department.data) ? department.data : []);
        if (books.success) setTopBooks(Array.isArray(books.data) ? books.data : []);
        if (fine.success) setFines(fine.data || {});
        if (performance.success) setReturns(performance.data || {});
        if (pipeline.success) setRequests(pipeline.data || {});
        if (health.success) setInventory(health.data || {});
        if (departmentBooksResponse.success) setDepartmentBooks(Array.isArray(departmentBooksResponse.data) ? departmentBooksResponse.data : []);
      } catch {
        setError("Unable to load analytics right now.");
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
    const handleOnline = () => { void loadAnalytics(); };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [departmentFilter, range, router, user]);

  const overview = stats?.overview || {};
  const overdueRate = overview.activeBorrows
    ? (overview.overdueBooks / overview.activeBorrows) * 100
    : 0;
  const cards = [
    { title: "Active Borrows", value: overview.activeBorrows ?? 0, icon: BookMarked, accent: "bg-blue-500/15 text-blue-400" },
    { title: "Overdue Books", value: overview.overdueBooks ?? 0, icon: AlertTriangle, accent: "bg-red-500/15 text-red-400" },
    { title: "Overdue Rate", value: `${overdueRate.toFixed(1)}%`, icon: TrendingUp, accent: "bg-orange-500/15 text-orange-400" },
    { title: "Unpaid Fines", value: `₱${Number(fines.unpaid || 0).toFixed(2)}`, icon: Coins, accent: "bg-amber-500/15 text-amber-400" },
    { title: "Pending Requests", value: requests.pending ?? overview.pendingRequests ?? 0, icon: ClipboardList, accent: "bg-blue-500/15 text-blue-400" },
    { title: "On-time Return Rate", value: `${Number(returns.onTimeRate || 0).toFixed(1)}%`, icon: BarChart3, accent: "bg-emerald-500/15 text-emerald-400" },
  ];
  const pipelineStages = [
    { label: "Pending", value: Number(requests.pending || 0), color: "#F59E0B" },
    { label: "Approved", value: Number(requests.approved || 0), color: "#10B981" },
    { label: "Rejected", value: Number(requests.rejected || 0), color: "#F87171" },
  ];
  const maxPipelineCount = Math.max(1, ...pipelineStages.map((stage) => stage.value));
  const totalBooks = Number(overview.totalBooks || 0);
  const inventoryMetrics = [
    { label: "Low stock", value: Number(inventory.lowStockCount || 0), color: "#F59E0B" },
    { label: "Unavailable", value: Number(inventory.unavailableCount || 0), color: "#F87171" },
    { label: "Never borrowed", value: Number(inventory.neverBorrowedCount || 0), color: "#22D3EE" },
  ];
  const lowStockItems = (inventory.lowStock || []).slice(0, showAllInventory ? undefined : 3);
  const neverBorrowedItems = (inventory.neverBorrowed || []).slice(0, showAllInventory ? undefined : 3);
  const hasMoreInventoryItems = (inventory.lowStock || []).length > 3 || (inventory.neverBorrowed || []).length > 3;
  const categoryColors = ["#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa", "#f87171", "#2dd4bf", "#f59e0b", "#38bdf8", "#c084fc"];

  return (
    <ProtectedRoute roles={["LIBRARIAN"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8">
            <header className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Report</h1>
                <p className="mt-1 text-sm text-zinc-400">Library performance and borrowing insights</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Report date range" className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ranges.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" onClick={handleDownloadReport} disabled={isDownloading} className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-60">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isDownloading ? "Preparing report..." : "Download Monthly Report"}
                </button>
              </div>
            </header>

            {error && <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">{error}</div>}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {loading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-zinc-900" />) : cards.map((card) => <StatCard key={card.title} {...card} />)}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel title="Monthly Borrow Activity">
                <p className="-mt-3 mb-3 text-xs text-zinc-500">Number of books borrowed each month</p>
                {trends.length === 0 ? <div className="flex h-72 items-center justify-center text-sm text-zinc-500">No borrowing data for this range</div> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={trends} margin={{ top: 20, right: 12, bottom: 12, left: 12 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="month" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} label={{ value: "Month", position: "insideBottom", offset: -8, fill: "#a1a1aa", fontSize: 11 }} /><YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={36} label={{ value: "Number of Books Borrowed", angle: -90, position: "insideLeft", fill: "#a1a1aa", fontSize: 11 }} /><Tooltip contentStyle={chartStyle} formatter={(value) => [`${value} books`, "Borrowed"]} /><Bar dataKey="borrows" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={48} name="Books Borrowed"><LabelList dataKey="borrows" position="top" fill="#a1a1aa" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>}
              </Panel>
              <Panel title="Department Borrowing Comparison">
                <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
                  {departmentPalette.map(({ code, color }) => (
                    <span key={code} className="inline-flex items-center gap-2 text-xs text-zinc-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      {code}
                    </span>
                  ))}
                </div>
                {departments.length === 0 ? <div className="flex h-64 items-center justify-center text-sm text-zinc-500">No department data for this range</div> : <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={departments} margin={{ top: 8, bottom: 8, left: 0, right: 8 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="code" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} interval={0} /><YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={32} /><Tooltip
                  cursor={{ fill: "rgba(59, 130, 246, 0.08)" }}
                  contentStyle={{ ...chartStyle, backgroundColor: "#0f172a", borderColor: "#3f3f46", color: "#f8fafc" }}
                  labelStyle={{ color: "#f8fafc", fontWeight: 600 }}
                  itemStyle={{ color: "#f8fafc" }}
                  formatter={(value) => [`${value} borrows`, "Total"]}
                /><Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={42}>{departments.map((entry) => <Cell key={entry.code} fill={getDepartmentColor(entry.code || entry.shortName)} />)}</Bar></BarChart></ResponsiveContainer></div>}
              </Panel>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel title="Top 10 Most Borrowed Books">
                {topBooks.length === 0 ? <p className="text-sm text-zinc-500">No borrow data for this range</p> : <div className="space-y-3">{topBooks.map((book) => <div key={book.id} className="flex items-center justify-between gap-4 border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{book.title}</p><p className="truncate text-xs text-zinc-500">{book.author}</p></div><span className="text-sm font-semibold text-blue-400">{book.borrowCount}</span></div>)}</div>}
              </Panel>
              <Panel title="Most Borrowed Categories">
                {categories.length === 0 ? <p className="text-sm text-zinc-500">No category data for this range</p> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ left: 8, right: 28 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} /><XAxis type="number" allowDecimals={false} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={110} stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} /><Tooltip contentStyle={chartStyle} /><Bar dataKey="borrowCount" radius={[0, 6, 6, 0]}>{categories.map((category, index) => (
                    <Cell key={`${category.name}-${index}`} fill={categoryColors[index % categoryColors.length]} />
                  ))}<LabelList dataKey="borrowCount" position="right" fill="#a1a1aa" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>}
              </Panel>
            </div>

            <Panel title="Most Borrowed Books by Department" className="mb-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-500">Ranked by borrow count within each department</p>
                <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="Department filter" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                  <option value="">All departments</option>
                  {departments.map((department) => <option key={department.code} value={department.code}>{department.name}</option>)}
                </select>
              </div>
              {departmentBooks.length === 0 ? <p className="text-sm text-zinc-500">No department borrowing data for this range.</p> : <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">{departmentBooks.map((group) => {
                const departmentColor = getDepartmentColor(group.department);
                const maxBorrowCount = Math.max(1, ...group.topBooks.map((book: any) => Number(book.borrowCount || 0)));
                return (
                  <section key={group.department} aria-label={`${group.department} most borrowed books`}>
                    <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: departmentColor }} />
                        <h3 className="font-semibold text-white">{group.department}</h3>
                      </div>
                      <span className="text-xs text-zinc-500">{group.topBooks.length} titles</span>
                    </div>
                    <div className="space-y-4">
                      {group.topBooks.map((book: any, index: number) => {
                        const borrowCount = Number(book.borrowCount || 0);
                        const barWidth = borrowCount ? Math.max(4, (borrowCount / maxBorrowCount) * 100) : 0;
                        return (
                          <div key={`${group.department}-${book.title}`}>
                            <div className="mb-1.5 flex items-start gap-3 text-sm">
                              <span className="w-5 shrink-0 pt-0.5 text-xs text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1 break-words text-zinc-300">{book.title}</span>
                              <span className="shrink-0 font-semibold text-zinc-100">{borrowCount}</span>
                            </div>
                            <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={`${book.title} borrows`} aria-valuenow={borrowCount} aria-valuemin={0} aria-valuemax={maxBorrowCount}>
                              <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: departmentColor }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}</div>}
            </Panel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Panel title="Request Pipeline">
                <div className="mb-5 grid grid-cols-2 gap-3 border-b border-zinc-800 pb-4">
                  <div><p className="text-xs text-zinc-500">Approval rate</p><p className="mt-1 text-xl font-semibold text-blue-300">{Number(requests.approvalRate || 0).toFixed(1)}%</p></div>
                  <div><p className="text-xs text-zinc-500">Avg. processing</p><p className="mt-1 text-xl font-semibold text-zinc-100">{Number(requests.averageApprovalHours || 0).toFixed(1)}<span className="ml-1 text-xs font-normal text-zinc-500">hrs</span></p></div>
                </div>
                <div className="space-y-4">
                  {pipelineStages.map((stage) => (
                    <div key={stage.label}>
                      <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-zinc-400">{stage.label}</span><span className="font-semibold text-zinc-100">{stage.value}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={`${stage.label} requests`} aria-valuenow={stage.value} aria-valuemin={0} aria-valuemax={maxPipelineCount}>
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${stage.value ? Math.max(4, (stage.value / maxPipelineCount) * 100) : 0}%`, backgroundColor: stage.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Inventory Health">
                <div className="mb-5 flex items-baseline justify-between border-b border-zinc-800 pb-4">
                  <p className="text-xs text-zinc-500">Collection health checks</p>
                  <p className="text-xs text-zinc-400">{totalBooks} books</p>
                </div>
                <div className="space-y-4">
                  {inventoryMetrics.map((metric) => {
                    const percent = totalBooks ? Math.min(100, (metric.value / totalBooks) * 100) : 0;
                    return (
                      <div key={metric.label}>
                        <div className="mb-1.5 flex items-center justify-between text-xs"><span className="text-zinc-400">{metric.label}</span><span className="font-semibold text-zinc-100">{metric.value}</span></div>
                        <div className="h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={metric.label} aria-valuenow={metric.value} aria-valuemin={0} aria-valuemax={totalBooks || 1}>
                          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: metric.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-zinc-800 pt-4 text-xs">
                  <div>
                    <h3 className="mb-2 font-medium text-zinc-300">Low stock</h3>
                    {lowStockItems.length ? <ul className="space-y-2">{lowStockItems.map((book: any) => <li key={book.id} className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-zinc-500">{book.title}</span><span className="shrink-0 text-amber-300">{book.availableCopies} left</span></li>)}</ul> : <p className="text-zinc-600">None</p>}
                  </div>
                  <div>
                    <h3 className="mb-2 font-medium text-zinc-300">Never borrowed</h3>
                    {neverBorrowedItems.length ? <ul className="space-y-2">{neverBorrowedItems.map((book: any) => <li key={book.id} className="line-clamp-2 text-zinc-500">{book.title}</li>)}</ul> : <p className="text-zinc-600">None</p>}
                  </div>
                </div>
                {hasMoreInventoryItems && (
                  <button
                    type="button"
                    onClick={() => setShowAllInventory((prev) => !prev)}
                    className="mt-4 inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                  >
                    {showAllInventory ? "Show less" : "See all"}
                  </button>
                )}
              </Panel>
              <Panel title="Fine Distribution">
                <div className="mb-4 grid grid-cols-3 gap-2 border-b border-zinc-800 pb-4 text-xs">
                  <div><p className="text-zinc-500">Unpaid</p><p className="mt-1 font-semibold text-amber-300">₱{Number(fines.unpaid || 0).toFixed(2)}</p></div>
                  <div><p className="text-zinc-500">Paid</p><p className="mt-1 font-semibold text-emerald-300">₱{Number(fines.paid || 0).toFixed(2)}</p></div>
                  <div><p className="text-zinc-500">Total</p><p className="mt-1 font-semibold text-zinc-100">₱{(Number(fines.unpaid || 0) + Number(fines.paid || 0)).toFixed(2)}</p></div>
                </div>
                {(fines.monthly || []).length === 0 ? <div className="flex h-36 items-center justify-center text-sm text-zinc-500">No fines for this range</div> : <div className="h-40"><ResponsiveContainer width="100%" height="100%"><BarChart data={fines.monthly} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="month" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value: number) => `₱${value}`} /><Tooltip contentStyle={chartStyle} formatter={(value) => [`₱${Number(value || 0).toFixed(2)}`, ""]} /><Bar dataKey="unpaid" stackId="fines" fill="#F59E0B" radius={[0, 0, 0, 0]} name="Unpaid" /><Bar dataKey="paid" stackId="fines" fill="#10B981" radius={[4, 4, 0, 0]} name="Paid" /></BarChart></ResponsiveContainer></div>}
              </Panel>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
