"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, QrCode, XCircle } from "lucide-react";
import api from "@/lib/api";
import { formatBorrowId, normalizeBorrowId } from "@/lib/borrow-id";

function ScanApproveContent() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "approved" | "error">("verifying");
  const [error, setError] = useState("");
  const requestId = params.get("request") || "";
  const token = params.get("token") || "";
  const approvalCode = params.get("code") || "";
  const borrowId = normalizeBorrowId(approvalCode);

  useEffect(() => {
    let active = true;
    if (!borrowId || !requestId || !token) {
      setError("This QR code is invalid or expired. Ask the librarian to generate a new one.");
      setStatus("error");
      return () => { active = false; };
    }

    if (!navigator.onLine) {
      setError("Internet connection required to confirm this transaction.");
      setStatus("error");
      return () => { active = false; };
    }

    api.approveByQRCode(requestId, token, approvalCode).then((response) => {
      if (!active) return;
      if (response.success) {
        setStatus("approved");
      } else {
        setError(response.error || "Could not verify this QR approval.");
        setStatus("error");
      }
    }).catch(() => {
      if (!active) return;
      setError("Could not verify this QR approval. Sign in to your member account and ask the librarian for a new QR code.");
      setStatus("error");
    });

    return () => { active = false; };
  }, [approvalCode, borrowId, requestId, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <section className="w-full max-w-md border-y border-zinc-800 py-8 text-center">
        {status === "verifying" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-400" />}
        {status === "approved" && <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />}
        {status === "error" && <XCircle className="mx-auto h-10 w-10 text-amber-400" />}
        <h1 className="mt-4 text-xl font-semibold text-white">
          {status === "verifying" ? "Verifying QR approval" : status === "approved" ? "Borrow Request Approved" : "QR Approval Not Verified"}
        </h1>
        {borrowId && <p className="mt-2 font-mono text-lg font-semibold text-zinc-200">{formatBorrowId(borrowId)}</p>}
        <p className="mt-2 text-sm text-zinc-400">
          {status === "verifying"
            ? "Confirming this approval with your member account."
            : status === "approved"
              ? "Your borrow is active. The due date is now counting from today."
              : error}
        </p>
        {status !== "verifying" && (
          <Link href="/requests" className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Go to Borrow Requests
          </Link>
        )}
        {status === "error" && /sign in|logged out|session/i.test(error) && (
          <Link href="/login" className="ml-2 mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-900">
            Sign in
          </Link>
        )}
        <QrCode className="mx-auto mt-8 h-5 w-5 text-zinc-600" />
      </section>
    </main>
  );
}

export default function ScanApprovePage() {
  return <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}><ScanApproveContent /></Suspense>;
}
