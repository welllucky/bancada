import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { appLabel } from "./appNames";
import { useDevice } from "./hooks";

/**
 * Logo real do app, extraída do APK no aparelho (ver `icons.rs`). Enquanto não chega, ou quando o app não tem
 * ícone que saibamos desenhar, mostra a inicial do nome.
 *
 * Cada ícone custa uma cópia do APK na primeira vez (depois fica em cache no disco), então só pedimos os que
 * aparecem na tela, um de cada vez, e cancelamos os que saíram da tela antes da vez deles.
 */

const known = new Map<string, string | null>();
type Job = { key: string; run: () => Promise<void>; cancelled: boolean };
const queue: Job[] = [];
let running = false;

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    if (!job.cancelled) await job.run().catch(() => {});
  }
  running = false;
}

const waiters = new Map<string, Set<(v: string | null) => void>>();

function request(serial: string, pkg: string, cb: (v: string | null) => void): () => void {
  const key = `${serial}|${pkg}`;
  if (known.has(key)) {
    cb(known.get(key)!);
    return () => {};
  }
  let set = waiters.get(key);
  let job: Job | undefined;
  if (!set) {
    set = new Set();
    waiters.set(key, set);
    job = {
      key,
      cancelled: false,
      run: async () => {
        let v: string | null = null;
        try {
          v = await api.appIcon(serial, pkg);
        } finally {
          known.set(key, v);
          waiters.get(key)?.forEach((f) => f(v));
          waiters.delete(key);
        }
      },
    };
    queue.push(job);
    pump();
  }
  set.add(cb);
  return () => {
    const s = waiters.get(key);
    s?.delete(cb);
    // Ninguém mais espera este ícone: se ainda não começou, sai da fila.
    if (s && s.size === 0) {
      const j = queue.find((q) => q.key === key);
      if (j) {
        j.cancelled = true;
        waiters.delete(key);
      }
    }
  };
}

export function AppIcon({ pkg, size = 28 }: { pkg: string; size?: number }) {
  const { serial } = useDevice();
  const key = `${serial}|${pkg}`;
  const [src, setSrc] = useState<string | null | undefined>(known.has(key) ? known.get(key) : undefined);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!serial || known.has(key)) {
      setSrc(known.get(key));
      return;
    }
    const el = ref.current;
    let cancel = () => {};
    const start = () => (cancel = request(serial, pkg, setSrc));
    if (!el || typeof IntersectionObserver === "undefined") {
      start();
      return () => cancel();
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancel();
    };
  }, [serial, pkg, key]);

  const name = appLabel(pkg);
  return (
    <span ref={ref} className={`app-icon ${src ? "has-img" : ""}`} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
      {src ? <img src={src} alt="" width={size} height={size} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
