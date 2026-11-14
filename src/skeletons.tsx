import { ReactNode } from "react";
import { LuckCard, Skeleton } from "./luck";

/**
 * Esqueletos do primeiro carregamento, no formato de cada tela: a pessoa já vê onde cada coisa vai ficar.
 * Ao voltar a uma tela já vista não aparecem (o dado antigo fica esmaecido enquanto atualiza).
 */

/** Anuncia o carregamento para leitores de tela; o desenho em si é decorativo. */
function Busy({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sk" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Larguras variadas para não parecer uma grade de tijolos. */
const w = (i: number, base = 60, spread = 30) => `${base + ((i * 37) % spread)}%`;

/** Linha de stats (cards com número grande e legenda). */
export const SkStats = ({ n = 4 }: { n?: number }) => (
  <div className="grid stats">
    {range(n).map((i) => (
      <LuckCard key={i} padded>
        <Skeleton width="55%" height={30} />
        <div style={{ height: 10 }} />
        <Skeleton width={w(i, 50)} height={12} />
      </LuckCard>
    ))}
  </div>
);

/** Área de gráfico: eixos e uma faixa ondulada. */
export const SkChart = ({ heading, height = 200 }: { heading?: string; height?: number }) => (
  <LuckCard heading={heading} padded>
    <div className="sk-chart" style={{ height }}>
      {range(24).map((i) => (
        <span key={i} className="l-skeleton" style={{ height: `${25 + ((i * 53) % 60)}%` }} />
      ))}
    </div>
  </LuckCard>
);

/** Linhas de tabela/lista; `icon` desenha o lugar do ícone do app. */
export const SkRows = ({ rows = 6, icon = false, cols = 2 }: { rows?: number; icon?: boolean; cols?: number }) => (
  <div>
    {range(rows).map((i) => (
      <div key={i} className="sk-row">
        {icon && <Skeleton width={28} height={28} />}
        <div style={{ flex: 1, display: "grid", gap: 6 }}>
          <Skeleton width={w(i, 25, 25)} height={13} />
          {icon && <Skeleton width={w(i + 3, 20, 20)} height={10} />}
        </div>
        {range(cols).map((c) => <Skeleton key={c} width={64} height={13} />)}
      </div>
    ))}
  </div>
);

export const SkTable = ({ heading, rows = 6, icon = false, cols = 2 }: { heading?: string; rows?: number; icon?: boolean; cols?: number }) => (
  <LuckCard heading={heading} padded={false}>
    <SkRows rows={rows} icon={icon} cols={cols} />
  </LuckCard>
);

/** Problemas: marca de severidade, título, explicação e botão. */
export const SkIssues = ({ n = 3 }: { n?: number }) => (
  <div>
    {range(n).map((i) => (
      <div key={i} className="sk-issue">
        <Skeleton width={32} height={32} />
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <Skeleton width={w(i, 30, 25)} height={15} />
          <Skeleton width={w(i, 70, 25)} height={12} />
          <Skeleton width={w(i + 1, 20, 15)} height={20} />
        </div>
        <Skeleton width={110} height={34} />
      </div>
    ))}
  </div>
);

/** Pares rótulo/valor. */
export const SkKV = ({ rows = 5 }: { rows?: number }) => (
  <div style={{ display: "grid", gap: 14 }}>
    {range(rows).map((i) => (
      <div key={i} className="row between gap-md">
        <Skeleton width={w(i, 25, 15)} height={12} />
        <Skeleton width={w(i + 2, 30, 20)} height={12} />
      </div>
    ))}
  </div>
);

// ---- telas

export const SkInicio = () => (
  <Busy label="Lendo o aparelho…">
    <LuckCard padded>
      <div className="row gap-md">
        <Skeleton width={40} height={40} />
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <Skeleton width="40%" height={20} />
          <Skeleton width="60%" height={12} />
        </div>
      </div>
    </LuckCard>
    <SkStats />
    <div className="grid two-1">
      <LuckCard heading="O que resolver primeiro" padded={false}><SkIssues n={3} /></LuckCard>
      <LuckCard heading="Aparelho" padded><SkKV rows={6} /></LuckCard>
    </div>
  </Busy>
);

/** Só a lista de problemas (dentro de um card que já existe). */
export const SkIssueList = ({ n = 3 }: { n?: number }) => (
  <Busy label="Analisando bateria, processos e configurações…"><SkIssues n={n} /></Busy>
);

export const SkProblemas = () => (
  <Busy label="Analisando bateria, processos e configurações…">
    <Skeleton width={220} height={12} />
    <LuckCard heading="Bateria e energia" padded={false}><SkIssues n={2} /></LuckCard>
    <LuckCard heading="Configurações" padded={false}><SkIssues n={3} /></LuckCard>
  </Busy>
);

export const SkBateria = ({ note }: { note?: string }) => (
  <Busy label="Lendo o consumo de bateria…">
    {note && <p className="muted small" style={{ margin: 0 }}>{note}</p>}
    <SkStats />
    <SkChart heading="Nível e temperatura" />
    <SkTable heading="Quem gastou a bateria" icon rows={6} />
  </Busy>
);

export const SkAgora = () => (
  <Busy label="Lendo os processos…">
    <SkStats n={3} />
    <SkTable heading="Processos agora" icon rows={8} cols={3} />
  </Busy>
);

export const SkMemoria = () => (
  <Busy label="Lendo a memória…">
    <SkStats n={2} />
    <SkTable heading="Memória por processo" icon rows={8} />
  </Busy>
);

export const SkApps = () => (
  <Busy label="Listando apps…">
    <LuckCard padded={false}><SkRows rows={9} icon cols={3} /></LuckCard>
  </Busy>
);

export const SkAppDetail = () => (
  <Busy label="Lendo o app…">
    <div className="grid two">
      <SkChart heading="Consumo por dia" height={150} />
      <LuckCard heading="Frequência em segundo plano" padded>
        <Skeleton width="90%" height={12} />
        <div style={{ height: 8 }} />
        <Skeleton width="60%" height={12} />
        <div style={{ height: 16 }} />
        <Skeleton height={40} />
      </LuckCard>
    </div>
    <div className="grid two">
      <LuckCard heading="Permissões sensíveis" padded><SkKV rows={5} /></LuckCard>
      <LuckCard heading="Sobre" padded><SkKV rows={5} /></LuckCard>
    </div>
  </Busy>
);

export const SkRede = ({ label = "Lendo o consumo de rede…" }: { label?: string }) => (
  <Busy label={label}>
    <SkChart heading="Consumo no período" />
    <SkTable heading="Por app" icon rows={6} cols={4} />
  </Busy>
);

/** Card genérico de uma aba de Aparelho: lista de pares. */
export const SkCards = ({ n = 2, rows = 5 }: { n?: number; rows?: number }) => (
  <Busy label="Lendo o aparelho…">
    <div className="grid two">
      {range(n).map((i) => <LuckCard key={i} padded><SkKV rows={rows} /></LuckCard>)}
    </div>
  </Busy>
);

export const SkHistorico = () => (
  <Busy label="Lendo o histórico…">
    <SkChart heading="Bateria" height={220} />
    <div className="grid two">
      <SkChart heading="Corrente" height={160} />
      <SkChart heading="Saúde" height={160} />
    </div>
    <SkTable heading="Consumo por app" icon rows={5} />
  </Busy>
);

/** Gráfico isolado dentro de um card já desenhado. */
export const SkChartBody = ({ height = 200, label = "Carregando o gráfico…" }: { height?: number; label?: string }) => (
  <Busy label={label}>
    <div className="sk-chart" style={{ height }}>
      {range(24).map((i) => <span key={i} className="l-skeleton" style={{ height: `${25 + ((i * 53) % 60)}%` }} />)}
    </div>
  </Busy>
);

/** Linhas de tabela dentro de um card já desenhado. */
export const SkRowsBody = ({ rows = 4, icon = false, label = "Carregando…" }: { rows?: number; icon?: boolean; label?: string }) => (
  <Busy label={label}><SkRows rows={rows} icon={icon} /></Busy>
);
