/** Gráficos em SVG feitos à mão, nos tokens do Luck (sem biblioteca). */
import { useEffect, useMemo, useRef, useState } from "react";

const PART_COLORS: Record<string, string> = {
  screen: "var(--chart-1)", cpu: "var(--chart-2)", wakelock: "var(--chart-3)", mobile_radio: "var(--chart-4)", wifi: "var(--chart-5)",
  bluetooth: "var(--chart-6)", audio: "var(--chart-8)", video: "var(--chart-7)",
};
export const PART_LABEL: Record<string, string> = {
  screen: "tela", cpu: "CPU", wakelock: "acordado", mobile_radio: "dados móveis", wifi: "Wi-Fi", bluetooth: "Bluetooth", audio: "áudio", video: "vídeo",
  gnss: "GPS", sensors: "sensores", camera: "câmera", flashlight: "lanterna",
};
export const partColor = (k: string) => PART_COLORS[k] ?? "var(--fg-faint)";

export const StackBar = ({ parts, max }: { parts: Record<string, number>; max: number }) => {
  const entries = Object.entries(parts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div
      className="l-meter__track"
      style={{ display: "flex", minWidth: 60 }}
      role="img"
      aria-label={entries.map(([k, v]) => `${PART_LABEL[k] ?? k} ${v.toFixed(0)} mAh`).join(", ")}
      title={entries.map(([k, v]) => `${PART_LABEL[k] ?? k}: ${v.toFixed(1)} mAh`).join("\n")}
    >
      {entries.map(([k, v]) => (
        <div key={k} style={{ height: "100%", width: `${(v / (max || 1)) * 100}%`, background: partColor(k) }} />
      ))}
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

export interface Marker {
  t: number;
  label: string;
}

/** Série temporal com faixas (ex.: tela ligada) e marcadores verticais (ex.: ações aplicadas). */
export const TimeChart = ({ series, bands = [], markers = [], height = 220, leftDomain, rightDomain, label }: {
  series: Series[];
  bands?: [number, number][];
  markers?: Marker[];
  height?: number;
  leftDomain?: [number, number];
  rightDomain?: [number, number];
  label: string;
}) => {
  // A largura do viewBox acompanha a largura real, para o texto dos eixos não distorcer.
  const box = useRef<HTMLDivElement>(null);
  const hasData = series.some((s) => s.points.length > 0);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);
  const H = height, P = { l: 40, r: 44, t: 12, b: 24 };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, leftDomain, rightDomain]);
  if (!geo) return <div className="l-empty">Sem amostras neste período.</div>;
  const digits = ([lo, hi]: [number, number]) => (hi - lo < 8 ? 1 : 0);
  const sx = (x: number) => P.l + ((x - geo.x0) / (geo.x1 - geo.x0)) * (W - P.l - P.r);
  const sy = (y: number, axis: "left" | "right" = "left") => {
    const [lo, hi] = axis === "left" ? geo.L : geo.R;
    return H - P.b - ((y - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  };
  const xt = Array.from({ length: 5 }, (_, i) => geo.x0 + ((geo.x1 - geo.x0) * i) / 4);
  const span = geo.x1 - geo.x0;
  const xl = (t: number) =>
    new Date(t * 1000).toLocaleString("pt-BR", span > 2 * 86400 ? { weekday: "short", day: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const hx = hover != null ? geo.x0 + ((hover - P.l) / (W - P.l - P.r)) * (geo.x1 - geo.x0) : null;
  const nearest = (s: Series) => {
    if (hx == null || !s.points.length) return null;
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p[0] - hx) < Math.abs(best[0] - hx)) best = p;
    return best;
  };
  const visibleMarkers = markers.filter((m) => m.t >= geo.x0 && m.t <= geo.x1);
  return (
    <div className="chart" ref={box}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
            {hover != null && nearest(s) && <b> {nearest(s)![1].toFixed(s.unit === "%" ? 0 : 1)}{s.unit}</b>}
          </span>
        ))}
        {bands.length > 0 && <span><i className="band-swatch" /> tela ligada</span>}
        {visibleMarkers.length > 0 && <span><i className="marker-swatch" /> ação aplicada</span>}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={label}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHover(((e.clientX - r.left) / r.width) * W);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {bands.map(([a, b], i) => (
          <rect key={i} x={sx(Math.max(a, geo.x0))} y={P.t} width={Math.max(1, sx(Math.min(b, geo.x1)) - sx(Math.max(a, geo.x0)))} height={H - P.t - P.b} className="band" />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = P.t + f * (H - P.t - P.b);
          const [lo, hi] = geo.L;
          return (
            <g key={f}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} className="grid" />
              <text x={P.l - 6} y={y + 4} textAnchor="end" className="axis">{(hi - f * (hi - lo)).toFixed(digits(geo.L))}</text>
              {series.some((s) => s.axis === "right") && (
                <text x={W - P.r + 6} y={y + 4} className="axis">{(geo.R[1] - f * (geo.R[1] - geo.R[0])).toFixed(digits(geo.R))}</text>
              )}
            </g>
          );
        })}
        {xt.map((t) => (
          <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" className="axis">{xl(t)}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            points={s.points.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1], s.axis).toFixed(1)}`).join(" ")} />
        ))}
        {visibleMarkers.map((m, i) => (
          <g key={`${m.t}-${i}`}>
            <line x1={sx(m.t)} x2={sx(m.t)} y1={P.t} y2={H - P.b} className="marker" vectorEffect="non-scaling-stroke" />
            <title>{m.label}</title>
          </g>
        ))}
        {hover != null && <line x1={hover} x2={hover} y1={P.t} y2={H - P.b} className="cursor" vectorEffect="non-scaling-stroke" />}
      </svg>
      {visibleMarkers.length > 0 && (
        <ul className="marker-list">
          {visibleMarkers.map((m, i) => (
            <li key={`${m.t}-${i}`}><span className="mono">{new Date(m.t * 1000).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span> {m.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Barras simples por categoria (ex.: consumo por dia). A última barra fica em destaque. */
export const Bars = ({ data, unit, label, height = 150 }: { data: { key: string; label: string; value: number }[]; unit: string; label: string; height?: number }) => {
  if (!data.length) return <div className="l-empty">Sem dados ainda.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 560, H = height, B = 24, gap = 16;
  // Barras com largura máxima, centralizadas: com um só dia de dado a barra não ocupa o gráfico inteiro.
  const bw = Math.min(72, (W - gap * (data.length - 1)) / data.length);
  const x0 = (W - (bw * data.length + gap * (data.length - 1))) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} role="img" aria-label={label}>
      <line x1={0} x2={W} y1={H - B} y2={H - B} className="chart-baseline" />
      {data.map((d, i) => {
        const h = ((H - B - 20) * d.value) / max;
        const x = x0 + i * (bw + gap);
        const last = i === data.length - 1;
        return (
          <g key={d.key}>
            <rect x={x} y={H - B - h} width={bw} height={Math.max(1, h)} rx={2} fill={last ? "var(--accent)" : "var(--surface-3)"} />
            {last && <text x={x + bw / 2} y={H - B - h - 6} textAnchor="middle" className="axis strong">{d.value.toFixed(0)} {unit}</text>}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" className={`axis ${last ? "strong" : ""}`}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};
