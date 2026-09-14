"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { Archive as ArchiveIcon, BookOpen, BookOpenText, Users, RotateCcw, Search } from "lucide-react";

const tabs = [
  { key: "books", label: "Books", icon: BookOpen },
  { key: "ebooks", label: "eBooks", icon: BookOpenText },
  { key: "users", label: "Users", icon: Users },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const ARCHIVE_RETENTION_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getArchiveCountdown(item: any) {
  const archivedAt = item.archivedAt || item.deletedAt || item.updatedAt;
  const archivedDate = new Date(archivedAt);
  if (Number.isNaN(archivedDate.getTime())) return null;

  const elapsedMs = Date.now() - archivedDate.getTime();
  const remainingDays = ARCHIVE_RETENTION_DAYS - Math.floor(elapsedMs / MS_PER_DAY);
  return Math.max(0, remainingDays);
}

export default function ArchivePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("books");
  const [archive, setArchive] = useState<{ books: any[]; ebooks: any[]; users: any[] }>({ books: [], ebooks: [], users: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await api.getArchive();
      if (res.success && res.data) {
        setArchive(res.data);
        return;
      }

      setError(res.error || "Failed to load archive. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load archive. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "LIBRARIAN") loadArchive();
    else setLoading(false);
  }, [user, loadArchive]);

  const restore = async (type: TabKey, id: string) => {
    if (!window.confirm("Restore this item to its active list?")) return;
    setRestoringId(id);
    setError("");
    const res = await api.restoreArchiveItem(type, id);
    if (res.success) {
      setMessage("Item restored successfully");
      loadArchive();
      setTimeout(() => setMessage(""), 3500);
    } else setError(res.error || "Failed to restore item");
    setRestoringId(null);
  };

  const items = archive[activeTab].filter((item) => {
    const query = search.toLowerCase();
    const text = activeTab === "users"
      ? `${item.firstName} ${item.lastName} ${item.email} ${item.libraryId}`
      : `${item.title} ${item.author || ""} ${item.isbn || ""} ${item.accessionNo || ""}`;
    return text.toLowerCase().includes(query);
  });

  if (user && user.role !== "LIBRARIAN") {
    return <div className="min-h-screen bg-zinc-950 text-white flex"><Sidebar /><main className="flex-1 flex items-center justify-center"><p className="text-zinc-400">Access denied.</p></main></div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 lg:pb-8">
          <div className="mb-6">
            <div className="flex items-center gap-3"><ArchiveIcon className="w-7 h-7 text-blue-400" /><h1 className="text-2xl font-bold text-white">Archive</h1></div>
            <p className="text-sm text-zinc-400 mt-1">Restore books, eBooks, and user accounts removed from active lists.</p>
          </div>
          {message && <div className="p-4 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400">{message}</div>}
          {error && (
            <div className="p-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => void loadArchive()}
                  className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 font-medium text-red-300 transition hover:bg-red-500/20"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2 border-b border-zinc-800 mb-5">
            {tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><Icon className="w-4 h-4" />{tab.label}<span className="text-xs">({archive[tab.key].length})</span></button>; })}
          </div>
          <div className="relative mb-5 max-w-xl"><Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search archived items..." className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          {loading ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-zinc-500">Loading archive...</div> : items.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-12 text-center text-zinc-500">No archived {activeTab} found.</div> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden"><div className="divide-y divide-zinc-800/70">{items.map((item) => {
            const countdown = getArchiveCountdown(item);
            const archivedDate = new Date(item.archivedAt || item.deletedAt || item.updatedAt);
            return <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5"><div><p className="font-medium text-zinc-100">{activeTab === "users" ? `${item.firstName} ${item.lastName}` : item.title}</p><p className="text-sm text-zinc-500 mt-1">{activeTab === "users" ? `${item.email} · ${item.libraryId}` : `${item.author || ""}${item.accessionNo ? ` · ${item.accessionNo}` : ""}`}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Archived {archivedDate.toLocaleDateString()}</span>
              {countdown !== null && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">Auto-delete in {countdown} day{countdown === 1 ? "" : "s"}</span>}
            </div></div><button onClick={() => restore(activeTab, item.id)} disabled={restoringId === item.id} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"><RotateCcw className="w-4 h-4" />{restoringId === item.id ? "Restoring..." : "Restore"}</button></div>;
          })}</div></div>}
        </div>
      </main>
    </div>
  );
}
