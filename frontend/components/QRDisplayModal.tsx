"use client";

import { useEffect, useRef, useState } from "react";
import { ModalLayer } from "@/components/ModalLayer";
import { Check, CheckCircle2, Copy, UserRound, X } from "lucide-react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const formattedBorrowId = transactionId ? formatBorrowId(transactionId) : "";

  useEffect(() => {
    if (!open) return;

    let frameId = 0;
    let previouslyFocused: HTMLElement | null = null;
    let removeKeydownListener: (() => void) | null = null;

    frameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      previouslyFocused = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const getFocusableElements = () => Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((element) => element.getClientRects().length > 0);

      closeButtonRef.current?.focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }

        if (event.key !== "Tab") return;
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && (document.activeElement === firstElement || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && (document.activeElement === lastElement || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          firstElement.focus();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      removeKeydownListener = () => document.removeEventListener("keydown", handleKeyDown);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      removeKeydownListener?.();
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          className="qr-modal-backdrop-enter absolute inset-0 bg-black/65 backdrop-blur-[2px]"
          aria-hidden="true"
          onClick={onClose}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-display-modal-title"
          tabIndex={-1}
          className="qr-modal-enter relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl shadow-black/40 outline-none sm:max-h-[min(92dvh,52rem)]"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-700 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 id="qr-display-modal-title" className="text-base font-semibold text-zinc-100 sm:text-lg">
                {title}
              </h3>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              aria-label="Close Ready for Pickup dialog"
              title="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:space-y-5 sm:p-6">
            {(borrowerName || borrowerId) && (
              <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-3.5 sm:p-4" aria-label="Borrower information">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Borrower</p>
                      <p className="mt-1 break-words text-sm font-semibold text-zinc-100">{borrowerName || "Member"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Member ID</p>
                      <p className="mt-1 break-all font-mono text-sm font-medium text-zinc-200">{borrowerId || "Not available"}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-3 sm:p-5" aria-label="Transaction QR code">
              <div className="mx-auto flex w-fit max-w-full items-center justify-center rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 sm:p-4">
                {imgError ? (
                  <div className="flex h-48 w-48 items-center justify-center text-center text-sm text-zinc-600 sm:h-52 sm:w-52">
                    QR code unavailable
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
                <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                  <div className="min-w-0 text-center sm:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Borrow ID</p>
                    <p className="mt-1 break-all font-mono text-xl font-bold tracking-wide text-zinc-100 sm:text-2xl">
                      {formattedBorrowId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 active:bg-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                    aria-label={copied ? "Borrow ID copied" : "Copy Borrow ID"}
                    title="Copy Borrow ID"
                  >
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </section>

            {books.length > 0 && (
              <section className="rounded-xl border border-zinc-700 bg-zinc-950/40 p-4" aria-label="Books in this transaction">
                <h4 className="text-sm font-semibold text-zinc-100">
                  Books in this transaction <span className="font-normal text-zinc-400">({books.length})</span>
                </h4>
                <ul className="mt-3 max-h-48 divide-y divide-zinc-800/60 overflow-y-auto overscroll-contain">
                  {books.map((book, index) => (
                    <li key={`${book.title}-${book.accessionNo || index}`} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0 break-words text-sm text-zinc-200">{book.title}</span>
                      {book.accessionNo && (
                        <span className="max-w-[42%] shrink-0 truncate font-mono text-xs text-zinc-400 sm:max-w-none">
                          {book.accessionNo}
                        </span>
                      )}
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

