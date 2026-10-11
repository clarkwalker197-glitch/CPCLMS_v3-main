"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { ModalLayer } from "@/components/ModalLayer";
import { offlineDb } from "@/lib/offline-db";

export default function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showingCached, setShowingCached] = useState(false);
  const [quickActionReservation, setQuickActionReservation] = useState<any | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isLibrarian = user?.role === "LIBRARIAN";

  const loadReservations = async () => {
    try {
      setLoading(true);
      const cached = user
        ? (await offlineDb.reservations.where("userId").equals(user.id).toArray())
          .filter((reservation: any) => !reservation._pending && !String(reservation.id).startsWith("local-reservation-"))
        : [];
      if (cached.length) setReservations(cached);
      if (!navigator.onLine) {
        setShowingCached(true);
        setLoading(false);
        return;
      }
      const response = await api.getReservations();
      if (response.success) {
        const serverRecords = (response.data || []).map((reservation: any) => ({
          ...reservation,
          userId: reservation.userId || user?.id,
        }));
        await offlineDb.reservations.bulkPut(serverRecords);
        setReservations(serverRecords);
        setShowingCached(false);
      } else {
        if (response.networkError && cached.length) setShowingCached(true);
        else setError(response.error || "Unable to load reservations.");
      }
    } catch {
      if (navigator.onLine) setError("Unable to load reservations.");
      else setShowingCached(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadReservations();
  }, [user]);

  const handleCancel = async (id: string) => {
    const response = await api.cancelReservation(id);
    if (response.success) {
      if (window.matchMedia("(max-width: 768px)").matches && "vibrate" in navigator) navigator.vibrate(25);
      await loadReservations();
      return;
    }
    setError(response.error || "Unable to cancel reservation.");
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
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 py-8 pb-[calc(7rem+min(env(safe-area-inset-bottom),2rem))] sm:px-6 lg:px-8 lg:pb-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Reservations</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {isLibrarian ? "See every active reservation and prioritize faculty first." : "Track your own reservations and pickup status."}
              </p>
              {showingCached && (
                <p className="mt-2 text-xs text-amber-300">
                  Offline — showing the last synchronized reservations.
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
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
                      <th className="px-4 py-3 font-medium">Expiry</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((reservation: any) => {
                      const isOwner = user?.id === reservation.userId;
                      const isActive = reservation.status === "ACTIVE";
                      const statusLabel = reservation.status;
                      return (
                        <tr key={reservation.id} className="border-t border-zinc-800 text-zinc-200">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{reservation.book?.title || "Unknown Book"}</div>
                            <div className="text-xs text-zinc-400">{reservation.book?.accessionNo || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            {reservation.user ? `${reservation.user.firstName} ${reservation.user.lastName}` : "—"}
                            <div className="text-xs text-zinc-400">{reservation.user?.role || "—"}</div>
                          </td>
                          <td className="px-4 py-3">
                            {`#${reservation.queuePosition ?? 1}`}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              reservation.status === "ACTIVE"
                                ? "bg-amber-500/15 text-amber-300"
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
                            {reservation.expiryDate ? new Date(reservation.expiryDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {isActive && (isLibrarian || isOwner) && (
                                <button
                                  onClick={() => handleCancel(reservation.id)}
                                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/15"
                                >
                                  Cancel
                                </button>
                              )}
                              {isActive && isOwner && (
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
                const statusClass = reservation.status === "ACTIVE"
                  ? "bg-amber-500/15 text-amber-300"
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
                        <h2 className="break-words font-semibold text-white">{reservation.book?.title || "Unknown Book"}</h2>
                        <p className="mt-1 text-xs text-zinc-400">{reservation.book?.accessionNo || "—"}</p>
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
                        <p className="text-xs text-zinc-500">Queue / Expiry</p>
                        <p className="mt-1 text-zinc-300">#{reservation.queuePosition ?? 1}</p>
                        <p className="text-xs text-zinc-400">{reservation.expiryDate ? new Date(reservation.expiryDate).toLocaleDateString() : "—"}</p>
                      </div>
                    </div>
                    {(isActive && (isLibrarian || isOwner)) && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {isLibrarian && (
                          <button onClick={() => api.approveReservation(reservation.id)} className="min-h-11 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                            Approve
                          </button>
                        )}
                        {isOwner && (
                          <button onClick={() => handlePickup(reservation.id)} className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                            Pick up
                          </button>
                        )}
                        {(isLibrarian || isOwner) && (
                          <button onClick={() => handleCancel(reservation.id)} className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/15">
                            Cancel
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
                  {user?.id === quickActionReservation.userId && quickActionReservation.status === "ACTIVE" && (
                    <button type="button" onClick={async () => { await handlePickup(quickActionReservation.id); setQuickActionReservation(null); }} className="min-h-11 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Pick up</button>
                  )}
                  {(isLibrarian || user?.id === quickActionReservation.userId) && quickActionReservation.status === "ACTIVE" && (
                    <button type="button" onClick={async () => { await handleCancel(quickActionReservation.id); setQuickActionReservation(null); }} className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300">Cancel</button>
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
