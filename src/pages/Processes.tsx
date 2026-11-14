import { useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { api, LiveProc } from "../api";
import { fmtDur, fmtKb, fmtNum, pkgOf } from "../format";
import { useDevice, useLoad } from "../hooks";
import { Badge, Bar, Card, ErrorBox, Kpi, Loading, Page, RefreshBtn, Segmented, Table } from "../ui";

export default function ProcessesPage() {
  const { confirmAction } = useDevice();
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"live" | "cum" | "mem">("live");
  const procs = useLoad(api.processes, [], paused ? undefined : 3000);
  const mem = useLoad(view === "mem" ? api.memory : null, [view]);
  const d = procs.data;
  const asleep = d?.wakefulness && d.wakefulness !== "Awake";
  const match = (n: string) => !q || n.toLowerCase().includes(q.toLowerCase());

  const stop = (p: LiveProc | { name: string }) => {
    const pkg = pkgOf(p.name);
    if (!pkg) return;
    confirmAction({
      title: `Forçar parada de ${pkg}`,
      body: "O app será encerrado agora. Ele pode voltar a rodar quando receber uma notificação push ou quando você abri-lo.",
      action: { kind: "force_stop", package: pkg },
      danger: true,
    }).then((ok) => {
      if (ok) procs.reload();
    });
  };

  return (
    <Page
      title="Processos"
      subtitle="Uso de CPU e memória em tempo real"
      actions={
        <>
          <input className="search" placeholder="Filtrar processo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={() => setPaused(!paused)}>
            {paused ? <Play size={15} /> : <Pause size={15} />} {paused ? "Retomar" : "Pausar"}
          </button>
          <RefreshBtn onClick={procs.reload} loading={procs.loading} />
        </>
      }
    >
      {procs.error && <ErrorBox error={procs.error} />}
      {!d ? (
        <Loading />
      ) : (
        <>
          <div className="grid kpis">
            <Kpi label="CPU ocupada" value={fmtNum(d.cpu?.busy_pct, 1, "%")} hint={`${d.cpu?.cores ?? "?"} núcleos`} tone={(d.cpu?.busy_pct ?? 0) > 50 ? "warn" : undefined} />
            <Kpi label="Load average" value={d.loadavg.join(" · ")} hint="1 · 5 · 15 min" />
            <Kpi label="Estado da tela" value={d.wakefulness ?? "—"} hint={asleep ? "processos com CPU alta agora são suspeitos" : "em uso"} tone={asleep ? "warn" : "good"} />
          </div>
          <Card extra={<Segmented value={view} onChange={setView} options={[["live", "Agora"], ["cum", "CPU acumulada"], ["mem", "Memória (PSS)"]]} />} title={view === "live" ? "Top processos" : view === "cum" ? "Tempo de CPU desde o boot" : "Memória por processo"}>
            {view === "live" && (
              <Table
                rows={d.live.filter((p) => match(p.name))}
                rowKey={(r) => r.pid}
                initialSort={{ key: "cpu", desc: true }}
                cols={[
                  { key: "pid", label: "PID", render: (r) => r.pid, sort: (r) => Number(r.pid), width: "70px" },
                  { key: "name", label: "Processo", render: (r) => <span className="mono">{r.name}</span>, sort: (r) => r.name },
                  { key: "user", label: "Usuário", render: (r) => <span className="muted">{r.user}</span> },
                  { key: "cpu", label: "CPU", width: "160px", render: (r) => (
                    <div className="row gap">
                      <Bar value={r.cpu} max={100} tone={r.cpu > 20 && asleep ? "bad" : "accent"} />
                      <span className="num">{fmtNum(r.cpu, 1)}%</span>
                      {r.cpu > 20 && asleep && <Badge tone="bad">em repouso</Badge>}
                    </div>
                  ), sort: (r) => r.cpu },
                  { key: "mem", label: "Mem", align: "right", render: (r) => `${fmtNum(r.mem, 1)}%`, sort: (r) => r.mem },
                  { key: "res", label: "RES", align: "right", render: (r) => r.res },
                  { key: "time", label: "TIME+", align: "right", render: (r) => r.time },
                  { key: "act", label: "", render: (r) => pkgOf(r.name) && (
                    <button className="btn icon ghost" title="Forçar parada" onClick={() => stop(r)}><Square size={14} /></button>
                  ) },
                ]}
              />
            )}
            {view === "cum" && (
              <Table
                rows={d.cumulative.filter((p) => match(p.name))}
                rowKey={(r) => r.pid}
                initialSort={{ key: "t", desc: true }}
                cols={[
                  { key: "name", label: "Processo", render: (r) => <span className="mono">{r.name}</span>, sort: (r) => r.name },
                  { key: "user", label: "Usuário", render: (r) => <span className="muted">{r.user}</span> },
                  { key: "rss", label: "RSS", align: "right", render: (r) => fmtKb(r.rss_kb), sort: (r) => r.rss_kb },
                  { key: "t", label: "CPU total", align: "right", render: (r) => <b>{fmtDur(r.time_s)}</b>, sort: (r) => r.time_s },
                ]}
              />
            )}
            {view === "mem" && (mem.data ? (
              <Table
                rows={mem.data.filter((p) => match(p.name))}
                rowKey={(r) => r.pid}
                initialSort={{ key: "kb", desc: true }}
                cols={[
                  { key: "name", label: "Processo", render: (r) => <span className="mono">{r.name}</span>, sort: (r) => r.name },
                  { key: "bar", label: "", width: "30%", render: (r) => <Bar value={r.kb} max={mem.data![0]?.kb ?? 1} /> },
                  { key: "kb", label: "PSS", align: "right", render: (r) => <b>{fmtKb(r.kb)}</b>, sort: (r) => r.kb },
                ]}
              />
            ) : <Loading label="Lendo meminfo…" />)}
          </Card>
        </>
      )}
    </Page>
  );
}
