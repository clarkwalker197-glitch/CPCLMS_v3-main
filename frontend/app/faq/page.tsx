"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Faq = { id: string; question: string; answer: string; category?: string; sortOrder: number; isPublished: boolean };
const emptyForm = { question: "", answer: "", category: "Borrowing", sortOrder: 0, isPublished: true };

export default function FaqPage() {
  const { user } = useAuth();
  const isLibrarian = user?.role === "LIBRARIAN";
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    const response = await api.getFaqs();
    if (response.success) setFaqs(response.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = editingId ? await api.updateFaq(editingId, form) : await api.createFaq(form);
    if (response.success) { setMessage(editingId ? "FAQ updated" : "FAQ added"); setForm(emptyForm); setEditingId(null); setShowForm(false); load(); }
  };
  const edit = (faq: Faq) => { setForm({ question: faq.question, answer: faq.answer, category: faq.category || "Borrowing", sortOrder: faq.sortOrder, isPublished: faq.isPublished }); setEditingId(faq.id); setShowForm(true); };
  const remove = async (id: string) => { if (window.confirm("Delete this FAQ?")) { const response = await api.deleteFaq(id); if (response.success) load(); } };

  return <ProtectedRoute roles={["STUDENT", "FACULTY", "LIBRARIAN"]}><div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex"><Sidebar /><main className="min-w-0 flex-1"><div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-6 lg:px-8 lg:pb-8">
    <div className="mb-8 flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-white">{isLibrarian ? "FAQ Manager" : "Frequently Asked Questions"}</h1><p className="mt-1 text-sm text-zinc-400">Find answers about borrowing, fines, accounts, and library services.</p></div>{isLibrarian && <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add FAQ</button>}</div>
    {message && <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
    {isLibrarian && showForm && <form onSubmit={submit} className="mb-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><input required value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><textarea required value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer" rows={4} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><div className="flex gap-3"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" /><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{editingId ? "Update" : "Add"}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancel</button></div></form>}
    {loading ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" /> : faqs.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-10 text-center text-sm text-zinc-500">No FAQs published yet.</div> : <div className="space-y-3">{faqs.map((faq) => <div key={faq.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70"><button onClick={() => setOpenId(openId === faq.id ? null : faq.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left"><span><span className="text-xs text-blue-400">{faq.category || "Library"}</span><span className="mt-1 block font-medium text-zinc-100">{faq.question}</span></span><ChevronDown className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform ${openId === faq.id ? "rotate-180" : ""}`} /></button>{openId === faq.id && <div className="border-t border-zinc-800 px-5 pb-5 pt-4 text-sm leading-6 text-zinc-400">{faq.answer}</div>}{isLibrarian && <div className="flex gap-2 border-t border-zinc-800 px-5 py-3"><button onClick={() => edit(faq)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><Pencil className="h-3.5 w-3.5" />Edit</button><button onClick={() => remove(faq.id)} className="inline-flex items-center gap-1 text-xs text-red-400"><Trash2 className="h-3.5 w-3.5" />Delete</button></div>}</div>)}</div>}
  </div></main></div></ProtectedRoute>;
}
