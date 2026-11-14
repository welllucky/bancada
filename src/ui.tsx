import { ReactNode, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info, Loader2, OctagonAlert, RefreshCw, X } from "lucide-react";

export const Page = ({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) => (
  <div className="page">
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row gap">{actions}</div>}
    </header>
    {children}
  </div>
);

export const Card = ({ title, icon, extra, children, className = "" }: { title?: ReactNode; icon?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card ${className}`}>
    {(title || extra) && (
      <div className="card-head">
        <h3>
          {icon}
          {title}
        </h3>
        {extra}
      </div>
    )}
    {children}
  </section>
);

export const Kpi = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) => (
  <div className={`kpi ${tone ?? ""}`}>
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">{value}</span>
    {hint && <span className="kpi-hint">{hint}</span>}
  </div>
);

export const Badge = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export const SeverityIcon = ({ s }: { s: "critical" | "warn" | "info" }) =>
  s === "critical" ? <OctagonAlert size={18} className="tone-bad" /> : s === "warn" ? <AlertTriangle size={18} className="tone-warn" /> : <Info size={18} className="tone-accent" />;

export const Loading = ({ label = "Lendo o aparelho…" }: { label?: string }) => (
  <div className="loading">
    <Loader2 className="spin" size={18} /> {label}
  </div>
);

export const ErrorBox = ({ error }: { error: string }) => <div className="error-box">{error}</div>;

export const RefreshBtn = ({ onClick, loading }: { onClick: () => void; loading?: boolean }) => (
  <button className="btn ghost" onClick={onClick} disabled={loading} title="Atualizar">
    <RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar
  </button>
);

export const Bar = ({ value, max, tone = "accent" }: { value: number; max: number; tone?: string }) => (
  <div className="bar">
    <div className={`bar-fill ${tone}`} style={{ width: `${Math.max(1, Math.min(100, (value / (max || 1)) * 100))}%` }} />
  </div>
);

const PART_COLORS: Record<string, string> = {
  screen: "var(--c1)", cpu: "var(--c2)", wakelock: "var(--c3)", mobile_radio: "var(--c4)", wifi: "var(--c5)",
  bluetooth: "var(--c6)", audio: "var(--c7)", video: "var(--c8)", gnss: "var(--c9)", sensors: "var(--c10)",
  camera: "var(--c11)", flashlight: "var(--c12)",
};
export const partColor = (k: string) => PART_COLORS[k] ?? "var(--muted)";

export const StackBar = ({ parts, max }: { parts: Record<string, number>; max: number }) => {
  const entries = Object.entries(parts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bar stack" title={entries.map(([k, v]) => `${k}: ${v.toFixed(1)} mAh`).join("\n")}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ width: `${(v / (max || 1)) * 100}%`, background: partColor(k) }} />
      ))}
    </div>
  );
};

export const Gauge = ({ pct, label, sub, tone }: { pct: number; label: string; sub?: string; tone?: string }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="gauge">
      <svg viewBox="0 0 120 120" width="140" height="140" role="img" aria-label={`${label} ${p}%`}>
        <circle cx="60" cy="60" r={r} className="gauge-track" />
        <circle cx="60" cy="60" r={r} className={`gauge-val ${tone ?? ""}`} strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
        <text x="60" y="58" textAnchor="middle" className="gauge-num">{Math.round(p)}%</text>
        <text x="60" y="78" textAnchor="middle" className="gauge-sub">{label}</text>
      </svg>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
};

export interface Series {
  label: string;
  color: string;
  points: [number, number][];
  axis?: "left" | "right";
  unit?: string;
}

/** Minimal responsive SVG time chart with optional shaded bands (e.g. screen-on). */
export const TimeChart = ({ series, bands = [], height = 220, leftDomain, rightDomain }: {
  series: Series[];
  bands?: [number, number][];
  height?: number;
  leftDomain?: [number, number];
  rightDomain?: [number, number];
}) => {
  const W = 900, H = height, P = { l: 40, r: 44, t: 10, b: 24 };
  const all = series.flatMap((s) => s.points);
  const [hover, setHover] = useState<number | null>(null);
  const geo = useMemo(() => {
    if (!all.length) return null;
    const x0 = Math.min(...all.map((p) => p[0]));
    const x1 = Math.max(...all.map((p) => p[0]));
    const dom = (axis: "left" | "right", fixed?: [number, number]): [number, number] => {
      if (fixed) return fixed;
      const ys = series.filter((s) => (s.axis ?? "left") === axis).flatMap((s) => s.points.map((p) => p[1]));
      if (!ys.length) return [0, 1];
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const pad = (hi - lo || 1) * 0.1;
      return [lo - pad, hi + pad];
    };
    return { x0, x1: x1 === x0 ? x0 + 1 : x1, L: dom("left", leftDomain), R: dom("right", rightDomain) };
  }, [series, leftDomain, rightDomain]);
  if (!geo) return <div className="empty">Sem dados ainda.</div>;
  const sx = (x: number) => P.l + ((x - geo.x0) / (geo.x1 - geo.x0)) * (W - P.l - P.r);
  const sy = (y: number, axis: "left" | "right" = "left") => {
    const [lo, hi] = axis === "left" ? geo.L : geo.R;
    return H - P.b - ((y - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  };
  const ticks = 5;
  const xt = Array.from({ length: ticks }, (_, i) => geo.x0 + ((geo.x1 - geo.x0) * i) / (ticks - 1));
  const span = geo.x1 - geo.x0;
  const xl = (t: number) =>
    new Date(t * 1000).toLocaleString("pt-BR", span > 2 * 86400 ? { day: "2-digit", month: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const hx = hover != null ? geo.x0 + ((hover - P.l) / (W - P.l - P.r)) * (geo.x1 - geo.x0) : null;
  const nearest = (s: Series) => {
    if (hx == null || !s.points.length) return null;
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p[0] - hx) < Math.abs(best[0] - hx)) best = p;
    return best;
  };
  return (
    <div className="chart">
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
            {hover != null && nearest(s) && <b> {nearest(s)![1].toFixed(s.unit === "%" ? 0 : 1)}{s.unit}</b>}
          </span>
        ))}
        {bands.length > 0 && (
          <span>
            <i className="band-swatch" /> tela ligada
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        setHover(((e.clientX - r.left) / r.width) * W);
      }} onMouseLeave={() => setHover(null)}>
        {bands.map(([a, b], i) => (
          <rect key={i} x={sx(Math.max(a, geo.x0))} y={P.t} width={Math.max(1, sx(Math.min(b, geo.x1)) - sx(Math.max(a, geo.x0)))} height={H - P.t - P.b} className="band" />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = P.t + f * (H - P.t - P.b);
          const [lo, hi] = geo.L;
          return (
            <g key={f}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} className="grid" />
              <text x={P.l - 6} y={y + 4} textAnchor="end" className="axis">{(hi - f * (hi - lo)).toFixed(0)}</text>
              {series.some((s) => s.axis === "right") && (
                <text x={W - P.r + 6} y={y + 4} className="axis">{(geo.R[1] - f * (geo.R[1] - geo.R[0])).toFixed(0)}</text>
              )}
            </g>
          );
        })}
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" className="axis">{xl(t)}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke"
            points={s.points.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1], s.axis).toFixed(1)}`).join(" ")} />
        ))}
        {hover != null && <line x1={hover} x2={hover} y1={P.t} y2={H - P.b} className="cursor" />}
      </svg>
    </div>
  );
};

export interface Col<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  align?: "right";
  width?: string;
}

export function Table<T>({ rows, cols, initialSort, empty = "Nada por aqui.", rowKey, onRow, limit }: {
  rows: T[];
  cols: Col<T>[];
  initialSort?: { key: string; desc: boolean };
  empty?: string;
  rowKey: (r: T, i: number) => string;
  onRow?: (r: T) => void;
  limit?: number;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    const c = cols.find((c) => c.key === sort?.key);
    if (!c?.sort) return rows;
    const f = c.sort;
    return [...rows].sort((a, b) => {
      const va = f(a), vb = f(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return sort!.desc ? -r : r;
    });
  }, [rows, sort, cols]);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} className={c.sort ? "sortable" : ""}
                onClick={() => c.sort && setSort({ key: c.key, desc: sort?.key === c.key ? !sort.desc : true })}>
                {c.label}
                {sort?.key === c.key && (sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={rowKey(r, i)} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? "clickable" : ""}>
              {cols.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const KV = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="kv">
    {items.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v ?? "—"}</dd>
      </div>
    ))}
  </dl>
);

export const Drawer = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) =>
  !open ? null : (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );

export const Segmented = <T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="segmented">
    {options.map(([v, l]) => (
      <button key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>
    ))}
  </div>
);
