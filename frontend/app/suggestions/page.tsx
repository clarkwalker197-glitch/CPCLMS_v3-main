"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import HeaderUserActions from "@/components/HeaderUserActions";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Star } from "lucide-react";

const statuses = ["PENDING", "REVIEWED", "ACCEPTED", "REJECTED", "FULFILLED"];
const badge: Record<string, string> = {
  PENDING: "text-amber-400",
  REVIEWED: "text-blue-400",
  ACCEPTED: "text-emerald-400",
  REJECTED: "text-red-400",
  FULFILLED: "text-violet-400",
};

type Suggestion = {
  id: string;
  subject: string;
  message: string;
  status: string;
  adminNote?: string | null;
  rating?: number | null;
  user?: {
    firstName?: string;
    lastName?: string;
    department?: string | null;
  };
};

export default function SuggestionsPage() {
  const { user } = useAuth();
  const librarian = user?.role === "LIBRARIAN";
  const [items, setItems] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({ subject: "", message: "" });
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [ratingInFlight, setRatingInFlight] = useState<string | null>(null);

  const fetchSuggestions = useCallback(
    () => librarian ? api.getSuggestions(filter) : api.getMySuggestions(),
    [filter, librarian],
  );

  const load = async () => {
    const response = await fetchSuggestions();
    if (response.success) setItems(response.data || []);
    else setError(response.error || "Could not load suggestions.");
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const response = await fetchSuggestions();
      if (!active) return;
      if (response.success) setItems(response.data || []);
      else setError(response.error || "Could not load suggestions.");
      setLoading(false);
    };
    void refresh();
    return () => { active = false; };
  }, [fetchSuggestions]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await api.createSuggestion(form);
    if (response.success) {
      setForm({ subject: "", message: "" });
      setMessage("Suggestion submitted");
      setLoading(true);
      await load();
    } else {
      setError(response.error || "Could not submit suggestion.");
    }
  };

  const update = async (id: string, status: string, adminNote?: string) => {
    const response = await api.updateSuggestion(id, { status, adminNote });
    if (!response.success) {
      setError(response.error || "Could not update suggestion.");
      return;
    }
    setLoading(true);
    await load();
  };

  const rate = async (id: string, rating: number) => {
    if (ratingInFlight) return;
    setRatingInFlight(id);
    setError("");
    try {
      const response = await api.rateSuggestion(id, rating);
      if (!response.success) {
        setError(response.error || "Could not save your rating.");
        return;
      }
      setItems((current) => current.map((item) => item.id === id ? { ...item, rating } : item));
      setMessage("Your suggestion rating has been saved.");
    } catch {
      setError("Could not save your rating. Please try again.");
    } finally {
      setRatingInFlight(null);
    }
  };

  return (
    <ProtectedRoute roles={["STUDENT", "FACULTY", "LIBRARIAN"]}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{librarian ? "Suggestions Inbox" : "Library Suggestions"}</h1>
                <p className="mt-1 text-sm text-zinc-400">{librarian ? "Review member ideas and respond to them." : "Help improve library services and facilities."}</p>
              </div>
              <HeaderUserActions />
            </div>

            {librarian && (
              <div className="mb-8 flex justify-end">
                <select value={filter} onChange={(event) => { setLoading(true); setFilter(event.target.value); }} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                  <option value="">All statuses</option>
                  {statuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            )}

            {!librarian && (
              <form onSubmit={submit} className="mb-8 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" />
                <textarea required rows={5} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Share your suggestion" className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white" />
                <button className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Submit suggestion</button>
                {message && <span className="ml-3 text-sm text-emerald-400">{message}</span>}
              </form>
            )}

            {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
            {loading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" />
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-10 text-center text-sm text-zinc-500">No suggestions yet.</div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const visibleActions = item.status === "FULFILLED"
                    ? ["FULFILLED"]
                    : item.status === "REJECTED"
                      ? ["REJECTED"]
                      : ["ACCEPTED", "FULFILLED", "REJECTED"];
                  return (
                    <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-white">{item.subject}</h2>
                          {librarian && <p className="mt-1 text-xs text-zinc-500">{item.user?.firstName} {item.user?.lastName} · {item.user?.department || "No department"}</p>}
                        </div>
                        <span className={`text-xs font-semibold ${badge[item.status] || "text-zinc-400"}`}>{item.status}</span>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{item.message}</p>

                      {librarian && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <div className="flex flex-wrap gap-2">
                            {visibleActions.map((status) => (
                              <button
                                key={status}
                                onClick={() => void update(item.id, status)}
                                disabled={item.status === status}
                                className={`rounded-lg border px-3 py-1.5 text-xs disabled:cursor-default disabled:opacity-50 ${
                                  status === "ACCEPTED"
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                    : status === "FULFILLED"
                                      ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                                      : "border-red-500/40 bg-red-500/10 text-red-300"
                                }`}
                              >
                                {status === "ACCEPTED" ? "Accept" : status === "FULFILLED" ? "Mark fulfilled" : "Reject"}
                              </button>
                            ))}
                          </div>
                          <input placeholder="Admin note" defaultValue={item.adminNote || ""} onBlur={(event) => event.target.value !== (item.adminNote || "") && void update(item.id, item.status, event.target.value)} className="min-w-48 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-white" />
                        </div>
                      )}

                      {item.status === "FULFILLED" && (
                        <div className="mt-4 border-t border-zinc-800 pt-4">
                          <p className="mb-2 text-xs font-medium text-zinc-300">{librarian ? "Member's performance rating" : "Rate how the library handled your suggestion"}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center" aria-label={item.rating ? `Rated ${item.rating} out of 5` : "Not rated"}>
                              {Array.from({ length: 5 }, (_, index) => {
                                const value = index + 1;
                                return librarian ? (
                                  <Star key={value} aria-hidden="true" className={`h-5 w-5 ${value <= (item.rating || 0) ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} />
                                ) : (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => void rate(item.id, value)}
                                    disabled={ratingInFlight !== null}
                                    aria-label={`Rate ${value} out of 5`}
                                    aria-pressed={item.rating === value}
                                    className="rounded-sm p-1 text-amber-400 transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
                                  >
                                    <Star className={`h-5 w-5 ${value <= (item.rating || 0) ? "fill-current" : ""}`} />
                                  </button>
                                );
                              })}
                            </div>
                            {item.rating ? <span className="text-sm text-zinc-400">{item.rating}/5</span> : librarian ? <span className="text-xs text-zinc-500">Not rated yet</span> : <span className="text-xs text-zinc-500">{ratingInFlight === item.id ? "Saving…" : "Select a star"}</span>}
                          </div>
                        </div>
                      )}

                      {!librarian && item.status !== "FULFILLED" && item.status !== "REJECTED" && (
                        <p className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
                          You can rate how the library handled this suggestion after it is marked fulfilled.
                        </p>
                      )}

                      {item.adminNote && <p className="mt-3 text-xs text-blue-300">Library note: {item.adminNote}</p>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
