"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const statuses = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED"];
const badge: Record<string, string> = { PENDING: "text-amber-400", REVIEWED: "text-blue-400", ACCEPTED: "text-emerald-400", REJECTED: "text-red-400" };

export default function SuggestionsPage() {
  const { user } = useAuth();
  const librarian = user?.role === "LIBRARIAN";
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ subject: "", message: "" });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = async () => { setLoading(true); const response = librarian ? await api.getSuggestions(filter) : await api.getMySuggestions(); if (response.success) setItems(response.data || []); setLoading(false); };
  useEffect(() => { load(); }, [librarian, filter]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const response = await api.createSuggestion(form); if (response.success) { setForm({ subject: "", message: "" }); setMessage("Suggestion submitted"); load(); } };
  const update = async (id: string, status: string, adminNote?: string) => { await api.updateSuggestion(id, { status, adminNote }); load(); };
  return <ProtectedRoute roles={["STUDENT", "FACULTY", "LIBRARIAN"]}><div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex"><Sidebar /><main className="min-w-0 flex-1"><div className="mx-auto max-w-6xl px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8"><div className="mb-8 flex items-center justify-between"><div><h1 className="text-2xl font-bold text-white">{librarian ? "Suggestions Inbox" : "Library Suggestions"}</h1><p className="mt-1 text-sm text-zinc-400">{librarian ? "Review member ideas and respond to them." : "Help improve library services and facilities."}</p></div>{librarian && <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300"><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>}</div>
    {!librarian && <form onSubmit={submit} className="mb-8 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Share your suggestion" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Submit suggestion</button>{message && <span className="ml-3 text-sm text-emerald-400">{message}</span>}</form>}
    {loading ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" /> : items.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-10 text-center text-sm text-zinc-500">No suggestions yet.</div> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{item.subject}</h2>{librarian && <p className="mt-1 text-xs text-zinc-500">{item.user?.firstName} {item.user?.lastName} · {item.user?.department || "No department"}</p>}</div><span className={`text-xs font-semibold ${badge[item.status] || "text-zinc-400"}`}>{item.status}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{item.message}</p>{librarian && <div className="mt-4 flex flex-wrap gap-2">{statuses.filter((status) => status !== item.status).map((status) => <button key={status} onClick={() => update(item.id, status)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Mark {status.toLowerCase()}</button>)}<input placeholder="Admin note" defaultValue={item.adminNote || ""} onBlur={(e) => e.target.value !== (item.adminNote || "") && update(item.id, item.status, e.target.value)} className="min-w-48 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white" /></div>}{item.adminNote && <p className="mt-3 text-xs text-blue-300">Library note: {item.adminNote}</p>}</article>)}</div>}
  </div></main></div></ProtectedRoute>;
}
