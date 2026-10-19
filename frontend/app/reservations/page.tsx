"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import HeaderUserActions from "@/components/HeaderUserActions";
import { ModalLayer } from "@/components/ModalLayer";
import { offlineDb } from "@/lib/offline-db";

export default function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selectedReservationIds, setSelectedReservationIds] = useState<Record<string, string>>({});
  const [cancellingReservations, setCancellingReservations] = useState(false);
  const [cancellingReservationId, setCancellingReservationId] = useState<string | null>(null);
  const [showingCached, setShowingCached] = useState(false);
  const [quickActionReservation, setQuickActionReservation] = useState<any | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isLibrarian = user?.role === "LIBRARIAN";

  const loadReservations = async () => {
    let cached: any[] = [];
    try {
      setLoading(true);
      cached = user
        ? (await offlineDb.reservations.where("userId").equals(user.id).toArray())
          .filter((reservation: any) => !reservation._pending && !String(reservation.id).startsWith("local-reservation-"))
        : [];
      if (!navigator.onLine) {
        if (cached.length) setReservations(cached);
        setShowingCached(true);
        setLoading(false);
        return;
      }
      const params = {
        page: "1",
        limit: "50",
        ...(isLibrarian ? { status: "ACTIVE" } : {}),
      };
      const response = await api.getReservations(params);
      if (response.success) {
        const totalPages = response.meta?.totalPages || 1;
        const additionalPages = totalPages > 1
          ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
            api.getReservations({ ...params, page: String(index + 2) })
          ))
          : [];
        const failedPage = additionalPages.find((page) => !page.success);
        if (failedPage) {
          setError(failedPage.error || "Unable to load all reservations. Refresh and try again.");
          return;
        }
        const allReservations = [
          ...(response.data || []),
          ...additionalPages.flatMap((page) => page.data || []),
        ];
        const serverRecords = allReservations.map((reservation: any) => ({
          ...reservation,
          userId: reservation.userId || user?.id,
        }));
        await offlineDb.reservations.bulkPut(serverRecords);
        setReservations(serverRecords);
        setShowingCached(false);
      } else {
        if (response.networkError && cached.length) {
          setReservations(cached);
          setShowingCached(true);
        }
        else setError(response.error || "Unable to load reservations.");
      }
    } catch {
      if (navigator.onLine) {
        setError("Unable to load reservations.");
      } else {
        if (cached.length) setReservations(cached);
        setShowingCached(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadReservations();
  }, [user, isLibrarian]);

  const handleCancel = async (id: string) => {
    if (cancellingReservations || cancellingReservationId) return;
    const reservation = reservations.find((item) => item.id === id);
    if (!reservation || !window.confirm(`Cancel the reservation for "${reservation.book?.title || "this book"}"?`)) return;
    if (!navigator.onLine || showingCached) {
      setError("Connect to the internet and refresh your reservations before cancelling.");
      return;
    }
    setCancellingReservationId(id);
    setError("");
    try {
      const response = await api.cancelReservation(id);
      if (!response.success) {
        const message = response.error || "Unable to cancel reservation.";
        await loadReservations();
        setError(message);
        return;
      }
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(25);
      const cancelled = response.data?.cancelled?.[0];
      setReservations((current) => current.map((item) => item.id === id ? { ...item, status: "CANCELLED" } : item));
      setSelectedReservationIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setSuccessMsg(`Cancelled reservation: ${cancelled?.title || reservation.book?.title || "Book"}.`);
      try {
        await offlineDb.reservations.update(id, { status: "CANCELLED" });
      } catch {
        setError("Reservation cancelled, but the offline cache could not be updated. Refresh when online.");
      }
      await loadReservations();
    } catch {
      await loadReservations();
      setError("Unable to cancel reservation. Refresh and try again.");
    } finally {
      setCancellingReservationId(null);
    }
  };

  const cancelSelectedReservations = async () => {
    if (cancellingReservations || cancellingReservationId) return;
    const selected = Object.entries(selectedReservationIds);
    if (!selected.length) {
      setError("Please select at least one item to cancel.");
      return;
    }
    if (selected.length > 50) {
      setError("You can cancel up to 50 reservations at a time.");
      return;
    }
    if (!navigator.onLine || showingCached) {
      setError("Connect to the internet and refresh your reservations before cancelling.");
      return;
    }
    const titles = selected.map(([, title]) => title);
    if (!window.confirm(`Cancel the following reservations?\n\n${titles.join("\n")}`)) return;

    setCancellingReservations(true);
    setError("");
    try {
      const response = await api.cancelSelectedReservations(selected.map(([id]) => id));
      if (!response.success || !response.data?.cancelled?.length) {
        const message = response.error || "Unable to cancel the selected reservations. Refresh and try again.";
        setSelectedReservationIds({});
        await loadReservations();
        setError(message);
        return;
      }
      const cancelled = response.data.cancelled;
      const cancelledIds = new Set(cancelled.map(({ id }) => id));
      setReservations((current) => current.map((reservation) =>
        cancelledIds.has(reservation.id) ? { ...reservation, status: "CANCELLED" } : reservation
      ));
      setSelectedReservationIds({});
      setSuccessMsg(`Cancelled reservations: ${cancelled.map(({ title }) => title).join(", ")}.`);
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(25);
      try {
        await Promise.all(Array.from(cancelledIds, (id) => offlineDb.reservations.update(id, { status: "CANCELLED" })));
      } catch {
        setError("Reservations cancelled, but the offline cache could not be updated. Refresh when online.");
      }
      await loadReservations();
    } catch {
      setSelectedReservationIds({});
      await loadReservations();
      setError("Unable to cancel the selected reservations. Refresh and try again.");
    } finally {
      setCancellingReservations(false);
    }
  };

  const handlePickup = async (id: string) => {
    const response = await api.pickupReservation(id);
    if (response.success) {
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(25);
      await loadReservations();
      return;
    }
    setError(response.error || "Unable to complete pickup.");
  };

  const handleApprove = async (id: string) => {
    const response = await api.approveReservation(id);
    if (!response.success) {
      setError(response.error || "Unable to approve reservation.");
      return false;
    }
    if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(25);
    await loadReservations();
    return true;
  };

  const beginCardGesture = (event: TouchEvent, reservation: any) => {
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    longPressTimer.current = setTimeout(() => setQuickActionReservation(reservation), 550);
  };
  const moveCardGesture = (event: TouchEvent) => {
    if (!touchStart.current) return;
    const dx = event.touches[0].clientX - touchStart.current.x;
    const dy = event.touches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const endCardGesture = (event: TouchEvent, reservation: any) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    const start = touchStart.current;
    touchStart.current = null;
    if (start && start.x - event.changedTouches[0].clientX > 64) {
      setQuickActionReservation(reservation);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar showCopyright={false} />
      <div className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Reservations</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {isLibrarian ? "Review active reservations and prioritize faculty first." : "Track your reservations and pickup status."}
              </p>
              {showingCached && (
                <p className="mt-2 text-xs text-amber-300">
                  Offline — showing the last synchronized reservations.
                </p>
              )}
            </div>
            <HeaderUserActions />
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {successMsg && (
            <div role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              {successMsg}
            </div>
          )}
          {!isLibrarian && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-400">
                {Object.keys(selectedReservationIds).length
                  ? `${Object.keys(selectedReservationIds).length} reservation${Object.keys(selectedReservationIds).length === 1 ? "" : "s"} selected`
                  : "Select one or more active or approved reservations to cancel."}
              </p>
              <button
                type="button"
                onClick={cancelSelectedReservations}
                disabled={cancellingReservations || cancellingReservationId !== null}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancellingReservations ? "Cancelling..." : "Cancel Selected Reservations"}
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-400">
              Loading reservations...
            </div>
          ) : reservations.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-zinc-400">
              No reservations found.
            </div>
          ) : (
            <>
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Book</th>
                      <th className="px-4 py-3 font-medium">Member</th>
                      <th className="px-4 py-3 font-medium">Queue</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Reservation Date</th>
                      <th className="px-4 py-3 font-medium">Expiry</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation: any) => {
                      const isOwner = user?.id === reservation.userId;
                      const isActive = reservation.status === "ACTIVE";
                      const canPickUp = ["ACTIVE", "APPROVED"].includes(reservation.status);
                      const statusLabel = reservation.status;
                      return (
                        <tr key={reservation.id} className="border-t border-zinc-800 text-zinc-200">
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              {!isLibrarian && isOwner && canPickUp && (
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedReservationIds[reservation.id])}
                                  disabled={showingCached || cancellingReservations || cancellingReservationId !== null}
                                  onChange={(event) => setSelectedReservationIds((current) => {
                                    const next = { ...current };
                                    if (event.target.checked) next[reservation.id] = reservation.book?.title || "Unknown book";
                                    else delete next[reservation.id];
                                    return next;
                                  })}
                                  aria-label={`Select ${reservation.book?.title || "book"} reservation`}
                                  className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 accent-blue-600"
                                />
                              )}
                              <div>
                                <div className="font-medium text-white">{reservation.book?.title || "Unknown Book"}</div>
                                <div className="text-xs text-zinc-400">{reservation.book?.author || "Author unavailable"}</div>
                                <div className="text-xs text-zinc-500">{reservation.book?.accessionNo || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {reservation.user ? `${reservation.user.firstName} ${reservation.user.lastName}` : "—"}
                            <div className="text-xs text-zinc-400">{reservation.user?.role || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            {reservation.status === "APPROVED" ? "Approved" : `#${reservation.queuePosition ?? 1}`}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              reservation.status === "ACTIVE"
                                ? "bg-amber-500/15 text-amber-300"
                                : reservation.status === "APPROVED"
                                  ? "bg-blue-500/15 text-blue-300"
                                : reservation.status === "FULFILLED"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : reservation.status === "CANCELLED"
                                    ? "bg-red-500/15 text-red-300"
                                    : "bg-zinc-700 text-zinc-300"
                            }`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {reservation.expiryDate ? new Date(reservation.expiryDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {canPickUp && (isLibrarian || isOwner) && (
                                <button
                                  onClick={() => handleCancel(reservation.id)}
                                  disabled={showingCached || cancellingReservations || cancellingReservationId !== null}
                                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {cancellingReservationId === reservation.id ? "Cancelling..." : "Cancel"}
                                </button>
                              )}
                              {canPickUp && isOwner && (
                                <button
                                  onClick={() => handlePickup(reservation.id)}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                >
                                  Pick up
                                </button>
                              )}
                              {isLibrarian && isActive && (
                                <button
                                  onClick={() => void handleApprove(reservation.id)}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  Approve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-3 md:hidden">
              {reservations.map((reservation: any) => {
                const isOwner = user?.id === reservation.userId;
                const isActive = reservation.status === "ACTIVE";
                const canPickUp = ["ACTIVE", "APPROVED"].includes(reservation.status);
                const statusClass = reservation.status === "ACTIVE"
                  ? "bg-amber-500/15 text-amber-300"
                  : reservation.status === "APPROVED"
                    ? "bg-blue-500/15 text-blue-300"
                  : reservation.status === "FULFILLED"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : reservation.status === "CANCELLED"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-zinc-700 text-zinc-300";
                return (
                  <article
                    key={reservation.id}
                    onTouchStart={(event) => beginCardGesture(event, reservation)}
                    onTouchMove={moveCardGesture}
                    onTouchEnd={(event) => endCardGesture(event, reservation)}
                    onTouchCancel={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                    onContextMenu={(event) => { event.preventDefault(); setQuickActionReservation(reservation); }}
                    className="mobile-gesture-card rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          {!isLibrarian && isOwner && canPickUp && (
                            <input
                              type="checkbox"
                              checked={Boolean(selectedReservationIds[reservation.id])}
                              disabled={showingCached || cancellingReservations || cancellingReservationId !== null}
                              onChange={(event) => setSelectedReservationIds((current) => {
                                const next = { ...current };
                                if (event.target.checked) next[reservation.id] = reservation.book?.title || "Unknown book";
                                else delete next[reservation.id];
                                return next;
                              })}
                              aria-label={`Select ${reservation.book?.title || "book"} reservation`}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-950 accent-blue-600"
                            />
                          )}
                          <div className="min-w-0">
                            <h2 className="break-words font-semibold text-white">{reservation.book?.title || "Unknown Book"}</h2>
                            <p className="mt-1 text-sm text-zinc-400">{reservation.book?.author || "Author unavailable"}</p>
                            <p className="mt-1 text-xs text-zinc-500">{reservation.book?.accessionNo || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>{reservation.status}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3 text-sm">
                      <div>
                        <p className="text-xs text-zinc-500">Member</p>
                        <p className="mt-1 text-zinc-300">{reservation.user ? `${reservation.user.firstName} ${reservation.user.lastName}` : "—"}</p>
                        <p className="text-xs text-zinc-500">{reservation.user?.role || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Reserved / Expiry</p>
                        <p className="mt-1 text-zinc-300">{reservation.status === "APPROVED" ? "Approved" : `#${reservation.queuePosition ?? 1}`}</p>
                        <p className="mt-1 text-xs text-zinc-400">{reservation.reservationDate ? new Date(reservation.reservationDate).toLocaleDateString() : "—"}</p>
                        <p className="text-xs text-zinc-400">{reservation.expiryDate ? new Date(reservation.expiryDate).toLocaleDateString() : "—"}</p>
                      </div>
                    </div>
                    {((isActive && isLibrarian) || (canPickUp && isOwner)) && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {isLibrarian && (
                          <button onClick={() => void handleApprove(reservation.id)} className="min-h-11 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                            Approve
                          </button>
                        )}
                        {isOwner && ["ACTIVE", "APPROVED"].includes(reservation.status) && (
                          <button onClick={() => handlePickup(reservation.id)} className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                            Pick up
                          </button>
                        )}
                        {(isLibrarian && isActive || isOwner && ["ACTIVE", "APPROVED"].includes(reservation.status)) && (
                          <button onClick={() => handleCancel(reservation.id)} disabled={showingCached || cancellingReservations || cancellingReservationId !== null} className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50">
                            {cancellingReservationId === reservation.id ? "Cancelling..." : "Cancel"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            </>
          )}
        </div>
        {quickActionReservation && (
          <ModalLayer>
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="reservation-quick-actions">
              <div className="w-full rounded-t-3xl border border-zinc-800 bg-zinc-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
                <h2 id="reservation-quick-actions" className="font-semibold text-white">Quick actions</h2>
                <p className="mt-1 truncate text-sm text-zinc-400">{quickActionReservation.book?.title || "Reservation"}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {isLibrarian && quickActionReservation.status === "ACTIVE" && (
                    <button type="button" onClick={async () => { if (await handleApprove(quickActionReservation.id)) setQuickActionReservation(null); }} className="min-h-11 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Approve</button>
                  )}
                  {user?.id === quickActionReservation.userId && ["ACTIVE", "APPROVED"].includes(quickActionReservation.status) && (
                    <button type="button" onClick={async () => { await handlePickup(quickActionReservation.id); setQuickActionReservation(null); }} className="min-h-11 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Pick up</button>
                  )}
                  {(isLibrarian && quickActionReservation.status === "ACTIVE" || user?.id === quickActionReservation.userId && ["ACTIVE", "APPROVED"].includes(quickActionReservation.status)) && (
                    <button type="button" onClick={async () => { await handleCancel(quickActionReservation.id); setQuickActionReservation(null); }} disabled={cancellingReservationId !== null} className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 disabled:opacity-50">{cancellingReservationId === quickActionReservation.id ? "Cancelling..." : "Cancel"}</button>
                  )}
                  <button type="button" onClick={() => setQuickActionReservation(null)} className="min-h-11 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300">Close</button>
                </div>
              </div>
            </div>
          </ModalLayer>
        )}
      </div>
    </div>
  );
}
