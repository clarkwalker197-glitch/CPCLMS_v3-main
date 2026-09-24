"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BarChart3, BookMarked, ClipboardList, Coins, Package, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import NotificationBell from "@/components/NotificationBell";
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
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.role !== "LIBRARIAN") {
      router.replace("/student/dashboard");
      return;
    }

    async function loadAnalytics() {
      setLoading(true);
      setError("");
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
        ]);
        const [dashboard, trend, category, department, books, fine, performance, pipeline, health] = results;
        if (!dashboard.success || !trend.success || !category.success || !department.success || !books.success || !fine.success || !performance.success || !pipeline.success || !health.success) {
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
      } catch {
        setError("Unable to load analytics right now.");
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, [range, router, user]);

  const overview = stats?.overview || {};
  const overdueRate = overview.activeBorrows + overview.overdueBooks
    ? (overview.overdueBooks / (overview.activeBorrows + overview.overdueBooks)) * 100
    : 0;
  const cards = [
    { title: "Active Borrows", value: overview.activeBorrows ?? 0, icon: BookMarked, accent: "bg-blue-500/15 text-blue-400" },
    { title: "Overdue Books", value: overview.overdueBooks ?? 0, icon: AlertTriangle, accent: "bg-red-500/15 text-red-400" },
    { title: "Overdue Rate", value: `${overdueRate.toFixed(1)}%`, icon: TrendingUp, accent: "bg-orange-500/15 text-orange-400" },
    { title: "Unpaid Fines", value: `₱${Number(fines.unpaid || 0).toFixed(2)}`, icon: Coins, accent: "bg-amber-500/15 text-amber-400" },
    { title: "Pending Requests", value: requests.pending ?? overview.pendingRequests ?? 0, icon: ClipboardList, accent: "bg-blue-500/15 text-blue-400" },
    { title: "On-time Return Rate", value: `${Number(returns.onTimeRate || 0).toFixed(1)}%`, icon: BarChart3, accent: "bg-emerald-500/15 text-emerald-400" },
  ];

  return (
    <ProtectedRoute roles={["LIBRARIAN"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pb-8">
            <header className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Analytics</h1>
                <p className="mt-1 text-sm text-zinc-400">Library performance and borrowing insights</p>
              </div>
              <div className="flex items-center gap-3">
                <select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Analytics date range" className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ranges.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <NotificationBell />
                <Link href="/profile" aria-label="Open profile" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/30">
                  {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </Link>
              </div>
            </header>

            {error && <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">{error}</div>}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {loading ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-zinc-900" />) : cards.map((card) => <StatCard key={card.title} {...card} />)}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel title="Monthly Borrow, Return & Overdue Trends">
                {trends.length === 0 ? <div className="flex h-72 items-center justify-center text-sm text-zinc-500">No trend data for this range</div> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trends}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="month" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={chartStyle} /><Line type="monotone" dataKey="borrows" stroke="#3b82f6" strokeWidth={2} dot={false} name="Borrows" /><Line type="monotone" dataKey="returns" stroke="#10b981" strokeWidth={2} dot={false} name="Returns" /><Line type="monotone" dataKey="overdues" stroke="#ef4444" strokeWidth={2} dot={false} name="Overdue" /></LineChart></ResponsiveContainer></div>}
              </Panel>
              <Panel title="Department Borrowing Comparison">
                {departments.length === 0 ? <div className="flex h-72 items-center justify-center text-sm text-zinc-500">No department data for this range</div> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={departments} margin={{ bottom: 28, left: 8, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="code" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={52} /><YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={chartStyle} formatter={(value) => [`${value} borrows`, "Total"]} /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{departments.map((entry) => <Cell key={entry.code} fill={getDepartmentColor(entry.code || entry.shortName)} />)}</Bar></BarChart></ResponsiveContainer></div>}
              </Panel>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel title="Top 10 Most Borrowed Books">
                {topBooks.length === 0 ? <p className="text-sm text-zinc-500">No borrow data for this range</p> : <div className="space-y-3">{topBooks.map((book) => <div key={book.id} className="flex items-center justify-between gap-4 border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-100">{book.title}</p><p className="truncate text-xs text-zinc-500">{book.author}</p></div><span className="text-sm font-semibold text-blue-400">{book.borrowCount}</span></div>)}</div>}
              </Panel>
              <Panel title="Most Borrowed Categories">
                {categories.length === 0 ? <p className="text-sm text-zinc-500">No category data for this range</p> : <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ left: 8, right: 28 }}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} /><XAxis type="number" allowDecimals={false} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={110} stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} /><Tooltip contentStyle={chartStyle} /><Bar dataKey="borrowCount" fill="#10b981" radius={[0, 6, 6, 0]}><LabelList dataKey="borrowCount" position="right" fill="#a1a1aa" fontSize={11} /></Bar></BarChart></ResponsiveContainer></div>}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Panel title="Request Pipeline"><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-zinc-500">Pending</p><p className="text-xl font-semibold text-amber-400">{requests.pending ?? 0}</p></div><div><p className="text-zinc-500">Approved</p><p className="text-xl font-semibold text-emerald-400">{requests.approved ?? 0}</p></div><div><p className="text-zinc-500">Rejected</p><p className="text-xl font-semibold text-red-400">{requests.rejected ?? 0}</p></div><div><p className="text-zinc-500">Approval rate</p><p className="text-xl font-semibold text-blue-400">{Number(requests.approvalRate || 0).toFixed(1)}%</p></div></div><p className="mt-4 text-xs text-zinc-500">Average processing time: {Number(requests.averageApprovalHours || 0).toFixed(1)} hours</p></Panel>
              <Panel title="Inventory Health"><div className="mb-4 flex items-center gap-2"><Package className="h-4 w-4 text-amber-400" /><span className="text-sm text-zinc-300">{inventory.lowStockCount ?? 0} low-stock, {inventory.unavailableCount ?? 0} unavailable, {inventory.neverBorrowedCount ?? 0} never borrowed</span></div><div className="space-y-2">{(inventory.lowStock || []).slice(0, 6).map((book: any) => <div key={book.id} className="flex justify-between gap-3 text-xs"><span className="truncate text-zinc-300">{book.title}</span><span className="text-amber-400">{book.availableCopies} left</span></div>)}</div></Panel>
              <Panel title="Paid vs Unpaid Fines"><div className="mb-3 flex justify-between text-sm"><span className="text-amber-400">Unpaid ₱{Number(fines.unpaid || 0).toFixed(2)}</span><span className="text-emerald-400">Paid ₱{Number(fines.paid || 0).toFixed(2)}</span></div>{(fines.monthly || []).length === 0 ? <p className="text-sm text-zinc-500">No fines for this range</p> : <div className="h-40"><ResponsiveContainer width="100%" height="100%"><BarChart data={fines.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#27272a" /><XAxis dataKey="month" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} /><Tooltip contentStyle={chartStyle} /><Bar dataKey="unpaid" stackId="fines" fill="#f59e0b" name="Unpaid" /><Bar dataKey="paid" stackId="fines" fill="#10b981" name="Paid" /></BarChart></ResponsiveContainer></div>}</Panel>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
