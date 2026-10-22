"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

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
  const [readyStorageKey, setReadyStorageKey] = useState<string | null>(null);
  const ready = readyStorageKey === storageKey;
  const valueRef = useRef(value);
  const draftsRef = useRef(drafts);
  const activeDraftIdRef = useRef(activeDraftId);
  const readyRef = useRef(ready);

  useLayoutEffect(() => {
    valueRef.current = value;
    draftsRef.current = drafts;
    activeDraftIdRef.current = activeDraftId;
    readyRef.current = ready;
  }, [activeDraftId, drafts, ready, value]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const persist = useCallback((nextDrafts: LocalDraft<Stored>[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextDrafts));
    } catch (error) {
      console.error("[Drafts] Could not save drafts in this browser.", error);
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
      } catch (error) {
        console.error("[Drafts] Could not read saved drafts from this browser.", error);
      } finally {
        setReadyStorageKey(storageKey);
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

  useEffect(() => {
    const saveLatestDraft = () => {
      const currentValue = valueRef.current;
      const currentOptions = optionsRef.current;
      if (!readyRef.current || currentOptions.isEmpty(currentValue)) return;

      const now = Date.now();
      const id = activeDraftIdRef.current || crypto.randomUUID();
      const draft: LocalDraft<Stored> = {
        id,
        label: currentOptions.getLabel(currentValue, now),
        updatedAt: now,
        data: currentOptions.serialize(currentValue),
      };
      const next = [draft, ...draftsRef.current.filter((item) => item.id !== id)];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        draftsRef.current = next;
        activeDraftIdRef.current = id;
      } catch (error) {
        console.error("[Drafts] Could not save drafts in this browser.", error);
      }
    };

    window.addEventListener("pagehide", saveLatestDraft);
    return () => {
      window.removeEventListener("pagehide", saveLatestDraft);
      saveLatestDraft();
    };
  }, [storageKey]);

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
    selectDraft,
    startNewDraft,
    discardDraft,
    clearActiveDraft,
  };
}
