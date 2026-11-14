import { useMemo } from "react";
import { api, AppTimeline as TL, TimelineMark, TimelineSpan } from "../api";
import { fmtNum } from "../format";
import { useLoad } from "../hooks";
import { DataTable, ErrorNote, LuckBadge, LuckCard, LuckStat } from "../luck";
import { SkChartBody } from "../skeletons";

/**
 * Quando o app esteve na tela e quando rodou escondido, desde a última carga (histórico do batterystats).
 * As faixas sombreadas são os períodos de tela desligada: atividade ali é o app acordando o aparelho.
 */

const LANES: { id: string; label: string; kinds: TimelineSpan["kind"][]; color: string; hint: string }[] = [
  { id: "top", label: "Na tela", kinds: ["top"], color: "var(--chart-1)", hint: "você usando o app" },
  { id: "fg", label: "Primeiro plano", kinds: ["fg"], color: "var(--chart-2)", hint: "processo em primeiro plano, inclusive serviço com notificação fixa" },
  { id: "job", label: "Tarefas", kinds: ["job", "sync"], color: "var(--chart-3)", hint: "tarefas agendadas e sincronização" },
  { id: "wake", label: "Mantém acordado", kinds: ["wake_lock", "longwake"], color: "var(--chart-4)", hint: "wakelock: impede o processador de dormir" },
];

const KIND_LABEL: Record<string, string> = {
  top: "Na tela", fg: "Primeiro plano", job: "Tarefa", sync: "Sincronização", wake_lock: "Wakelock", longwake: "Wakelock longo",
  wakeupap: "Alarme", tmpwhitelist: "Push",
};

const hm = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const hms = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dur = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : ms < 3600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.floor(ms / 3600_000)} h ${Math.round((ms % 3600_000) / 60_000)} min`);
/** Tag do Android encurtada: tira o pacote repetido e prefixos internos. */
const shortTag = (tag: string, pkg: string) => tag.replace(/^\*(job|walarm|alarm)\*[r]?\//, "").replace(/^\*walarm\*:/, "").replace(`${pkg}/`, "").replace(pkg, "…");

type Wake = { t: number; kind: string; dur?: number; tag: string };

export function AppTimelineCard({ pkg }: { pkg: string }) {
  const tl = useLoad((s) => api.appTimeline(s, pkg), [pkg]);
  const d = tl.data;

  const sum = useMemo(() => summarize(d), [d]);

  return (
    <LuckCard heading="Quando o app rodou" hint="desde a última carga · sombreado: tela desligada" padded>
      {tl.error ? (
        <ErrorNote error={tl.error} title="Não foi possível ler a linha do tempo" />
      ) : !d ? (
        <SkChartBody height={170} label="Lendo a linha do tempo…" />
      ) : d.start == null || d.end == null || (!d.spans.length && !d.marks.length) ? (
        <p className="muted" style={{ margin: 0 }}>Sem atividade deste app no histórico desde a última carga.</p>
      ) : (
        <div className="tl">
          <div className="grid stats">
            <LuckStat value={dur(sum.onScreen)} caption={`na tela, ${sum.opens} ${sum.opens === 1 ? "vez" : "vezes"}`} />
            <LuckStat value={fmtNum(sum.wakes.length, 0)} caption="vezes que rodou com a tela desligada" />
            <LuckStat value={dur(sum.offBusy)} caption="ativo com a tela desligada" />
          </div>
          <Lanes d={d} pkg={pkg} />
          {sum.wakes.length > 0 && (
            <>
              <span className="label">Com a tela desligada, mais recentes primeiro</span>
              <DataTable<Wake>
                rows={sum.wakes}
                rowKey={(r) => `${r.t}|${r.kind}|${r.tag}`}
                limit={12}
                initialSort={{ key: "t", desc: true }}
                cols={[
                  { key: "t", label: "Hora", render: (r) => <span className="mono" style={{ whiteSpace: "nowrap" }}>{hms(r.t)}</span>, sort: (r) => r.t },
                  { key: "kind", label: "O quê", render: (r) => <LuckBadge tone={r.kind === "wakeupap" ? "warning" : "neutral"}>{KIND_LABEL[r.kind] ?? r.kind}</LuckBadge>, sort: (r) => r.kind },
                  { key: "dur", label: "Duração", align: "right", render: (r) => (r.dur != null ? dur(r.dur) : "—"), sort: (r) => r.dur ?? 0 },
                  { key: "tag", label: "Detalhe", render: (r) => <small className="mono muted tl-tag" title={r.tag}>{shortTag(r.tag, pkg)}</small> },
                ]}
              />
            </>
          )}
        </div>
      )}
    </LuckCard>
  );
}

function summarize(d: TL | null) {
  const out = { onScreen: 0, opens: 0, offBusy: 0, wakes: [] as Wake[] };
  if (!d) return out;
  for (const s of d.spans) {
    if (s.kind === "top") {
      out.onScreen += s.end - s.start;
      out.opens++;
    } else if (s.screen_off) {
      out.wakes.push({ t: s.start, kind: s.kind, dur: s.end - s.start, tag: s.tag });
    }
  }
  for (const m of d.marks) if (m.screen_off) out.wakes.push({ t: m.t, kind: m.kind, tag: m.tag });
  // Tempo ativo com a tela desligada: união dos intervalos (tarefa e wakelock costumam se sobrepor).
  const iv = d.spans.filter((s) => s.screen_off && s.kind !== "top").map((s) => [s.start, s.end] as const).sort((a, b) => a[0] - b[0]);
  let cur: [number, number] | null = null;
  for (const [a, b] of iv) {
    if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b);
    else {
      if (cur) out.offBusy += cur[1] - cur[0];
      cur = [a, b];
    }
  }
  if (cur) out.offBusy += cur[1] - cur[0];
  return out;
}

function Lanes({ d, pkg }: { d: TL; pkg: string }) {
  const t0 = d.start!;
  const span = Math.max(1, d.end! - t0);
  const x = (t: number) => `${((t - t0) / span) * 100}%`;
  const w = (a: number, b: number) => `max(2px, ${((b - a) / span) * 100}%)`;
  const ticks = useMemo(() => {
    const steps = [15, 30, 60, 120, 180, 360, 720].map((m) => m * 60_000);
    const step = steps.find((s) => span / s <= 8) ?? 1440 * 60_000;
    const first = Math.ceil(t0 / step) * step;
    const out: number[] = [];
    for (let t = first; t <= t0 + span; t += step) out.push(t);
    return out;
  }, [t0, span]);
  const shade = d.screen_off.map(([a, b], i) => <span key={i} className="tl-off" style={{ left: x(a), width: w(a, b) }} />);
  const marks = (kind: TimelineMark["kind"]) => d.marks.filter((m) => m.kind === kind);

  return (
    <div className="tl-lanes" role="img" aria-label={`Linha do tempo de ${pkg}: uso na tela, tarefas, wakelocks e despertares desde a última carga`}>
      {LANES.map((lane) => {
        const spans = d.spans.filter((s) => lane.kinds.includes(s.kind));
        return (
          <div key={lane.id} className="tl-lane">
            <span className="tl-name" title={lane.hint}>{lane.label}</span>
            <div className="tl-track">
              {shade}
              {spans.map((s, i) => (
                <span
                  key={i}
                  className="tl-span"
                  style={{ left: x(s.start), width: w(s.start, s.end), background: lane.color }}
                  title={`${hms(s.start)}–${hms(s.end)} · ${KIND_LABEL[s.kind]} · ${dur(s.end - s.start)}${s.screen_off ? " · tela desligada" : ""}\n${s.tag}`}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="tl-lane">
        <span className="tl-name" title="alarme do app acordou o processador (▲) ou push de alta prioridade liberou o app (●)">Acordou</span>
        <div className="tl-track">
          {shade}
          {marks("wakeupap").map((m, i) => <span key={`a${i}`} className="tl-mark tl-mark--alarm" style={{ left: x(m.t) }} title={`${hms(m.t)} · alarme acordou o aparelho\n${m.tag}`} />)}
          {marks("tmpwhitelist").map((m, i) => <span key={`p${i}`} className="tl-mark tl-mark--push" style={{ left: x(m.t) }} title={`${hms(m.t)} · push liberou o app\n${m.tag}`} />)}
        </div>
      </div>
      <div className="tl-lane tl-axis">
        <span />
        <div className="tl-track">
          {ticks.map((t) => <span key={t} className="tl-tick" style={{ left: x(t) }}>{hm(t)}</span>)}
        </div>
      </div>
    </div>
  );
}
