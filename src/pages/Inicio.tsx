import { ArrowRight, BatteryCharging, HardDrive, HeartPulse, Thermometer } from "lucide-react";
import { api } from "../api";
import { appLabel } from "../appNames";
import { fmtDate, fmtDur, fmtKb, fmtNum } from "../format";
import { useDevice, useLoad } from "../hooks";
import { Banner, ErrorNote, Issue, Loading, LuckBadge, LuckButton, LuckCard, LuckMeter, LuckStat, Severity, Tone } from "../luck";
import { problems, recPackage, recTitle, SEV_LABEL, toneOf } from "../recs";
import { KV, PageHead, Refresh } from "./common";

const STATUS: Record<string, string> = { Charging: "carregando", Discharging: "descarregando", Full: "carga completa", "Not charging": "sem carregar" };
const THERMAL = ["normal", "leve", "moderado", "severo", "crítico", "emergência", "desligamento"];

export default function InicioPage() {
  const { go, openApp } = useDevice();
  const ov = useLoad(api.overview, [], 15000);
  const recs = useLoad(api.optimizations);
  const d = ov.data;

  if (ov.error) return <div className="page"><PageHead title="Início" /><ErrorNote error={ov.error} /></div>;
  if (!d) return <div className="page"><PageHead title="Início" /><Loading /></div>;

  const b = d.battery;
  const list = problems(recs.data ?? []);
  const critical = list.filter((r) => r.severity === "critical").length;
  const tone: Severity = !recs.data ? "neutral" : critical ? "danger" : list.length ? "warning" : "success";
  const title = !recs.data
    ? "Analisando o aparelho…"
    : list.length === 0
      ? "Tudo certo com o aparelho"
      : `${list.length} ${list.length === 1 ? "problema pede" : "problemas pedem"} sua atenção`;
  const temp = b.temp_c ?? 0;
  const tempTone: Tone = temp > 42 ? "danger" : temp > 38 ? "warning" : "success";
  const health = b.asoc ?? b.bsoh;
  const storage = d.storage?.pct ?? 0;

  return (
    <div className="page">
      <PageHead title="Início" subtitle={`${d.name ?? d.model} · ${d.wakefulness === "Awake" ? "tela ligada" : "tela desligada"}`} actions={<Refresh onClick={ov.reload} loading={ov.loading} at={ov.at} />} />

      <Banner
        tone={tone}
        eyebrow="Veredito"
        title={title}
        action={list.length > 0 && <LuckButton variant="primary" iconRight={<ArrowRight size={16} />} onClick={() => go({ area: "diagnostico" })}>Ver diagnóstico</LuckButton>}
      >
        {recs.error
          ? "Não foi possível analisar agora."
          : !recs.data
            ? "Lendo bateria, processos e configurações."
            : list.length
              ? `${critical ? `${critical} crítico${critical > 1 ? "s" : ""}. ` : ""}Cada item mostra a evidência e o que fazer.`
              : "Nada drenando bateria, aquecendo ou expondo o aparelho agora."}
      </Banner>

      <div className="grid vitals">
        <LuckCard heading="Bateria" index="01" padded>
          <LuckStat value={fmtNum(b.level)} unit="%" caption={<span className="row gap-xs"><BatteryCharging size={13} aria-hidden /> {b.status ? STATUS[b.status] ?? b.status : "—"}{b.plugged ? ` · ${b.plugged}` : ""}</span>} />
          <LuckMeter label="Nível da bateria" value={b.level ?? 0} tone={(b.level ?? 0) < 20 ? "danger" : "accent"} compact />
        </LuckCard>
        <LuckCard heading="Temperatura" index="02" padded>
          <LuckStat value={fmtNum(b.temp_c, 1)} unit="°C" caption={<span className="row gap-xs"><Thermometer size={13} aria-hidden /> térmico {THERMAL[d.thermal_status ?? 0] ?? d.thermal_status}</span>} />
          <LuckMeter label="Temperatura da bateria" value={temp} max={50} tone={tempTone} compact valueText={`${fmtNum(b.temp_c, 1)} °C`} />
        </LuckCard>
        <LuckCard heading="Armazenamento" index="03" padded>
          <LuckStat value={fmtNum(storage)} unit="%" caption={<span className="row gap-xs"><HardDrive size={13} aria-hidden /> {fmtKb(d.storage?.used_kb)} de {fmtKb(d.storage?.total_kb)}</span>} />
          <LuckMeter label="Armazenamento usado" value={storage} tone={storage > 90 ? "danger" : storage > 85 ? "warning" : "accent"} compact />
        </LuckCard>
        {health != null && (
          <LuckCard heading="Saúde da bateria" index="04" padded>
            <LuckStat value={fmtNum(health)} unit="%" caption={<span className="row gap-xs"><HeartPulse size={13} aria-hidden /> {b.first_use ? `em uso desde ${b.first_use}` : "capacidade restante"}</span>} />
            <LuckMeter label="Saúde da bateria" value={health} tone={health < 80 ? "warning" : "success"} compact />
          </LuckCard>
        )}
      </div>

      <div className="grid two-1">
        <LuckCard heading="O que resolver primeiro" index={list.length ? String(list.length) : undefined} padded={false}
          extra={list.length > 3 && <LuckButton variant="ghost" size="sm" onClick={() => go({ area: "diagnostico" })}>Ver todos</LuckButton>}>
          {recs.error ? (
            <div className="pad"><ErrorNote error={recs.error} title="Não foi possível analisar o aparelho" /></div>
          ) : !recs.data ? (
            <Loading label="Analisando bateria, processos e configurações…" />
          ) : list.length === 0 ? (
            <div className="l-empty">Nenhum problema encontrado. Sugestões opcionais ficam em Diagnóstico.</div>
          ) : (
            <div>
              {list.slice(0, 3).map((r) => {
                const pkg = recPackage(r);
                return (
                  <Issue
                    key={r.id}
                    tone={toneOf(r.severity)}
                    title={recTitle(r, appLabel)}
                    badge={<LuckBadge tone={toneOf(r.severity) === "danger" ? "danger" : "warning"}>{SEV_LABEL[r.severity]}</LuckBadge>}
                    evidence={r.evidence}
                    actions={
                      pkg
                        ? <LuckButton size="sm" onClick={() => openApp(pkg)}>Ver app</LuckButton>
                        : <LuckButton size="sm" onClick={() => go({ area: "diagnostico" })}>Resolver</LuckButton>
                    }
                  />
                );
              })}
            </div>
          )}
        </LuckCard>

        <LuckCard heading="Aparelho" padded extra={<LuckButton variant="ghost" size="sm" onClick={() => go({ area: "aparelho" })}>Detalhes</LuckButton>}>
          <KV items={[
            ["Modelo", `${d.manufacturer ?? ""} ${d.model ?? ""}`.trim()],
            ["Android", d.android && `${d.android}${d.oneui ? ` · One UI ${d.oneui}` : ""}`],
            ["Patch de segurança", d.security_patch],
            ["Ligado há", fmtDur(d.uptime_s)],
            ["Último boot", fmtDate(d.boot_time)],
            ["RAM livre", d.ram_avail_kb != null && `${fmtKb(d.ram_avail_kb)} de ${fmtKb(d.ram_total_kb)}`],
          ]} />
        </LuckCard>
      </div>
    </div>
  );
}
