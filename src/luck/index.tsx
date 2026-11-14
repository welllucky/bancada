/**
 * Fachada do Luck Design System na Bancada.
 *
 * Os componentes `Luck*` seguem nomes e props do `@welllucky/luck-react`. Enquanto o pacote não pode ser
 * instalado (registro privado do GitHub Packages), eles são implementados aqui com os tokens do Luck;
 * a troca para o pacote real acontece só neste arquivo. Os componentes de `proposed.tsx` ainda não
 * existem no Luck e são candidatos a contribuição.
 */
import { ReactNode, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import "./luck.css";

export type Tone = "neutral" | "accent" | "danger" | "success" | "warning" | "company";

export function LuckCard({ heading, index, hint, extra, padded = true, className = "", children, style }: {
  heading?: ReactNode;
  index?: string;
  hint?: ReactNode;
  /** Controles à direita da barra (fora do Luck: lá vão no slot). */
  extra?: ReactNode;
  padded?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  const bar = heading != null || index != null;
  return (
    <section className={`l-card ${padded ? "l-card--padded" : ""} ${className}`} style={style}>
      {bar && (
        <div className="l-card__bar">
          {index && <b>{index}</b>}
          <span>{heading}</span>
          {hint && <small className="l-card__hint">{hint}</small>}
          {extra && <div className="l-card__extra">{extra}</div>}
        </div>
      )}
      <div className="l-card__body">{children}</div>
    </section>
  );
}

export function LuckButton({ variant = "secondary", size = "md", iconLeft, iconRight, loading, disabled, danger, fullWidth, onClick, children, type = "button", title, ...rest }: {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Texto em vermelho para ações destrutivas (proposta: variante `danger` no Luck). */
  danger?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      aria-label={rest["aria-label"]}
      aria-busy={loading || undefined}
      className={`l-key l-key--${variant} l-key--${size} ${danger ? "l-key--danger" : ""}`}
      style={fullWidth ? { width: "100%" } : undefined}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 size={16} className="l-spin" aria-hidden /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

export function LuckIconButton({ label, icon, onClick, size = "md", disabled }: { label: string; icon: ReactNode; onClick?: () => void; size?: "sm" | "md"; disabled?: boolean }) {
  return (
    <button type="button" className={`l-key l-key--ghost l-key--${size} l-key--icon`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {icon}
    </button>
  );
}

export function LuckBadge({ tone = "neutral", dot, icon, children }: { tone?: Tone; dot?: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`l-badge l-badge--${tone}`}>
      {dot && <i className="l-badge__dot" aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

export function LuckStat({ value, unit, caption, pending }: { value: ReactNode; unit?: string; caption?: ReactNode; pending?: boolean }) {
  return (
    <div className="l-stat">
      <div className="l-stat__value">
        {pending ? <span className="l-skeleton" style={{ width: 80, height: 34 }} /> : <strong>{value}</strong>}
        {unit && !pending && <span>{unit}</span>}
      </div>
      {caption && <span className="l-stat__caption">{caption}</span>}
    </div>
  );
}

export function LuckMeter({ label, value, max = 100, tone = "accent", valueText, compact }: {
  label: string;
  value: number;
  max?: number;
  tone?: Tone;
  valueText?: string;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={`l-meter l-meter--${tone}`}>
      {!compact && (
        <div className="l-meter__head">
          <span>{label}</span>
          <span>{valueText ?? `${Math.round(pct)}%`}</span>
        </div>
      )}
      <div className="l-meter__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}>
        <div className="l-meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  badge?: ReactNode;
}

export function LuckTabs<T extends string>({ value, items, onChange, label }: { value: T; items: TabItem<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="l-tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" className="l-tab" aria-selected={it.value === value} onClick={() => onChange(it.value)}>
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  );
}

export function LuckSwitch({ checked, label, onChange, disabled }: { checked: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="l-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function LuckDialog({ open, heading, description, persistent, onClose, children }: {
  open: boolean;
  heading: string;
  description?: ReactNode;
  persistent?: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open, persistent, onClose]);
  if (!open) return null;
  return (
    <div className="l-dialog-backdrop" onClick={() => !persistent && onClose()}>
      <div ref={ref} className="l-dialog" role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()}>
        <h2>{heading}</h2>
        {description && <p>{description}</p>}
        {children}
      </div>
    </div>
  );
}

export * from "./proposed";
