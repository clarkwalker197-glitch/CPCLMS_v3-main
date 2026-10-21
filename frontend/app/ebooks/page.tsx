'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import api from '@/lib/api';
import { resolveMediaUrl } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import HeaderUserActions from "@/components/HeaderUserActions";
import MediaImage from '@/components/MediaImage';
import ResponsiveTable from '@/components/ResponsiveTable';
import AvailabilitySwitch from '@/components/AvailabilitySwitch';
import { SortHeader, SortSelect, nextSortOrder, type SortOption } from '@/components/SortControls';
import { AddEBookModal } from '@/components/AddEBookModal';
import { EditEBookModal } from '@/components/EditEBookModal';
import MobileBookTypeSelect from '@/components/MobileBookTypeSelect';
import MobileSearchInput from '@/components/MobileSearchInput';
import { BOOK_MAIN_CATEGORIES, categoryIdForDewey, normalizeMainCategoryCode, subcategoriesForMain } from '@/lib/categories';
import { offlineDb } from '@/lib/offline-db';
import { searchCachedBooks } from '@/lib/offline-api';
import { syncCatalogForOffline } from '@/lib/catalog-cache';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Pencil,
  Eye,
} from 'lucide-react';

const PAGE_SIZE = 8;

type EBookRecord = {
  id: string;
  title?: string;
  author?: string;
  status?: string;
  fileUrl?: string;
  format?: string;
  publisher?: string | null;
  coverImage?: string | null;
  totalViews?: number;
  fileSize?: number;
  category?: { name?: string | null } | null;
};

type EBookViewLogs = {
  totalViews: number;
  recentActivity: Array<{
    viewedAt: string;
    user: { id: string; firstName: string; lastName: string; libraryId: string };
  }>;
};

const isEBookAvailable = (ebook: EBookRecord | null | undefined) => ebook?.status === 'AVAILABLE';

const formatBadge: Record<string, string> = {
  PDF: 'bg-red-500/15 text-red-400 ring-red-500/30',
  EPUB: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  MOBI: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
};

export default function EBooksPage() {
  const { user } = useAuth();
  const [ebooks, setEbooks] = useState<EBookRecord[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [mainCategoryFilter, setMainCategoryFilter] = useState('');
  const [viewPreference, setViewPreference] = useState<'grid' | 'list' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [successMsg, setSuccessMsg] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEBook, setSelectedEBook] = useState<any | null>(null);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);
  const [showingCached, setShowingCached] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [viewLogEBook, setViewLogEBook] = useState<EBookRecord | null>(null);
  const [viewLogs, setViewLogs] = useState<EBookViewLogs | null>(null);
  const [loadingViewLogs, setLoadingViewLogs] = useState(false);
  const [viewLogsError, setViewLogsError] = useState('');

  const isLibrarian = user?.role === 'LIBRARIAN';
  const view = viewPreference ?? 'grid';

  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const updateLayout = () => setIsDesktop(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cachedBooks = await offlineDb.ebooks.toArray();
      const cachedCategories = await offlineDb.categories.toArray();
      const cachedParams: Record<string, string> = { sort, order: sortOrder };
      if (search) cachedParams.search = search;
      if (categoryFilter) cachedParams.categoryId = categoryFilter;
      if (mainCategoryFilter) cachedParams.categoryMain = normalizeMainCategoryCode(mainCategoryFilter);
      if (cachedBooks.length) {
        setEbooks(searchCachedBooks(cachedBooks, cachedParams, cachedCategories));
        setLoading(false);
      }
      if (cachedCategories.length) {
        setCategories(cachedCategories.filter((category: any) => category.slug?.startsWith('dewey-')));
      }
      if (!navigator.onLine) {
        setShowingCached(true);
        if (!cachedBooks.length) setError('The e-book catalog is not available offline yet. Reconnect to synchronize it.');
        return;
      }

      const params: Record<string, string> = {};
      params.limit = '100';
      params.sort = sort;
      params.order = sortOrder;
      if (search) params.search = search;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (mainCategoryFilter) params.categoryMain = normalizeMainCategoryCode(mainCategoryFilter);
      const [ebooksRes, catsRes] = await Promise.all([
        api.getEBooks(params),
        api.getCategories(),
      ]);
      if (ebooksRes.success) {
        setEbooks(ebooksRes.data || []);
        await offlineDb.ebooks.bulkPut(ebooksRes.data || []);
        setShowingCached(false);
      } else if (ebooksRes.networkError && cachedBooks.length) {
        setEbooks(searchCachedBooks(cachedBooks, cachedParams, cachedCategories));
        setShowingCached(true);
      } else if (!ebooksRes.success) {
        setError(ebooksRes.error || 'Failed to load e-books');
      }
      if (catsRes.success) {
        setCategories((catsRes.data || []).filter((category: any) => category.slug?.startsWith('dewey-')));
        await offlineDb.categories.bulkPut(catsRes.data || []);
      }
    } catch {
      setShowingCached(true);
      if (!ebooks.length) setError('Failed to load e-books. Reconnect to synchronize the catalog.');
    } finally {
      setLoading(false);
    }
  }, [search, mainCategoryFilter, categoryFilter, sort, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(loadData, 300);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const refreshOfflineCatalog = () => {
      void syncCatalogForOffline('ebooks').catch((caught: unknown) => {
        console.error('[Offline] Could not synchronize the e-book catalog:', caught);
      });
    };
    if (navigator.onLine) refreshOfflineCatalog();
    window.addEventListener('online', refreshOfflineCatalog);
    return () => window.removeEventListener('online', refreshOfflineCatalog);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, ebooks.length]);

  const totalPages = Math.max(1, Math.ceil(ebooks.length / PAGE_SIZE));
  const paginatedEBooks = ebooks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const getPageNumbers = () => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  };

  const handleEdit = (ebook: EBookRecord) => {
    setSelectedEBook(ebook);
    setShowEditModal(true);
  };

  const handleToggleAvailability = async (ebook: EBookRecord, available: boolean) => {
    if (togglingStatusId) return;
    const previousStatus = ebook.status;
    const newStatus = available ? 'AVAILABLE' : 'MAINTENANCE';
    setTogglingStatusId(ebook.id);
    setError('');
    setEbooks((current) => current.map((item) => item.id === ebook.id ? { ...item, status: newStatus } : item));
    try {
      const response = await api.updateEBook(ebook.id, { status: newStatus });
      if (!response.success) {
        throw new Error(response.rateLimited
          ? "You're moving too fast. Please wait a moment and try again."
          : response.error || 'Failed to update e-book');
      }
      setSuccessMsg(`E-book marked as ${available ? 'available' : 'not available'}`);
      void loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (caught) {
      setEbooks((current) => current.map((item) => item.id === ebook.id ? { ...item, status: previousStatus } : item));
      setError(caught instanceof Error ? caught.message : 'Failed to update e-book');
    } finally {
      setTogglingStatusId(null);
    }
  };

  const openEBook = async (ebook: EBookRecord) => {
    if (!ebook.fileUrl) {
      setError('The e-book file URL is unavailable. Reconnect to refresh this catalog entry.');
      return;
    }
    const viewer = window.open('about:blank', '_blank');
    if (!viewer) {
      setError('Allow pop-ups for this site to open the e-book.');
      return;
    }
    setError('');
    try {
      const response = await api.recordEBookView(ebook.id);
      if (!response.success) {
        viewer.close();
        setError(response.error || 'Could not record this e-book view.');
        return;
      }
      setEbooks((current) => current.map((item) => item.id === ebook.id
        ? { ...item, ...(response.data ?? {}) }
        : item));
      viewer.location.href = resolveMediaUrl(ebook.fileUrl);
    } catch {
      viewer.close();
      setError('Could not record this e-book view. Please try again.');
    }
  };

  const showViewLogs = async (ebook: EBookRecord) => {
    setViewLogEBook(ebook);
    setViewLogs(null);
    setViewLogsError('');
    setLoadingViewLogs(true);
    try {
      const response = await api.getEBookViewLogs(ebook.id);
      if (response.success) setViewLogs(response.data);
      else setViewLogsError(response.error || 'Could not load e-book view activity.');
    } catch {
      setViewLogsError('Could not load e-book view activity.');
    } finally {
      setLoadingViewLogs(false);
    }
  };

  const handleEditSuccess = () => {
    setSuccessMsg("E-book updated successfully");
    setSelectedEBook(null);
    loadData();
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const fallbackCover = (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-600/30 to-indigo-600/30">
      <FileText className="w-8 h-8 text-blue-300/70" />
    </div>
  );

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  const sortOptions: SortOption[] = [
    { sort: 'title', order: 'asc', label: 'Title A–Z' },
    { sort: 'title', order: 'desc', label: 'Title Z–A' },
    { sort: 'author', order: 'asc', label: 'Author A–Z' },
    { sort: 'author', order: 'desc', label: 'Author Z–A' },
    { sort: 'classification', order: 'asc', label: 'Classification low–high' },
    { sort: 'classification', order: 'desc', label: 'Classification high–low' },
    { sort: 'createdAt', order: 'desc', label: 'Date added newest' },
    { sort: 'createdAt', order: 'asc', label: 'Date added oldest' },
    { sort: 'availability', order: 'asc', label: 'Available first' },
    { sort: 'views', order: 'desc', label: 'Most viewed' },
    { sort: 'views', order: 'asc', label: 'Least viewed' },
  ];
  const changeSort = (field: string, direction: 'asc' | 'desc') => {
    setSort(field);
    setSortOrder(direction);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] lg:pb-8">
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
          <div className={`flex items-start justify-between gap-4 ${isLibrarian ? "mb-3" : "mb-6"}`}>
            <div>
              <h1 className="text-2xl font-bold text-white">E-Books</h1>
              <p className="mt-1 text-sm text-zinc-400">Browse and access digital books</p>
              {showingCached && (
                <p className="mt-2 text-xs text-amber-300">
                  Offline — showing cached e-book details. File downloads require an internet connection.
                </p>
              )}
            </div>
            <HeaderUserActions />
          </div>
          {isLibrarian && (
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add E-Book
              </button>
            </div>
          )}

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
                  placeholder="Search by title, author, or Dewey number..."
                  className="min-h-[44px] w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="w-full md:hidden">
                <MobileSearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search by title, author, or Dewey number..."
                  storageKey="cpc-recent-ebook-searches"
                />
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto lg:hidden">
                <MobileBookTypeSelect current="ebook" className="min-w-0 flex-1 sm:w-[180px] sm:flex-none" />
                <div className="flex shrink-0 items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1">
                  <button
                    onClick={() => setViewPreference('grid')}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === 'grid' ? 'border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewPreference('list')}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === 'list' ? 'border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                    aria-label="List view"
                    aria-pressed={view === 'list'}
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
                  setCategoryFilter('');
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
                  return <option key={category.code} value={categoryId}>{category.name}</option>;
                })}
              </select>

              <div className="hidden items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-1 sm:flex">
                <button
                  onClick={() => setViewPreference('grid')}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === 'grid' ? 'border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewPreference('list')}
                  className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${view === 'list' ? 'border-blue-400/50 bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'border-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                >
                  <List className="h-4 w-4" />
                </button>
                <span className="self-center px-2 text-xs text-zinc-500">
                  {ebooks.length} e-books
                </span>
              </div>
            </div>
            </details>
          </div>

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-72 rounded-2xl bg-zinc-900 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && ebooks.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
              <p className="text-zinc-300 font-medium">No e-books found</p>
              <p className="text-sm text-zinc-500 mt-1">
                {search || categoryFilter ? 'Try adjusting your search or filters' : 'Add an e-book to get started'}
              </p>
            </div>
          )}

          {/* GRID VIEW */}
          {!loading && view === 'grid' && ebooks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedEBooks.map((ebook) => (
                <div key={ebook.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden hover:border-zinc-700 transition-colors">
                  {/* Cover */}
                  <div className="aspect-[3/4] bg-zinc-800 relative">
                    <MediaImage src={ebook.coverImage} alt={ebook.title || "E-book cover"} className="w-full h-full object-cover" fallback={fallbackCover} />
                    <div className="absolute top-3 right-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${formatBadge[ebook.format || ''] || 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30'}`}>
                        {ebook.format}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 sm:p-4">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-4 text-white sm:text-base sm:leading-snug">{ebook.title}</h3>
                    <p className="mt-1 truncate text-xs text-zinc-400 sm:text-sm">{ebook.author}</p>
                    <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5">
                      {ebook.category ? (
                        <span className="max-w-full truncate rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300 sm:px-2 sm:text-xs">{ebook.category.name}</span>
                      ) : (
                        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:px-2 sm:text-xs">General</span>
                      )}
                      {ebook.fileSize && (
                        <span className="text-[10px] text-zinc-500 sm:text-xs">{formatFileSize(ebook.fileSize)}</span>
                      )}
                      {isLibrarian && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:text-xs ${
                          ebook.status === 'AVAILABLE'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-orange-500/15 text-orange-400'
                        }`}>
                          {ebook.status === 'AVAILABLE' ? 'Available' : 'Not Available'}
                        </span>
                      )}
                    </div>
                    {isLibrarian && (
                      <p className="mt-2 text-xs text-zinc-400">
                        {ebook.totalViews ?? 0} total views
                      </p>
                    )}
                    <div className="mt-2 flex flex-col items-stretch gap-2 min-[400px]:flex-row">
                      {isLibrarian ? (
                        <>
                          <button
                            onClick={() => handleEdit(ebook)}
                            className="flex min-h-9 min-w-0 flex-1 whitespace-nowrap items-center justify-center gap-1 rounded-lg bg-zinc-800 px-2 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                          >
                            <Pencil className="h-4 w-4 shrink-0" />
                            <span>Edit</span>
                          </button>
                          <div className="flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-800 px-2 text-xs text-zinc-300">
                            <AvailabilitySwitch
                              checked={ebook.status === 'AVAILABLE'}
                              disabled={togglingStatusId !== null}
                              label={`Availability for ${ebook.title}`}
                              onChange={(available) => void handleToggleAvailability(ebook, available)}
                            />
                            <span>{ebook.status === 'AVAILABLE' ? 'Available' : 'Not available'}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void showViewLogs(ebook)}
                            className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-zinc-800 px-2 text-xs text-zinc-200 hover:bg-zinc-700"
                          >
                            <Eye className="h-4 w-4" /> {ebook.totalViews ?? 0} views
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => void openEBook(ebook)}
                            disabled={!isEBookAvailable(ebook)}
                            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed sm:gap-1.5 sm:px-3 sm:text-sm"
                          >
                            <BookOpen className="w-4 h-4" /> {isEBookAvailable(ebook) ? 'View' : 'Unavailable'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LIST VIEW */}
          {!loading && view === 'list' && ebooks.length > 0 && (
            <>
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-xl shadow-black/10 md:block">
              <div className="overflow-x-auto">
                <table className={`w-full table-fixed text-sm ${isLibrarian ? 'min-w-[1080px]' : 'min-w-[760px]'}`}>
                  <thead>
                    <tr className="bg-zinc-900/95 text-left text-[11px] uppercase tracking-wider text-zinc-400">
                      <th className="w-[76px] px-4 py-3 font-medium">Cover</th>
                      <th className="w-[240px] px-4 py-3 font-medium"><SortHeader field="title" sort={sort} order={sortOrder} onSort={(field) => changeSort(field, nextSortOrder(sort, sortOrder, field))}>Title</SortHeader></th>
                      <th className="w-[190px] px-4 py-3 font-medium"><SortHeader field="author" sort={sort} order={sortOrder} onSort={(field) => changeSort(field, nextSortOrder(sort, sortOrder, field))}>Author</SortHeader></th>
                      <th className="w-[170px] px-4 py-3 font-medium">Category</th>
                      <th className="w-[100px] px-4 py-3 font-medium">Format</th>
                      {isLibrarian && <th className="w-[130px] px-4 py-3 font-medium"><SortHeader field="views" sort={sort} order={sortOrder} onSort={(field) => changeSort(field, nextSortOrder(sort, sortOrder, field))}>Views</SortHeader></th>}
                      {isLibrarian && <th className="w-[175px] px-4 py-3 font-medium">Status</th>}
                      <th className="w-[120px] px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEBooks.map((ebook) => (
                      <tr key={ebook.id} className="border-t border-zinc-800/70 transition-colors even:bg-zinc-950/20 hover:bg-blue-500/[0.04]">
                        <td className="px-4 py-4">
                          <div className="h-16 w-12 overflow-hidden rounded-lg bg-zinc-800 shadow-md shadow-black/20">
                            <MediaImage src={ebook.coverImage} alt={ebook.title || "E-book cover"} className="w-full h-full object-cover" fallback={<div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-zinc-600" /></div>} />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="line-clamp-2 break-words font-medium leading-5 text-zinc-100">{ebook.title}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">{ebook.publisher || '—'}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="line-clamp-2 break-words text-sm leading-5 text-zinc-300">{ebook.author || '—'}</span>
                        </td>
                        <td className="px-4 py-4">
                          {ebook.category ? (
                            <span title={ebook.category.name || ''} className="inline-block max-w-full truncate rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-200 ring-1 ring-blue-500/20">{ebook.category.name}</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">General</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${formatBadge[ebook.format || ''] || 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30'}`}>
                            {ebook.format}
                          </span>
                        </td>
                        {isLibrarian && (
                          <td className="whitespace-nowrap px-4 py-4 text-xs text-zinc-300">
                            <button
                              type="button"
                              onClick={() => void showViewLogs(ebook)}
                              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-zinc-100 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
                              aria-label={`View ${ebook.totalViews ?? 0} views for ${ebook.title}`}
                            >
                              <Eye className="h-3.5 w-3.5 text-zinc-400" />
                              {ebook.totalViews ?? 0} views
                            </button>
                          </td>
                        )}
                        {isLibrarian && (
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <AvailabilitySwitch
                                checked={ebook.status === 'AVAILABLE'}
                                disabled={togglingStatusId !== null}
                                label={`Availability for ${ebook.title}`}
                                onChange={(available) => void handleToggleAvailability(ebook, available)}
                              />
                              <span className="whitespace-nowrap text-xs text-zinc-300">{ebook.status === 'AVAILABLE' ? 'Available' : 'Not available'}</span>
                            </div>
                          </td>
                        )}
                        <td className="px-4 py-4 text-right">
                          {isLibrarian ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleEdit(ebook)}
                                className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                                aria-label="Edit"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => void openEBook(ebook)}
                                disabled={!isEBookAvailable(ebook)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <BookOpen className="w-3.5 h-3.5" /> {isEBookAvailable(ebook) ? 'View' : 'Unavailable'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <ResponsiveTable mobile={
              paginatedEBooks.map((ebook) => (
                <article key={ebook.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10">
                  <div className="flex items-start gap-3 border-b border-zinc-800/80 pb-3"><div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-800"><MediaImage src={ebook.coverImage} alt={ebook.title || "E-book cover"} className="h-full w-full object-cover" fallback={<ImageIcon className="m-3 h-5 w-5 text-zinc-600" />} /></div><div className="min-w-0"><p className="font-semibold text-zinc-100 break-words">{ebook.title}</p><p className="mt-1 text-sm text-zinc-500 break-words">{ebook.author}</p></div></div>
                  <div className="grid grid-cols-2 gap-3 py-4 text-sm"><div><p className="text-xs text-zinc-500">Category</p><p className="mt-1 text-zinc-300">{ebook.category?.name || "General"}</p></div><div><p className="text-xs text-zinc-500">Format</p><p className="mt-1 text-zinc-300">{ebook.format}</p></div></div>
                  {isLibrarian && <p className="mt-2 text-xs text-zinc-400">{ebook.totalViews ?? 0} total views</p>}
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${isEBookAvailable(ebook) ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' : 'bg-orange-500/15 text-orange-400 ring-orange-500/30'}`}>{isEBookAvailable(ebook) ? 'Available' : 'Unavailable'}</span>{isLibrarian ? <div className="flex items-center gap-3"><button onClick={() => handleEdit(ebook)} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200">Edit</button><AvailabilitySwitch checked={ebook.status === 'AVAILABLE'} disabled={togglingStatusId !== null} label={`Availability for ${ebook.title}`} onChange={(available) => void handleToggleAvailability(ebook, available)} /><button onClick={() => void showViewLogs(ebook)} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800" aria-label={`View recent visitors for ${ebook.title}`} title="Recent visitors"><Eye className="h-4 w-4" /></button></div> : <button onClick={() => void openEBook(ebook)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white" disabled={!isEBookAvailable(ebook)}>{isEBookAvailable(ebook) ? 'View' : 'Unavailable'}</button>}</div>
                </article>
              ))
            } />
            </>
          )}

          {/* Pagination */}
          {!loading && ebooks.length > 0 && (
            <div className="hidden items-center justify-between mt-6 md:flex">
              <p className="text-sm text-zinc-500">
                Showing{' '}
                <span className="text-zinc-300">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, ebooks.length)}
                </span>{' '}
                of <span className="text-zinc-300">{ebooks.length}</span> e-books
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
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
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
          {!loading && ebooks.length > 0 && currentPage < totalPages && (
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} className="mt-4 min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 md:hidden">
              Load more e-books
            </button>
          )}
        </div>
      </div>

      <AddEBookModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        categories={categories}
        onSuccess={() => {
          setSuccessMsg('E-book added successfully.');
          loadData();
        }}
      />

      <EditEBookModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        ebook={selectedEBook}
        categories={categories}
        onSuccess={handleEditSuccess}
      />
      {viewLogEBook && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <button
            type="button"
            aria-label="Close view activity"
            onClick={() => setViewLogEBook(null)}
            className="absolute inset-0"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ebook-view-activity-title"
            className="relative z-10 max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 id="ebook-view-activity-title" className="font-semibold text-white">E-book views</h2>
                <p className="mt-1 text-sm text-zinc-400">{viewLogEBook.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewLogEBook(null)}
                className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              {loadingViewLogs ? (
                <p className="text-sm text-zinc-400">Loading view activity…</p>
              ) : viewLogsError ? (
                <p role="alert" className="text-sm text-red-300">{viewLogsError}</p>
              ) : viewLogs ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                      <p className="text-xs text-zinc-500">Total views</p>
                      <p className="mt-1 text-2xl font-semibold text-white">{viewLogs.totalViews}</p>
                    </div>
                  </div>
                  <h3 className="mt-6 text-sm font-semibold text-zinc-200">Top 3 recent visitors</h3>
                  {viewLogs.recentActivity?.length ? (
                    <ul className="mt-3 divide-y divide-zinc-800">
                      {viewLogs.recentActivity.map((activity, index) => (
                        <li key={`${activity.user.id}-${activity.viewedAt}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <div>
                            <p className="text-zinc-200">{activity.user.firstName} {activity.user.lastName}</p>
                            <p className="text-xs text-zinc-500">{activity.user.libraryId}</p>
                          </div>
                          <time className="shrink-0 text-xs text-zinc-500">{new Date(activity.viewedAt).toLocaleString()}</time>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">No views recorded yet.</p>
                  )}
                </>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
