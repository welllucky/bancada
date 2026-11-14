import { useState } from "react";
import { Wand2 } from "lucide-react";
import { api, Recommendation } from "../api";
import { useDevice, useLoad } from "../hooks";
import { Badge, ErrorBox, Loading, Page, RefreshBtn, Segmented, SeverityIcon } from "../ui";

const SEV_LABEL = { critical: "Crítico", warn: "Atenção", info: "Sugestão" } as const;

export default function OptimizePage() {
  const { confirmAction } = useDevice();
  const recs = useLoad(api.optimizations);
  const [filter, setFilter] = useState<"all" | "critical" | "warn" | "info">("all");
  const [done, setDone] = useState<Set<string>>(new Set());

  const apply = async (r: Recommendation) => {
    if (!r.action) return;
    const danger = r.action.kind === "force_stop" || r.action.kind === "reboot";
    const ok = await confirmAction({ title: r.action_label ?? "Aplicar", body: r.detail, action: r.action, danger });
    if (ok) {
      setDone(new Set(done).add(r.id));
      setTimeout(recs.reload, 1500);
    }
  };

  const list = (recs.data ?? []).filter((r) => filter === "all" || r.severity === filter);
  const count = (s: string) => (recs.data ?? []).filter((r) => r.severity === s).length;

  return (
    <Page
      title="Otimizações"
      subtitle="Diagnóstico automático com ações seguras (lista fechada de comandos)"
      actions={
        <>
          <Segmented value={filter} onChange={setFilter} options={[["all", "Todas"], ["critical", `Críticas ${count("critical")}`], ["warn", `Atenção ${count("warn")}`], ["info", `Sugestões ${count("info")}`]]} />
          <RefreshBtn onClick={recs.reload} loading={recs.loading} />
        </>
      }
    >
      {recs.error && <ErrorBox error={recs.error} />}
      {!recs.data && recs.loading && <Loading label="Analisando bateria, processos e configurações…" />}
      <div className="rec-grid">
        {list.map((r) => (
          <article key={r.id} className={`rec-card sev-${r.severity}`}>
            <header>
              <SeverityIcon s={r.severity} />
              <Badge tone={r.severity === "critical" ? "bad" : r.severity === "warn" ? "warn" : "accent"}>{SEV_LABEL[r.severity]}</Badge>
            </header>
            <h3>{r.title}</h3>
            <p>{r.detail}</p>
            <code className="evidence">{r.evidence}</code>
            {r.action && (
              <button className="btn primary" disabled={done.has(r.id)} onClick={() => apply(r)}>
                <Wand2 size={15} /> {done.has(r.id) ? "Aplicado" : r.action_label ?? "Aplicar"}
              </button>
            )}
          </article>
        ))}
      </div>
      {recs.data && !list.length && <div className="empty">Nenhuma recomendação nesta categoria. 🎉</div>}
    </Page>
  );
}
