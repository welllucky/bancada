export const fmtDur = (s?: number | null): string => {
  if (s == null || !isFinite(s)) return "—";
  if (s < 60) return `${Math.round(s)} s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m} min`;
};

export const fmtKb = (kb?: number | null): string => {
  if (kb == null) return "—";
  const gb = kb / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
  return `${(kb / 1024).toFixed(0)} MB`;
};

export const fmtNum = (n?: number | null, digits = 0, unit = ""): string =>
  n == null || !isFinite(n) ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit}`;

export const fmtDate = (ts?: number | null): string =>
  ts == null ? "—" : new Date(ts * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const fmtTime = (ts: number): string =>
  new Date(ts * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const isPkg = (s: string) => /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(s);

export const pkgOf = (procName: string): string | null => {
  const base = procName.split(/\s+/)[0]?.split(":")[0] ?? "";
  return isPkg(base) ? base : null;
};

export const shortPkg = (p: string) => {
  const parts = p.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : p;
};

/** Bytes em B, KB, MB ou GB (base 1024), no formato brasileiro. */
export const fmtBytes = (b?: number | null): string => {
  if (b == null || !isFinite(b)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 || i === 0 ? 0 : 1 })} ${u[i]}`;
};

/** Taxa em bytes por segundo, como "1,2 MB/s". */
export const fmtRate = (bps?: number | null): string => (bps == null ? "—" : `${fmtBytes(bps)}/s`);
