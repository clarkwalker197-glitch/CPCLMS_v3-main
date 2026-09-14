"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import ProtectedRoute from "@/components/ProtectedRoute";
import NotificationBell from "@/components/NotificationBell";
import Sidebar from "@/components/Sidebar";
import ResponsiveTable from "@/components/ResponsiveTable";
import { StatCard } from "@/components/StatCard";
import BorrowHistoryCard from "@/components/BorrowHistoryCard";
import api from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Library,
  BookMarked,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
} from "recharts";
import { getDepartmentColor } from "@/lib/department-colors";

const statusBadge: Record<string, string> = {
  ACTIVE: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  RETURNED: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  OVERDUE: "bg-red-500/15 text-red-400 ring-red-500/30",
  PENDING: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  APPROVED: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  REJECTED: "bg-red-500/15 text-red-400 ring-red-500/30",
  CANCELLED: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryRange, setCategoryRange] = useState("all");
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [departments, setDepartments] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== "LIBRARIAN") {
      router.replace("/student/dashboard");
      return;
    }

    async function load() {
      setCategoryLoading(true);
      try {
        const [statsRes, trendRes, catRes, deptRes, txRes] = await Promise.all([
          api.getDashboardStats(),
          api.getMonthlyTrends(6),
          api.getMostBorrowedCategories(categoryRange),
          api.getDepartmentDistribution(),
          api.getTransactions({ limit: "5" }),
        ]);
        if (statsRes.success) setStats(statsRes.data);
        if (trendRes.success && Array.isArray(trendRes.data)) setTrends(trendRes.data);
        if (catRes.success && catRes.data) setCategories((catRes.data as any).data || []);
        if (deptRes.success && Array.isArray(deptRes.data)) setDepartments(deptRes.data);
        setRecentTransactions(txRes.success ? (txRes.data || []) : []);
      } catch {
        // silent fail for demo
      } finally {
        setLoading(false);
        setCategoryLoading(false);
      }
    }
    load();
  }, [user, router, categoryRange]);

  const ov = stats?.overview || {};
  const activity = stats?.recentActivity || {};

  const statsCards = [
    { title: "Total Books", value: ov.totalBooks ?? 0, icon: Library, accent: "bg-blue-500/15 text-blue-400" },
    { title: "Active Members", value: ov.totalUsers ?? 0, icon: Users, accent: "bg-violet-500/15 text-violet-400" },
    { title: "Books Borrowed", value: ov.activeBorrows ?? 0, icon: BookMarked, accent: "bg-emerald-500/15 text-emerald-400" },
    { title: "Overdue Books", value: ov.overdueBooks ?? 0, icon: AlertTriangle, accent: "bg-red-500/15 text-red-400" },
  ];

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <ProtectedRoute roles={["LIBRARIAN"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
        <Sidebar />

        {/* ── Main Content ────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 pb-28 lg:pb-8">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold text-white">Library Dashboard</h1>
                <p className="text-sm text-zinc-400 mt-1">Welcome back! Here&apos;s your library overview.</p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />

                <Link
                  href="/profile"
                  aria-label="Open profile"
                  className="w-10 h-10 ml-1 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
                >
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-2 xl:grid-cols-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-zinc-900 animate-pulse" />
                ))
                : statsCards.map((card) => (
                  <StatCard key={card.title} {...card} />
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Most Active Departments in Borrowing */}
              <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
                <h2 className="text-base font-semibold text-white mb-6">Most Active Departments in Borrowing</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={departments.length ? departments : [{ code: "No data", name: "No data", value: 0 }]}
                      margin={{ top: 8, right: 12, left: 12, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis
                        dataKey="code"
                        stroke="#71717a"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        minTickGap={12}
                        height={40}
                        tick={{ fill: "#a1a1aa" }}
                      />
                      <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                        labelStyle={{ color: "#a1a1aa" }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.name || payload?.[0]?.payload?.code || "Department"}
                        formatter={(value) => [`${value} borrows`, "Total Borrows"]}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} name="Total Borrows">
                        {departments.length > 0 ? (
                          departments.map((entry) => (
                            <Cell key={entry.code || entry.name} fill={getDepartmentColor(entry.code || entry.shortName)} />
                          ))
                        ) : (
                          <Cell fill="#3b82f6" />
                        )}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Most Borrowed Categories */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <h2 className="text-base font-semibold text-white">Most Borrowed Categories</h2>
                  <select
                    value={categoryRange}
                    onChange={(e) => setCategoryRange(e.target.value)}
                    aria-label="Borrow category range"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All time</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                    <option value="semester">This semester</option>
                  </select>
                </div>
                {categoryLoading ? (
                  <div className="h-72 space-y-4 pt-3">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="h-8 rounded-lg bg-zinc-800 animate-pulse" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-zinc-500">No borrow data yet</div>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 28, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={105}
                          stroke="#a1a1aa"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => value.length > 16 ? `${value.slice(0, 16)}...` : value}
                        />
                        <Tooltip
                          contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                          formatter={(value) => [`${value} borrows`, "Borrow count"]}
                          labelFormatter={(label) => String(label)}
                        />
                        <Bar dataKey="borrowCount" fill="#10b981" radius={[0, 6, 6, 0]} name="Borrow count">
                          <LabelList dataKey="borrowCount" position="right" fill="#a1a1aa" fontSize={11} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Borrow Activity */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Recent Borrow Activity</h2>
                <Link href="/requests" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  View all
                </Link>
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-6 py-3 font-medium">Book</th>
                      <th className="px-6 py-3 font-medium">Member</th>
                      <th className="px-6 py-3 font-medium">Borrow Date</th>
                      <th className="px-6 py-3 font-medium">Due Date</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-zinc-500">
                          No recent activity
                        </td>
                      </tr>
                    ) : (
                      recentTransactions.map((tx: any) => (
                        <tr key={tx.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-zinc-100 font-medium">{tx.book?.title || "Unknown Book"}</p>
                            <p className="text-xs text-zinc-500">{tx.book?.author || ""}</p>
                          </td>
                          <td className="px-6 py-4 text-zinc-300">
                            {tx.user?.firstName} {tx.user?.lastName}
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{formatDate(tx.borrowDate)}</td>
                          <td className="px-6 py-4 text-zinc-400">{formatDate(tx.dueDate)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusBadge[tx.status] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>
                              {tx.status}
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
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-10 text-center text-zinc-500">No recent activity</div>
                ) : recentTransactions.map((tx: any) => (
                  <BorrowHistoryCard key={tx.id} transaction={tx} formatDate={formatDate} statusBadge={statusBadge} statusLabel={{}} contextLabel="Member" contextValue={`${tx.user?.firstName || ""} ${tx.user?.lastName || ""}`.trim() || "Unknown member"} />
                ))
              } />
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
