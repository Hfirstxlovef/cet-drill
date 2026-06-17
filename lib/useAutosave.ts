"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
  flush: () => Promise<void>;
}

export interface UseAutosaveOptions<T> {
  value: T;
  save: (value: T) => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
}

export function useAutosave<T>({
  value,
  save,
  delayMs = 800,
  enabled = true,
}: UseAutosaveOptions<T>): AutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSavedRef = useRef<T>(value);
  const valueRef = useRef<T>(value);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(0);

  valueRef.current = value;
  saveRef.current = save;
  enabledRef.current = enabled;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const runSave = useCallback(async (snapshot: T) => {
    const epoch = ++epochRef.current;
    const isCurrent = () => epoch === epochRef.current;
    if (isCurrent()) setStatus("saving");
    try {
      await saveRef.current(snapshot);
      if (!isCurrent()) return;
      lastSavedRef.current = snapshot;
      setLastSavedAt(new Date());
      setError(null);
      setStatus("saved");
    } catch (e) {
      if (!isCurrent()) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (Object.is(value, lastSavedRef.current)) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSave(valueRef.current);
    }, delayMs);
    return clearTimer;
  }, [value, enabled, delayMs, runSave]);

  const flush = useCallback(async () => {
    clearTimer();
    if (Object.is(valueRef.current, lastSavedRef.current)) return;
    await runSave(valueRef.current);
  }, [runSave]);

  useEffect(() => {
    return () => {
      clearTimer();
      if (!Object.is(valueRef.current, lastSavedRef.current)) {
        void saveRef.current(valueRef.current).catch(() => {});
      }
    };
  }, []);

  return { status, lastSavedAt, error, flush };
}
