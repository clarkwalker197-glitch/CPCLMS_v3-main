"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { SortSelect, type SortOption } from "@/components/SortControls";

const statuses = ["PENDING", "ACCEPTED", "REJECTED", "FULFILLED"];
const badge: Record<string, string> = { PENDING: "text-amber-400", ACCEPTED: "text-blue-400", REJECTED: "text-red-400", FULFILLED: "text-emerald-400" };

export default function AcquisitionRequestsPage() {
  const { user } = useAuth();
  const librarian = user?.role === "LIBRARIAN";
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ title: "", author: "", isbn: "", details: "" });
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); const response = librarian ? await api.getAcquisitionRequests(filter) : await api.getMyAcquisitionRequests(); if (response.success) setItems(response.data || []); setLoading(false); };
  useEffect(() => { load(); }, [librarian, filter]);
  const displayedItems = [...items].sort((left, right) => {
    if (sort === "status") {
      const priority: Record<string, number> = { PENDING: 0, ACCEPTED: 1, FULFILLED: 2, REJECTED: 3 };
      const difference = (priority[left.status] ?? 4) - (priority[right.status] ?? 4);
      if (difference) return difference * (sortOrder === "asc" ? 1 : -1);
    }
    const difference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return difference * (sortOrder === "asc" ? 1 : -1);
  });
  const sortOptions: SortOption[] = [
    { sort: "createdAt", order: "desc", label: "Newest first" },
    { sort: "createdAt", order: "asc", label: "Oldest first" },
    { sort: "status", order: "asc", label: "Pending first" },
  ];
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const response = await api.createAcquisitionRequest(form); if (response.success) { setForm({ title: "", author: "", isbn: "", details: "" }); load(); } };
  const update = async (id: string, status: string, adminNote?: string) => { await api.updateAcquisitionRequest(id, { status, adminNote }); load(); };
  return <ProtectedRoute roles={["STUDENT", "FACULTY", "LIBRARIAN"]}><div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex"><Sidebar /><main className="min-w-0 flex-1"><div className="mx-auto max-w-6xl px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8"><div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-white">{librarian ? "Acquisition Requests" : "Request a Book"}</h1><p className="mt-1 text-sm text-zinc-400">{librarian ? "Review books members want the library to acquire." : "Suggest a title for the library collection."}</p></div><div className="flex flex-wrap gap-2">{librarian && <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>}<SortSelect options={sortOptions} sort={sort} order={sortOrder} onChange={(nextSort, nextOrder) => { setSort(nextSort); setSortOrder(nextOrder); }} /></div></div>
    {!librarian && <form onSubmit={submit} className="mb-8 grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 sm:grid-cols-2"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title *" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Author" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} placeholder="ISBN" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Reason or course need" rows={3} className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white sm:col-span-2" /><button className="w-fit rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Submit book request</button></form>}
    {loading ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" /> : displayedItems.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-10 text-center text-sm text-zinc-500">No acquisition requests yet.</div> : <div className="space-y-3">{displayedItems.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{item.title}</h2><p className="mt-1 text-sm text-zinc-400">{item.author || "Author not provided"}{item.isbn ? ` · ISBN ${item.isbn}` : ""}</p>{librarian && <p className="mt-1 text-xs text-zinc-500">Requested by {item.user?.firstName} {item.user?.lastName} · {item.user?.department || "No department"}</p>}</div><span className={`text-xs font-semibold ${badge[item.status] || "text-zinc-400"}`}>{item.status}</span></div>{item.details && <p className="mt-4 text-sm text-zinc-400">{item.details}</p>}{librarian && <div className="mt-4 flex flex-wrap gap-2">{statuses.filter((status) => status !== item.status && !(item.status === "ACCEPTED" && status === "PENDING")).map((status) => <button key={status} onClick={() => update(item.id, status)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Mark {status.toLowerCase()}</button>)}<input placeholder="Admin note" defaultValue={item.adminNote || ""} onBlur={(e) => e.target.value !== (item.adminNote || "") && update(item.id, item.status, e.target.value)} className="min-w-48 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white" /></div>}{item.adminNote && <p className="mt-3 text-xs text-blue-300">Library note: {item.adminNote}</p>}</article>)}</div>}
  </div></main></div></ProtectedRoute>;
}
