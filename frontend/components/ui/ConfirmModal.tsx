'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Info, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { ModalLayer } from '@/components/ModalLayer';

type DialogVariant = 'default' | 'info' | 'warning' | 'danger';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  dangerous?: boolean;
  onConfirm?: () => void | Promise<void>;
}

export interface AlertOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: Exclude<DialogVariant, 'danger'> | 'danger';
}

interface DialogRequest {
  kind: 'confirm' | 'alert';
  options: ConfirmOptions | AlertOptions;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

const variantStyles: Record<DialogVariant, { icon: string; button: string }> = {
  default: {
    icon: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    button: 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400',
  },
  info: {
    icon: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    button: 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400',
  },
  warning: {
    icon: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    button: 'bg-amber-600 hover:bg-amber-500 focus-visible:ring-amber-400',
  },
  danger: {
    icon: 'bg-red-500/10 text-red-400 ring-red-500/20',
    button: 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-400',
  },
};

function DialogCard({
  request,
  close,
}: {
  request: DialogRequest;
  close: (confirmed: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(false);
  const options = request.options;
  const variant = options.variant || 'default';
  const style = variantStyles[variant];
  const dangerous = request.kind === 'confirm' && (options as ConfirmOptions).dangerous === true;
  const Icon = variant === 'danger' ? ShieldAlert : variant === 'warning' ? AlertTriangle : Info;
  loadingRef.current = loading;

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    (request.kind === 'alert' ? primaryButtonRef.current : cancelButtonRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!dangerous && !loadingRef.current) {
          event.preventDefault();
          close(false);
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = [closeButtonRef.current, cancelButtonRef.current, primaryButtonRef.current]
        .filter((element): element is HTMLButtonElement => Boolean(element && !element.disabled));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [close, dangerous, request.kind]);

  const handleConfirm = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      if (request.kind === 'confirm') {
        await (options as ConfirmOptions).onConfirm?.();
      }
      close(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action could not be completed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <ModalLayer>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !dangerous && !loading) close(false);
        }}
      >
        <section
          ref={dialogRef}
          role={request.kind === 'alert' ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
          className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-2xl shadow-black/60"
        >
          <div className="p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${style.icon}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="confirm-dialog-title" className="text-lg font-semibold text-white">
                  {options.title}
                </h2>
                <p id="confirm-dialog-description" className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-400">
                  {options.description}
                </p>
              </div>
              {!dangerous && (
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => close(false)}
                  disabled={loading}
                  aria-label="Close dialog"
                  className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {request.kind === 'confirm' && (
                <button
                  ref={cancelButtonRef}
                  type="button"
                  onClick={() => close(false)}
                  disabled={loading}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {(options as ConfirmOptions).cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                ref={primaryButtonRef}
                type="button"
                onClick={() => void handleConfirm()}
                disabled={loading}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 ${style.button}`}
              >
                {loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {options.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </ModalLayer>
  );
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const close = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    if (resolverRef.current) {
      resolve(false);
      return;
    }
    resolverRef.current = resolve;
    setRequest({ kind: 'confirm', options });
  }), []);

  const alert = useCallback((options: AlertOptions) => new Promise<void>((resolve) => {
    if (resolverRef.current) {
      resolve();
      return;
    }
    resolverRef.current = () => resolve();
    setRequest({ kind: 'alert', options });
  }), []);

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {request && <DialogCard key={request.kind + request.options.title} request={request} close={close} />}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog(): ConfirmDialogContextValue {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  return context;
}
