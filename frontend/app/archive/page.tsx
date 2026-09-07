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
    const res = await api.getArchive();
    if (res.success && res.data) setArchive(res.data);
    else setError(res.error || "Failed to load archive");
    setLoading(false);
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <div className="flex items-center gap-3"><ArchiveIcon className="w-7 h-7 text-blue-400" /><h1 className="text-2xl font-bold text-white">Archive</h1></div>
            <p className="text-sm text-zinc-400 mt-1">Restore books, eBooks, and user accounts removed from active lists.</p>
          </div>
          {message && <div className="p-4 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400">{message}</div>}
          {error && <div className="p-4 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>}
          <div className="flex gap-2 border-b border-zinc-800 mb-5">
            {tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}><Icon className="w-4 h-4" />{tab.label}<span className="text-xs">({archive[tab.key].length})</span></button>; })}
          </div>
          <div className="relative mb-5 max-w-xl"><Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search archived items..." className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          {loading ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-zinc-500">Loading archive...</div> : items.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-12 text-center text-zinc-500">No archived {activeTab} found.</div> : <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden"><div className="divide-y divide-zinc-800/70">{items.map((item) => <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5"><div><p className="font-medium text-zinc-100">{activeTab === "users" ? `${item.firstName} ${item.lastName}` : item.title}</p><p className="text-sm text-zinc-500 mt-1">{activeTab === "users" ? `${item.email} · ${item.libraryId}` : `${item.author || ""}${item.accessionNo ? ` · ${item.accessionNo}` : ""}`}</p><p className="text-xs text-zinc-600 mt-1">Archived {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : new Date(item.updatedAt).toLocaleDateString()}</p></div><button onClick={() => restore(activeTab, item.id)} disabled={restoringId === item.id} className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40"><RotateCcw className="w-4 h-4" />{restoringId === item.id ? "Restoring..." : "Restore"}</button></div>)}</div></div>}
        </div>
      </main>
    </div>
  );
}
