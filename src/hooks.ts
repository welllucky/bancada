import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Action } from "./api";

export type Area = "inicio" | "diagnostico" | "apps" | "aparelho" | "historico";

/** Destino de navegação: uma área, opcionalmente uma aba dela e um app aberto no detalhe. */
export interface Route {
  area: Area;
  tab?: string;
  app?: string;
}

export interface DeviceCtx {
  serial: string | null;
  route: Route;
  go: (to: Route) => void;
  /** Abre o detalhe do app, de qualquer tela. */
  openApp: (pkg: string) => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
  confirmAction: (opts: { title: string; body: string; action: Action; danger?: boolean }) => Promise<boolean>;
}

export const Ctx = createContext<DeviceCtx>({
  serial: null,
  route: { area: "inicio" },
  go: () => {},
  openApp: () => {},
  toast: () => {},
  confirmAction: async () => false,
});

export const useDevice = () => useContext(Ctx);

/** Carrega dados do aparelho atual; intervalo opcional de atualização em ms. */
export function useLoad<T>(fn: ((serial: string) => Promise<T>) | null, deps: unknown[] = [], interval?: number) {
  const { serial } = useDevice();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    if (!serial || !fnRef.current) return;
    setLoading(true);
    try {
      setData(await fnRef.current(serial));
      setError(null);
      setAt(Date.now());
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

  return { data, error, loading, reload, at };
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

/** "há 12 s", "há 3 min": idade de um dado carregado, atualizada a cada 5 s. */
export function useAgo(at: number | null): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);
  if (at == null) return "carregando…";
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? `atualizado há ${s} s` : `atualizado há ${Math.round(s / 60)} min`;
}
