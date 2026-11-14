import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Action } from "./api";

export interface DeviceCtx {
  serial: string | null;
  toast: (msg: string, kind?: "ok" | "err") => void;
  confirmAction: (opts: { title: string; body: string; action: Action; danger?: boolean }) => Promise<boolean>;
}

export const Ctx = createContext<DeviceCtx>({
  serial: null,
  toast: () => {},
  confirmAction: async () => false,
});

export const useDevice = () => useContext(Ctx);

/** Load data for the current device; optional polling interval in ms. */
export function useLoad<T>(fn: ((serial: string) => Promise<T>) | null, deps: unknown[] = [], interval?: number) {
  const { serial } = useDevice();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    if (!serial || !fnRef.current) return;
    setLoading(true);
    try {
      setData(await fnRef.current(serial));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, ...deps]);

  useEffect(() => {
    setData(null);
    reload();
    if (!interval) return;
    const id = setInterval(reload, interval);
    return () => clearInterval(id);
  }, [reload, interval]);

  return { data, error, loading, reload };
}

export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, JSON.stringify(nv));
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}
