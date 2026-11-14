/**
 * Componentes que a Bancada precisa e que o Luck ainda não tem. Ficam com a mesma linguagem
 * (tokens, teclas, poços) para virarem contribuições ao design system: `luck-issue`, `luck-banner`,
 * `luck-steps`, `luck-table`, variante segmentada do `luck-radio-group`.
 */
import { KeyboardEvent, ReactNode, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Circle, Info, Loader2, OctagonAlert, X } from "lucide-react";

export type Severity = "danger" | "warning" | "success" | "neutral";

export function SeverityMark({ tone, size = 18 }: { tone: Severity; size?: number }) {
  const Icon = tone === "danger" ? OctagonAlert : tone === "warning" ? AlertTriangle : tone === "success" ? Check : Info;
  return (
    <div className={`l-sev l-sev--${tone}`} aria-hidden>
      <Icon size={size} />
    </div>
  );
}

/** Item de diagnóstico: o que acontece, por que importa, evidência e ação. */
export function Issue({ tone, title, badge, detail, evidence, actions }: {
  tone: Severity;
  title: ReactNode;
  badge?: ReactNode;
  detail?: ReactNode;
  evidence?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="l-issue">
      <SeverityMark tone={tone} />
      <div style={{ minWidth: 0 }}>
        <div className="l-issue__title">
          <strong>{title}</strong>
          {badge}
        </div>
        {detail && <p className="l-issue__detail">{detail}</p>}
        {evidence && <code className="l-evidence">{evidence}</code>}
      </div>
      {actions && <div className="l-issue__actions">{actions}</div>}
    </div>
  );
}

/** Veredito em destaque (topo do Início). */
export function Banner({ tone, eyebrow, title, children, action }: { tone: Severity; eyebrow?: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`l-card l-banner l-banner--${tone}`}>
      <SeverityMark tone={tone} size={28} />
      <div style={{ flex: 1, minWidth: 260 }}>
        {eyebrow && <span className="label">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </section>
  );
}

export type StepState = "done" | "current" | "error" | "todo";

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="l-steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ol>;
}

export function Step({ state, title, children }: { state: StepState; title: ReactNode; children?: ReactNode }) {
  const icon =
    state === "done" ? <Check size={16} /> : state === "current" ? <Loader2 size={16} className="l-spin" /> : state === "error" ? <X size={16} /> : <Circle size={10} />;
  return (
    <li className={`l-step l-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
      <div className="l-step__mark" aria-hidden>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <strong>{title}</strong>
        {children && <div style={{ marginTop: 4 }}>{children}</div>}
      </div>
    </li>
  );
}

/** Seletor segmentado com semântica de radio (ex.: frequência em segundo plano). */
export function Segmented<T extends string>({ value, options, onChange, label, disabled }: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="l-tabs l-segmented" role="radiogroup" aria-label={label} style={{ display: "grid" }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" className="l-tab" aria-checked={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface Col<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  align?: "right";
  width?: string;
}

/** Tabela ordenável; linhas com `onRow` são links acessíveis por teclado (Enter/Espaço). */
export function DataTable<T>({ rows, cols, initialSort, empty = "Nada por aqui.", rowKey, onRow, rowLabel, limit }: {
  rows: T[];
  cols: Col<T>[];
  initialSort?: { key: string; desc: boolean };
  empty?: string;
  rowKey: (r: T, i: number) => string;
  onRow?: (r: T) => void;
  /** Nome acessível da linha quando ela é clicável. */
  rowLabel?: (r: T) => string;
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
  if (!rows.length) return <div className="l-empty">{empty}</div>;
  const key = (r: T) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRow?.(r);
    }
  };
  return (
    <div className="l-table-wrap">
      <table className="l-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                {c.sort ? (
                  <button type="button" onClick={() => setSort({ key: c.key, desc: sort?.key === c.key ? !sort.desc : true })}>
                    {c.label}
                    {sort?.key === c.key && (sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr
              key={rowKey(r, i)}
              className={onRow ? "is-link" : ""}
              tabIndex={onRow ? 0 : undefined}
              aria-label={onRow && rowLabel ? rowLabel(r) : undefined}
              onClick={onRow ? () => onRow(r) : undefined}
              onKeyDown={onRow ? key(r) : undefined}
            >
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

export const Empty = ({ children }: { children: ReactNode }) => <div className="l-empty">{children}</div>;

export const Skeleton = ({ width = "100%", height = 16 }: { width?: number | string; height?: number }) => (
  <span className="l-skeleton" style={{ display: "block", width, height }} aria-hidden />
);

export const Loading = ({ label = "Lendo o aparelho…" }: { label?: string }) => (
  <div className="l-empty" role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
    <Loader2 size={16} className="l-spin" aria-hidden /> {label}
  </div>
);

/** Erro em linguagem simples, com o detalhe técnico recolhido. */
export function ErrorNote({ error, title = "Não foi possível ler este dado" }: { error: string; title?: string }) {
  return (
    <div role="alert" className="l-card" style={{ padding: "14px 18px", borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}>
      <strong style={{ color: "var(--danger)" }}>{title}</strong>
      <details style={{ marginTop: 4 }}>
        <summary className="muted small" style={{ cursor: "pointer" }}>detalhe técnico</summary>
        <code className="l-evidence" style={{ display: "block" }}>{error}</code>
      </details>
    </div>
  );
}
