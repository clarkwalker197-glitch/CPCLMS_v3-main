"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useDebounce } from "@/lib/useDebounce";
import Sidebar from "@/components/Sidebar";
import HeaderUserActions from "@/components/HeaderUserActions";
import ResponsiveTable from "@/components/ResponsiveTable";
import UserAvatar from "@/components/UserAvatar";
import { SortHeader, SortSelect, nextSortOrder, type SortOption } from "@/components/SortControls";
import BorrowHistoryCard from "@/components/BorrowHistoryCard";
import { QRDisplayModal } from "@/components/QRDisplayModal";
import { QRScanner } from "@/components/QRScanner";
import { ModalLayer } from "@/components/ModalLayer";
import { useConfirmDialog } from "@/components/ui/ConfirmModal";
import { formatBorrowId, normalizeBorrowId } from "@/lib/borrow-id";
import { parseApprovalInput } from "@/lib/qr-approval";
import { offlineDb } from "@/lib/offline-db";
import {
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  QrCode,
} from "lucide-react";

const PAGE_SIZE = 10;
const REQUEST_PAGE_SIZE = 5;

const txnStatusBadge: Record<string, string> = {
  ACTIVE: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  RETURNED: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  OVERDUE: "bg-red-500/15 text-red-400 ring-red-500/30",
  MISSING: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  PENDING: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
};
const txnStatusLabel: Record<string, string> = {
  ACTIVE: "Borrowed",
  RETURNED: "Returned",
  OVERDUE: "Overdue",
  MISSING: "Missing",
  PENDING: "Pending",
};

// ── Request status styling ──
const reqStatusBadge: Record<string, string> = {
  PENDING: "request-status-badge request-status-pending",
  APPROVED: "request-status-badge request-status-approved",
  REJECTED: "request-status-badge request-status-rejected",
  CANCELLED: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
};
const reqStatusLabel: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function requestStatusText(request: any): string {
  return reqStatusLabel[request.status] || request.status;
}

export default function RequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const isLibrarian = user?.role === "LIBRARIAN";

  // Borrowed books remain available to students and faculty only.
  const [txns, setTxns] = useState<any[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnLoading, setTxnLoading] = useState(true);
  const [txnSearch, setTxnSearch] = useState("");
  const [txnStatusFilter, setTxnStatusFilter] = useState("");
  const [txnPage, setTxnPage] = useState(1);
  const [txnSort, setTxnSort] = useState("status");
  const [txnSortOrder, setTxnSortOrder] = useState<"asc" | "desc">("asc");
  const [showingCachedTransactions, setShowingCachedTransactions] = useState(false);

  // Librarian-only active borrowed books
  const [activeTxns, setActiveTxns] = useState<any[]>([]);
  const [activeTxnTotal, setActiveTxnTotal] = useState(0);
  const [activeTxnLoading, setActiveTxnLoading] = useState(true);
  const [activeTxnSearch, setActiveTxnSearch] = useState("");
  const [activeTxnPage, setActiveTxnPage] = useState(1);
  const [activeTxnSort, setActiveTxnSort] = useState("dueDate");
  const [activeTxnSortOrder, setActiveTxnSortOrder] = useState<"asc" | "desc">("asc");
  const [returnTarget, setReturnTarget] = useState<any>(null);
  const [returnError, setReturnError] = useState("");
  const [missingTarget, setMissingTarget] = useState<any>(null);
  const [missingReason, setMissingReason] = useState("");
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState("");

  // Borrow requests
  const [records, setRecords] = useState<any[]>([]);
  const [reqTotal, setReqTotal] = useState(0);
  const [reqLoading, setReqLoading] = useState(true);
  const [reqSearch, setReqSearch] = useState("");
  const [reqStatusFilter, setReqStatusFilter] = useState("");
  const [reqPage, setReqPage] = useState(1);
  const [reqSort, setReqSort] = useState("status");
  const [reqSortOrder, setReqSortOrder] = useState<"asc" | "desc">("asc");
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");
  const [showingCachedRequests, setShowingCachedRequests] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);

  // Debounced search/filter values (300ms) to avoid per-keystroke API spam
  const debouncedReqSearch = useDebounce(reqSearch, 300);
  const debouncedReqStatus = useDebounce(reqStatusFilter, 300);

  const debouncedTxnSearch = useDebounce(txnSearch, 300);
  const debouncedTxnStatus = useDebounce(txnStatusFilter, 300);
  const debouncedActiveTxnSearch = useDebounce(activeTxnSearch, 300);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reject Borrow Request modal state (librarian only)
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState("");

  useEffect(() => {
    const openScanner = () => {
      setTransactionLookupError("");
      setScannedBorrowId("");
      setTransactionScannerOpen(true);
    };
    window.addEventListener("cpc:open-qr", openScanner);
    if (new URLSearchParams(window.location.search).get("mobileScan") === "1") {
      openScanner();
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () => window.removeEventListener("cpc:open-qr", openScanner);
  }, []);

  const [approvalReceipt, setApprovalReceipt] = useState<any | null>(null);
  const [transactionLookupId, setTransactionLookupId] = useState("");
  const [transactionScannerOpen, setTransactionScannerOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [scannedBorrowId, setScannedBorrowId] = useState("");
  const [scannedApproval, setScannedApproval] = useState<{ requestId: string; token: string; approvalCode: string } | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const updateLayout = () => setIsMobileLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);
  const [transactionLookupError, setTransactionLookupError] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (isLibrarian) return;
    setTxnLoading(true);
    const applyCachedTransactions = (cachedTransactions: any[]) => {
      const search = debouncedTxnSearch.trim().toLocaleLowerCase();
      const filtered = cachedTransactions
        .filter((transaction: any) => {
          const searchable = [
            transaction.book?.title,
            transaction.book?.author,
            transaction.book?.accessionNo,
          ].some((value) => String(value || "").toLocaleLowerCase().includes(search));
          return (!search || searchable) &&
            (!debouncedTxnStatus || transaction.status === debouncedTxnStatus);
        })
        .sort((left: any, right: any) => {
          const leftValue = left[txnSort] ?? "";
          const rightValue = right[txnSort] ?? "";
          const comparison = txnSort === "fineAmount"
            ? Number(leftValue) - Number(rightValue)
            : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
          return txnSortOrder === "desc" ? -comparison : comparison;
        });
      setTxns(filtered);
      setTxnTotal(filtered.length);
      setShowingCachedTransactions(cachedTransactions.length > 0);
      return cachedTransactions.length > 0;
    };
    try {
      const cachedTransactions = user
        ? await offlineDb.transactions.where("userId").equals(user.id).toArray()
        : [];

      if (!navigator.onLine) {
        if (!applyCachedTransactions(cachedTransactions)) setError("No synchronized borrowed books are available offline.");
        return;
      }

      const params: Record<string, string> = {
        page: "1",
        limit: "100",
      };
      params.sort = txnSort;
      params.order = txnSortOrder;

      const res = await api.get<any>(`/transactions?${new URLSearchParams(params).toString()}`);
      if (res.success) {
        const serverTransactions = ((res.data as any[]) || []).map((transaction: any) => ({
          ...transaction,
          userId: transaction.userId || user?.id,
        }));
        setTxns(serverTransactions);
        setTxnTotal(res.meta?.total ?? ((res.data as any[]) || []).length);
        if (user) await offlineDb.transactions.bulkPut(serverTransactions);
        setShowingCachedTransactions(false);
      } else {
        if (!applyCachedTransactions(cachedTransactions)) setError(res.error || "Failed to load borrowed books");
      }
    } catch {
      const cachedTransactions = user
        ? await offlineDb.transactions.where("userId").equals(user.id).toArray()
        : [];
      if (!cachedTransactions.length) setError("Failed to load borrowed books");
      else applyCachedTransactions(cachedTransactions);
    } finally {
      setTxnLoading(false);
    }
  }, [debouncedTxnSearch, debouncedTxnStatus, isLibrarian, txnPage, txnSort, txnSortOrder, user]);

  const loadActiveTransactions = useCallback(async () => {
    if (!isLibrarian) return;
    setActiveTxnLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(activeTxnPage),
        limit: String(PAGE_SIZE),
        status: "ACTIVE,OVERDUE,MISSING",
      };
      if (debouncedActiveTxnSearch) params.search = debouncedActiveTxnSearch;
      params.sort = activeTxnSort;
      params.order = activeTxnSortOrder;
      const res = await api.get<any>(`/transactions?${new URLSearchParams(params).toString()}`);
      if (res.success) {
        setActiveTxns((res.data as any[]) || []);
        setActiveTxnTotal(res.meta?.total ?? ((res.data as any[]) || []).length);
      } else {
        setError(res.error || "Failed to load active borrowed books");
      }
    } catch {
      setError("Failed to load active borrowed books");
    } finally {
      setActiveTxnLoading(false);
    }
  }, [activeTxnPage, debouncedActiveTxnSearch, isLibrarian, activeTxnSort, activeTxnSortOrder]);

  useEffect(() => {
    if (!isLibrarian) loadTransactions();
  }, [isLibrarian, loadTransactions]);

  useEffect(() => {
    if (isLibrarian) loadActiveTransactions();
  }, [isLibrarian, loadActiveTransactions]);

  useEffect(() => {
    setTxnPage(1);
  }, [debouncedTxnSearch, debouncedTxnStatus]);

  useEffect(() => {
    setActiveTxnPage(1);
  }, [debouncedActiveTxnSearch]);

  // ── Load borrow requests ──
  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const cachedRecords = user
        ? (await offlineDb.borrowRequests.where("userId").equals(user.id).toArray())
          .filter((request: any) => !request._pending && !String(request.id).startsWith("local-borrow-"))
        : [];
      if (!navigator.onLine) {
        if (cachedRecords.length) {
          setRecords(cachedRecords);
          setReqTotal(cachedRecords.length);
        }
        setShowingCachedRequests(true);
        return;
      }

      const params: Record<string, string> = {
        page: String(reqPage),
        limit: String(REQUEST_PAGE_SIZE),
      };
      if (debouncedReqSearch) params.search = debouncedReqSearch;
      if (debouncedReqStatus) params.status = debouncedReqStatus;
      params.sort = reqSort;
      params.order = reqSortOrder;

      const res = await api.getBorrowRequests(params);
      if (res.success) {
        const serverRecords = (res.data as any[]) || [];
        await offlineDb.borrowRequests.bulkPut(serverRecords.map((request: any) => ({
          ...request,
          userId: request.userId || user?.id,
        })));
        setRecords(serverRecords);
        setReqTotal(res.meta?.total ?? serverRecords.length);
        setShowingCachedRequests(false);
      } else if (res.rateLimited) {
        setError("You're moving too fast. Please wait a moment and try again.");
      } else if (res.networkError && cachedRecords.length) {
        setRecords(cachedRecords);
        setReqTotal(cachedRecords.length);
        setShowingCachedRequests(true);
      } else {
        setError(res.error || "Failed to load borrow requests");
      }
    } catch {
      if (navigator.onLine) setError("Failed to load borrow requests");
      else setShowingCachedRequests(true);
    } finally {
      setReqLoading(false);
    }
  }, [debouncedReqSearch, debouncedReqStatus, isLibrarian, reqPage, reqSort, reqSortOrder, user]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    const transactionId = approvalReceipt?.transactionId;
    if (!transactionId) return;

    let cancelled = false;
    let timeoutId = 0;
    const checkVerification = async () => {
      const response = await api.getBorrowRequestBatch(transactionId).catch(() => null);
      if (!cancelled && response?.success) {
        setApprovalReceipt(null);
        setSuccessMsg(`Borrow ID ${formatBorrowId(transactionId)} verified. Books are now active.`);
        await Promise.all([loadRequests(), loadActiveTransactions()]);
        setTimeout(() => setSuccessMsg(""), 4000);
        return;
      }

      if (!cancelled) timeoutId = window.setTimeout(() => void checkVerification(), 3000);
    };

    timeoutId = window.setTimeout(() => void checkVerification(), 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [approvalReceipt?.transactionId, loadActiveTransactions, loadRequests]);

  useEffect(() => {
    setReqPage(1);
  }, [debouncedReqSearch, debouncedReqStatus]);

  const txnSortOptions: SortOption[] = [
    { sort: "borrowDate", order: "desc", label: "Borrow date newest" },
    { sort: "borrowDate", order: "asc", label: "Borrow date oldest" },
    { sort: "dueDate", order: "asc", label: "Due date soonest" },
    { sort: "dueDate", order: "desc", label: "Due date latest" },
    { sort: "status", order: "asc", label: "Overdue, active, returned" },
    { sort: "status", order: "desc", label: "Returned, active, overdue" },
    { sort: "fineAmount", order: "desc", label: "Fine high–low" },
    { sort: "fineAmount", order: "asc", label: "Fine low–high" },
  ];
  const requestSortOptions: SortOption[] = [
    { sort: "status", order: "asc", label: "Pending first" },
    { sort: "status", order: "desc", label: "Pending last" },
    { sort: "requestDate", order: "desc", label: "Request date newest" },
    { sort: "requestDate", order: "asc", label: "Request date oldest" },
    { sort: "memberName", order: "asc", label: "Member name A–Z" },
    { sort: "memberName", order: "desc", label: "Member name Z–A" },
  ];
  const changeTxnSort = (field: string, direction: "asc" | "desc") => {
    setTxnSort(field);
    setTxnSortOrder(direction);
    setTxnPage(1);
  };
  const changeActiveTxnSort = (field: string, direction: "asc" | "desc") => {
    setActiveTxnSort(field);
    setActiveTxnSortOrder(direction);
    setActiveTxnPage(1);
  };
  const changeRequestSort = (field: string, direction: "asc" | "desc") => {
    setReqSort(field);
    setReqSortOrder(direction);
    setReqPage(1);
  };

  const openReturnModal = (record: any) => {
    setReturnTarget(record);
    setReturnError("");
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    if (actionLoadingId) return;
    setActionLoadingId(returnTarget.id);
    setReturnError("");
    try {
      const res = await api.returnBook(returnTarget.id);
      if (res.success) {
        setReturnTarget(null);
        setSuccessMsg("Book returned successfully");
        if (isLibrarian) loadActiveTransactions();
        else loadTransactions();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setReturnError(res.error || "Failed to return book");
      }
    } catch {
      setReturnError("Failed to return book");
    } finally {
      setActionLoadingId(null);
    }
  };

  const openMissingModal = (record: any) => {
    setMissingTarget(record);
    setMissingReason("");
    setMissingError("");
  };

  const handleDeclareMissing = async () => {
    if (!missingTarget) return;
    setMissingLoading(true);
    setMissingError("");
    try {
      const res = await api.declareMissing(missingTarget.id, missingReason || undefined);
      if (res.success) {
        setMissingTarget(null);
        setSuccessMsg("Book declared missing");
        loadActiveTransactions();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setMissingError(res.error || "Failed to declare book missing");
      }
    } catch {
      setMissingError("Failed to declare book missing");
    } finally {
      setMissingLoading(false);
    }
  };

// ── Borrow requests actions ──
  const approveListedBatch = async (request: any) => {
    const requestBatchId = request.requestBatchId || request.transactionId;
    if (!requestBatchId) {
      setError("This request is missing its batch ID. Apply the latest database migration and refresh.");
      return;
    }
    setActionLoadingId(request.id);
    try {
      const response = await api.approveBorrowRequestBatch(requestBatchId);
      if (!response.success) {
        setError(response.error || "Failed to approve borrow transaction");
        return;
      }
      setApprovalReceipt(response.data);
      setSuccessMsg(`Borrow ID ${formatBorrowId(response.data?.transactionId || "")}: QR generated. Request remains Pending until the borrower verifies it.`);
      loadRequests();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch {
      setError("Failed to approve borrow transaction");
    } finally {
      setActionLoadingId(null);
    }
  };

  const cancelBorrowRequest = async (book: { requestId?: string; title?: string | null }) => {
    const requestId = book.requestId;
    if (isLibrarian || !requestId) return;
    if (!navigator.onLine || showingCachedRequests) {
      setError("Connect to the internet and refresh your requests before cancelling.");
      return;
    }

    setError("");
    setCancellingRequestId(requestId);
    try {
      await confirm({
        title: "Cancel this request?",
        description: `Cancel your borrow request for “${book.title?.trim() || "this book"}”?`,
        confirmLabel: "Cancel request",
        variant: "danger",
        onConfirm: async () => {
          try {
            const response = await api.cancelBorrowRequest(requestId);
            if (!response.success) {
              throw new Error(response.error || "Unable to cancel this request. Refresh and try again.");
            }
            await loadRequests();
            setSuccessMsg("Borrow request cancelled.");
            setTimeout(() => setSuccessMsg(""), 6000);
          } finally {
            setCancellingRequestId(null);
          }
        },
      });
    } finally {
      setCancellingRequestId(null);
    }
  };

  const openRejectModal = (request: any) => {
    setRejectTarget(request);
    setRejectReason("");
    setRejectError("");
  };

  const verifyBorrowId = async (value: string) => {
    const borrowId = normalizeBorrowId(value);
    if (!borrowId) {
      setTransactionLookupError("Enter or scan a valid Borrow ID, such as BRW-1234-5678.");
      return;
    }
    setTransactionLookupError("");
    setVerificationLoading(true);
    try {
      const response = await api.verifyBorrowRequest(borrowId);
      if (!response.success) {
        setTransactionLookupError(response.error || "Could not verify this Borrow ID.");
        return;
      }
      setTransactionScannerOpen(false);
      setScannedBorrowId("");
      setTransactionLookupId("");
      setSuccessMsg(`Borrow ID ${formatBorrowId(borrowId)} verified. Your request is approved.`);
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(35);
      await Promise.all([loadRequests(), loadTransactions()]);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch {
      setTransactionLookupError("Could not verify this Borrow ID. Please try again.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const verifyScannedApproval = async (approval: { requestId: string; token: string; approvalCode: string }) => {
    setTransactionLookupError("");
    setVerificationLoading(true);
    try {
      const response = await api.approveByQRCode(
        approval.requestId,
        approval.token,
        approval.approvalCode,
      );
      if (!response.success) {
        setTransactionLookupError(response.error || "Could not verify this QR approval.");
        return;
      }
      setTransactionScannerOpen(false);
      setScannedApproval(null);
      setScannedBorrowId("");
      setSuccessMsg(`Borrow ID ${formatBorrowId(approval.approvalCode)} verified. Your request is approved.`);
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(35);
      await Promise.all([loadRequests(), loadTransactions()]);
      setTimeout(() => setSuccessMsg(""), 5000);
    } catch {
      setTransactionLookupError("Could not verify this QR approval. Please try again.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleTransactionLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyBorrowId(transactionLookupId);
  };

  const handleTransactionScan = async (value: string) => {
    if (value.includes("://")) {
      const parsed = parseApprovalInput(value);
      if (!parsed.approvalCode || !parsed.requestId || !parsed.token) {
        setTransactionLookupError(parsed.error || "This QR code is invalid or expired.");
        return;
      }
      const approval = {
        requestId: parsed.requestId,
        token: parsed.token,
        approvalCode: parsed.approvalCode,
      };
      const borrowId = normalizeBorrowId(parsed.approvalCode);
      if (!borrowId) {
        setTransactionLookupError("This QR code does not contain a valid Borrow ID.");
        return;
      }
      setTransactionScannerOpen(false);
      if (isMobileLayout) {
        setScannedApproval(approval);
        setScannedBorrowId(borrowId);
      } else {
        await verifyScannedApproval(approval);
      }
      return;
    }

    const borrowId = normalizeBorrowId(value);
    if (!borrowId) {
      setTransactionLookupError("Enter or scan a valid Borrow ID, such as BRW-1234-5678.");
      return;
    }
    setTransactionScannerOpen(false);
    if (!isMobileLayout) {
      await verifyBorrowId(borrowId);
      return;
    }
    setScannedBorrowId(borrowId);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("A rejection reason is required");
      return;
    }
    setRejectLoading(true);
    setRejectError("");
    try {
      const res = await api.rejectRequest(rejectTarget.id, reason);
      if (res.success) {
        setRejectTarget(null);
        setRejectReason("");
        setSuccessMsg(rejectTarget.transactionId ? "Borrow transaction rejected" : "Borrow request rejected");
        loadRequests();
        setTimeout(() => setSuccessMsg(""), 4000);
      } else {
        setRejectError(res.error || "Failed to reject request");
      }
    } catch {
      setRejectError("Failed to reject request");
    } finally {
      setRejectLoading(false);
    }
  };

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";

  const reqTotalPages = Math.max(1, Math.ceil(reqTotal / REQUEST_PAGE_SIZE));
  const myBooks = txns
    .filter((transaction: any) => {
      const searchTerm = txnSearch.trim().toLocaleLowerCase();
      const matchesSearch = !searchTerm || [
        transaction.book?.title,
        transaction.book?.author,
        transaction.book?.accessionNo,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(searchTerm));
      const matchesStatus = !txnStatusFilter || transaction.status === txnStatusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((left: any, right: any) => {
      const leftValue = left[txnSort] ?? "";
      const rightValue = right[txnSort] ?? "";
      const comparison = txnSort === "fineAmount"
        ? Number(leftValue) - Number(rightValue)
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      return txnSortOrder === "desc" ? -comparison : comparison;
    });
  const myBooksTotalPages = Math.max(1, Math.ceil(myBooks.length / PAGE_SIZE));
  const displayedMyBooks = myBooks.slice((txnPage - 1) * PAGE_SIZE, txnPage * PAGE_SIZE);

  const getReqPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, reqPage - Math.floor(maxVisible / 2));
    const end = Math.min(reqTotalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] lg:pb-8 ${isLibrarian ? "flex flex-col" : ""}`}>
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

                    {!isLibrarian && (
                      <div className="mb-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div>
                            <h1 className="text-2xl font-bold text-white">My Borrowed Books</h1>
                            <p className="text-sm text-zinc-400 mt-1">Your currently borrowed and recently returned books · {txnTotal} record{txnTotal !== 1 ? "s" : ""}</p>
                            {showingCachedTransactions && (
                              <p className="mt-2 text-xs text-amber-300">
                                Offline — showing your last synchronized borrowed books.
                              </p>
                            )}
                          </div>
                          <HeaderUserActions />
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-4">
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1 relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="w-5 h-5 text-zinc-500" /></div>
                              <input
                                type="text"
                                value={txnSearch}
                                onChange={(e) => setTxnSearch(e.target.value)}
                                placeholder="Search by book title..."
                                className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                              />
                            </div>
                            <select
                              value={txnStatusFilter}
                              onChange={(e) => setTxnStatusFilter(e.target.value)}
                              className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition appearance-none"
                            >
                              <option value="" className="bg-zinc-900 text-white">All Status</option>
                              <option value="PENDING" className="bg-zinc-900 text-white">Pending</option>
                              <option value="ACTIVE" className="bg-zinc-900 text-white">Borrowed</option>
                              <option value="OVERDUE" className="bg-zinc-900 text-white">Overdue</option>
                              <option value="RETURNED" className="bg-zinc-900 text-white">Returned</option>
                              <option value="MISSING" className="bg-zinc-900 text-white">Missing</option>
                            </select>
                            <SortSelect options={txnSortOptions} sort={txnSort} order={txnSortOrder} onChange={changeTxnSort} />
                          </div>
                        </div>

                        {txnLoading && <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-zinc-900 animate-pulse border-b border-zinc-800/40" />)}</div>}
                        {!txnLoading && displayedMyBooks.length === 0 && (
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-16 text-center">
                            <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
                            <p className="text-zinc-300 font-medium">No borrowed books found</p>
                            <p className="text-sm text-zinc-500 mt-1">{txnSearch || txnStatusFilter ? "Try adjusting your search or filters" : "Borrowed books will appear here"}</p>
                          </div>
                        )}
                        {!txnLoading && displayedMyBooks.length > 0 && (
                          <>
                          <div className="hidden md:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead><tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                                  <th className="px-6 py-3 font-medium">Book</th><th className="px-6 py-3 font-medium hidden sm:table-cell">Accession</th><th className="px-6 py-3 font-medium hidden sm:table-cell"><SortHeader field="borrowDate" sort={txnSort} order={txnSortOrder} onSort={(field) => changeTxnSort(field, nextSortOrder(txnSort, txnSortOrder, field))}>Borrow Date</SortHeader></th><th className="px-6 py-3 font-medium hidden md:table-cell"><SortHeader field="dueDate" sort={txnSort} order={txnSortOrder} onSort={(field) => changeTxnSort(field, nextSortOrder(txnSort, txnSortOrder, field))}>Due Date</SortHeader></th><th className="px-6 py-3 font-medium hidden md:table-cell">Return / Missing Date</th><th className="px-6 py-3 font-medium"><SortHeader field="status" sort={txnSort} order={txnSortOrder} onSort={(field) => changeTxnSort(field, nextSortOrder(txnSort, txnSortOrder, field))}>Status</SortHeader></th><th className="px-6 py-3 font-medium"><SortHeader field="fineAmount" sort={txnSort} order={txnSortOrder} onSort={(field) => changeTxnSort(field, nextSortOrder(txnSort, txnSortOrder, field))}>Fine</SortHeader></th>
                                </tr></thead>
                                <tbody>{displayedMyBooks.map((txn: any) => <tr key={txn.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                                  <td className="px-6 py-4"><p className="text-zinc-100 font-medium">{txn.book?.title || "Unknown"}</p><p className="text-xs text-zinc-500">{txn.book?.author || ""}</p></td>
                                  <td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">{txn.book?.accessionNo || "—"}</td><td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">{formatDate(txn.borrowDate)}</td><td className="px-6 py-4 text-zinc-400 hidden md:table-cell">{formatDate(txn.dueDate)}</td><td className="px-6 py-4 text-zinc-400 hidden md:table-cell">{formatDate(txn.returnDate)}</td>
                                  <td className="px-6 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${txnStatusBadge[txn.status] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30"}`}>{txnStatusLabel[txn.status] || txn.status}</span></td>
                                  <td className="px-6 py-4"><span className={`font-medium ${txn.finePaid ? "text-emerald-400" : txn.fineAmount > 0 ? "text-amber-400" : "text-zinc-500"}`}>{txn.fineAmount ? `₱${txn.fineAmount.toFixed(2)} · ${txn.finePaid ? "Paid" : "Unpaid"}` : "—"}</span></td>
                                </tr>)}</tbody>
                              </table>
                            </div>
                          </div>
                          <div className="space-y-0 md:hidden">
                            {displayedMyBooks.map((txn: any) => (
                              <div key={txn.id} className="mb-4 last:mb-0">
                                <BorrowHistoryCard
                                  transaction={txn}
                                  formatDate={formatDate}
                                  statusBadge={txnStatusBadge}
                                  statusLabel={txnStatusLabel}
                                  contextLabel="Borrower"
                                  contextValue={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
                                  onPayFine={!txn._pendingRequest ? async (amount) => {
                                    const response = await api.payFine(txn.id, amount);
                                    if (!response.success) throw new Error(response.error || "Unable to record fine payment.");
                                    setSuccessMsg("Fine paid successfully.");
                                    await loadTransactions();
                                  } : undefined}
                                />
                              </div>
                            ))}
                          </div>
                          </>
                        )}
                        {!txnLoading && myBooks.length > 0 && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <p className="text-sm text-zinc-500">Showing <span className="text-zinc-300">{(txnPage - 1) * PAGE_SIZE + 1}–{Math.min(txnPage * PAGE_SIZE, myBooks.length)}</span> of <span className="text-zinc-300">{myBooks.length}</span> records</p>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setTxnPage((page) => Math.max(1, page - 1))} disabled={txnPage === 1} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
                              <span className="px-2 text-xs text-zinc-500">Page {txnPage} of {myBooksTotalPages}</span>
                              <button onClick={() => setTxnPage((page) => Math.min(myBooksTotalPages, page + 1))} disabled={txnPage >= myBooksTotalPages} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===================================================== */}
                    {/* Borrow Requests */}
          {/* ===================================================== */}
          <div className="order-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">{isLibrarian ? "Borrow Requests" : "My Book Requests"}</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  {isLibrarian ? "Review and manage borrowing transactions" : "Track and manage your borrowing requests"} · {reqTotal} total
                </p>
                {showingCachedRequests && (
                  <p className="mt-2 text-xs text-amber-300">
                    Offline — showing last synchronized requests.
                  </p>
                )}
              </div>
            </div>

            {!isLibrarian && (
              <div className="mb-4 hidden border-b border-zinc-800 pb-4 lg:block">
                <form onSubmit={handleTransactionLookup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="request-transaction-lookup" className="mb-2 block text-sm font-medium text-zinc-200">Scan / Find Transaction</label>
                    <input
                      id="request-transaction-lookup"
                      value={transactionLookupId}
                      onChange={(event) => setTransactionLookupId(event.target.value.toUpperCase().slice(0, 13))}
                      maxLength={13}
                      placeholder="BRW-1234-5678"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <button type="submit" disabled={!normalizeBorrowId(transactionLookupId) || verificationLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <Search className="h-4 w-4" /> {verificationLoading ? "Verifying..." : "Verify"}
                  </button>
                  <button type="button" onClick={() => { setTransactionLookupError(""); setTransactionScannerOpen(true); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-blue-500 hover:text-white">
                    <QrCode className="h-4 w-4" /> Scan QR
                  </button>
                </form>
                {transactionLookupError && <p role="alert" className="mt-2 text-sm text-amber-300">{transactionLookupError}</p>}
              </div>
            )}

            {/* Toolbar */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-5 h-5 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    value={reqSearch}
                    onChange={(e) => setReqSearch(e.target.value)}
                    placeholder="Search by book or member..."
                    className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <select
                  value={reqStatusFilter}
                  onChange={(e) => setReqStatusFilter(e.target.value)}
                  className="px-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition appearance-none"
                >
                  <option value="" className="bg-zinc-900 text-white">All Status</option>
                  <option value="PENDING" className="bg-zinc-900 text-white">Pending</option>
                  <option value="APPROVED" className="bg-zinc-900 text-white">Approved</option>
                  <option value="REJECTED" className="bg-zinc-900 text-white">Rejected</option>
                  <option value="CANCELLED" className="bg-zinc-900 text-white">Cancelled</option>
                </select>
                <SortSelect options={requestSortOptions} sort={reqSort} order={reqSortOrder} onChange={changeRequestSort} />
              </div>
            </div>

            {reqLoading && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 bg-zinc-900 animate-pulse border-b border-zinc-800/40" />
                ))}
              </div>
            )}

            {!reqLoading && records.length === 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
                <p className="text-zinc-300 font-medium">No borrow requests found</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {reqSearch || reqStatusFilter ? "Try adjusting your search or filters" : "Borrow requests will appear here"}
                </p>
              </div>
            )}

            {!reqLoading && records.length > 0 && (
              <>
              <div className="hidden md:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-6 py-3 font-medium">{isLibrarian ? "Books / Transaction" : "Book"}</th>
                        <th className="px-6 py-3 font-medium hidden md:table-cell"><SortHeader field="memberName" sort={reqSort} order={reqSortOrder} onSort={(field) => changeRequestSort(field, nextSortOrder(reqSort, reqSortOrder, field))}>Member</SortHeader></th>
                        <th className="px-6 py-3 font-medium hidden sm:table-cell"><SortHeader field="requestDate" sort={reqSort} order={reqSortOrder} onSort={(field) => changeRequestSort(field, nextSortOrder(reqSort, reqSortOrder, field))}>Request Date</SortHeader></th>
                        <th className="px-6 py-3 font-medium">Notes</th>
                        <th className="px-6 py-3 font-medium"><SortHeader field="status" sort={reqSort} order={reqSortOrder} onSort={(field) => changeRequestSort(field, nextSortOrder(reqSort, reqSortOrder, field))}>Status</SortHeader></th>
                        <th className="px-6 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((req: any) => (
                        <tr key={req.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              {(req.books || []).map((book: any) => (
                                <div key={book.requestId || book.id} className="flex items-start gap-2">
                                  <div>
                                    <p className="text-zinc-100 font-medium">{book.title || "Unknown"}</p>
                                    <p className="text-xs text-zinc-400">{book.author || "Author unavailable"}</p>
                                    <p className="text-xs text-zinc-500">{book.accessionNo || ""}</p>
                                    <p className="text-xs text-zinc-500">{formatDate(req.requestDate)} · {requestStatusText({ status: book.status || req.status })}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-zinc-300 hidden md:table-cell">
                            <div>{req.user?.firstName} {req.user?.lastName}<p className="text-xs text-zinc-500">{req.user?.libraryId || ""}</p></div>
                          </td>
                          <td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">{formatDate(req.requestDate)}</td>
                          <td className="px-6 py-4 text-zinc-400 max-w-[180px]">
                            {req.notes ? (
                              <button
                                type="button"
                                onClick={() => setSelectedNote(req.notes)}
                                className="block max-w-[180px] truncate text-left hover:text-blue-300"
                                title="View full note"
                              >
                                {req.notes}
                              </button>
                            ) : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${reqStatusBadge[req.status] || "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30"}`}>
                              {requestStatusText(req)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right align-middle">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {!isLibrarian && (req.books || []).map((book: any) =>
                                (book.status || req.status) === "PENDING" && book.requestId ? (
                                  <button
                                    key={book.requestId}
                                    type="button"
                                    onClick={() => void cancelBorrowRequest(book)}
                                    disabled={showingCachedRequests || cancellingRequestId !== null}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {cancellingRequestId === book.requestId && <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-300/40 border-t-red-300" aria-hidden="true" />}
                                    {cancellingRequestId === book.requestId ? "Cancelling..." : "Cancel"}
                                  </button>
                                ) : null
                              )}
                              {isLibrarian && req.status === "PENDING" && (
                                <>
                                  <button
                                    onClick={() => approveListedBatch(req)}
                                    disabled={actionLoadingId === req.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> {actionLoadingId === req.id ? "Generating QR..." : req.transactionId ? "View QR / Borrow ID" : "Approve via QR"}
                                  </button>
                                  <button
                                    onClick={() => openRejectModal(req)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium rounded-lg transition-colors"
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <ResponsiveTable mobile={
                records.map((req: any) => (
                  <article key={req.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg shadow-black/10">
                    <div className="border-b border-zinc-800/80 pb-3">
                      {(req.books || []).map((book: any) => (
                        <div key={book.requestId || book.id} className="mb-3 flex items-start gap-2 last:mb-0">
                          <div>
                            <p className="font-semibold break-words text-zinc-100">{book.title || "Unknown"}</p>
                            <p className="mt-1 text-sm text-zinc-400">{book.author || "Author unavailable"}</p>
                            <p className="mt-1 text-xs text-zinc-500">{book.accessionNo || ""}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatDate(req.requestDate)} · {requestStatusText({ status: book.status || req.status })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 py-4 text-sm"><div><p className="text-xs text-zinc-500">Member</p><p className="mt-1 break-words text-zinc-300">{req.user?.firstName} {req.user?.lastName}</p><p className="text-xs text-zinc-500">{req.user?.libraryId || ""}</p></div><div><p className="text-xs text-zinc-500">Request Date</p><p className="mt-1 text-zinc-300">{formatDate(req.requestDate)}</p></div><div className="col-span-2"><p className="text-xs text-zinc-500">Notes</p><p className="mt-1 whitespace-pre-wrap break-words text-zinc-300">{req.notes || "—"}</p></div></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${reqStatusBadge[req.status] || "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30"}`}>
                        {requestStatusText(req)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {!isLibrarian && (req.books || []).map((book: any) =>
                          (book.status || req.status) === "PENDING" && book.requestId ? (
                            <button
                              key={book.requestId}
                              type="button"
                              onClick={() => void cancelBorrowRequest(book)}
                              disabled={showingCachedRequests || cancellingRequestId !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {cancellingRequestId === book.requestId && <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-300/40 border-t-red-300" aria-hidden="true" />}
                              {cancellingRequestId === book.requestId ? "Cancelling..." : "Cancel"}
                            </button>
                          ) : null
                        )}
                        {isLibrarian && req.status === "PENDING" && (
                          <>
                            <button disabled={actionLoadingId === req.id} onClick={() => approveListedBatch(req)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                              {actionLoadingId === req.id ? "Generating QR..." : req.transactionId ? "View QR / Borrow ID" : "Approve via QR"}
                            </button>
                            <button onClick={() => openRejectModal(req)} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-medium text-red-400">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              } />
              </>
            )}

            {!reqLoading && records.length > 0 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-zinc-500">
                  Showing{" "}
                  <span className="text-zinc-300">
                    {(reqPage - 1) * REQUEST_PAGE_SIZE + 1}–{Math.min(reqPage * REQUEST_PAGE_SIZE, reqTotal)}
                  </span>{" "}
                  of <span className="text-zinc-300">{reqTotal}</span> transactions
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setReqPage((p) => Math.max(1, p - 1))}
                    disabled={reqPage === 1}
                    className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {getReqPageNumbers().map((page) => (
                    <button
                      key={page}
                      onClick={() => setReqPage(page)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                        page === reqPage
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setReqPage((p) => Math.min(reqTotalPages, p + 1))}
                    disabled={reqPage === reqTotalPages}
                    className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {isLibrarian && (
            <div className={isLibrarian ? "order-1 mt-8" : "mt-8"}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Borrowed & Missing Books</h2>
                  <p className="text-sm text-zinc-400 mt-1">Currently borrowed books and missing-book records · {activeTxnTotal} records</p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 mb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative max-w-xl flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-5 h-5 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    value={activeTxnSearch}
                    onChange={(e) => setActiveTxnSearch(e.target.value)}
                    placeholder="Search by book title or member name..."
                    className="w-full pl-10 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <SortSelect options={txnSortOptions.filter((option) => option.sort === "dueDate")} sort={activeTxnSort} order={activeTxnSortOrder} onChange={changeActiveTxnSort} />
                </div>
              </div>

              {activeTxnLoading && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-zinc-900 animate-pulse border-b border-zinc-800/40" />)}
                </div>
              )}

              {!activeTxnLoading && activeTxns.length === 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="w-12 h-12 text-zinc-600 mb-4" />
                  <p className="text-zinc-300 font-medium">No borrowed or missing books found</p>
                  <p className="text-sm text-zinc-500 mt-1">Borrowed and missing-book records will appear here.</p>
                </div>
              )}

              {!activeTxnLoading && activeTxns.length > 0 && (
                <>
                <div className="hidden md:block rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                          <th className="px-6 py-3 font-medium">Book</th>
                          <th className="px-6 py-3 font-medium">Member</th>
                          <th className="px-6 py-3 font-medium hidden sm:table-cell"><SortHeader field="dueDate" sort={activeTxnSort} order={activeTxnSortOrder} onSort={(field) => changeActiveTxnSort(field, nextSortOrder(activeTxnSort, activeTxnSortOrder, field))}>Due Date</SortHeader></th>
                          <th className="px-6 py-3 font-medium text-right">Fine</th>
                          <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTxns.map((txn: any) => (
                          <tr key={txn.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-zinc-100 font-medium">{txn.book?.title || "Unknown"}</p>
                              <p className="text-xs text-zinc-500">{txn.book?.author || ""}</p>
                              {txn.status === "MISSING" && <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">Missing</span>}
                            </td>
                            <td className="px-6 py-4 text-zinc-300">
                              <div className="flex items-center gap-2.5">
                                <UserAvatar firstName={txn.user?.firstName} lastName={txn.user?.lastName} avatar={txn.user?.avatar} className="h-8 w-8" />
                                <div>{txn.user?.firstName} {txn.user?.lastName}<p className="text-xs text-zinc-500">{txn.user?.libraryId || ""}</p></div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-zinc-400 hidden sm:table-cell">
                              <div className="flex items-center gap-2">
                                <span>{formatDate(txn.dueDate)}</span>
                                {txn.status === "OVERDUE" && <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400 ring-1 ring-red-500/30">Overdue</span>}
                                {txn.status === "MISSING" && <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">Missing</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={`font-medium ${txn.finePaid ? "text-emerald-400" : "text-amber-400"}`}>
                                ₱{Number(txn.fineAmount || 0).toFixed(2)}
                              </span>
                              <p className="mt-1 text-xs text-zinc-500">
                                {txn.status === "MISSING" ? "Includes overdue · " : ""}
                                {txn.finePaid ? "Paid" : "Unpaid"}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {txn.status !== "MISSING" && (
                                  <>
                                <button
                                  onClick={() => openReturnModal(txn)}
                                  disabled={actionLoadingId !== null}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> {actionLoadingId === txn.id ? "Returning..." : "Return"}
                                </button>
                                <button
                                  onClick={() => openMissingModal(txn)}
                                  disabled={actionLoadingId !== null}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" /> Missing
                                </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-4 md:hidden">
                  {activeTxns.map((txn: any) => (
                    <BorrowHistoryCard
                      key={txn.id}
                      transaction={txn}
                      formatDate={formatDate}
                      statusBadge={txnStatusBadge}
                      statusLabel={txnStatusLabel}
                      contextLabel="Member"
                      contextValue={[txn.user?.firstName, txn.user?.lastName].filter(Boolean).join(" ") || "Unknown member"}
                      onReturn={() => openReturnModal(txn)}
                      onMissing={() => openMissingModal(txn)}
                      onPayFine={async (amount) => {
                        const response = await api.payFine(txn.id, amount);
                        if (!response.success) throw new Error(response.error || "Unable to record fine payment.");
                        setSuccessMsg("Fine paid successfully.");
                        await loadActiveTransactions();
                      }}
                    />
                  ))}
                </div>
                </>
              )}

              {!activeTxnLoading && activeTxns.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-zinc-500">Showing <span className="text-zinc-300">{(activeTxnPage - 1) * PAGE_SIZE + 1}–{Math.min(activeTxnPage * PAGE_SIZE, activeTxnTotal)}</span> of <span className="text-zinc-300">{activeTxnTotal}</span> records</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setActiveTxnPage((p) => Math.max(1, p - 1))} disabled={activeTxnPage === 1} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="px-3 py-2 text-xs text-zinc-500">Page {activeTxnPage} of {Math.max(1, Math.ceil(activeTxnTotal / PAGE_SIZE))}</span>
                    <button onClick={() => setActiveTxnPage((p) => Math.min(Math.max(1, Math.ceil(activeTxnTotal / PAGE_SIZE)), p + 1))} disabled={activeTxnPage >= Math.max(1, Math.ceil(activeTxnTotal / PAGE_SIZE))} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {returnTarget && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => actionLoadingId !== returnTarget.id && setReturnTarget(null)} />
            <div className="relative z-50 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400"><CheckCircle2 className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirm Book Return</h3>
                  <p className="mt-1 text-sm text-zinc-400">Confirm that this book has been returned. This will close the active borrow record.</p>
                </div>
              </div>
              <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <p className="font-medium text-zinc-100">{returnTarget.book?.title || "Unknown book"}</p>
                <p className="mt-1 text-sm text-zinc-400">{[returnTarget.user?.firstName, returnTarget.user?.lastName].filter(Boolean).join(" ") || "Unknown member"}</p>
                <p className="mt-1 text-xs text-zinc-500">Due {formatDate(returnTarget.dueDate)}</p>
              </div>
              {returnError && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{returnError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setReturnTarget(null)} disabled={actionLoadingId !== null} className="flex-1 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">Cancel</button>
                <button type="button" onClick={handleReturn} disabled={actionLoadingId !== null} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-50">{actionLoadingId === returnTarget.id ? "Returning..." : "Confirm Return"}</button>
              </div>
            </div>
          </div>
        </ModalLayer>
      )}

      {missingTarget && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !missingLoading && setMissingTarget(null)} />
          <div className="relative z-50 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></div>
              <div>
                <h3 className="text-lg font-semibold text-white">Declare Book Missing</h3>
                <p className="text-sm text-zinc-400 mt-1">Mark &quot;{missingTarget.book?.title || "this book"}&quot; as missing? This will close the active borrow record.</p>
              </div>
            </div>
            {missingError && <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{missingError}</div>}
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Reason <span className="text-zinc-500">(optional)</span></label>
            <textarea value={missingReason} onChange={(e) => setMissingReason(e.target.value)} placeholder="e.g., Not returned by borrower, lost in transit" rows={3} className="flex w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setMissingTarget(null)} disabled={missingLoading} className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl border border-zinc-700 disabled:opacity-40">Cancel</button>
              <button onClick={handleDeclareMissing} disabled={missingLoading} className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40">{missingLoading ? "Declaring..." : "Declare Missing"}</button>
            </div>
          </div>
          </div>
        </ModalLayer>
      )}

      {/* Reject Borrow Request modal (librarian only) */}
      {rejectTarget && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setRejectTarget(null)} />
          <div className="relative z-50 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Reject Borrow Transaction</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Reject all {rejectTarget.books?.length || 1} book(s){rejectTarget.transactionId ? ` in ${rejectTarget.transactionId}` : " in this request"}? A reason is required.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                  {(rejectTarget.books || []).map((book: any) => <li key={book.requestId || book.id}>{book.title} · {book.accessionNo}</li>)}
                </ul>
              </div>
            </div>

            {rejectError && (
              <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{rejectError}</div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Book not available, exceeding borrow limit"
                rows={3}
                className="flex w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRejectTarget(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium rounded-xl border border-zinc-700 transition-colors"
                disabled={rejectLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/30 transition-colors"
                disabled={rejectLoading}
              >
                {rejectLoading ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
          </div>
        </ModalLayer>
      )}

      {approvalReceipt && (
        <QRDisplayModal
          open={Boolean(approvalReceipt)}
          onClose={() => setApprovalReceipt(null)}
          qrCodeDataUrl={approvalReceipt.qrCode || ""}
          transactionId={approvalReceipt.transactionId}
          borrowerName={approvalReceipt.requests?.[0]?.user
            ? `${approvalReceipt.requests[0].user.firstName} ${approvalReceipt.requests[0].user.lastName}`.trim()
            : undefined}
          borrowerId={approvalReceipt.requests?.[0]?.user?.libraryId}
          books={approvalReceipt.requests?.map((borrowRequest: any) => ({
            title: borrowRequest.book?.title || "Book",
            accessionNo: borrowRequest.book?.accessionNo,
          }))}
          title="Ready for Pickup"
        />
      )}

      {!isLibrarian && transactionScannerOpen && (
        <QRScanner
          onScan={handleTransactionScan}
          onClose={() => setTransactionScannerOpen(false)}
          title="Scan / Find Transaction"
          entryHint="Scan the librarian-issued QR code or enter the Borrow ID shown on it."
          placeholder="BRW-1234-5678"
          submitLabel="Verify"
          externalError={transactionLookupError}
          loading={verificationLoading}
        />
      )}

      {isMobileLayout && scannedBorrowId && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-borrow-scan-title">
            <div className="w-full rounded-t-3xl border border-zinc-800 bg-zinc-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl sm:p-6">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
              <h2 id="confirm-borrow-scan-title" className="text-lg font-semibold text-white">Confirm scanned Borrow ID</h2>
              <p className="mt-2 text-sm text-zinc-400">Check the code before confirming your borrow.</p>
              <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-center font-mono text-lg font-semibold text-zinc-100">{formatBorrowId(scannedBorrowId)}</p>
              {transactionLookupError && <p role="alert" className="mt-3 text-sm text-red-300">{transactionLookupError}</p>}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setScannedBorrowId(""); setScannedApproval(null); setTransactionScannerOpen(true); }} disabled={verificationLoading} className="min-h-11 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">Scan again</button>
                <button type="button" onClick={() => void (scannedApproval ? verifyScannedApproval(scannedApproval) : verifyBorrowId(scannedBorrowId))} disabled={verificationLoading} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{verificationLoading ? "Verifying…" : "Confirm"}</button>
              </div>
            </div>
          </div>
        </ModalLayer>
      )}

      {selectedNote !== null && (
        <ModalLayer>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedNote(null)} />
          <div className="relative z-50 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
            <h3 className="text-lg font-semibold text-white">Borrower Note</h3>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{selectedNote}</p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setSelectedNote(null)} className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700">Close</button>
            </div>
          </div>
          </div>
        </ModalLayer>
      )}
    </div>
  );
}
