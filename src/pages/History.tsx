import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api";
import { fmtDate, fmtNum, shortPkg } from "../format";
import { useDevice, useLoad } from "../hooks";
import { Card, ErrorBox, Kpi, Loading, Page, RefreshBtn, Segmented, Table, TimeChart } from "../ui";

export default function HistoryPage() {
  const { serial } = useDevice();
  const [days, setDays] = useState(7);
  const h = useLoad((s) => api.history(s, days), [days], 60000);
  const d = h.data;

  const drainByApp = useMemo(() => {
    if (!d) return [];
    // Each snapshot is cumulative since last charge; take the max per app per day, then sum across days.
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
    return [...tot.entries()].map(([pkg, mah]) => ({ pkg, mah })).sort((a, b) => b.mah - a.mah);
  }, [d]);

  const s = d?.samples ?? [];
  const first = s[0], last = s[s.length - 1];
  const dev = d?.devices.find((x) => x.serial === serial);

  return (
    <Page
      title="Histórico"
      subtitle="Amostras coletadas a cada minuto enquanto o aparelho está conectado"
      actions={
        <>
          <Segmented value={days} onChange={setDays} options={[[1, "24 h"], [7, "7 dias"], [30, "30 dias"], [365, "1 ano"]]} />
          <RefreshBtn onClick={h.reload} loading={h.loading} />
        </>
      }
    >
      {h.error && <ErrorBox error={h.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid kpis">
            <Kpi label="Amostras no período" value={fmtNum(s.length)} hint={dev ? `acompanhando desde ${fmtDate(dev.first_seen)}` : undefined} />
            <Kpi label="Saúde (ASOC)" value={fmtNum(last?.asoc, 0, "%")} hint={first?.asoc != null && last?.asoc != null ? `variação ${fmtNum(last.asoc - first.asoc, 0, " pp")}` : undefined} />
            <Kpi label="Temp. máxima" value={fmtNum(Math.max(...s.map((x) => x.temp_c ?? 0)), 1, " °C")} />
            <Kpi label="Ações aplicadas" value={fmtNum(d.actions.length)} />
          </div>
          <Card title="Nível de bateria e temperatura">
            <TimeChart leftDomain={[0, 100]} series={[
              { label: "Nível", unit: "%", color: "var(--c2)", points: s.filter((x) => x.level != null).map((x) => [x.ts, x.level!]) },
              { label: "Temperatura", unit: " °C", color: "var(--c4)", axis: "right", points: s.filter((x) => x.temp_c != null).map((x) => [x.ts, x.temp_c!]) },
            ]} />
          </Card>
          <div className="grid two">
            <Card title="Corrente (mA)">
              <TimeChart height={180} series={[{ label: "Corrente", unit: " mA", color: "var(--c5)", points: s.filter((x) => x.current_ma != null).map((x) => [x.ts, x.current_ma!]) }]} />
            </Card>
            <Card title="Saúde da bateria (ASOC / BSOH)">
              <TimeChart height={180} series={[
                { label: "ASOC", unit: "%", color: "var(--c1)", points: s.filter((x) => x.asoc != null).map((x) => [x.ts, x.asoc!]) },
                { label: "BSOH", unit: "%", color: "var(--c3)", points: s.filter((x) => x.bsoh != null).map((x) => [x.ts, x.bsoh!]) },
              ]} />
            </Card>
          </div>
          <div className="grid two">
            <Card title="Consumo acumulado por app">
              <Table rows={drainByApp} rowKey={(r) => r.pkg} limit={20} initialSort={{ key: "mah", desc: true }} cols={[
                { key: "pkg", label: "App", render: (r) => <span title={r.pkg}>{r.pkg.includes(".") ? shortPkg(r.pkg) : r.pkg}</span>, sort: (r) => r.pkg },
                { key: "mah", label: "mAh", align: "right", render: (r) => <b>{fmtNum(r.mah, 0)}</b>, sort: (r) => r.mah },
              ]} />
            </Card>
            <Card title="Registro de ações">
              <Table rows={d.actions} rowKey={(r, i) => `${r.ts}-${i}`} empty="Nenhuma ação aplicada ainda." cols={[
                { key: "ok", label: "", width: "28px", render: (r) => r.ok ? <CheckCircle2 size={15} className="tone-good" /> : <XCircle size={15} className="tone-bad" /> },
                { key: "a", label: "Ação", render: (r) => <span title={r.output}>{r.action}</span> },
                { key: "t", label: "Quando", align: "right", render: (r) => fmtDate(r.ts) },
              ]} />
            </Card>
          </div>
        </>
      )}
    </Page>
  );
}
