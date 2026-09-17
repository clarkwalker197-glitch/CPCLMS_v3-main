"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import Sidebar from "@/components/Sidebar";
import ResponsiveTable from "@/components/ResponsiveTable";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
Phone,
} from "lucide-react";

const PAGE_SIZE = 10;

type AddMemberFormState = {
  firstName: string;
  lastName: string;
  email: string;
  libraryId: string;
  password: string;
  confirmPassword: string;
  role: "STUDENT" | "FACULTY" | "LIBRARIAN";
  department: string;
  yearSection: string;
  phone: string;
};

const emptyAddMemberForm: AddMemberFormState = {
  firstName: "",
  lastName: "",
  email: "",
  libraryId: "",
  password: "",
  confirmPassword: "",
  role: "STUDENT",
  department: "",
  yearSection: "",
  phone: "",
};

export default function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [finesMap, setFinesMap] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [successMsg, setSuccessMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState<AddMemberFormState>(emptyAddMemberForm);
  const [submittingMember, setSubmittingMember] = useState(false);
  const [memberFormError, setMemberFormError] = useState("");

  const debouncedSearch = useDebounce(search, 300);
  const debouncedStatus = useDebounce(statusFilter, 300);

  const isLibrarian = user?.role === "LIBRARIAN";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedStatus) params.isActive = debouncedStatus === "active" ? "true" : "false";

const [usersRes, statsRes] = await Promise.all([
        api.get<any>("/auth/users?" + new URLSearchParams(params).toString()),
        api.getDashboardStats(),
      ]);

      if (usersRes.success) {
        setMembers((usersRes.data as any[]) || []);
        setTotal(usersRes.meta?.total ?? ((usersRes.data as any[]) || []).length);
      } else if (usersRes.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      }

      if (statsRes.success && statsRes.data?.overdueByUser) {
        const map: Record<string, number> = {};
        for (const o of statsRes.data.overdueByUser) {
          map[o.userId] = o.totalFine ?? 0;
        }
        setFinesMap(map);
      }
    } catch {
      setError("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debouncedStatus, currentPage]);

  useEffect(() => {
    if (user && user.role !== "LIBRARIAN") {
      // non-librarians shouldn't manage members
      window.location.href = "/student/dashboard";
      return;
    }
    loadData();
  }, [user, loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, debouncedStatus]);

const handleDelete = async (member: any) => {
    if (!window.confirm(`Delete member "${member.firstName} ${member.lastName}"? This action cannot be undone.`)) return;
    if (deletingId) return; // prevent double-click spam
    setDeletingId(member.id);
    try {
      const res = await api.delete(`/auth/users/${member.id}`);
      if (res.success) {
        setSuccessMsg("Member deleted successfully");
        loadData();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (res.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to delete member");
      }
    } catch {
      setError("Failed to delete member");
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddMemberChange = (
    field: keyof AddMemberFormState
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setMemberForm((current) => ({ ...current, [field]: value }));
    setMemberFormError("");
  };

  const resetAddMemberForm = () => {
    setMemberForm(emptyAddMemberForm);
    setMemberFormError("");
  };

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setMemberFormError("");

    if (memberForm.password !== memberForm.confirmPassword) {
      setMemberFormError("Passwords do not match.");
      return;
    }

    if (memberForm.password.length < 8) {
      setMemberFormError("Password must be at least 8 characters long.");
      return;
    }

    if (memberForm.role === "LIBRARIAN" && !memberForm.libraryId.trim()) {
      setMemberFormError("ID Number is required for Librarian accounts.");
      return;
    }

    if ((memberForm.role === "STUDENT" || memberForm.role === "FACULTY") && !memberForm.department.trim()) {
      setMemberFormError("Department is required for Student and Faculty accounts.");
      return;
    }

    if (memberForm.role === "STUDENT" && !memberForm.yearSection.trim()) {
      setMemberFormError("Year & Section is required for Student accounts.");
      return;
    }

    setSubmittingMember(true);
    try {
      const payload = {
        firstName: memberForm.firstName.trim(),
        lastName: memberForm.lastName.trim(),
        email: memberForm.email.trim().toLowerCase(),
        libraryId: memberForm.libraryId.trim() || undefined,
        password: memberForm.password,
        role: memberForm.role,
        department: memberForm.department.trim() || undefined,
        yearSection: memberForm.yearSection.trim() || undefined,
        phone: memberForm.phone.trim() || undefined,
      };

      const res = await api.post<{ firstName?: string; lastName?: string }>("/auth/admin/users", payload);
      if (res.success) {
        const createdName = `${res.data?.firstName || memberForm.firstName} ${res.data?.lastName || memberForm.lastName}`.trim();
        setSuccessMsg(createdName ? `User created successfully: ${createdName}` : "User created successfully");
        setShowAddMemberModal(false);
        resetAddMemberForm();
        await loadData();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (res.rateLimited) {
        setMemberFormError("You're moving too fast. Please wait a moment and try again.");
      } else {
        setMemberFormError(res.error || "Failed to create member.");
      }
    } catch {
      setMemberFormError("Failed to create member. Please try again.");
    } finally {
      setSubmittingMember(false);
    }
  };

  const getFullName = (m: any) => `${m?.firstName || ""} ${m?.lastName || ""}`.trim() || "—";
  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const formatPhone = (p?: string) => p || "—";

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
          {successMsg && (
            <div className="p-4 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400">
              {successMsg}
            </div>
          )}
          {error && (
            <div className="p-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Members</h1>
              <p className="text-sm text-zinc-400 mt-1">
                Manage library members ({total} total)
              </p>
            </div>
            {isLibrarian && (
              <button
                onClick={() => {
                  resetAddMemberForm();
                  setShowAddMemberModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Member
              </button>
            )}
          </div>

          {/* Toolbar */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none"
              >
                <option value="" className="bg-zinc-900 text-white">All Status</option>
                <option value="active" className="bg-zinc-900 text-white">Active</option>
                <option value="inactive" className="bg-zinc-900 text-white">Inactive</option>
              </select>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="hidden sm:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 bg-zinc-900 animate-pulse border-b border-zinc-800/40" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && members.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-20 text-center">
              <Users className="w-12 h-12 text-zinc-600 mb-4" />
              <p className="text-zinc-300 font-medium">No members found</p>
              <p className="text-sm text-zinc-500 mt-1">
                {search || statusFilter ? "Try adjusting your search or filters" : "Add a member to get started"}
              </p>
            </div>
          )}

          {/* Table */}
          <Dialog open={showAddMemberModal} onOpenChange={(open) => {
            setShowAddMemberModal(open);
            if (!open) resetAddMemberForm();
          }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                Add Member
              </DialogTitle>
              <DialogDescription>
                Create a new student, faculty, or librarian account. Librarian accounts can only be created by librarians.
              </DialogDescription>
            </DialogHeader>

            {memberFormError && (
              <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
                {memberFormError}
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">First Name *</label>
                  <input
                    required
                    value={memberForm.firstName}
                    onChange={handleAddMemberChange("firstName")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Last Name *</label>
                  <input
                    required
                    value={memberForm.lastName}
                    onChange={handleAddMemberChange("lastName")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email *</label>
                <input
                  type="email"
                  required
                  value={memberForm.email}
                  onChange={handleAddMemberChange("email")}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  placeholder="member@example.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Role *</label>
                  <select
                    value={memberForm.role}
                    onChange={handleAddMemberChange("role")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  >
                    <option value="STUDENT">Student</option>
                    <option value="FACULTY">Faculty</option>
                    <option value="LIBRARIAN">Librarian</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Phone</label>
                  <input
                    value={memberForm.phone}
                    onChange={handleAddMemberChange("phone")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="09XXXXXXXXX"
                  />
                </div>
              </div>

              {memberForm.role === "LIBRARIAN" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">ID Number *</label>
                  <input
                    required
                    value={memberForm.libraryId}
                    onChange={handleAddMemberChange("libraryId")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="e.g., LIB-2026-0001"
                  />
                </div>
              )}

              {(memberForm.role === "STUDENT" || memberForm.role === "FACULTY") && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Department *</label>
                  <input
                    required
                    value={memberForm.department}
                    onChange={handleAddMemberChange("department")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="e.g., BSIT"
                  />
                </div>
              )}

              {memberForm.role === "STUDENT" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Year & Section *</label>
                  <input
                    required
                    value={memberForm.yearSection}
                    onChange={handleAddMemberChange("yearSection")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="e.g., 2-A"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password *</label>
                  <input
                    type="password"
                    required
                    value={memberForm.password}
                    onChange={handleAddMemberChange("password")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    value={memberForm.confirmPassword}
                    onChange={handleAddMemberChange("confirmPassword")}
                    className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                    placeholder="Re-enter password"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMemberModal(false);
                    resetAddMemberForm();
                  }}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingMember ? "Creating..." : "Create Member"}
                </button>
              </div>
            </form>
          </Dialog>

          {!loading && members.length > 0 && (
            <>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium hidden md:table-cell">Email</th>
                      <th className="px-6 py-3 font-medium hidden lg:table-cell">Phone</th>
                      <th className="px-6 py-3 font-medium hidden sm:table-cell">Join Date</th>
                      <th className="px-6 py-3 font-medium">Fines</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m: any) => (
                      <tr key={m.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center font-semibold text-xs shrink-0">
                              {m.firstName?.charAt(0)}{m.lastName?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-zinc-100 font-medium truncate">{getFullName(m)}</p>
                              <p className="text-xs text-zinc-500">{m.libraryId || ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-300 hidden md:table-cell">{m.email || "—"}</td>
                        <td className="px-6 py-4 text-zinc-400 hidden lg:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-zinc-600" />
                            {formatPhone(m.phone)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">{formatDate(m.createdAt)}</td>
                        <td className="px-6 py-4">
                          <span className={`font-medium ${finesMap[m.id] > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                            ₱ {(finesMap[m.id] ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                            m.isActive
                              ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                              : "bg-red-500/15 text-red-400 ring-red-500/30"
                          }`}>
                            {m.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors" aria-label="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(m)}
                              disabled={deletingId !== null}
                              className="p-2 rounded-lg text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Delete"
                            >
                              <Trash2 className={`w-4 h-4 ${deletingId === m.id ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <ResponsiveTable mobile={
              members.map((m: any) => (
                <article key={m.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10">
                  <div className="flex items-center gap-3 border-b border-zinc-800/80 pb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-semibold text-blue-300">{m.firstName?.charAt(0)}{m.lastName?.charAt(0)}</div>
                    <div className="min-w-0"><p className="truncate font-semibold text-zinc-100">{getFullName(m)}</p><p className="text-xs text-zinc-500">{m.libraryId || "—"}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-4 text-sm">
                    <div><p className="text-xs text-zinc-500">Email</p><p className="mt-1 break-words text-zinc-300">{m.email || "—"}</p></div>
                    <div><p className="text-xs text-zinc-500">Phone</p><p className="mt-1 break-words text-zinc-300">{formatPhone(m.phone)}</p></div>
                    <div><p className="text-xs text-zinc-500">Join Date</p><p className="mt-1 text-zinc-300">{formatDate(m.createdAt)}</p></div>
                    <div><p className="text-xs text-zinc-500">Fines</p><p className={`mt-1 font-medium ${finesMap[m.id] > 0 ? "text-amber-400" : "text-zinc-400"}`}>₱ {(finesMap[m.id] ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${m.isActive ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : "bg-red-500/15 text-red-400 ring-red-500/30"}`}>{m.isActive ? "Active" : "Inactive"}</span>
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(m)} disabled={deletingId !== null} className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40" aria-label="Delete"><Trash2 className={`h-4 w-4 ${deletingId === m.id ? "animate-spin" : ""}`} /></button>
                    </div>
                  </div>
                </article>
              ))
            } />
            </>
          )}

          {/* Pagination */}
          {!loading && members.length > 0 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-zinc-500">
                Showing{" "}
                <span className="text-zinc-300">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, total)}
                </span>{" "}
                of <span className="text-zinc-300">{total}</span> members
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
        </div>
      </div>
    </div>
  );
}
