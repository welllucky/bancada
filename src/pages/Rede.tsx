import { useEffect, useMemo, useState } from "react";
import { api, NetApp, NetLive, NetSocket } from "../api";
import { AppIcon } from "../appIcon";
import { appLabel } from "../appNames";
import { TimeChart } from "../charts";
import { fmtBytes, fmtNum, fmtRate } from "../format";
import { useDevice, useLoad } from "../hooks";
import { DataTable, ErrorNote, LuckBadge, LuckCard, LuckStat, Segmented } from "../luck";
import { Refresh } from "./common";
import { SkChartBody, SkRede, SkRowsBody } from "../skeletons";

/**
 * Rede: taxa agora (diferença entre leituras de `/proc/net/dev`), consumo por período e por app
 * (`dumpsys netstats`) e conexões abertas com o app dono (`/proc/net/tcp|udp`).
 */

// ---- taxa ao vivo: amostras guardadas por aparelho, para não zerar o gráfico ao trocar de aba.

type Sample = { t: number; rx: number; tx: number; wifi: boolean; mobile: boolean };
type Rate = { t: number; rx: number; tx: number };
const WINDOW_MS = 3 * 60 * 1000;
const samples = new Map<string, { last?: Sample; rates: Rate[] }>();

function push(serial: string, l: NetLive) {
  const s = samples.get(serial) ?? { rates: [] };
  const cur: Sample = {
    t: l.t,
    rx: l.ifaces.reduce((a, i) => a + i.rx, 0),
    tx: l.ifaces.reduce((a, i) => a + i.tx, 0),
    wifi: l.ifaces.some((i) => i.transport === "wifi"),
    mobile: l.ifaces.some((i) => i.transport === "mobile"),
  };
  const p = s.last;
  // Contador que volta (interface reiniciou, troca de rede) não vira taxa negativa: só recomeça.
  if (p && cur.t > p.t && cur.rx >= p.rx && cur.tx >= p.tx) {
    const dt = (cur.t - p.t) / 1000;
    s.rates.push({ t: cur.t, rx: (cur.rx - p.rx) / dt, tx: (cur.tx - p.tx) / dt });
  }
  s.last = cur;
  s.rates = s.rates.filter((r) => r.t >= cur.t - WINDOW_MS);
  samples.set(serial, s);
  return s;
}

function useLiveRate(every = 2000) {
  const { serial } = useDevice();
  const [, tick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!serial) return;
    let alive = true;
    const read = () =>
      api.netLive(serial).then(
        (l) => { if (alive) { push(serial, l); setError(null); tick((n) => n + 1); } },
        (e) => alive && setError(String(e)),
      );
    read();
    const id = setInterval(read, every);
    return () => { alive = false; clearInterval(id); };
  }, [serial, every]);
  const s = serial ? samples.get(serial) : undefined;
  return { rates: s?.rates ?? [], last: s?.last, error };
}

// ---- dicas sobre o destino de uma conexão

const PORTS: Record<number, string> = {
  53: "DNS", 80: "HTTP", 123: "hora (NTP)", 443: "HTTPS", 853: "DNS privado", 993: "e-mail (IMAP)", 465: "e-mail (SMTP)", 587: "e-mail (SMTP)",
  1900: "descoberta (SSDP)", 3478: "chamada (STUN)", 5222: "mensagens (XMPP)", 5223: "push (Apple)", 5228: "push (Google)", 5353: "descoberta (mDNS)", 8080: "HTTP alternativo",
};

const isPrivate = (ip: string) =>
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|fe80:|fc|fd|::1$)/i.test(ip);

const active = (s: NetSocket) => s.state === "estabelecida" || (s.proto === "UDP" && s.remote_port > 0);

const who = (pkgs: string[], label: string) => (pkgs.length ? appLabel(pkgs[0]) : label);

function Owner({ packages, label }: { packages: string[]; label: string }) {
  if (!packages.length) return <span>{label}</span>;
  return (
    <span className="app-row">
      <AppIcon pkg={packages[0]} size={24} />
      <span>
        <b>{appLabel(packages[0])}</b>
        {packages.length > 1 && <small className="muted"> +{packages.length - 1}</small>}
      </span>
    </span>
  );
}

// ---- consumo agrupado em blocos (por hora em 24 h, a cada 6 h em 7 dias, por dia em 30 dias)

const PERIODS = [
  { value: "1", label: "24 h", step: 3600 },
  { value: "7", label: "7 dias", step: 6 * 3600 },
  { value: "30", label: "30 dias", step: 86400 },
] as const;
type Period = (typeof PERIODS)[number]["value"];

function bucketed(points: { t: number; rx: number; tx: number }[], step: number) {
  const m = new Map<number, { rx: number; tx: number }>();
  for (const p of points) {
    const k = Math.floor(p.t / step) * step;
    const b = m.get(k) ?? { rx: 0, tx: 0 };
    b.rx += p.rx;
    b.tx += p.tx;
    m.set(k, b);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

const MB = 1024 * 1024;

export function Rede() {
  const { openApp } = useDevice();
  const [period, setPeriod] = useState<Period>("1");
  const [refresh, setRefresh] = useState(0);
  const [onlyActive, setOnlyActive] = useState<"ativas" | "todas">("ativas");
  const live = useLiveRate();
  const usage = useLoad((s) => api.netUsage(s, Number(period), refresh > 0), [period, refresh]);
  const conns = useLoad(api.netConnections, [], 5000);

  const step = PERIODS.find((p) => p.value === period)!.step;
  const blocks = useMemo(() => bucketed(usage.data?.timeline ?? [], step), [usage.data, step]);
  const split = useMemo(() => {
    const tl = usage.data?.timeline ?? [];
    return { wifi: tl.reduce((a, p) => a + p.wifi, 0), mobile: tl.reduce((a, p) => a + p.mobile, 0) };
  }, [usage.data]);
  const connCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of conns.data?.sockets ?? []) if (active(s)) m.set(s.uid, (m.get(s.uid) ?? 0) + 1);
    return m;
  }, [conns.data]);

  const now = live.rates[live.rates.length - 1];
  const via = live.last ? (live.last.wifi && live.last.mobile ? "Wi-Fi e dados móveis" : live.last.wifi ? "Wi-Fi" : live.last.mobile ? "dados móveis" : "sem rede") : "lendo…";
  const sockets = (conns.data?.sockets ?? []).filter((s) => onlyActive === "todas" || active(s));

  return (
    <>
      <div className="grid stats">
        <LuckCard padded><LuckStat value={fmtRate(now?.rx)} caption={`baixando agora · ${via}`} /></LuckCard>
        <LuckCard padded><LuckStat value={fmtRate(now?.tx)} caption="enviando agora" /></LuckCard>
        <LuckCard padded><LuckStat value={fmtBytes(usage.data?.rx)} caption={`baixado em ${PERIODS.find((p) => p.value === period)!.label}`} /></LuckCard>
        <LuckCard padded>
          <LuckStat value={fmtBytes(usage.data?.tx)} caption={`enviado · Wi-Fi ${fmtBytes(split.wifi)}, dados ${fmtBytes(split.mobile)}`} />
        </LuckCard>
      </div>

      <LuckCard heading="Agora" hint="últimos 3 min, a cada 2 s" padded>
        {live.error && !live.rates.length ? (
          <ErrorNote error={live.error} title="Não foi possível ler a taxa da rede" />
        ) : live.rates.length < 2 ? (
          <SkChartBody height={180} label="Medindo a taxa…" />
        ) : (
          <TimeChart
            label="Taxa de download e upload nos últimos minutos"
            height={180}
            leftDomain={[0, Math.max(1, ...live.rates.map((r) => Math.max(r.rx, r.tx) / 1024)) * 1.1]}
            series={[
              { label: "Download", unit: " KB/s", color: "var(--chart-1)", points: live.rates.map((r) => [r.t / 1000, r.rx / 1024]) },
              { label: "Upload", unit: " KB/s", color: "var(--chart-3)", points: live.rates.map((r) => [r.t / 1000, r.tx / 1024]) },
            ]}
          />
        )}
      </LuckCard>

      <div className="row between wrap gap-sm">
        <Segmented label="Período" value={period} onChange={setPeriod} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
        <Refresh onClick={() => setRefresh((n) => n + 1)} loading={usage.loading} at={usage.at} />
      </div>

      {usage.error ? (
        <ErrorNote error={usage.error} title="Não foi possível ler o consumo de rede" />
      ) : !usage.data ? (
        <SkRede />
      ) : !usage.data.available ? (
        <LuckCard padded><p className="muted">Este aparelho não informou o consumo de rede pelo adb.</p></LuckCard>
      ) : (
        <>
          <LuckCard heading="Consumo no período" hint={step === 3600 ? "por hora" : step === 86400 ? "por dia" : "a cada 6 h"} padded>
            <TimeChart
              label="Dados baixados e enviados no período"
              height={200}
              leftDomain={[0, Math.max(1, ...blocks.map(([, b]) => Math.max(b.rx, b.tx) / MB)) * 1.1]}
              series={[
                { label: "Baixado", unit: " MB", color: "var(--chart-1)", points: blocks.map(([t, b]) => [t, b.rx / MB]) },
                { label: "Enviado", unit: " MB", color: "var(--chart-3)", points: blocks.map(([t, b]) => [t, b.tx / MB]) },
              ]}
            />
          </LuckCard>

          <LuckCard heading="Por app" hint="clique para abrir o app" padded={false}>
            <DataTable<NetApp>
              rows={usage.data.apps.filter((a) => a.rx + a.tx > 0)}
              rowKey={(r) => String(r.uid)}
              limit={30}
              initialSort={{ key: "total", desc: true }}
              onRow={(r) => r.packages[0] && openApp(r.packages[0])}
              rowLabel={(r) => `Abrir ${who(r.packages, r.label)}`}
              cols={[
                { key: "app", label: "App", render: (r) => <Owner packages={r.packages} label={r.label} />, sort: (r) => who(r.packages, r.label) },
                { key: "rx", label: "Baixado", align: "right", render: (r) => fmtBytes(r.rx), sort: (r) => r.rx },
                { key: "tx", label: "Enviado", align: "right", render: (r) => fmtBytes(r.tx), sort: (r) => r.tx },
                { key: "total", label: "Total", align: "right", render: (r) => <b>{fmtBytes(r.rx + r.tx)}</b>, sort: (r) => r.rx + r.tx },
                { key: "mobile", label: "Dados móveis", align: "right", render: (r) => (r.mobile ? fmtBytes(r.mobile) : "—"), sort: (r) => r.mobile },
                { key: "bg", label: "2º plano", align: "right", render: (r) => `${fmtNum(bgPct(r), 0)}%`, sort: (r) => bgPct(r) },
                { key: "conn", label: "Conexões", align: "right", render: (r) => connCount.get(r.uid) ?? "—", sort: (r) => connCount.get(r.uid) ?? 0 },
              ]}
            />
          </LuckCard>
        </>
      )}

      <Connections
        sockets={sockets}
        readable={conns.data?.readable}
        error={conns.error}
        loaded={!!conns.data}
        extra={<Segmented label="Quais conexões" value={onlyActive} onChange={setOnlyActive} options={[{ value: "ativas", label: "Ativas" }, { value: "todas", label: "Todas" }]} />}
        withApp
      />
    </>
  );
}

const bgPct = (a: NetApp) => {
  const t = a.rx + a.tx;
  return t ? (100 * Math.max(0, t - a.foreground)) / t : 0;
};

function Connections({ sockets, readable, error, loaded, extra, withApp }: {
  sockets: NetSocket[];
  readable?: boolean;
  error: string | null;
  loaded: boolean;
  extra?: React.ReactNode;
  withApp?: boolean;
}) {
  const { openApp } = useDevice();
  return (
    <LuckCard heading="Conexões abertas" hint="a cada 5 s" padded={false} extra={extra}>
      {error ? (
        <div className="pad"><ErrorNote error={error} title="Não foi possível ler as conexões" /></div>
      ) : !loaded ? (
        <SkRowsBody rows={4} icon={withApp} label="Lendo as conexões…" />
      ) : readable === false ? (
        <p className="pad muted">O Android deste aparelho não deixa ler as conexões pelo adb.</p>
      ) : (
        <DataTable<NetSocket>
          rows={sockets}
          rowKey={(r) => `${r.proto}|${r.local_port}|${r.remote}|${r.remote_port}|${r.uid}`}
          limit={40}
          initialSort={{ key: withApp ? "app" : "remote", desc: false }}
          onRow={withApp ? (r) => r.packages[0] && openApp(r.packages[0]) : undefined}
          rowLabel={withApp ? (r) => `Abrir ${who(r.packages, r.label)}` : undefined}
          cols={[
            ...(withApp ? [{ key: "app", label: "App", render: (r: NetSocket) => <Owner packages={r.packages} label={r.label} />, sort: (r: NetSocket) => who(r.packages, r.label) }] : []),
            { key: "remote", label: "Destino", sort: (r) => r.remote, render: (r) => r.remote_port ? (
              <span>
                <span className="mono">{r.remote}:{r.remote_port}</span>{" "}
                {PORTS[r.remote_port] && <small className="muted">{PORTS[r.remote_port]}</small>}{" "}
                {isPrivate(r.remote) && <LuckBadge tone="neutral">rede local</LuckBadge>}
              </span>
            ) : <span className="muted">aguardando · porta {r.local_port}{PORTS[r.local_port] ? ` (${PORTS[r.local_port]})` : ""}</span> },
            { key: "proto", label: "Protocolo", render: (r) => r.proto, sort: (r) => r.proto },
            { key: "state", label: "Estado", render: (r) => <LuckBadge tone={r.state === "estabelecida" ? "success" : "neutral"}>{r.state}</LuckBadge>, sort: (r) => r.state },
          ]}
        />
      )}
    </LuckCard>
  );
}

/** Card de rede no detalhe do app: consumo dos últimos 7 dias e as conexões abertas dele. */
export function AppNetCard({ pkg }: { pkg: string }) {
  const usage = useLoad((s) => api.netUsage(s, 7), []);
  const conns = useLoad(api.netConnections, [], 5000);
  const mine = usage.data?.apps.find((a) => a.packages.includes(pkg));
  const sockets = (conns.data?.sockets ?? []).filter((s) => s.packages.includes(pkg) && active(s));
  if (usage.data && !usage.data.available && conns.data && !conns.data.readable) return null;
  return (
    <>
      <LuckCard heading="Rede" hint="últimos 7 dias" padded>
        {usage.error ? <ErrorNote error={usage.error} /> : !usage.data ? <SkRowsBody rows={1} label="Lendo o consumo de rede…" /> : !mine ? (
          <p className="muted">Sem uso de rede registrado nos últimos 7 dias.</p>
        ) : (
          <div className="grid stats">
            <LuckStat value={fmtBytes(mine.rx)} caption="baixado" />
            <LuckStat value={fmtBytes(mine.tx)} caption="enviado" />
            <LuckStat value={fmtBytes(mine.mobile)} caption="em dados móveis" />
            <LuckStat value={`${fmtNum(bgPct(mine), 0)}%`} caption="em 2º plano" />
          </div>
        )}
      </LuckCard>
      {conns.data?.readable !== false && (
        <Connections sockets={sockets} readable={conns.data?.readable} error={conns.error} loaded={!!conns.data} />
      )}
    </>
  );
}
