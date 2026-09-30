"use client";

import { useState } from "react";
import { ModalLayer } from "@/components/ModalLayer";
import { Check, Copy, UserRound, X } from "lucide-react";
import { formatBorrowId } from "@/lib/borrow-id";

interface QRDisplayBook {
  title: string;
  accessionNo?: string | null;
}

interface QRDisplayModalProps {
  open: boolean;
  onClose: () => void;
  qrCodeDataUrl: string;
  title: string;
  transactionId?: string;
  borrowerName?: string;
  borrowerId?: string;
  books?: QRDisplayBook[];
}

export function QRDisplayModal({
  open,
  onClose,
  qrCodeDataUrl,
  title,
  transactionId,
  borrowerName,
  borrowerId,
  books = [],
}: QRDisplayModalProps) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const formattedBorrowId = transactionId ? formatBorrowId(transactionId) : "";

  if (!open) return null;

  const handleCopy = async () => {
    if (!formattedBorrowId) return;
    try {
      await navigator.clipboard.writeText(formattedBorrowId);
    } catch {
      const input = document.createElement("textarea");
      input.value = formattedBorrowId;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copiedToClipboard = document.execCommand("copy");
      document.body.removeChild(input);
      if (!copiedToClipboard) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalLayer>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          {(borrowerName || borrowerId) && (
            <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4" aria-label="Borrower information">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-zinc-600 ring-1 ring-zinc-200">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase text-zinc-500">Borrower</p>
                    <p className="mt-1 break-words text-sm font-semibold text-zinc-900">{borrowerName || "Member"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase text-zinc-500">Member ID</p>
                    <p className="mt-1 break-all font-mono text-sm font-medium text-zinc-800">{borrowerId || "Not available"}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-zinc-200 p-4 sm:p-5" aria-label="Transaction QR code">
            <div
              className="mx-auto flex w-fit items-center justify-center rounded-lg border border-zinc-200 bg-white p-3"
              style={{ minHeight: "220px", minWidth: "220px" }}
            >
              {imgError ? (
                <div className="text-center text-zinc-400">
                  <p className="text-sm">QR code unavailable</p>
                </div>
              ) : (
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code for ${formattedBorrowId || "book borrowing"}`}
                  className="h-48 w-48 sm:h-52 sm:w-52"
                  style={{ imageRendering: "pixelated" }}
                  onError={() => setImgError(true)}
                />
              )}
            </div>
            {transactionId && (
              <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <div className="min-w-0 text-center sm:text-left">
                  <p className="text-xs font-medium uppercase text-zinc-500">Borrow ID</p>
                  <p className="mt-1 break-all font-mono text-xl font-bold text-zinc-900 sm:text-2xl">{formattedBorrowId}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                  title="Copy Borrow ID"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </section>

          {books.length > 0 && (
            <section className="rounded-lg border border-zinc-200 p-4" aria-label="Books in this transaction">
              <h4 className="text-sm font-semibold text-zinc-900">Books in this transaction <span className="font-normal text-zinc-500">({books.length})</span></h4>
              <ul className="mt-3 divide-y divide-zinc-100">
                {books.map((book, index) => (
                  <li key={`${book.title}-${book.accessionNo || index}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-sm text-zinc-800">{book.title}</span>
                    {book.accessionNo && <span className="shrink-0 text-xs text-zinc-500">{book.accessionNo}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </div>
      </div>
    </ModalLayer>
  );
}

