"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import { BookBorrowModal } from "@/components/BookBorrowModal";
import { AddBookModal } from "@/components/AddBookModal";
import { EditBookModal } from "@/components/EditBookModal";
import MobileBookTypeSelect from "@/components/MobileBookTypeSelect";
import Sidebar from "@/components/Sidebar";
import ResponsiveTable from "@/components/ResponsiveTable";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  ShoppingCart,
  X,
  Check,
  Send,
  AlertCircle,
} from "lucide-react";

const PAGE_SIZE = 8;
const MAX_BOOKS_PER_TRANSACTION = 3;
const MAX_LIMIT_MESSAGE = "You can only borrow a maximum of 3 books per transaction.";

export default function BooksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [cart, setCart] = useState<any[]>([]);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);

  const isLibrarian = user?.role === "LIBRARIAN";

  // Debounced search/filter values (300ms) to avoid per-keystroke API spam
  const debouncedSearch = useDebounce(search, 300);
  const debouncedCategory = useDebounce(categoryFilter, 300);
  const debouncedClassification = useDebounce(classificationFilter, 300);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedCategory) params.categoryId = debouncedCategory;
      if (debouncedClassification) params.classificationNumber = debouncedClassification;
      const [booksRes, catsRes] = await Promise.all([
        api.getBooks(params),
        api.getCategories(),
      ]);
      if (booksRes.success) {
        setBooks((booksRes.data || []).map((book: any) => ({ ...book, bookType: "physical" })));
      } else if (booksRes.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      }
      if (catsRes.success) setCategories((catsRes.data || []).filter((category: any) => category.slug?.startsWith("dewey-")));
    } catch {
      setError("Failed to load books");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, debouncedCategory, debouncedClassification]);

  const visibleBooks = books;

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, debouncedCategory, debouncedClassification, visibleBooks.length]);

  const inCart = (id: string) => cart.some((b) => b.id === id);

  const handleAddToCart = (book: any) => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (inCart(book.id)) {
      setCart((prev) => prev.filter((b) => b.id !== book.id));
      return;
    }
    if (cart.length >= MAX_BOOKS_PER_TRANSACTION) {
      setError(MAX_LIMIT_MESSAGE);
      return;
    }
    setError("");
    setCart((prev) => [...prev, book]);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((b) => b.id !== id));
  };

  const handleBorrowNow = () => {
    if (cart.length === 0) {
      setError("Please select at least one book to borrow.");
      return;
    }
    if (cart.length > MAX_BOOKS_PER_TRANSACTION) {
      setError(MAX_LIMIT_MESSAGE);
      return;
    }
    setError("");
    setShowBorrowModal(true);
  };

  const handleBorrowSuccess = () => {
    setSuccessMsg("Borrow request submitted successfully!");
    setCart([]);
    loadData();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleDelete = async (book: any) => {
    if (!window.confirm(`Archive "${book.title}"? It can be restored later from the Archive.`)) return;
    if (togglingStatusId) return; // prevent double-click spam
    setTogglingStatusId(book.id);
    try {
      const res = await api.delete(`/books/${book.id}`);
      if (res.success) {
        setSuccessMsg("Book archived successfully");
        loadData();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (res.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to delete book");
      }
    } catch {
      setError("Failed to delete book");
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleEdit = (book: any) => {
    setSelectedBook(book);
    setShowEditModal(true);
  };

  const handleToggleAvailability = async (book: any) => {
    const newStatus = book.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE';
    const action = newStatus === 'AVAILABLE' ? 'available' : 'not available';
    const message = newStatus === 'AVAILABLE' 
      ? `Mark "${book.title}" as available? Students will be able to borrow this book.`
      : `Mark "${book.title}" as not available? Students will no longer be able to borrow this book.`;
    
    if (!window.confirm(message)) return;
    if (togglingStatusId) return; // prevent double-click spam
    setTogglingStatusId(book.id);
    try {
      const res = await api.updateBook(book.id, { status: newStatus });
      if (res.success) {
        setSuccessMsg(`Book marked as ${action}`);
        loadData();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (res.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      } else {
        setError(res.error || "Failed to update book");
      }
    } catch {
      setError("Failed to update book");
    } finally {
      setTogglingStatusId(null);
    }
  };

  const handleEditSuccess = () => {
    setSuccessMsg("Book updated successfully");
    setSelectedBook(null);
    loadData();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const totalPages = Math.max(1, Math.ceil(visibleBooks.length / PAGE_SIZE));
  const paginatedBooks = visibleBooks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const getPageNumbers = () => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  };

  const fallbackCover = (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600/30 to-indigo-600/30">
      <BookOpen className="w-8 h-8 text-blue-300/70" />
    </div>
  );

  const hasActiveFilters = Boolean(search.trim() || categoryFilter || classificationFilter);
  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setClassificationFilter("");
  };
  const typeBadge = (book: any) => book.bookType === "ebook"
    ? "bg-violet-500/15 text-violet-300"
    : "bg-cyan-500/15 text-cyan-300";
  const typeLabel = (book: any) => book.bookType === "ebook" ? "eBook" : "Physical";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
<div className="flex-1 min-w-0">
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28 lg:pb-8 ${!isLibrarian && cart.length > 0 ? "lg:pb-44" : ""}`}>
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
            <h1 className="text-2xl font-bold text-white">Books Collection</h1>
            <p className="text-sm text-zinc-400 mt-1">Manage your library&apos;s book collection</p>
          </div>
<div className="flex items-center gap-2">
            {isLibrarian && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Book
            </button>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-zinc-500" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, author, or Dewey number..."
                className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none"
            >
              <option value="" className="bg-zinc-900 text-white">All Categories</option>
              {categories.map((cat: any) => (
                <option key={cat.id} value={cat.id} className="bg-zinc-900 text-white">{cat.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              placeholder="Dewey no. e.g., 510.5"
              inputMode="decimal"
              className="w-full lg:w-44 px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <div className="flex w-full items-center gap-2 sm:hidden">
              <MobileBookTypeSelect current="physical" className="min-w-0 flex-1" />
              <div className="flex shrink-0 gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
                <button
                  onClick={() => setView("grid")}
                  className={`rounded-lg border p-2 transition-colors ${view === "grid" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={`rounded-lg border p-2 transition-colors ${view === "list" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <List className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="hidden gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1 sm:flex">
              <button
                onClick={() => setView("grid")}
                className={`p-2 rounded-lg border transition-colors ${view === "grid" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 rounded-lg border transition-colors ${view === "list" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                aria-label="List view"
                aria-pressed={view === "list"}
              >
                <List className="w-5 h-5" />
              </button>
              <span className="self-center text-xs text-zinc-500 px-2 hidden sm:block">
                {visibleBooks.length} books
              </span>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className={view === "grid" ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}>
            {Array.from({ length: view === "grid" ? 8 : 5 }).map((_, i) => (
              <div key={i} className={view === "grid" ? "h-72 rounded-2xl border border-zinc-800 bg-zinc-900/70 animate-pulse" : "h-20 rounded-xl border border-zinc-800 bg-zinc-900/70 animate-pulse"} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && visibleBooks.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
            <p className="text-zinc-300 font-medium">{hasActiveFilters ? "No books match your filters" : "No books found"}</p>
            <p className="text-sm text-zinc-500 mt-1">
              {hasActiveFilters ? "Try adjusting your search or category." : "Add a book to get started"}
            </p>
            {hasActiveFilters && <button onClick={clearFilters} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-700">Clear filters</button>}
          </div>
        )}

        {/* GRID VIEW */}
        {!loading && view === "grid" && visibleBooks.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedBooks.map((book: any) => (
                <div key={book.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden hover:border-zinc-700 transition-colors">
                  {/* Cover */}
                  <div className="aspect-[3/4] bg-zinc-800 relative">
                    {book.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      fallbackCover
                    )}
                    {!isLibrarian && inCart(book.id) && (
                      <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-4 text-white sm:text-base sm:leading-snug">{book.title}</h3>
                    <p className="mt-1 truncate text-xs text-zinc-400 sm:text-sm">{book.author}</p>
                    <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-xs ${typeBadge(book)}`}>{typeLabel(book)}</span>
                      {book.category ? (
                        <span className="max-w-full truncate rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 sm:px-2 sm:text-xs">{book.category.name}</span>
                      ) : (
                        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:px-2 sm:text-xs">General</span>
                      )}
                      {book.publishYear && (
                        <span className="text-[10px] text-zinc-500 sm:text-xs">{book.publishYear}</span>
                      )}
                      {isLibrarian && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-xs ${
                          book.status === 'AVAILABLE'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-orange-500/15 text-orange-400'
                        }`}>
                          {book.status === 'AVAILABLE' ? 'Available' : 'Not Available'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-400 sm:text-xs"><span className="font-medium text-emerald-400">{book.availableCopies ?? 0}</span><span className="text-zinc-500"> / {book.copies ?? 0} available</span></div>
                    <div className="mt-2 flex gap-1.5">
                      {isLibrarian ? (
                        <>
                          <button
                            onClick={() => handleEdit(book)}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors sm:text-sm"
                          >
                            <Pencil className="w-4 h-4" /> Edit
                          </button>
                          <button
                            onClick={() => handleToggleAvailability(book)}
                            disabled={togglingStatusId !== null}
                            className={`flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-2 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed sm:gap-1.5 sm:px-3 sm:text-sm ${
                              book.status === 'AVAILABLE'
                                ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            <AlertCircle className={`w-4 h-4 ${togglingStatusId === book.id ? "animate-spin" : ""}`} />
                            {book.status === 'AVAILABLE' ? 'Mark Unavailable' : 'Mark Available'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(book)}
                          disabled={(book.availableCopies ?? 0) <= 0}
                            className={`flex-1 px-1.5 py-2 text-[11px] font-semibold text-white rounded-lg transition-colors sm:px-3 sm:text-sm ${
                            inCart(book.id)
                              ? "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                              : "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {(book.availableCopies ?? 0) <= 0
                            ? "Unavailable"
                            : inCart(book.id)
                              ? "Remove"
                              : "Add to Cart"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* LIST VIEW */}
        {!loading && view === "list" && visibleBooks.length > 0 && (
          <>
            <div className="hidden sm:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-6 py-3 font-medium">Book</th>
                    <th className="px-6 py-3 font-medium hidden md:table-cell">Genre</th>
                    <th className="px-6 py-3 font-medium hidden sm:table-cell">Year</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBooks.map((book: any) => (
                    <tr key={book.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                            {book.coverImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-zinc-600" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><p className="text-zinc-100 font-medium truncate">{book.title}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadge(book)}`}>{typeLabel(book)}</span></div>
                            <p className="text-xs text-zinc-500">{book.author}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-zinc-300 hidden md:table-cell">
                        {book.category?.name || "General"}
                      </td>
                      <td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">
                        {book.publishYear || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 w-fit ${
                            (book.availableCopies ?? 0) > 0
                              ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                              : "bg-red-500/15 text-red-400 ring-red-500/30"
                          }`}>
                            {(book.availableCopies ?? 0)}/{book.copies ?? 0} available
                          </span>
                          {book.bookType === "ebook" && <span className={`rounded-full px-2.5 py-1 text-xs font-medium w-fit ${typeBadge(book)}`}>Digital reader</span>}
                          {isLibrarian && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${
                              book.status === 'AVAILABLE'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-orange-500/15 text-orange-400'
                            }`}>
                              {book.status === 'AVAILABLE' ? 'Available' : 'Not Available'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isLibrarian ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(book)}
                              className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                              aria-label="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleAvailability(book)}
                              disabled={togglingStatusId !== null}
                              className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                book.status === 'AVAILABLE'
                                  ? 'text-zinc-400 hover:bg-orange-500/10 hover:text-orange-400'
                                  : 'text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400'
                              }`}
                              aria-label={book.status === 'AVAILABLE' ? 'Mark not available' : 'Mark available'}
                            >
                              <AlertCircle className={`w-4 h-4 ${togglingStatusId === book.id ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddToCart(book)}
                            disabled={(book.availableCopies ?? 0) <= 0}
                            className={`px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors ${
                              inCart(book.id)
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-blue-600 hover:bg-blue-700"
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {(book.availableCopies ?? 0) <= 0 ? "Unavailable" : inCart(book.id) ? "Remove" : "Add to Cart"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ResponsiveTable mobile={
              paginatedBooks.map((book: any) => (
                <article key={book.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10">
                  <div className="flex items-start gap-3 border-b border-zinc-800/80 pb-3">
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-800">{book.coverImage ? <img src={book.coverImage} alt={book.title} className="h-full w-full object-cover" /> : <ImageIcon className="m-3 h-5 w-5 text-zinc-600" />}</div>
                    <div className="min-w-0"><p className="font-semibold text-zinc-100 break-words">{book.title}</p><p className="mt-1 text-sm text-zinc-500 break-words">{book.author}</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 py-4 text-sm"><div><p className="text-xs text-zinc-500">Type</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(book)}`}>{typeLabel(book)}</span></div><div><p className="text-xs text-zinc-500">Genre</p><p className="mt-1 text-zinc-300">{book.category?.name || "General"}</p></div><div><p className="text-xs text-zinc-500">Year</p><p className="mt-1 text-zinc-300">{book.publishYear || "—"}</p></div><div><p className="text-xs text-zinc-500">{book.bookType === "ebook" ? "Access" : "Copies"}</p><p className="mt-1 text-zinc-300">{book.bookType === "ebook" ? "Digital reader" : `${book.availableCopies ?? 0}/${book.copies ?? 0} available`}</p></div></div>
                  <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${(book.availableCopies ?? 0) > 0 ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : "bg-red-500/15 text-red-400 ring-red-500/30"}`}>{(book.availableCopies ?? 0) > 0 ? "Available" : "Unavailable"}</span>{isLibrarian ? <div className="flex gap-2"><button onClick={() => handleEdit(book)} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200">Edit</button><button onClick={() => handleToggleAvailability(book)} className="rounded-lg bg-orange-500/10 px-3 py-2 text-xs text-orange-400">Toggle</button></div> : <button onClick={() => handleAddToCart(book)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">{inCart(book.id) ? "Remove" : "Add to Cart"}</button>}</div>
                </article>
              ))
            } />
          </>
        )}

        {/* Pagination */}
        {!loading && visibleBooks.length > 0 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-zinc-500">
              Showing{" "}
              <span className="text-zinc-300">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, visibleBooks.length)}
              </span>{" "}
              of <span className="text-zinc-300">{visibleBooks.length}</span> books
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

        {/* Borrow Cart Bar */}
        {!isLibrarian && cart.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl z-50">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {cart.length}/3 books selected
                  </p>
                  <p className="text-xs text-zinc-500">You can borrow up to 3 books per transaction.</p>
                </div>
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {cart.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200"
                  >
                    <span className="max-w-[160px] truncate">{b.title}</span>
                    <button
                      onClick={() => handleRemoveFromCart(b.id)}
                      className="text-zinc-400 hover:text-red-400 transition-colors"
                      aria-label={`Remove ${b.title}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleBorrowNow}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/30"
                >
                  <Send className="w-4 h-4" />
                  Send Borrow Request
                </button>
              </div>
            </div>
          </div>
        )}

        {!isLibrarian && cart.length > 0 && (
          <BookBorrowModal
            open={showBorrowModal}
            onOpenChange={setShowBorrowModal}
            books={cart}
            onSuccess={handleBorrowSuccess}
          />
        )}

        <AddBookModal
          open={showAddModal}
          onOpenChange={setShowAddModal}
          categories={categories}
          onSuccess={() => {
            setSuccessMsg("Book added successfully.");
            loadData();
          }}
        />

        <EditBookModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          book={selectedBook}
          categories={categories}
          onSuccess={handleEditSuccess}
        />
      </div>
      </div>
    </div>
  );
}
