import { BatteryCharging, Cpu, HardDrive, MemoryStick, Thermometer, Timer } from "lucide-react";
import { api } from "../api";
import { fmtDate, fmtDur, fmtKb, fmtNum } from "../format";
import { useLoad } from "../hooks";
import { Badge, Card, ErrorBox, Gauge, Kpi, Loading, Page, RefreshBtn, SeverityIcon } from "../ui";

const THERMAL = ["normal", "leve", "moderado", "severo", "crítico", "emergência", "desligamento"];

export default function OverviewPage() {
  const ov = useLoad(api.overview, [], 15000);
  const recs = useLoad(api.optimizations);
  const d = ov.data;
  if (ov.error) return <Page title="Visão geral"><ErrorBox error={ov.error} /></Page>;
  if (!d) return <Page title="Visão geral"><Loading /></Page>;
  const b = d.battery;
  const ramUsed = d.ram_total_kb && d.ram_avail_kb ? d.ram_total_kb - d.ram_avail_kb : undefined;
  const tempTone = (b.temp_c ?? 0) > 42 ? "bad" : (b.temp_c ?? 0) > 38 ? "warn" : "good";
  return (
    <Page title="Visão geral" subtitle="Estado atual do aparelho conectado" actions={<RefreshBtn onClick={ov.reload} loading={ov.loading} />}>
      <div className="hero card">
        <div className="hero-device">
          <span className="eyebrow">{d.manufacturer}</span>
          <h2>{d.name ?? d.model}</h2>
          <p className="muted">
            {d.model} · Android {d.android}
            {d.oneui && ` · One UI ${d.oneui}`}
          </p>
          <div className="row gap wrap">
            <Badge tone="accent">Build {d.build}</Badge>
            <Badge>Patch {d.security_patch}</Badge>
            <Badge tone={d.wakefulness === "Awake" ? "good" : "neutral"}>{d.wakefulness === "Awake" ? "Tela ligada" : d.wakefulness ?? "—"}</Badge>
          </div>
        </div>
        <Gauge pct={b.level ?? 0} label="bateria" sub={`${b.status ?? ""}${b.plugged ? ` · ${b.plugged}` : ""}`} tone={(b.level ?? 0) < 20 ? "bad" : "good"} />
        <Gauge pct={b.asoc ?? (b.bsoh ?? 0)} label="saúde" sub={b.first_use ? `em uso desde ${b.first_use}` : undefined} tone={(b.asoc ?? 100) < 80 ? "warn" : "good"} />
      </div>

      <div className="grid kpis">
        <Kpi label="Temperatura" value={<><Thermometer size={16} /> {fmtNum(b.temp_c, 1, " °C")}</>} hint={`máx. registrada ${fmtNum(b.max_temp_c, 1, " °C")}`} tone={tempTone} />
        <Kpi label="Corrente" value={<><BatteryCharging size={16} /> {fmtNum(b.current_ma, 0, " mA")}</>} hint={`${fmtNum(b.voltage_mv, 0, " mV")}`} />
        <Kpi label="RAM em uso" value={<><MemoryStick size={16} /> {fmtKb(ramUsed)}</>} hint={`de ${fmtKb(d.ram_total_kb)} · swap ${fmtKb((d.swap_total_kb ?? 0) - (d.swap_free_kb ?? 0))}`} />
        <Kpi label="Armazenamento" value={<><HardDrive size={16} /> {fmtNum(d.storage?.pct, 0, "%")}</>} hint={`${fmtKb(d.storage?.used_kb)} de ${fmtKb(d.storage?.total_kb)}`} tone={(d.storage?.pct ?? 0) > 85 ? "warn" : undefined} />
        <Kpi label="Ligado há" value={<><Timer size={16} /> {fmtDur(d.uptime_s)}</>} hint={`boot em ${fmtDate(d.boot_time)}`} />
        <Kpi label="Térmico" value={<><Cpu size={16} /> {THERMAL[d.thermal_status ?? 0] ?? d.thermal_status}</>} hint={`proteção de carga ${b.protect_threshold ? `${b.protect_threshold}%` : "—"}`} tone={(d.thermal_status ?? 0) >= 2 ? "warn" : "good"} />
      </div>

      <Card title="Principais recomendações" extra={<span className="muted small">veja todas em Otimizações</span>}>
        {recs.loading && !recs.data ? (
          <Loading label="Analisando bateria, processos e configurações…" />
        ) : recs.error ? (
          <ErrorBox error={recs.error} />
        ) : (
          <ul className="rec-list">
            {(recs.data ?? []).slice(0, 4).map((r) => (
              <li key={r.id}>
                <SeverityIcon s={r.severity} />
                <div>
                  <strong>{r.title}</strong>
                  <span className="muted small">{r.evidence}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
