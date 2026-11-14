import { useMemo, useState } from "react";
import { api, Timed } from "../api";
import { fmtDur, fmtNum, shortPkg } from "../format";
import { useLoad } from "../hooks";
import { Card, ErrorBox, Kpi, Loading, Page, RefreshBtn, Segmented, StackBar, Table, TimeChart, partColor } from "../ui";

export default function BatteryPage() {
  const [refresh, setRefresh] = useState(0);
  const stats = useLoad((s) => api.batteryStats(s, refresh > 0), [refresh]);
  const hist = useLoad(api.batteryHistory, [refresh]);
  const [tab, setTab] = useState<"wakelocks" | "jobs" | "kernel" | "wakeup">("wakelocks");

  const bands = useMemo(() => {
    const out: [number, number][] = [];
    let on: number | null = null;
    for (const e of hist.data?.screen ?? []) {
      if (e.on && on == null) on = e.t;
      if (!e.on && on != null) {
        out.push([on, e.t]);
        on = null;
      }
    }
    if (on != null && hist.data?.points.length) out.push([on, hist.data.points[hist.data.points.length - 1].t]);
    return out;
  }, [hist.data]);

  const s = stats.data?.summary;
  const maxMah = Math.max(...(stats.data?.consumers ?? []).map((c) => c.mah), 1);
  const timedRows: Timed[] =
    tab === "wakelocks" ? stats.data?.wakelocks ?? [] : tab === "jobs" ? stats.data?.jobs ?? [] : tab === "kernel" ? stats.data?.kernel_wakelocks ?? [] : stats.data?.wakeup_reasons ?? [];
  const maxT = Math.max(...timedRows.map((t) => t.seconds), 1);

  return (
    <Page
      title="Bateria"
      subtitle={s?.start ? `Desde a última carga completa (${s.start.replace(/-(\d\d)-(\d\d)$/, " $1:$2")})` : "Desde a última carga completa"}
      actions={<RefreshBtn onClick={() => setRefresh(refresh + 1)} loading={stats.loading || hist.loading} />}
    >
      {stats.error && <ErrorBox error={stats.error} />}
      {!s ? (
        <Loading label="Lendo batterystats (pode levar alguns segundos)…" />
      ) : (
        <>
          <div className="grid kpis">
            <Kpi label="Na bateria" value={fmtDur(s.time_on_battery_s)} hint={`${fmtNum(s.discharge_mah, 0, " mAh")} gastos`} />
            <Kpi label="Tela ligada" value={fmtDur(s.screen_on_s)} hint={`${fmtNum(s.screen_on_mah, 0, " mAh")} · ${fmtNum(s.screen_on_ma, 0, " mA")}`} />
            <Kpi label="Tela desligada" value={fmtDur(s.screen_off_s)} hint={`${fmtNum(s.screen_off_mah, 0, " mAh")} · ${fmtNum(s.screen_off_ma, 0, " mA")}`} tone={(s.screen_off_ma ?? 0) > 60 ? "bad" : (s.screen_off_ma ?? 0) > 40 ? "warn" : "good"} />
            <Kpi label="Deep doze" value={fmtNum(s.deep_doze_mah, 0, " mAh")} hint={`light doze ${fmtNum(s.light_doze_mah, 0, " mAh")}`} tone={s.deep_doze_mah === 0 && s.screen_off_s > 10800 ? "warn" : undefined} />
            <Kpi label="Wakelocks parciais" value={fmtDur(s.partial_wakelock_s)} hint={`tela forçada acesa ${fmtDur(s.full_wakelock_s)}`} />
            <Kpi label="Mudanças de rede" value={fmtNum(s.connectivity_changes)} hint={`capacidade ${fmtNum(s.capacity_mah, 0, " mAh")}`} />
          </div>

          <Card title="Nível e temperatura" extra={<span className="muted small">faixas = tela ligada</span>}>
            {hist.data ? (
              <TimeChart
                bands={bands}
                leftDomain={[0, 100]}
                series={[
                  { label: "Nível", unit: "%", color: "var(--c2)", points: hist.data.points.map((p) => [p.t, p.level]) },
                  { label: "Temperatura", unit: " °C", color: "var(--c4)", axis: "right", points: hist.data.points.filter((p) => p.temp != null).map((p) => [p.t, p.temp!]) },
                ]}
              />
            ) : (
              <Loading />
            )}
          </Card>

          <div className="grid two">
            <Card title="Quem gastou a bateria">
              <div className="legend inline">
                {["screen", "cpu", "wakelock", "mobile_radio", "wifi", "audio", "video", "bluetooth"].map((k) => (
                  <span key={k}><i style={{ background: partColor(k) }} /> {k}</span>
                ))}
              </div>
              <Table
                rows={stats.data!.consumers}
                rowKey={(r) => r.uid}
                limit={25}
                initialSort={{ key: "mah", desc: true }}
                cols={[
                  { key: "label", label: "App / UID", render: (r) => <span title={r.packages.join(", ")}>{r.label.includes(".") ? shortPkg(r.label) : r.label}</span>, sort: (r) => r.label },
                  { key: "bar", label: "Composição", width: "38%", render: (r) => <StackBar parts={r.parts} max={maxMah} /> },
                  { key: "bg", label: "2º plano", align: "right", render: (r) => fmtNum(r.bg_mah, 1), sort: (r) => r.bg_mah },
                  { key: "mah", label: "mAh", align: "right", render: (r) => <b>{fmtNum(r.mah, 1)}</b>, sort: (r) => r.mah },
                ]}
              />
            </Card>
            <Card title="Componentes">
              <Table
                rows={stats.data!.components}
                rowKey={(r) => r[0]}
                cols={[
                  { key: "n", label: "Componente", render: (r) => <span><i className="dot" style={{ background: partColor(r[0]) }} /> {r[0]}</span> },
                  { key: "v", label: "mAh", align: "right", render: (r) => fmtNum(r[1], 1) },
                ]}
              />
            </Card>
          </div>

          <Card
            title="O que mantém o aparelho acordado"
            extra={<Segmented value={tab} onChange={setTab} options={[["wakelocks", "Wakelocks"], ["jobs", "Jobs"], ["kernel", "Kernel"], ["wakeup", "Motivos de despertar"]]} />}
          >
            <Table
              rows={timedRows}
              rowKey={(r, i) => `${r.uid ?? ""}-${r.name}-${i}`}
              initialSort={{ key: "t", desc: true }}
              cols={[
                ...(tab === "wakelocks" || tab === "jobs" ? [{ key: "who", label: "App", render: (r: Timed) => r.label ?? r.uid ?? "", sort: (r: Timed) => r.label ?? "" }] : []),
                { key: "name", label: "Nome", width: "45%", render: (r: Timed) => <code className="wrap-code">{r.name}</code> },
                { key: "bar", label: "", width: "16%", render: (r: Timed) => <StackBar parts={{ wakelock: r.seconds }} max={maxT} /> },
                { key: "c", label: "Vezes", align: "right", render: (r: Timed) => fmtNum(r.count), sort: (r: Timed) => r.count },
                { key: "t", label: "Tempo", align: "right", render: (r: Timed) => <b>{fmtDur(r.seconds)}</b>, sort: (r: Timed) => r.seconds },
              ]}
            />
          </Card>
        </>
      )}
    </Page>
  );
}
