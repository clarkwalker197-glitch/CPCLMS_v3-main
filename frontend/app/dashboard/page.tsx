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
  User,
  Settings,
  LogOut,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

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
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (user && user.role !== "LIBRARIAN") {
      router.replace("/student/dashboard");
      return;
    }

    async function load() {
      try {
        const [statsRes, trendRes, catRes, deptRes, txRes] = await Promise.all([
          api.getDashboardStats(),
          api.getMonthlyTrends(6),
          api.get("/analytics/category-distribution"),
          api.getDepartmentDistribution(),
          api.getTransactions({ limit: "5" }),
        ]);
        if (statsRes.success) setStats(statsRes.data);
        if (trendRes.success && Array.isArray(trendRes.data)) setTrends(trendRes.data);
        if (catRes.success && Array.isArray(catRes.data)) setCategories(catRes.data);
        if (deptRes.success && Array.isArray(deptRes.data)) setDepartments(deptRes.data);
        setRecentTransactions(txRes.success ? (txRes.data || []) : []);
      } catch {
        // silent fail for demo
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, router]);

  const ov = stats?.overview || {};
  const activity = stats?.recentActivity || {};

  const statsCards = [
    { title: "Total Books", value: ov.totalBooks ?? 0, icon: Library, accent: "bg-blue-500/15 text-blue-400", trend: "+12.5%", trendUp: true },
    { title: "Active Members", value: ov.totalUsers ?? 0, icon: Users, accent: "bg-violet-500/15 text-violet-400", trend: "+8.2%", trendUp: true },
    { title: "Books Borrowed", value: ov.activeBorrows ?? 0, icon: BookMarked, accent: "bg-emerald-500/15 text-emerald-400", trend: "+5.1%", trendUp: true },
    { title: "Overdue Books", value: ov.overdueBooks ?? 0, icon: AlertTriangle, accent: "bg-red-500/15 text-red-400", trend: "-2.3%", trendUp: false },
  ];

  const pieData = categories.map((c: any) => ({ name: c.name, value: c.total }));

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

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setProfileOpen((o) => !o)}
                    className="w-10 h-10 ml-1 rounded-xl bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
                  >
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                  </button>

                  {profileOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setProfileOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-52 z-40 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <p className="text-sm font-semibold text-white">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">{user?.role}</p>
                        </div>
                        <div className="p-1.5">
                          <Link
                            href="/profile"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                          >
                            <User className="w-4 h-4" />
                            Profile
                          </Link>
                          <button
                            onClick={() => { setProfileOpen(false); router.push("/profile/settings"); }}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                            Settings
                          </button>
                          <div className="my-1.5 border-t border-zinc-800" />
                          <button
                            onClick={async () => {
                              setProfileOpen(false);
                              await logout();
                              router.push("/login");
                            }}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Log out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
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
                    <BarChart data={departments.length ? departments : [{ name: "No data", value: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                        labelStyle={{ color: "#a1a1aa" }}
                        formatter={(value) => [`${value} borrows`, "Total Borrows"]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Total Borrows" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Category Distribution */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
                <h2 className="text-base font-semibold text-white mb-6">Category Distribution</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData.length ? pieData : [{ name: "No data", value: 1 }]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {pieData.map((_: any, idx: number) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "12px", color: "#fff" }}
                        labelStyle={{ color: "#a1a1aa" }}
                      />
                      <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
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
