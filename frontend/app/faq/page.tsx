"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Pencil, Send, Trash2, X } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Faq = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt?: string;
  createdBy?: { firstName: string; lastName: string; role: string } | null;
};

const emptyForm = { question: "", answer: "", category: "Library" };

export default function FaqPage() {
  const { user } = useAuth();
  const isLibrarian = user?.role === "LIBRARIAN";
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    const response = await api.getFaqs();
    if (response.success) setFaqs(response.data || []);
    else setError(response.error || "Unable to load FAQs.");
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const submitQuestion = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const response = await api.createFaq({ question });
    if (response.success) {
      setQuestion("");
      setShowQuestionForm(false);
      setMessage("Your question was submitted for librarian review.");
    } else {
      setError(response.error || "Unable to submit your question.");
    }
    setSubmitting(false);
  };

  const publish = async (faq: Faq) => {
    const answer = answerDrafts[faq.id]?.trim() || "";
    if (!answer) return;
    setSubmitting(true);
    setError("");
    const response = await api.updateFaq(faq.id, { answer, isPublished: true });
    if (response.success) {
      setMessage("FAQ answered and published.");
      setAnswerDrafts((current) => {
        const next = { ...current };
        delete next[faq.id];
        return next;
      });
      await load();
    } else {
      setError(response.error || "Unable to publish this FAQ.");
    }
    setSubmitting(false);
  };

  const reject = async (faq: Faq) => {
    if (!window.confirm("Reject and remove this submitted question?")) return;
    setError("");
    const response = await api.deleteFaq(faq.id);
    if (response.success) {
      setMessage("Submitted question rejected.");
      await load();
    } else {
      setError(response.error || "Unable to reject this question.");
    }
  };

  const edit = (faq: Faq) => {
    setForm({ question: faq.question, answer: faq.answer, category: faq.category || "Library" });
    setEditingId(faq.id);
    setMessage("");
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setSubmitting(true);
    setError("");
    const response = await api.updateFaq(editingId, { ...form, isPublished: true });
    if (response.success) {
      setMessage("FAQ updated.");
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } else {
      setError(response.error || "Unable to update this FAQ.");
    }
    setSubmitting(false);
  };

  const removePublishedFaq = async (id: string) => {
    if (!window.confirm("Delete this published FAQ?")) return;
    const response = await api.deleteFaq(id);
    if (response.success) {
      setMessage("FAQ deleted.");
      await load();
    } else {
      setError(response.error || "Unable to delete this FAQ.");
    }
  };

  const pendingFaqs = faqs.filter((faq) => !faq.isPublished);
  const publishedFaqs = faqs.filter((faq) => faq.isPublished);

  return (
    <ProtectedRoute roles={["STUDENT", "FACULTY", "LIBRARIAN"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{isLibrarian ? "FAQ Manager" : "Frequently Asked Questions"}</h1>
                <p className="mt-1 text-sm text-zinc-400">Find answers about borrowing, fines, accounts, and library services.</p>
              </div>
              {!isLibrarian && <button type="button" onClick={() => setShowQuestionForm((current) => !current)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"><Send className="h-4 w-4" />Ask a Question</button>}
            </div>

            {message && <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
            {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

            {!isLibrarian && showQuestionForm && <form onSubmit={submitQuestion} className="mb-8 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div>
                <label htmlFor="faq-question" className="mb-2 block text-sm font-medium text-zinc-200">Your question</label>
                <textarea id="faq-question" required maxLength={1000} rows={4} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about borrowing, fines, accounts, or library services..." className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => setShowQuestionForm(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancel</button>
                <button type="submit" disabled={submitting || !question.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />Submit question</button>
              </div>
            </form>}

            {isLibrarian && <section className="mb-10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Pending Questions</h2>
                  <p className="mt-1 text-sm text-zinc-400">Review each submission, add an answer, then publish or reject it.</p>
                </div>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">{pendingFaqs.length} pending</span>
              </div>
              {loading ? <div className="h-28 animate-pulse rounded-2xl bg-zinc-900" /> : pendingFaqs.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm text-zinc-500">No questions are awaiting review.</div> : <div className="space-y-3">
                {pendingFaqs.map((faq) => <article key={faq.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                  <p className="font-medium text-zinc-100">{faq.question}</p>
                  <p className="mt-2 text-xs text-zinc-500">Submitted by {faq.createdBy ? `${faq.createdBy.firstName} ${faq.createdBy.lastName} · ${faq.createdBy.role.toLowerCase()}` : "a library member"}{faq.createdAt ? ` · ${new Date(faq.createdAt).toLocaleDateString()}` : ""}</p>
                  <label htmlFor={`faq-answer-${faq.id}`} className="mb-2 mt-4 block text-sm font-medium text-zinc-300">Answer</label>
                  <textarea id={`faq-answer-${faq.id}`} rows={3} value={answerDrafts[faq.id] ?? faq.answer} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [faq.id]: event.target.value }))} placeholder="Write an answer before publishing..." className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="mt-3 flex flex-wrap justify-end gap-3">
                    <button type="button" onClick={() => void reject(faq)} className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"><X className="h-4 w-4" />Reject</button>
                    <button type="button" onClick={() => void publish(faq)} disabled={submitting || !(answerDrafts[faq.id] ?? faq.answer).trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Check className="h-4 w-4" />Publish answer</button>
                  </div>
                </article>)}
              </div>}
            </section>}

            {isLibrarian && <div className="mb-8 border-t border-zinc-800" />}

            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{isLibrarian ? "Published FAQs" : "Frequently Asked Questions"}</h2>
                  {isLibrarian && <p className="mt-1 text-sm text-zinc-400">These answers are visible to students and faculty.</p>}
                </div>
                {isLibrarian && <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">{publishedFaqs.length} published</span>}
              </div>

              {editingId && isLibrarian && <form onSubmit={saveEdit} className="mb-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <input required value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="Question" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" />
                <textarea required value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} placeholder="Answer" rows={4} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" />
                <div className="flex flex-wrap gap-3">
                  <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Category" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" />
                  <button disabled={submitting} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Update</button>
                  <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancel</button>
                </div>
              </form>}

              {loading ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" /> : publishedFaqs.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-10 text-center text-sm text-zinc-500">No FAQs published yet.</div> : <div className="space-y-3">
                {publishedFaqs.map((faq) => <div key={faq.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
                  <button type="button" onClick={() => setOpenId(openId === faq.id ? null : faq.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                    <span><span className="text-xs text-blue-400">{faq.category || "Library"}</span><span className="mt-1 block font-medium text-zinc-100">{faq.question}</span></span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform ${openId === faq.id ? "rotate-180" : ""}`} />
                  </button>
                  {openId === faq.id && <div className="border-t border-zinc-800 px-5 pb-5 pt-4 text-sm leading-6 text-zinc-400">{faq.answer}</div>}
                  {isLibrarian && <div className="flex gap-2 border-t border-zinc-800 px-5 py-3">
                    <button type="button" onClick={() => edit(faq)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><Pencil className="h-3.5 w-3.5" />Edit</button>
                    <button type="button" onClick={() => void removePublishedFaq(faq.id)} className="inline-flex items-center gap-1 text-xs text-red-400"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                  </div>}
                </div>)}
              </div>}
            </section>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
