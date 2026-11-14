import { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { appLabel } from "../appNames";
import { useAgo, useDevice } from "../hooks";
import { LuckButton, LuckTabs, TabItem } from "../luck";

/** Cabeçalho de página: título, subtítulo e ações à direita. */
export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row gap-sm wrap">{actions}</div>}
    </header>
  );
}

/** Botão de recarregar com a idade do dado ao lado. */
export function Refresh({ onClick, loading, at }: { onClick: () => void; loading: boolean; at: number | null }) {
  const ago = useAgo(at);
  return (
    <span className="row gap-sm">
      <span className="muted small">{ago}</span>
      <LuckButton variant="ghost" size="sm" loading={loading} iconLeft={<RefreshCw size={14} />} onClick={onClick}>Atualizar</LuckButton>
    </span>
  );
}

/** Abas guardadas na rota, para que links de outras telas abram a aba certa. */
export function useTab<T extends string>(fallback: T, valid: readonly T[]): [T, (t: T) => void] {
  const { route, go } = useDevice();
  const tab = valid.includes(route.tab as T) ? (route.tab as T) : fallback;
  return [tab, (t: T) => go({ area: route.area, tab: t })];
}

export const Tabs = <T extends string,>(p: { value: T; items: TabItem<T>[]; onChange: (v: T) => void; label: string }) => (
  <div className="page-tabs"><LuckTabs {...p} /></div>
);

/** Lista chave/valor; linhas sem valor somem (bloco indisponível nesta marca/versão). */
export function KV({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v != null && v !== "" && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="kv">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Nome do app clicável que abre o detalhe. */
export function AppLink({ pkg, sub }: { pkg: string; sub?: boolean }) {
  const { openApp } = useDevice();
  return (
    <button type="button" className="app-link" onClick={(e) => { e.stopPropagation(); openApp(pkg); }} title={pkg}>
      <span>{appLabel(pkg)}</span>
      {sub !== false && <small className="mono">{pkg}</small>}
    </button>
  );
}

/** Lista de pacotes, cada um abrindo o detalhe do app. */
export function PkgList({ items, empty = "nenhum" }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="muted small">{empty}</span>;
  return (
    <ul className="pkg-list">
      {items.map((p) => (
        <li key={p}><AppLink pkg={p} /></li>
      ))}
    </ul>
  );
}

/** Evita que um clique num botão dentro de uma linha clicável abra a linha. */
export const Stop = ({ children }: { children: ReactNode }) => (
  <span className="row gap-xs end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{children}</span>
);
