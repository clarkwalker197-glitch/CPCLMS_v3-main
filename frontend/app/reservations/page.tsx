"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { offlineDb } from "@/lib/offline-db";

export default function ReservationsPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showingCached, setShowingCached] = useState(false);
  const isLibrarian = user?.role === "LIBRARIAN";

  const loadReservations = async () => {
    try {
      setLoading(true);
      const cached = user
        ? await offlineDb.reservations.where("userId").equals(user.id).toArray()
        : [];
      if (cached.length) setReservations(cached);
      if (!navigator.onLine) {
        setShowingCached(true);
        setLoading(false);
        return;
      }
      const response = await api.getReservations();
      if (response.success) {
        const localPending = cached.filter((reservation: any) =>
          reservation._pending || reservation._syncStatus === "FAILED" || reservation._syncStatus === "CONFLICT"
        );
        const serverRecords = (response.data || []).map((reservation: any) => ({
          ...reservation,
          userId: reservation.userId || user?.id,
        }));
        await offlineDb.reservations.bulkPut(serverRecords);
        setReservations([
          ...serverRecords,
          ...localPending.filter((local: any) => !serverRecords.some((remote: any) => remote.id === local.id)),
        ]);
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
      await loadReservations();
      return;
    }
    setError(response.error || "Unable to cancel reservation.");
  };

  const handlePickup = async (id: string) => {
    const response = await api.pickupReservation(id);
    if (response.success) {
      await loadReservations();
      return;
    }
    setError(response.error || "Unable to complete pickup.");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Reservations</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {isLibrarian ? "See every active reservation and prioritize faculty first." : "Track your own reservations and pickup status."}
              </p>
              {showingCached && (
                <p className="mt-2 text-xs text-amber-300">
                  Offline — showing the last synchronized reservations and any pending reservation intents.
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
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
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
                      const statusLabel = reservation._pending
                        ? "Pending synchronization"
                        : reservation._syncStatus === "FAILED" || reservation._syncStatus === "CONFLICT"
                          ? `Not synchronized — ${reservation._syncError || "server rejected the request"}`
                          : reservation.status;
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
                            {reservation._pending ? "Not assigned" : `#${reservation.queuePosition ?? 1}`}
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
                                  onClick={() => api.approveReservation(reservation.id)}
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
          )}
        </div>
      </div>
    </div>
  );
}
