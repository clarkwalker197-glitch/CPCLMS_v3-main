"use client";

import { useState, useEffect, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import type { ApiResponse } from "@/lib/api";
import MediaImage from "@/components/MediaImage";
import { offlineDb } from "@/lib/offline-db";
import { searchCachedBooks } from "@/lib/offline-api";
import { syncCatalogForOffline } from "@/lib/catalog-cache";
import { useDebounce } from "@/lib/useDebounce";
import { BookBorrowModal } from "@/components/BookBorrowModal";
import { BookDetailsPanel, type BookDetailsBook } from "@/components/BookDetailsPanel";
import { AddBookModal } from "@/components/AddBookModal";
import { EditBookModal } from "@/components/EditBookModal";
import { FloatingAddButton } from "@/components/FloatingAddButton";
import MobileBookTypeSelect from "@/components/MobileBookTypeSelect";
import MobileSearchInput from "@/components/MobileSearchInput";
import Sidebar from "@/components/Sidebar";
import HeaderUserActions from "@/components/HeaderUserActions";
import ResponsiveTable from "@/components/ResponsiveTable";
import AvailabilitySwitch from "@/components/AvailabilitySwitch";
import { SortHeader, SortSelect, nextSortOrder, type SortOption } from "@/components/SortControls";
import { BOOK_MAIN_CATEGORIES, categoryDisplayName, categoryIdForDewey, normalizeMainCategoryCode, subcategoriesForMain } from "@/lib/categories";
import {
  Search,
  LayoutGrid,
  List,
  Pencil,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  ShoppingCart,
  X,
  Send,
} from "lucide-react";

const PAGE_SIZE = 20;
const MAX_BOOKS_PER_TRANSACTION = 3;
const MAX_LIMIT_MESSAGE = "You can only borrow a maximum of 3 books per transaction.";

type BookRequestOverview = {
  books?: Array<{ id: string; status?: string }>;
};

type ReservationOverview = {
  bookId?: string;
  book?: { id: string };
};

const isPhysicalBookAvailable = (book: any) => {
  return ['AVAILABLE', 'BORROWED'].includes(book?.status) && Number(book?.availableCopies ?? 0) > 0;
};

const isBookCirculationEnabled = (book: any) => {
  return ['AVAILABLE', 'BORROWED'].includes(book?.status);
};

const isPhysicalBookReservable = (book: any) => {
  return ['AVAILABLE', 'BORROWED'].includes(book?.status) && Number(book?.availableCopies ?? 0) === 0;
};

export default function BooksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState<any[]>([]);
  const [totalBooks, setTotalBooks] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState("");
  const [viewPreference, setViewPreference] = useState<"grid" | "list" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState("title");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [cart, setCart] = useState<any[]>([]);
  const [cartUserId, setCartUserId] = useState<string | null>(null);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [detailsBook, setDetailsBook] = useState<BookDetailsBook | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [requestedBookIds, setRequestedBookIds] = useState<Set<string>>(new Set());
  const [reservedBookIds, setReservedBookIds] = useState<Set<string>>(new Set());
  const [actionsLoadedForUserId, setActionsLoadedForUserId] = useState<string | null>(null);
  const [actionsLookupErrorForUserId, setActionsLookupErrorForUserId] = useState<string | null>(null);
  const [actionsLookupRetryKey, setActionsLookupRetryKey] = useState(0);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [cardActionError, setCardActionError] = useState<{ bookId: string; message: string } | null>(null);
  const [borrowRequestError, setBorrowRequestError] = useState<{ bookIds: Set<string>; message: string } | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [showingCachedCatalog, setShowingCachedCatalog] = useState(false);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  const isLibrarian = user?.role === "LIBRARIAN";
  const view = viewPreference ?? "grid";

  // Debounced search/filter values (300ms) to avoid per-keystroke API spam
  const debouncedSearch = useDebounce(search, 300);
  const requestSequence = useRef(0);
  const reservationRequestInFlight = useRef(false);
  const activeCart = user && cartUserId === user.id ? cart : [];

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    setCart([]);
    setCartUserId(user?.id ?? null);
    setRequestedBookIds(new Set());
    setReservedBookIds(new Set());
    setActionsLoadedForUserId(null);
    setActionsLookupErrorForUserId(null);
  }, [user?.id]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const updateLayout = () => setIsDesktop(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const retryLookupsWhenOnline = () => {
      setActionsLookupRetryKey((current) => current + 1);
      void syncCatalogForOffline("books").catch((caught: unknown) => {
        console.error("[Offline] Could not synchronize the physical book catalog:", caught);
      });
    };
    if (navigator.onLine) {
      void syncCatalogForOffline("books").catch((caught: unknown) => {
        console.error("[Offline] Could not synchronize the physical book catalog:", caught);
      });
    }
    window.addEventListener("online", retryLookupsWhenOnline);
    return () => window.removeEventListener("online", retryLookupsWhenOnline);
  }, []);

  useEffect(() => {
    if (!user || user.role === "LIBRARIAN") return;
    let active = true;
    void offlineDb.syncQueue
      .where("userId")
      .equals(user.id)
      .filter((request) => request.type === "BORROW_REQUEST" && request.status === "QUEUED")
      .toArray()
      .then((requests) => {
        if (!active) return;
        setRequestedBookIds((previous) => new Set([
          ...previous,
          ...requests.flatMap((request) => request.bookIds),
        ]));
      })
      .catch((caught: unknown) => {
        console.error("[Offline] Could not load queued borrow requests:", caught);
      });
    return () => {
      active = false;
    };
  }, [user?.id, user?.role]);

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const cachedBooks = await offlineDb.books.toArray();
      const cachedCategories = await offlineDb.categories.toArray();
      const hasServerFilters = Boolean(debouncedSearch || categoryFilter || mainCategoryFilter);
      const localParams: Record<string, string> = {
        sort,
        order: sortOrder,
      };
      if (debouncedSearch) localParams.search = debouncedSearch;
      if (categoryFilter) localParams.categoryId = categoryFilter;
      if (mainCategoryFilter) localParams.categoryMain = normalizeMainCategoryCode(mainCategoryFilter);
      if (cachedBooks.length) {
        const cachedResults = searchCachedBooks(cachedBooks, localParams, cachedCategories).map((book) => ({ ...book, bookType: "physical" }));
        setBooks(cachedResults);
        setTotalBooks(cachedResults.length);
        setLoading(false);
      }
      const cachedSync = await offlineDb.meta.get("booksLastSyncedAt");
      setCatalogUpdatedAt(typeof cachedSync?.value === "number" ? cachedSync.value : null);
      if (cachedCategories.length) {
        setCategories(cachedCategories.filter((category) => String(category.slug || "").startsWith("dewey-")));
      }

      if (!navigator.onLine) {
        setShowingCachedCatalog(true);
        if (!cachedBooks.length) setError("This catalog is not available offline yet. Reconnect to synchronize it.");
        return;
      }

      const params: Record<string, string> = {};
      params.page = String(currentPage);
      params.limit = String(PAGE_SIZE);
      params.sort = sort;
      params.order = sortOrder;
      if (debouncedSearch) params.search = debouncedSearch;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (mainCategoryFilter) params.categoryMain = normalizeMainCategoryCode(mainCategoryFilter);
      const booksRes = await api.getBooks(params);
      if (requestId !== requestSequence.current) return;
      if (booksRes.success) {
        setBooks((booksRes.data || []).map((book: any) => ({ ...book, bookType: "physical" })));
        setTotalBooks(booksRes.meta?.total ?? (booksRes.data || []).length);
        await offlineDb.books.bulkPut(booksRes.data || []);
        if (!hasServerFilters) {
          const syncedAt = Date.now();
          await offlineDb.meta.put({ key: "booksLastSyncedAt", value: syncedAt, updatedAt: syncedAt });
          setCatalogUpdatedAt(syncedAt);
        }
        setShowingCachedCatalog(false);
      } else if (booksRes.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      } else if (booksRes.networkError && cachedBooks.length) {
        setBooks(searchCachedBooks(cachedBooks, localParams, cachedCategories).map((book) => ({ ...book, bookType: "physical" })));
        setTotalBooks(searchCachedBooks(cachedBooks, localParams, cachedCategories).length);
        setShowingCachedCatalog(true);
      } else if (!booksRes.success) {
        setError(booksRes.error || "Unable to load the catalog.");
      }
    } catch {
      if (requestId === requestSequence.current) {
        const cachedBooks = await offlineDb.books.toArray();
        if (cachedBooks.length) {
          const cachedCategories = await offlineDb.categories.toArray();
          const params: Record<string, string> = { sort, order: sortOrder };
          if (debouncedSearch) params.search = debouncedSearch;
          if (categoryFilter) params.categoryId = categoryFilter;
          if (mainCategoryFilter) params.categoryMain = normalizeMainCategoryCode(mainCategoryFilter);
          setBooks(searchCachedBooks(cachedBooks, params, cachedCategories).map((book) => ({ ...book, bookType: "physical" })));
          setShowingCachedCatalog(true);
        } else {
          setError("Unable to load the catalog. Connect once to download the catalog.");
        }
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [categoryFilter, currentPage, debouncedSearch, mainCategoryFilter, sort, sortOrder]);

  const visibleBooks = books;

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!user || user.role === "LIBRARIAN" || !navigator.onLine) {
      return;
    }

    let active = true;
    setActionsLoadedForUserId(null);
    setActionsLookupErrorForUserId(null);
    const getAllPages = async <T,>(
      fetchPage: (page: number) => Promise<ApiResponse<T[]>>
    ): Promise<T[]> => {
      const firstResponse = await fetchPage(1);
      if (!firstResponse.success) throw new Error(firstResponse.error || "Could not load existing requests.");
      const responses = [firstResponse];
      const totalPages = firstResponse.meta?.totalPages || 1;
      if (totalPages > 1) {
        responses.push(...await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2))
        ));
      }
      const failedResponse = responses.find((response) => !response.success);
      if (failedResponse) throw new Error(failedResponse.error || "Could not load existing requests.");
      return responses.flatMap((response) => response.data || []);
    };

    void Promise.all([
      getAllPages<BookRequestOverview>((page) => api.getBorrowRequests({ status: "PENDING", page: String(page), limit: "100" })),
      getAllPages<ReservationOverview>((page) => api.getReservations({ status: "ACTIVE", page: String(page), limit: "100" })),
      getAllPages<ReservationOverview>((page) => api.getReservations({ status: "APPROVED", page: String(page), limit: "100" })),
    ])
      .then(([pendingRequests, activeReservations, approvedReservations]) => {
        if (!active) return;
        setActionsLoadedForUserId(user.id);
        setActionsLookupErrorForUserId(null);
        setRequestedBookIds(new Set(pendingRequests
          .flatMap((request) => request.books || [])
          .filter((book) => book.status === "PENDING")
          .map((book) => book.id)));
        setReservedBookIds(new Set([...activeReservations, ...approvedReservations]
          .map((reservation) => reservation.bookId || reservation.book?.id)
          .filter((id): id is string => typeof id === "string")));
        setDetailsError("");
      })
      .catch((caught: unknown) => {
        if (active) {
          setActionsLookupErrorForUserId(user.id);
          setDetailsError(caught instanceof Error
            ? caught.message
            : "Could not check your existing requests and reservations.");
        }
      });

    return () => {
      active = false;
    };
  }, [actionsLookupRetryKey, user?.id, user?.role]);

  useEffect(() => {
    if (!navigator.onLine) return;
    api.getCategories().then(async (response) => {
      if (!response.success || !response.data) return;
      const deweyCategories = response.data.filter((category: any) => category.slug?.startsWith("dewey-"));
      setCategories(deweyCategories);
      await offlineDb.categories.bulkPut(response.data);
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, categoryFilter, mainCategoryFilter, sort, sortOrder]);

  const inCart = (id: string) => activeCart.some((b) => b.id === id);

  const openBookDetails = (book: BookDetailsBook) => {
    setDetailsError(borrowRequestError?.bookIds.has(book.id) ? borrowRequestError.message : "");
    setDetailsBook(book);
  };

  const handleBorrowBook = (book: BookDetailsBook) => {
    setBorrowRequestError(null);
    setCardActionError(null);
    if (!user) {
      router.push("/login");
      return;
    }
    if (!isPhysicalBookAvailable(book)) {
      const message = "This book is currently unavailable.";
      setDetailsError(message);
      setCardActionError({ bookId: book.id, message });
      return;
    }
    if (inCart(book.id)) {
      setCart(activeCart.filter((item) => item.id !== book.id));
      setDetailsError("");
      return;
    }
    if (actionsLoadedForUserId === user.id && requestedBookIds.has(book.id)) {
      const message = "You already have a pending request for this book.";
      setDetailsError(message);
      setCardActionError({ bookId: book.id, message });
      return;
    }
    if (activeCart.length >= MAX_BOOKS_PER_TRANSACTION) {
      setDetailsError(MAX_LIMIT_MESSAGE);
      setCardActionError({ bookId: book.id, message: MAX_LIMIT_MESSAGE });
      return;
    }
    setDetailsError("");
    setCartUserId(user.id);
    setCart([...activeCart, book]);
  };

  const handleReserveBook = async (book: BookDetailsBook) => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'LIBRARIAN') {
      return;
    }
    if (reservationRequestInFlight.current) return;
    setBorrowRequestError(null);
    if (reservedBookIds.has(book.id)) return;
    if (!isPhysicalBookReservable(book)) return;

    try {
      reservationRequestInFlight.current = true;
      setDetailsError('');
      setCardActionError(null);
      setReservationLoading(true);
      const res = await api.reserveBook(book.id);
      if (res.success) {
        setActionsLoadedForUserId(user.id);
        setReservedBookIds((previous) => new Set(previous).add(book.id));
        setSuccessMsg(`Reservation placed for "${book.title}".`);
        loadData();
        setTimeout(() => setSuccessMsg(''), 4000);
        return;
      }
      const message = res.error || 'Unable to reserve this book.';
      setDetailsError(message);
      setCardActionError({ bookId: book.id, message });
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : 'Unable to reserve this book right now.';
      setDetailsError(message);
      setCardActionError({ bookId: book.id, message });
    } finally {
      reservationRequestInFlight.current = false;
      setReservationLoading(false);
    }
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(activeCart.filter((b) => b.id !== id));
  };

  const handleBorrowNow = () => {
    if (activeCart.length === 0) {
      setError("Please select at least one book to borrow.");
      return;
    }
    if (activeCart.length > MAX_BOOKS_PER_TRANSACTION) {
      setError(MAX_LIMIT_MESSAGE);
      return;
    }
    setError("");
    setShowBorrowModal(true);
  };

  const handleBorrowSuccess = (queuedOffline = false) => {
    setSuccessMsg(queuedOffline
      ? "Request saved on this device. It will be sent to the librarian when you reconnect; it is not approved yet."
      : "Request sent! Waiting for librarian approval.");
    setBorrowRequestError(null);
    if (user) setActionsLoadedForUserId(user.id);
    setRequestedBookIds((previous) => new Set([...previous, ...activeCart.map((book) => book.id)]));
    setCart([]);
    loadData();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleEdit = (book: any) => {
    setSelectedBook(book);
    setShowEditModal(true);
  };

  const handleToggleAvailability = async (book: any, available: boolean) => {
    if (togglingStatusId) return;
    const previousStatus = book.status;
    const previousAvailableCopies = book.availableCopies;
    const newStatus = available ? "AVAILABLE" : "MAINTENANCE";
    setTogglingStatusId(book.id);
    setError("");
    setBooks((current) => current.map((item) => item.id === book.id
      ? { ...item, status: newStatus, ...(available ? {} : { availableCopies: 0 }) }
      : item));
    try {
      const response = await api.updateBook(book.id, { status: newStatus });
      if (!response.success) {
        throw new Error(response.rateLimited
          ? "You're moving too fast. Please wait a moment and try again."
          : response.error || "Failed to update book");
      }
      setSuccessMsg(`Book marked as ${available ? "available" : "not available"}`);
      void loadData();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (caught) {
      setBooks((current) => current.map((item) => item.id === book.id
        ? { ...item, status: previousStatus, availableCopies: previousAvailableCopies }
        : item));
      setError(caught instanceof Error ? caught.message : "Failed to update book");
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

  const handleBorrowRequestError = (message: string) => {
    setDetailsError(message);
    setBorrowRequestError({
      bookIds: new Set(activeCart.map((book) => book.id)),
      message,
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalBooks / PAGE_SIZE));
  const paginatedBooks = showingCachedCatalog
    ? visibleBooks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : visibleBooks;

  const getPageNumbers = () => {
    const pages: number[] = [];
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    for (let i = start; i <= Math.min(totalPages, start + 4); i++) pages.push(i);
    return pages;
  };

  const fallbackCover = (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600/30 to-indigo-600/30">
      <BookOpen className="w-8 h-8 text-blue-300/70" />
    </div>
  );

  const openDetailsFromCard = (event: ReactKeyboardEvent<HTMLElement>, book: any) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openBookDetails(book);
  };

  const hasActiveFilters = Boolean(search.trim() || mainCategoryFilter || categoryFilter);
  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setMainCategoryFilter("");
  };
  const typeBadge = (book: any) => book.bookType === "ebook"
    ? "bg-violet-500/15 text-violet-300"
    : "bg-cyan-500/15 text-cyan-300";
  const typeLabel = (book: any) => book.bookType === "ebook" ? "eBook" : "Physical";
  const sortOptions: SortOption[] = [
    { sort: "title", order: "asc", label: "Title A–Z" },
    { sort: "title", order: "desc", label: "Title Z–A" },
    { sort: "author", order: "asc", label: "Author A–Z" },
    { sort: "author", order: "desc", label: "Author Z–A" },
    { sort: "classification", order: "asc", label: "Classification low–high" },
    { sort: "classification", order: "desc", label: "Classification high–low" },
    { sort: "createdAt", order: "desc", label: "Date added newest" },
    { sort: "createdAt", order: "asc", label: "Date added oldest" },
    { sort: "availability", order: "asc", label: "Available first" },
  ];
  const changeSort = (field: string, direction: "asc" | "desc") => {
    setSort(field);
    setSortOrder(direction);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${!isLibrarian && activeCart.length > 0 ? "pb-[calc(14rem+min(env(safe-area-inset-bottom),2rem))] lg:pb-44" : "pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] lg:pb-8"}`}>
          {successMsg && (
            <div role="status" className="cpc-feedback-success mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
              <svg className="cpc-success-icon h-4 w-4 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              {successMsg}
            </div>
          )}
          {error && (
            <div role="alert" className="cpc-feedback-error mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Header */}
          <div className={`flex items-start justify-between gap-4 ${isLibrarian ? "mb-3" : "mb-6"}`}>
            <div>
              <h1 className="text-2xl font-bold text-white">Books Collection</h1>
              <p className="mt-1 text-sm text-zinc-400">Manage your library&apos;s book collection</p>
              {showingCachedCatalog && (
                <p className="mt-2 text-xs text-amber-300">
                  Showing cached catalog
                  {catalogUpdatedAt ? ` — last synchronized ${new Date(catalogUpdatedAt).toLocaleString()}` : " — synchronization time unavailable"}.
                </p>
              )}
            </div>
            <HeaderUserActions />
          </div>
          {/* Toolbar */}
          <div className="mobile-search-toolbar mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="hidden relative w-full sm:flex-1 md:block">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-5 w-5 text-zinc-500" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search book titles..."
                  className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="w-full md:hidden">
                <MobileSearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search book titles..."
                  storageKey="cpc-recent-book-searches"
                />
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto lg:hidden">
                <MobileBookTypeSelect current="physical" className="min-w-0 flex-1 sm:w-[180px] sm:flex-none" />
                <div className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
                  <button
                    onClick={() => setViewPreference("grid")}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === "grid" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewPreference("list")}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === "list" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                    aria-label="List view"
                    aria-pressed={view === "list"}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <details className="mobile-filter-details" open={isDesktop}>
              <summary>Filters and sort</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <SortSelect options={sortOptions} sort={sort} order={sortOrder} onChange={changeSort} />
              <select
                value={mainCategoryFilter}
                onChange={(e) => {
                  setMainCategoryFilter(e.target.value);
                  setCategoryFilter("");
                }}
                className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 appearance-none sm:w-auto sm:min-w-[180px]"
              >
                <option value="" className="bg-zinc-900 text-white">All Main Categories</option>
                {BOOK_MAIN_CATEGORIES.map((category) => (
                  <option key={category.code} value={category.code} className="bg-zinc-900 text-white">{category.name}{category.range ? ` (${category.range})` : ""}</option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={!mainCategoryFilter}
                className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 appearance-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
              >
                <option value="">{normalizeMainCategoryCode(mainCategoryFilter) === "FIL" ? "All Main Categories" : "All Subcategories"}</option>
                {subcategoriesForMain(mainCategoryFilter).map((category) => {
                  const categoryId = categoryIdForDewey(category, categories);
                  return <option key={category.code} value={categoryId}>{categoryDisplayName(category.name)}</option>;
                })}
              </select>

              <div className="hidden items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1 sm:flex">
                <button
                  onClick={() => setViewPreference("grid")}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === "grid" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewPreference("list")}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === "list" ? "border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20" : "border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                >
                  <List className="h-4 w-4" />
                </button>
                <span className="self-center px-2 text-xs text-zinc-500">
                  {totalBooks} books
                </span>
              </div>
            </div>
            </details>
          </div>
          {/* Loading */}
          {loading && (
            <div className={view === "grid" ? "grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "space-y-3"}>
              {Array.from({ length: view === "grid" ? 8 : 5 }).map((_, i) => (
                <div key={i} className={view === "grid" ? "cpc-skeleton h-72 rounded-2xl border border-zinc-800 bg-zinc-900/70" : "cpc-skeleton h-20 rounded-xl border border-zinc-800 bg-zinc-900/70"} />
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
              <div className="cpc-stagger-list grid grid-cols-2 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedBooks.map((book: any) => (
                  <div
                    key={book.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openBookDetails(book)}
                    onKeyDown={(event) => openDetailsFromCard(event, book)}
                    aria-label={`View details for ${book.title}`}
                    className="cpc-book-card flex h-full min-w-0 flex-col cursor-pointer overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {/* Cover */}
                    <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden bg-zinc-800">
                      <MediaImage src={book.coverImage} alt={book.title} className="w-full h-full object-cover" fallback={fallbackCover} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                      <h3 className="h-10 min-w-0 line-clamp-2 text-sm font-semibold leading-5 text-white sm:h-12 sm:text-base sm:leading-6">{book.title}</h3>
                      <p className="mt-1 min-w-0 truncate text-xs text-zinc-400 sm:text-sm">{book.author}</p>
                      <p className="mt-2 min-h-4 truncate text-[10px] text-zinc-500 sm:text-xs">{book.publishYear || "\u00a0"}</p>
                      <p className="mt-2 min-w-0 truncate whitespace-nowrap text-[10px] text-zinc-400 sm:text-xs">
                        <span className="font-medium text-emerald-400">{book.availableCopies ?? 0}</span>
                        <span className="text-zinc-500"> / {book.copies ?? 0} available</span>
                      </p>
                      <div className="mt-auto grid h-28 grid-rows-2 gap-2 pt-2">
                        {isLibrarian ? (
                          <>
                            <button
                              onClick={(event) => { event.stopPropagation(); handleEdit(book); }}
                              className="min-h-11 min-w-0 whitespace-nowrap inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-800 px-2 py-2 text-[10px] font-medium text-zinc-200 transition-colors hover:bg-zinc-700 sm:text-xs"
                            >
                              <Pencil className="h-4 w-4 shrink-0" />
                              <span>Edit</span>
                            </button>
                            <div className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-800/70 px-2 text-xs text-zinc-300">
                              <AvailabilitySwitch
                                checked={isBookCirculationEnabled(book)}
                                disabled={togglingStatusId !== null}
                                label={`Availability for ${book.title}`}
                                onChange={(available) => void handleToggleAvailability(book, available)}
                              />
                              <span>{isBookCirculationEnabled(book) ? "Available" : "Not available"}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            {(() => {
                              const available = isPhysicalBookAvailable(book);
                              const reservable = isPhysicalBookReservable(book);
                              const alreadyRequested = actionsLoadedForUserId === user?.id && requestedBookIds.has(book.id);
                              const alreadyReserved = actionsLoadedForUserId === user?.id && reservedBookIds.has(book.id);
                              const lookupFailed = Boolean(user && actionsLookupErrorForUserId === user.id);
                              const checking = Boolean(
                                user &&
                                actionsLoadedForUserId !== user.id &&
                                !lookupFailed
                              );
                              const selected = inCart(book.id);
                              const actionLabel = lookupFailed
                                ? "Retry request check"
                                : !available && !reservable
                                  ? "Unavailable"
                                : checking
                                ? "Checking requests..."
                                : alreadyRequested
                                  ? "Request already sent"
                                  : available
                                    ? selected
                                      ? "Remove from Borrow Request"
                                      : "Add to Borrow Request"
                                    : alreadyReserved
                                      ? "Already reserved"
                                      : reservationLoading
                                        ? "Reserving..."
                                        : "Reserve";
                              const disabled = lookupFailed
                                ? false
                                : checking || alreadyRequested || (!available && !reservable) || (available
                                  ? !selected && activeCart.length >= MAX_BOOKS_PER_TRANSACTION
                                  : !reservable || alreadyReserved || reservationLoading);
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (lookupFailed) setActionsLookupRetryKey((current) => current + 1);
                                      else if (available) handleBorrowBook(book);
                                      else if (reservable) void handleReserveBook(book);
                                    }}
                                    disabled={disabled}
                                    className={`min-h-11 min-w-0 whitespace-normal break-words rounded-lg px-1.5 py-1 text-[11px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                      available
                                        ? "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500"
                                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                    }`}
                                  >
                                    {actionLabel}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); openBookDetails(book); }}
                                    className="min-h-11 min-w-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
                                  >
                                    View details
                                  </button>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>
                      {!isLibrarian && cardActionError && cardActionError.bookId === book.id && (
                        <p role="alert" className="mt-2 text-xs text-red-300">{cardActionError.message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* LIST VIEW */}
          {!loading && view === "list" && visibleBooks.length > 0 && (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-xl shadow-black/10 md:block">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] table-fixed text-sm">
                  <thead>
                    <tr className="bg-zinc-900/95 text-left text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="w-[370px] px-6 py-3 font-medium"><SortHeader field="title" sort={sort} order={sortOrder} onSort={(field) => changeSort(field, nextSortOrder(sort, sortOrder, field))}>Book</SortHeader></th>
                      <th className="w-[170px] px-6 py-3 font-medium">Genre</th>
                      <th className="w-[100px] px-6 py-3 font-medium">Year</th>
                      <th className="w-[190px] px-6 py-3 font-medium">Status</th>
                      <th className="w-[130px] px-6 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="cpc-stagger-list">
                    {paginatedBooks.map((book: any) => (
                      <tr
                        key={book.id}
                        tabIndex={0}
                        onClick={() => openBookDetails(book)}
                        onKeyDown={(event) => openDetailsFromCard(event, book)}
                        className="cursor-pointer border-t border-zinc-800/70 transition-colors even:bg-zinc-950/20 hover:bg-blue-500/[0.04] focus:outline-none focus:bg-zinc-800/40"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                              <MediaImage src={book.coverImage} alt={book.title} className="w-full h-full object-cover" fallback={<div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-zinc-600" /></div>} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2"><p className="line-clamp-2 break-words font-medium leading-5 text-zinc-100">{book.title}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadge(book)}`}>{typeLabel(book)}</span></div>
                              <p className="mt-1 truncate text-xs text-zinc-500">{book.author}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-300">
                          <span className="block truncate" title={book.category?.name || "General"}>{book.category?.name || "General"}</span>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {book.publishYear || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 w-fit ${isPhysicalBookAvailable(book)
                                ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                                : "bg-red-500/15 text-red-400 ring-red-500/30"
                              }`}>
                              {isPhysicalBookAvailable(book) ? `${book.availableCopies ?? 0}/${book.copies ?? 0} available` : "Unavailable"}
                            </span>
                            {book.bookType === "ebook" && <span className={`rounded-full px-2.5 py-1 text-xs font-medium w-fit ${typeBadge(book)}`}>Digital reader</span>}
                            {isLibrarian && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${isBookCirculationEnabled(book)
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-orange-500/15 text-orange-400'
                                }`}>
                                {isBookCirculationEnabled(book) ? 'Available' : 'Not Available'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isLibrarian ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={(event) => { event.stopPropagation(); handleEdit(book); }}
                                className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                                aria-label="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <AvailabilitySwitch
                                checked={isBookCirculationEnabled(book)}
                                disabled={togglingStatusId !== null}
                                label={`Availability for ${book.title}`}
                                onChange={(available) => void handleToggleAvailability(book, available)}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); openBookDetails(book); }}
                              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                            >
                              View details
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <ResponsiveTable mobile={
                paginatedBooks.map((book: any) => (
                  <article
                    key={book.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openBookDetails(book)}
                    onKeyDown={(event) => openDetailsFromCard(event, book)}
                    aria-label={`View details for ${book.title}`}
                    className="cpc-book-card cursor-pointer rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <div className="flex items-start gap-3 border-b border-zinc-800/80 pb-3">
                      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-800"><MediaImage src={book.coverImage} alt={book.title} className="h-full w-full object-cover" fallback={<ImageIcon className="m-3 h-5 w-5 text-zinc-600" />} /></div>
                      <div className="min-w-0"><p className="font-semibold text-zinc-100 break-words">{book.title}</p><p className="mt-1 text-sm text-zinc-500 break-words">{book.author}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 py-4 text-sm"><div><p className="text-xs text-zinc-500">Type</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge(book)}`}>{typeLabel(book)}</span></div><div><p className="text-xs text-zinc-500">Genre</p><p className="mt-1 text-zinc-300">{book.category?.name || "General"}</p></div><div><p className="text-xs text-zinc-500">Year</p><p className="mt-1 text-zinc-300">{book.publishYear || "—"}</p></div><div><p className="text-xs text-zinc-500">{book.bookType === "ebook" ? "Access" : "Copies"}</p><p className="mt-1 text-zinc-300">{book.bookType === "ebook" ? "Digital reader" : `${book.availableCopies ?? 0}/${book.copies ?? 0} available`}</p></div></div>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${isPhysicalBookAvailable(book) ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30" : "bg-red-500/15 text-red-400 ring-red-500/30"}`}>{isPhysicalBookAvailable(book) ? "Available" : "Unavailable"}</span>{isLibrarian ? <div className="flex items-center gap-3"><button onClick={(event) => { event.stopPropagation(); handleEdit(book); }} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200">Edit</button><AvailabilitySwitch checked={isBookCirculationEnabled(book)} disabled={togglingStatusId !== null} label={`Availability for ${book.title}`} onChange={(available) => void handleToggleAvailability(book, available)} /></div> : <button type="button" onClick={(event) => { event.stopPropagation(); openBookDetails(book); }} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200">View details</button>}</div>
                  </article>
                ))
              } />
            </>
          )}

          {/* Pagination */}
          {!loading && visibleBooks.length > 0 && (
            <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-center text-sm text-zinc-500 sm:text-left">
                Showing{" "}
                <span className="text-zinc-300">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min((currentPage - 1) * PAGE_SIZE + paginatedBooks.length, totalBooks)}
                </span>{" "}
                of <span className="text-zinc-300">{totalBooks}</span> books
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
                    className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${page === currentPage
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
          {portalTarget && !isLibrarian && activeCart.length > 0 && createPortal(
            <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 lg:bottom-4">
              <div className="rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur shadow-2xl shadow-black/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {activeCart.length}/3 books selected
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
                  {activeCart.map((b) => (
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
            </div>,
            portalTarget
          )}

          {!isLibrarian && activeCart.length > 0 && (
            <BookBorrowModal
              open={showBorrowModal}
              onOpenChange={setShowBorrowModal}
              books={activeCart}
              user={user!}
              onSuccess={handleBorrowSuccess}
              onError={handleBorrowRequestError}
            />
          )}

          {isLibrarian && (
            <FloatingAddButton label="Add Book" onClick={() => setShowAddModal(true)} />
          )}

          {detailsBook && (
            <BookDetailsPanel
              book={detailsBook}
              isAvailable={isPhysicalBookAvailable(detailsBook)}
              isLibrarian={isLibrarian}
              inCart={inCart(detailsBook.id)}
              alreadyRequested={actionsLoadedForUserId === user?.id && requestedBookIds.has(detailsBook.id)}
              alreadyReserved={actionsLoadedForUserId === user?.id && reservedBookIds.has(detailsBook.id)}
              cartLimitReached={activeCart.length >= MAX_BOOKS_PER_TRANSACTION}
              loadingExistingActions={Boolean(
                user &&
                user.role !== "LIBRARIAN" &&
                actionsLoadedForUserId !== user.id &&
                actionsLookupErrorForUserId !== user.id
              )}
              actionsLookupFailed={Boolean(
                user &&
                user.role !== "LIBRARIAN" &&
                actionsLookupErrorForUserId === user.id
              )}
              loadingReservation={reservationLoading}
              error={detailsError}
              onClose={() => setDetailsBook(null)}
              onBorrow={() => handleBorrowBook(detailsBook)}
              onReserve={() => { void handleReserveBook(detailsBook); }}
              onRetryActionsCheck={() => setActionsLookupRetryKey((current) => current + 1)}
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
