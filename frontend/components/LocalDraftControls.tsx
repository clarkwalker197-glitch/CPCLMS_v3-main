"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { X } from "lucide-react";

export type LocalDraft<T> = {
  id: string;
  label: string;
  updatedAt: number;
  data: T;
};

type LocalDraftOptions<T, Stored> = {
  isEmpty: (value: T) => boolean;
  getLabel: (value: T, createdAt: number) => string;
  serialize: (value: T) => Stored;
  deserialize: (data: Stored, initialValue: T) => T;
  onRestore?: (value: T) => void;
};

export function useLocalDrafts<T extends Record<string, unknown>, Stored = T>(
  storageKey: string,
  initialValue: T,
  value: T,
  setValue: Dispatch<SetStateAction<T>>,
  options: LocalDraftOptions<T, Stored>,
) {
  const initialValueRef = useRef(initialValue);
  const optionsRef = useRef(options);
  const [drafts, setDrafts] = useState<LocalDraft<Stored>[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const persist = useCallback((nextDrafts: LocalDraft<Stored>[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextDrafts));
      setError("");
    } catch {
      setError("Drafts could not be saved in this browser.");
    }
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const validDrafts = parsed.filter((draft): draft is LocalDraft<Stored> =>
              !!draft &&
              typeof draft === "object" &&
              typeof draft.id === "string" &&
              typeof draft.label === "string" &&
              typeof draft.updatedAt === "number" &&
              "data" in draft
            );
            const sortedDrafts = validDrafts.sort((a, b) => b.updatedAt - a.updatedAt);
            setDrafts(sortedDrafts);
            const latestDraft = sortedDrafts[0];
            if (latestDraft) {
              setActiveDraftId(latestDraft.id);
              const restored = optionsRef.current.deserialize(latestDraft.data, initialValueRef.current);
              setValue(restored);
              optionsRef.current.onRestore?.(restored);
            }
          }
        }
      } catch {
        setError("Saved drafts could not be read from this browser.");
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setValue, storageKey]);

  useEffect(() => {
    if (!ready || optionsRef.current.isEmpty(value)) return;

    const timer = window.setTimeout(() => {
      const now = Date.now();
      const id = activeDraftId || crypto.randomUUID();
      const draft: LocalDraft<Stored> = {
        id,
        label: optionsRef.current.getLabel(value, now),
        updatedAt: now,
        data: optionsRef.current.serialize(value),
      };
      setDrafts((current) => {
        const next = [draft, ...current.filter((item) => item.id !== id)];
        persist(next);
        return next;
      });
      if (!activeDraftId) setActiveDraftId(id);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [activeDraftId, persist, ready, value]);

  const commitCurrent = useCallback((current: LocalDraft<Stored>[]) => {
    if (!ready || optionsRef.current.isEmpty(value)) return current;
    const now = Date.now();
    const id = activeDraftId || crypto.randomUUID();
    const draft: LocalDraft<Stored> = {
      id,
      label: optionsRef.current.getLabel(value, now),
      updatedAt: now,
      data: optionsRef.current.serialize(value),
    };
    return [draft, ...current.filter((item) => item.id !== id)];
  }, [activeDraftId, ready, value]);

  const selectDraft = useCallback((id: string) => {
    const selected = drafts.find((draft) => draft.id === id);
    if (!selected) return;
    const current = commitCurrent(drafts);
    const next = current.map((draft) => draft.id === id ? { ...draft, updatedAt: Date.now() } : draft)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setDrafts(next);
    persist(next);
    setActiveDraftId(id);
    const restored = optionsRef.current.deserialize(selected.data, initialValueRef.current);
    setValue(restored);
    optionsRef.current.onRestore?.(restored);
  }, [commitCurrent, drafts, persist, setValue]);

  const startNewDraft = useCallback(() => {
    const current = commitCurrent(drafts);
    const id = crypto.randomUUID();
    const now = Date.now();
    const blank: LocalDraft<Stored> = {
      id,
      label: optionsRef.current.getLabel(initialValueRef.current, now),
      updatedAt: now,
      data: optionsRef.current.serialize(initialValueRef.current),
    };
    const next = [blank, ...current.filter((draft) => draft.id !== id)];
    setDrafts(next);
    persist(next);
    setActiveDraftId(id);
    setValue(initialValueRef.current);
    optionsRef.current.onRestore?.(initialValueRef.current);
  }, [commitCurrent, drafts, persist, setValue]);

  const discardDraft = useCallback(() => {
    if (!activeDraftId) return;
    const next = drafts.filter((draft) => draft.id !== activeDraftId);
    const nextActive = next[0];
    setDrafts(next);
    persist(next);
    setActiveDraftId(nextActive?.id || null);
    const restored = nextActive
      ? optionsRef.current.deserialize(nextActive.data, initialValueRef.current)
      : initialValueRef.current;
    setValue(restored);
    optionsRef.current.onRestore?.(restored);
  }, [activeDraftId, drafts, persist, setValue]);

  const clearActiveDraft = useCallback(() => {
    const next = drafts.filter((draft) => draft.id !== activeDraftId);
    setDrafts(next);
    persist(next);
    setActiveDraftId(null);
    setValue(initialValueRef.current);
    optionsRef.current.onRestore?.(initialValueRef.current);
  }, [activeDraftId, drafts, persist, setValue]);

  return {
    drafts,
    activeDraftId,
    error,
    selectDraft,
    startNewDraft,
    discardDraft,
    clearActiveDraft,
  };
}

export function LocalDraftControls<T>({
  drafts,
  activeDraftId,
  error,
  note,
  onSelect,
  onNew,
  onDiscard,
}: {
  drafts: LocalDraft<T>[];
  activeDraftId: string | null;
  error: string;
  note: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDiscard: () => void;
}) {
  return (
    <section aria-label="Drafts" className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="form-draft-select" className="sr-only">Saved drafts</label>
        <select
          id="form-draft-select"
          value={activeDraftId || ""}
          onChange={(event) => onSelect(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
        >
          <option value="" disabled>{drafts.length ? "Select a saved draft" : "No saved drafts yet"}</option>
          {drafts.map((draft) => (
            <option key={draft.id} value={draft.id}>{draft.label}</option>
          ))}
        </select>
        <button type="button" onClick={onNew} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
          New draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={!activeDraftId}
          aria-label="Discard selected draft"
          className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">{note}</p>
      {error && <p role="alert" className="mt-2 text-xs text-amber-300">{error}</p>}
    </section>
  );
}
