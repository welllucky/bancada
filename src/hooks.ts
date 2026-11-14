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
  /** Muda quando chegam nomes reais de apps, para quem mostra nomes redesenhar. */
  labelsRev?: number;
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

/** Último resultado de cada leitura, por aparelho + função + dependências. Vive enquanto o app está aberto. */
const cache = new Map<string, { data: unknown; at: number }>();

/** Recarregadores das leituras na tela, para atualizar tudo depois de uma ação no aparelho. */
const reloaders = new Set<() => void>();
/** Atualiza todas as leituras visíveis (mantendo o dado atual esmaecido até chegar o novo). */
export function reloadAll() {
  reloaders.forEach((f) => f());
}

/** Leituras que estão mostrando dado antigo enquanto buscam o novo (para esmaecer a área). */
const staleKeys = new Set<string>();
const staleSubs = new Set<() => void>();
const setStale = (k: string, on: boolean) => {
  if (on === staleKeys.has(k)) return;
  if (on) staleKeys.add(k);
  else staleKeys.delete(k);
  staleSubs.forEach((f) => f());
};
/** Verdadeiro enquanto alguma tela mostra dado antigo e atualiza em segundo plano. */
export function useAnyStale(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    staleSubs.add(f);
    return () => { staleSubs.delete(f); };
  }, []);
  return staleKeys.size > 0;
}

/**
 * Carrega dados do aparelho atual; intervalo opcional de atualização em ms.
 * Na primeira vez `data` é nulo (a tela mostra o spinner). Ao voltar a uma tela já vista, devolve o último
 * dado na hora, com `stale` verdadeiro, e atualiza em segundo plano.
 */
export function useLoad<T>(fn: ((serial: string) => Promise<T>) | null, deps: unknown[] = [], interval?: number) {
  const { serial } = useDevice();
  const key = fn && serial ? `${serial}|${fn.toString()}|${JSON.stringify(deps)}` : null;
  const cached = key ? (cache.get(key) as { data: T; at: number } | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStaleState] = useState(!!cached);
  const [at, setAt] = useState<number | null>(cached?.at ?? null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!serial || !fnRef.current || !key) return;
    const id = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current(serial);
      if (id !== seq.current) return;
      const now = Date.now();
      cache.set(key, { data: v, at: now });
      setData(v);
      setError(null);
      setAt(now);
    } catch (e) {
      if (id === seq.current) setError(String(e));
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setStaleState(false);
        setStale(key, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, key]);

  useEffect(() => {
    const c = key ? (cache.get(key) as { data: T; at: number } | undefined) : undefined;
    setData(c?.data ?? null);
    setAt(c?.at ?? null);
    setStaleState(!!c);
    if (key && c) setStale(key, true);
    reload();
    const id = interval ? setInterval(reload, interval) : undefined;
    const again = () => {
      if (key) setStale(key, true);
      setStaleState(true);
      reload();
    };
    reloaders.add(again);
    return () => {
      reloaders.delete(again);
      if (id) clearInterval(id);
      if (key) setStale(key, false);
    };
  }, [reload, interval, key]);

  return { data, error, loading, reload, at, stale };
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
