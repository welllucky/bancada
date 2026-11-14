import { useMemo, useState } from "react";
import { AppIcon } from "../appIcon";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { Action, api, LiveProc, Recommendation, Timed } from "../api";
import { appLabel } from "../appNames";
import { PART_LABEL, partColor, StackBar, TimeChart } from "../charts";
import { fmtDur, fmtKb, fmtNum, pkgOf } from "../format";
import { useDevice, useLoad } from "../hooks";
import { DataTable, ErrorNote, Issue, Loading, LuckBadge, LuckButton, LuckCard, LuckIconButton, LuckMeter, LuckStat, Segmented } from "../luck";
import { GROUP_LABEL, groupOf, recPackage, RecGroup, recTitle, SEV_LABEL, toneOf } from "../recs";
import { AppLink, PageHead, Refresh, Stop, Tabs, useTab } from "./common";

const TABS = ["problemas", "bateria", "agora", "memoria"] as const;
type Tab = (typeof TABS)[number];

export default function DiagnosticoPage() {
  const [tab, setTab] = useTab<Tab>("problemas", TABS);
  return (
    <div className="page">
      <PageHead title="Diagnóstico" subtitle="O que está errado, por quê e o que fazer" />
      <Tabs
        label="Seções do diagnóstico"
        value={tab}
        onChange={setTab}
        items={[
          { value: "problemas", label: "Problemas" },
          { value: "bateria", label: "Bateria" },
          { value: "agora", label: "Agora" },
          { value: "memoria", label: "Memória" },
        ]}
      />
      {tab === "problemas" && <Problemas />}
      {tab === "bateria" && <Bateria />}
      {tab === "agora" && <Agora />}
      {tab === "memoria" && <Memoria />}
    </div>
  );
}

const ORDER: RecGroup[] = ["energia", "config", "seguranca"];
const isDanger = (a: Action) => a.kind === "force_stop" || a.kind === "reboot" || a.kind === "uninstall_user_app";

function Problemas() {
  const { confirmAction, openApp } = useDevice();
  const recs = useLoad(api.optimizations);
  const groups = useMemo(() => {
    const m = new Map<RecGroup, Recommendation[]>();
    for (const r of recs.data ?? []) m.set(groupOf(r), [...(m.get(groupOf(r)) ?? []), r]);
    return m;
  }, [recs.data]);

  const apply = async (r: Recommendation) => {
    if (!r.action) return;
    const ok = await confirmAction({ title: r.action_label ?? r.title, body: r.detail, action: r.action, danger: isDanger(r.action) });
    if (ok) recs.reload();
  };

  const issue = (r: Recommendation) => {
    const pkg = recPackage(r);
    const tone = toneOf(r.severity);
    return (
      <Issue
        key={r.id}
        tone={tone}
        title={recTitle(r, appLabel)}
        badge={<LuckBadge tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "neutral"}>{SEV_LABEL[r.severity]}</LuckBadge>}
        detail={r.detail}
        evidence={r.evidence}
        actions={
          <>
            {pkg && <LuckButton variant="ghost" size="sm" onClick={() => openApp(pkg)}>Ver app</LuckButton>}
            {r.action && (
              <LuckButton size="sm" variant={r.severity === "critical" ? "primary" : "secondary"} danger={isDanger(r.action) && r.severity !== "critical"} onClick={() => apply(r)}>
                {r.action_label ?? "Aplicar"}
              </LuckButton>
            )}
          </>
        }
      />
    );
  };

  if (recs.error) return <ErrorNote error={recs.error} title="Não foi possível analisar o aparelho" />;
  if (!recs.data) return <Loading label="Analisando bateria, processos e configurações…" />;
  const maint = groups.get("manutencao") ?? [];

  return (
    <>
      <div className="row between">
        <span className="muted small">{recs.data.length} itens, do mais grave para o mais leve</span>
        <Refresh onClick={recs.reload} loading={recs.loading} at={recs.at} />
      </div>
      {ORDER.filter((g) => groups.get(g)?.length).map((g) => (
        <LuckCard key={g} heading={GROUP_LABEL[g]} index={String(groups.get(g)!.length)} padded={false}>
          <div>{groups.get(g)!.map(issue)}</div>
        </LuckCard>
      ))}
      <LuckCard heading={GROUP_LABEL.manutencao} hint="sempre disponível" padded={false}>
        {maint.length > 0 && <div>{maint.map(issue)}</div>}
        <div className="pad row gap-sm wrap">
          {!maint.some((r) => r.action?.kind === "trim_caches") && <LuckButton size="sm" onClick={() => confirmAction({ title: "Limpar cache dos apps", body: "Remove só arquivos temporários de todos os apps. Não apaga conversas, fotos ou logins.", action: { kind: "trim_caches" } })}>Limpar caches</LuckButton>}
          <LuckButton size="sm" onClick={() => confirmAction({ title: "Otimizar apps", body: "Conclui a compilação de apps pendente após atualizações. Pode levar minutos; prefira com o aparelho carregando.", action: { kind: "bg_dexopt" } })}>Otimizar apps</LuckButton>
          <LuckButton size="sm" danger iconLeft={<RotateCcw size={14} />} onClick={() => confirmAction({ title: "Reiniciar aparelho", body: "O celular reinicia agora e a conexão cai até ele voltar.", action: { kind: "reboot" }, danger: true })}>Reiniciar</LuckButton>
        </div>
      </LuckCard>
    </>
  );
}

type WakeTab = "wakelocks" | "jobs" | "kernel" | "wakeup";

function Bateria() {
  const { openApp } = useDevice();
  const [refresh, setRefresh] = useState(0);
  const stats = useLoad((s) => api.batteryStats(s, refresh > 0), [refresh]);
  const hist = useLoad(api.batteryHistory, [refresh]);
  const [wake, setWake] = useState<WakeTab>("wakelocks");

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
    const pts = hist.data?.points ?? [];
    if (on != null && pts.length) out.push([on, pts[pts.length - 1].t]);
    return out;
  }, [hist.data]);

  if (stats.error) return <ErrorNote error={stats.error} title="Não foi possível ler o consumo de bateria" />;
  const d = stats.data;
  if (!d) return <Loading label="Lendo o consumo de bateria (pode levar alguns segundos)…" />;
  const s = d.summary;
  const maxMah = Math.max(...d.consumers.map((c) => c.mah), 1);
  const rows: Timed[] = wake === "wakelocks" ? d.wakelocks : wake === "jobs" ? d.jobs : wake === "kernel" ? d.kernel_wakelocks : d.wakeup_reasons;
  const maxT = Math.max(...rows.map((t) => t.seconds), 1);
  const offMa = s.screen_off_ma ?? 0;

  return (
    <>
      <div className="row between">
        <span className="muted small">Desde a última carga completa{s.start ? ` (${s.start.replace(/-(\d\d)-(\d\d)$/, " $1:$2")})` : ""}</span>
        <Refresh onClick={() => setRefresh(refresh + 1)} loading={stats.loading || hist.loading} at={stats.at} />
      </div>
      <div className="grid stats">
        <LuckCard padded><LuckStat value={fmtDur(s.time_on_battery_s)} caption={`na bateria · ${fmtNum(s.discharge_mah, 0, " mAh")} gastos`} /></LuckCard>
        <LuckCard padded><LuckStat value={fmtDur(s.screen_on_s)} caption={`tela ligada · ${fmtNum(s.screen_on_ma, 0, " mA")} em média`} /></LuckCard>
        <LuckCard padded>
          <LuckStat value={fmtNum(offMa, 0)} unit="mA" caption={`tela desligada por ${fmtDur(s.screen_off_s)}`} />
          <LuckMeter label="Consumo com a tela desligada" value={offMa} max={100} tone={offMa > 60 ? "danger" : offMa > 40 ? "warning" : "success"} compact valueText={`${fmtNum(offMa, 0)} mA`} />
        </LuckCard>
        <LuckCard padded><LuckStat value={fmtDur(s.partial_wakelock_s)} caption={`acordado sem tela · deep doze ${fmtNum(s.deep_doze_mah, 0, " mAh")}`} /></LuckCard>
      </div>

      <LuckCard heading="Nível e temperatura" hint="faixas: tela ligada" padded>
        {hist.data ? (
          <TimeChart
            label="Nível de bateria e temperatura desde a última carga"
            bands={bands}
            leftDomain={[0, 100]}
            series={[
              { label: "Nível", unit: "%", color: "var(--chart-1)", points: hist.data.points.map((p) => [p.t, p.level]) },
              { label: "Temperatura", unit: " °C", color: "var(--chart-4)", axis: "right", points: hist.data.points.filter((p) => p.temp != null).map((p) => [p.t, p.temp!]) },
            ]}
          />
        ) : hist.error ? <ErrorNote error={hist.error} /> : <Loading />}
      </LuckCard>

      <LuckCard heading="Quem gastou a bateria" hint="clique para abrir o app" padded={false}>
        <div className="legend pad-x">
          {["screen", "cpu", "wakelock", "mobile_radio", "wifi", "audio", "video", "bluetooth"].map((k) => (
            <span key={k}><i style={{ background: partColor(k) }} /> {PART_LABEL[k]}</span>
          ))}
        </div>
        <DataTable
          rows={d.consumers}
          rowKey={(r) => r.uid}
          limit={25}
          initialSort={{ key: "mah", desc: true }}
          onRow={(r) => r.packages[0] && openApp(r.packages[0])}
          rowLabel={(r) => `Abrir ${appLabel(r.packages[0] ?? r.label)}`}
          cols={[
            { key: "label", label: "App", render: (r) => <span className="app-row" title={r.packages.join(", ")}>{r.packages[0] && <AppIcon pkg={r.packages[0]} size={24} />}{r.packages[0] ? appLabel(r.packages[0]) : r.label}</span>, sort: (r) => r.label },
            { key: "bar", label: "Composição", width: "38%", render: (r) => <StackBar parts={r.parts} max={maxMah} /> },
            { key: "bg", label: "2º plano", align: "right", render: (r) => fmtNum(r.bg_mah, 1), sort: (r) => r.bg_mah },
            { key: "mah", label: "mAh", align: "right", render: (r) => <b>{fmtNum(r.mah, 1)}</b>, sort: (r) => r.mah },
          ]}
        />
      </LuckCard>

      <LuckCard
        heading="O que mantém o aparelho acordado"
        padded={false}
        extra={<Segmented label="Tipo" value={wake} onChange={setWake} options={[{ value: "wakelocks", label: "Wakelocks" }, { value: "jobs", label: "Jobs" }, { value: "kernel", label: "Kernel" }, { value: "wakeup", label: "Despertares" }]} />}
      >
        <DataTable
          rows={rows}
          rowKey={(r, i) => `${r.uid ?? ""}-${r.name}-${i}`}
          initialSort={{ key: "t", desc: true }}
          empty="Nada registrado."
          onRow={wake === "wakelocks" || wake === "jobs" ? (r) => r.packages?.[0] && openApp(r.packages[0]) : undefined}
          rowLabel={(r) => `Abrir ${appLabel(r.packages?.[0] ?? r.name)}`}
          cols={[
            ...(wake === "wakelocks" || wake === "jobs"
              ? [{ key: "who", label: "App", render: (r: Timed) => (r.packages?.[0] ? <span className="app-row"><AppIcon pkg={r.packages[0]} size={24} />{appLabel(r.packages[0])}</span> : r.label ?? r.uid ?? ""), sort: (r: Timed) => r.label ?? "" }]
              : []),
            { key: "name", label: "Nome", width: "45%", render: (r: Timed) => <code className="wrap-code">{r.name}</code> },
            { key: "bar", label: "", width: "14%", render: (r: Timed) => <StackBar parts={{ wakelock: r.seconds }} max={maxT} /> },
            { key: "c", label: "Vezes", align: "right", render: (r: Timed) => fmtNum(r.count), sort: (r: Timed) => r.count },
            { key: "t", label: "Tempo", align: "right", render: (r: Timed) => <b>{fmtDur(r.seconds)}</b>, sort: (r: Timed) => r.seconds },
          ]}
        />
      </LuckCard>
    </>
  );
}

function Agora() {
  const { confirmAction, openApp } = useDevice();
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");
  const procs = useLoad(api.processes, [], paused ? undefined : 3000);
  const d = procs.data;
  if (procs.error) return <ErrorNote error={procs.error} title="Não foi possível ler os processos" />;
  if (!d) return <Loading />;
  const asleep = !!d.wakefulness && d.wakefulness !== "Awake";
  const match = (n: string) => !q || n.toLowerCase().includes(q.toLowerCase()) || appLabel(n).toLowerCase().includes(q.toLowerCase());
  const busy = d.cpu?.busy_pct ?? 0;

  const stop = (p: LiveProc) => {
    const pkg = pkgOf(p.name);
    if (!pkg) return;
    confirmAction({
      title: `Forçar parada de ${appLabel(pkg)}`,
      body: "O app é encerrado agora. Ele pode voltar a rodar quando receber uma notificação ou quando você abri-lo.",
      action: { kind: "force_stop", package: pkg },
      danger: true,
    }).then((ok) => { if (ok) procs.reload(); });
  };

  return (
    <>
      <div className="grid stats">
        <LuckCard padded>
          <LuckStat value={fmtNum(busy, 0)} unit="%" caption={`CPU ocupada · ${d.cpu?.cores ?? "?"} núcleos`} />
          <LuckMeter label="CPU ocupada" value={busy} tone={busy > 50 ? "warning" : "accent"} compact />
        </LuckCard>
        <LuckCard padded><LuckStat value={d.loadavg.join(" · ")} caption="carga média em 1, 5 e 15 min" /></LuckCard>
        <LuckCard padded>
          <LuckStat value={asleep ? "Em repouso" : "Em uso"} caption={asleep ? "CPU alta agora é suspeita" : "tela ligada"} />
          {asleep && <LuckBadge tone="warning" dot>tela desligada</LuckBadge>}
        </LuckCard>
      </div>
      <LuckCard
        heading="Processos agora"
        hint={paused ? "pausado" : "a cada 3 s"}
        padded={false}
        extra={
          <span className="row gap-sm">
            <input className="field sm" placeholder="Filtrar…" aria-label="Filtrar processos" value={q} onChange={(e) => setQ(e.target.value)} />
            <LuckButton variant="ghost" size="sm" iconLeft={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => setPaused(!paused)}>{paused ? "Retomar" : "Pausar"}</LuckButton>
          </span>
        }
      >
        <DataTable
          rows={d.live.filter((p) => match(p.name))}
          rowKey={(r) => r.pid}
          initialSort={{ key: "cpu", desc: true }}
          onRow={(r) => { const pkg = pkgOf(r.name); if (pkg) openApp(pkg); }}
          rowLabel={(r) => `Abrir ${appLabel(r.name)}`}
          cols={[
            { key: "name", label: "Processo", render: (r) => (pkgOf(r.name) ? <span className="app-row"><AppIcon pkg={pkgOf(r.name)!} size={24} /><span><b>{appLabel(r.name)}</b> <small className="mono muted">{r.name}</small></span></span> : <span className="mono">{r.name}</span>), sort: (r) => r.name },
            { key: "cpu", label: "CPU", width: "190px", sort: (r) => r.cpu, render: (r) => (
              <span className="row gap-sm">
                <span style={{ flex: 1 }}><LuckMeter label={`CPU de ${r.name}`} value={r.cpu} tone={r.cpu > 20 && asleep ? "danger" : "accent"} compact /></span>
                <span className="num">{fmtNum(r.cpu, 1)}%</span>
              </span>
            ) },
            { key: "flag", label: "", render: (r) => r.cpu > 20 && asleep && <LuckBadge tone="danger">em repouso</LuckBadge> },
            { key: "mem", label: "Mem", align: "right", render: (r) => `${fmtNum(r.mem, 1)}%`, sort: (r) => r.mem },
            { key: "res", label: "RES", align: "right", render: (r) => r.res },
            { key: "act", label: "", align: "right", render: (r) => pkgOf(r.name) && (
              <Stop><LuckIconButton size="sm" label={`Forçar parada de ${appLabel(r.name)}`} icon={<Square size={14} />} onClick={() => stop(r)} /></Stop>
            ) },
          ]}
        />
      </LuckCard>
      <LuckCard heading="Tempo de CPU desde o boot" padded={false}>
        <DataTable
          rows={d.cumulative.filter((p) => match(p.name))}
          rowKey={(r) => r.pid}
          limit={30}
          initialSort={{ key: "t", desc: true }}
          cols={[
            { key: "name", label: "Processo", render: (r) => (pkgOf(r.name) ? <AppLink pkg={pkgOf(r.name)!} /> : <span className="mono">{r.name}</span>), sort: (r) => r.name },
            { key: "rss", label: "Memória", align: "right", render: (r) => fmtKb(r.rss_kb), sort: (r) => r.rss_kb },
            { key: "t", label: "CPU total", align: "right", render: (r) => <b>{fmtDur(r.time_s)}</b>, sort: (r) => r.time_s },
          ]}
        />
      </LuckCard>
    </>
  );
}

function Memoria() {
  const { openApp } = useDevice();
  const ov = useLoad(api.overview);
  const mem = useLoad(api.memory);
  if (mem.error) return <ErrorNote error={mem.error} title="Não foi possível ler a memória" />;
  if (!mem.data) return <Loading label="Lendo a memória…" />;
  const o = ov.data;
  const used = o?.ram_total_kb && o.ram_avail_kb != null ? o.ram_total_kb - o.ram_avail_kb : undefined;
  const swapUsed = o?.swap_total_kb != null && o.swap_free_kb != null ? o.swap_total_kb - o.swap_free_kb : undefined;
  const top = mem.data[0]?.kb ?? 1;
  return (
    <>
      {o && (
        <div className="grid stats">
          <LuckCard padded>
            <LuckStat value={fmtKb(used)} caption={`RAM em uso de ${fmtKb(o.ram_total_kb)}`} />
            <LuckMeter label="RAM em uso" value={used ?? 0} max={o.ram_total_kb ?? 1} compact />
          </LuckCard>
          {o.swap_total_kb ? (
            <LuckCard padded>
              <LuckStat value={fmtKb(swapUsed)} caption={`swap em uso de ${fmtKb(o.swap_total_kb)}`} />
              <LuckMeter label="Swap em uso" value={swapUsed ?? 0} max={o.swap_total_kb} tone="neutral" compact />
            </LuckCard>
          ) : null}
        </div>
      )}
      <LuckCard heading="Memória por processo" hint="PSS" padded={false}>
        <DataTable
          rows={mem.data}
          rowKey={(r) => r.pid}
          limit={40}
          initialSort={{ key: "kb", desc: true }}
          onRow={(r) => { const pkg = pkgOf(r.name); if (pkg) openApp(pkg); }}
          rowLabel={(r) => `Abrir ${appLabel(r.name)}`}
          cols={[
            { key: "name", label: "Processo", render: (r) => (pkgOf(r.name) ? <span className="app-row"><AppIcon pkg={pkgOf(r.name)!} size={24} /><span><b>{appLabel(r.name)}</b> <small className="mono muted">{r.name}</small></span></span> : <span className="mono">{r.name}</span>), sort: (r) => r.name },
            { key: "bar", label: "", width: "30%", render: (r) => <LuckMeter label={`Memória de ${r.name}`} value={r.kb} max={top} compact /> },
            { key: "kb", label: "PSS", align: "right", render: (r) => <b>{fmtKb(r.kb)}</b>, sort: (r) => r.kb },
          ]}
        />
      </LuckCard>
    </>
  );
}
