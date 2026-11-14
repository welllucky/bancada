import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api";
import { appLabel } from "../appNames";
import { TimeChart } from "../charts";
import { fmtDate, fmtNum } from "../format";
import { useDevice, useLoad } from "../hooks";
import { DataTable, ErrorNote, Loading, LuckCard, LuckStat, Segmented } from "../luck";
import { PageHead, Refresh } from "./common";

type Days = "1" | "7" | "30" | "365";

export default function HistoricoPage() {
  const { serial, openApp } = useDevice();
  const [days, setDays] = useState<Days>("7");
  const h = useLoad((s) => api.history(s, Number(days)), [days], 60000);
  const d = h.data;

  const drainByApp = useMemo(() => {
    if (!d) return [];
    // Cada amostra é acumulada desde a última carga: máximo por app e dia, somado entre os dias.
    const perDay = new Map<string, number>();
    for (const r of d.drain) {
      const k = `${r.package}|${new Date(r.ts * 1000).toDateString()}`;
      perDay.set(k, Math.max(perDay.get(k) ?? 0, r.mah));
    }
    const tot = new Map<string, number>();
    for (const [k, v] of perDay) {
      const pkg = k.split("|")[0];
      tot.set(pkg, (tot.get(pkg) ?? 0) + v);
    }
    return [...tot.entries()].map(([pkg, mah]) => ({ pkg, mah }));
  }, [d]);

  const s = d?.samples ?? [];
  const first = s.find((x) => x.asoc != null);
  const last = [...s].reverse().find((x) => x.asoc != null);
  const dev = d?.devices.find((x) => x.serial === serial);
  const markers = (d?.actions ?? []).filter((a) => a.ok).map((a) => ({ t: a.ts, label: a.action }));
  const temps = s.map((x) => x.temp_c).filter((t): t is number => t != null);

  return (
    <div className="page">
      <PageHead
        title="Histórico"
        subtitle="Amostras a cada minuto enquanto o aparelho está conectado"
        actions={
          <>
            <Segmented label="Período" value={days} onChange={setDays} options={[{ value: "1", label: "24 h" }, { value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "365", label: "1 ano" }]} />
            <Refresh onClick={h.reload} loading={h.loading} at={h.at} />
          </>
        }
      />
      {h.error ? (
        <ErrorNote error={h.error} title="Não foi possível ler o histórico" />
      ) : !d ? (
        <Loading />
      ) : s.length === 0 ? (
        <div className="l-empty">Ainda não há amostras neste período. Deixe o aparelho conectado com o Phone Deck aberto.</div>
      ) : (
        <>
          <div className="grid stats">
            <LuckCard padded><LuckStat value={fmtNum(s.length)} caption={dev ? `amostras · acompanhando desde ${fmtDate(dev.first_seen)}` : "amostras no período"} /></LuckCard>
            {last?.asoc != null && (
              <LuckCard padded><LuckStat value={fmtNum(last.asoc)} unit="%" caption={first?.asoc != null ? `saúde · variação de ${fmtNum(last.asoc - first.asoc, 0, " p.p.")}` : "saúde da bateria"} /></LuckCard>
            )}
            <LuckCard padded><LuckStat value={temps.length ? fmtNum(Math.max(...temps), 1) : "—"} unit="°C" caption="temperatura máxima" /></LuckCard>
            <LuckCard padded><LuckStat value={fmtNum(d.actions.length)} caption="ações aplicadas" /></LuckCard>
          </div>

          <LuckCard heading="Bateria e temperatura" hint="linhas verticais: ações aplicadas" padded>
            <TimeChart
              label="Nível de bateria e temperatura no período, com as ações aplicadas"
              leftDomain={[0, 100]}
              markers={markers}
              series={[
                { label: "Nível", unit: "%", color: "var(--chart-1)", points: s.filter((x) => x.level != null).map((x) => [x.ts, x.level!]) },
                { label: "Temperatura", unit: " °C", color: "var(--chart-4)", axis: "right", points: s.filter((x) => x.temp_c != null).map((x) => [x.ts, x.temp_c!]) },
              ]}
            />
          </LuckCard>

          <div className="grid two">
            <LuckCard heading="Corrente" hint="mA" padded>
              <TimeChart label="Corrente da bateria no período" height={180} markers={markers} series={[{ label: "Corrente", unit: " mA", color: "var(--chart-5)", points: s.filter((x) => x.current_ma != null).map((x) => [x.ts, x.current_ma!]) }]} />
            </LuckCard>
            <LuckCard heading="Saúde da bateria" padded>
              <TimeChart label="Saúde da bateria no período" height={180} series={[
                { label: "ASOC", unit: "%", color: "var(--chart-2)", points: s.filter((x) => x.asoc != null).map((x) => [x.ts, x.asoc!]) },
                { label: "BSOH", unit: "%", color: "var(--chart-3)", points: s.filter((x) => x.bsoh != null).map((x) => [x.ts, x.bsoh!]) },
              ]} />
            </LuckCard>
          </div>

          <div className="grid two">
            <LuckCard heading="Consumo por app" hint="mAh no período" padded={false}>
              <DataTable
                rows={drainByApp}
                rowKey={(r) => r.pkg}
                limit={20}
                initialSort={{ key: "mah", desc: true }}
                empty="Sem consumo registrado."
                onRow={(r) => openApp(r.pkg)}
                rowLabel={(r) => `Abrir ${appLabel(r.pkg)}`}
                cols={[
                  { key: "pkg", label: "App", sort: (r) => appLabel(r.pkg), render: (r) => <span title={r.pkg}>{appLabel(r.pkg)}</span> },
                  { key: "mah", label: "mAh", align: "right", sort: (r) => r.mah, render: (r) => <b>{fmtNum(r.mah, 0)}</b> },
                ]}
              />
            </LuckCard>
            <LuckCard heading="Ações aplicadas" index={String(d.actions.length)} padded={false}>
              <DataTable
                rows={d.actions}
                rowKey={(r, i) => `${r.ts}-${i}`}
                empty="Nenhuma ação aplicada ainda."
                cols={[
                  { key: "ok", label: "", width: "28px", render: (r) => (r.ok ? <CheckCircle2 size={15} className="tone-success" aria-label="aplicada" /> : <XCircle size={15} className="tone-danger" aria-label="falhou" />) },
                  { key: "a", label: "Ação", render: (r) => <span title={r.output}>{r.action}</span> },
                  { key: "t", label: "Quando", align: "right", render: (r) => <span className="mono">{fmtDate(r.ts)}</span> },
                ]}
              />
            </LuckCard>
          </div>
        </>
      )}
    </div>
  );
}
