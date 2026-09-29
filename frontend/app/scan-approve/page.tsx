"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QrCode } from "lucide-react";

function ScanApproveContent() {
  const params = useSearchParams();
  const transactionId = params.get("transactionId");
  const lookupPath = transactionId
    ? `/transactions/lookup?transactionId=${encodeURIComponent(transactionId)}`
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <section className="w-full max-w-md border-y border-zinc-800 py-8 text-center">
        <QrCode className="mx-auto h-10 w-10 text-blue-400" />
        <h1 className="mt-4 text-xl font-semibold text-white">Borrow request status</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Scanning a member QR only displays transaction details. It does not approve, return, or change any books.
        </p>
        {lookupPath ? (
          <Link href={lookupPath} className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            View transaction
          </Link>
        ) : (
          <p className="mt-6 text-sm text-zinc-300">
            This is an older approval link. Ask the librarian for the approved transaction QR code or ID.
          </p>
        )}
      </section>
    </main>
  );
}

export default function ScanApprovePage() {
  return <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}><ScanApproveContent /></Suspense>;
}
