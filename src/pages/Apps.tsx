import { useMemo, useState } from "react";
import { AppIcon } from "../appIcon";
import { Ban, Square, Trash2 } from "lucide-react";
import { Action, api, AppEntry } from "../api";
import { appLabel, installerLabel } from "../appNames";
import { Bars } from "../charts";
import { fmtNum } from "../format";
import { fmtAgo, permLabel } from "../permissions";
import { useDevice, useLoad } from "../hooks";
import { AppNetCard } from "./Rede";
import { AppTimelineCard } from "./AppTimeline";
import { DataTable, ErrorNote, LuckBadge, LuckButton, LuckCard, Segmented, Tone } from "../luck";
import { BackButton, KV, PageHead, Refresh } from "./common";
import { SkAppDetail, SkApps, SkChartBody } from "../skeletons";

/** Frequência em segundo plano, nos termos do usuário (bucket de standby do Android). */
export const BUCKETS = [
  { value: "active", label: "Ativo" },
  { value: "working_set", label: "Frequente" },
  { value: "frequent", label: "Regular" },
  { value: "rare", label: "Raro" },
  { value: "restricted", label: "Restrito" },
] as const;
const BUCKET_LABEL: Record<string, string> = Object.fromEntries(BUCKETS.map((b) => [b.value, b.label]));
const BUCKET_TONE: Record<string, Tone> = { active: "success", working_set: "accent", frequent: "neutral", rare: "warning", restricted: "danger", exempted: "neutral" };

type Filter = "all" | "drain" | "nonstore" | "restricted";

export default function AppsPage() {
  const { route } = useDevice();
  return route.app ? <AppDetailPage pkg={route.app} /> : <AppList />;
}

function AppList() {
  const { openApp } = useDevice();
  const apps = useLoad(api.apps);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const all = apps.data ?? [];
  const rows = all.filter((a) => {
    const needle = q.toLowerCase();
    if (q && !a.package.toLowerCase().includes(needle) && !appLabel(a.package).toLowerCase().includes(needle)) return false;
    if (filter === "drain") return (a.mah ?? 0) > 0;
    if (filter === "nonstore") return !a.store;
    if (filter === "restricted") return a.bucket === "restricted" || a.bucket === "rare";
    return true;
  });
  const count = (f: Filter) => all.filter((a) => (f === "drain" ? (a.mah ?? 0) > 0 : f === "nonstore" ? !a.store : a.bucket === "restricted" || a.bucket === "rare")).length;

  return (
    <div className="page">
      <PageHead title="Apps" subtitle={apps.data ? `${all.length} apps instalados por você` : "Apps instalados por você"} actions={<Refresh onClick={apps.reload} loading={apps.loading} at={apps.at} />} />
      <div className="row gap-sm wrap">
        <input className="field" placeholder="Buscar app ou pacote…" aria-label="Buscar app" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <Segmented
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos" },
            { value: "drain", label: `Com consumo${apps.data ? ` (${count("drain")})` : ""}` },
            { value: "nonstore", label: `Fora da loja${apps.data ? ` (${count("nonstore")})` : ""}` },
            { value: "restricted", label: `Restritos${apps.data ? ` (${count("restricted")})` : ""}` },
          ]}
        />
      </div>
      {apps.error ? (
        <ErrorNote error={apps.error} title="Não foi possível listar os apps" />
      ) : !apps.data ? (
        <SkApps />
      ) : (
        <LuckCard padded={false}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.package}
            onRow={(r) => openApp(r.package)}
            rowLabel={(r) => `Abrir ${appLabel(r.package)}`}
            initialSort={{ key: "mah", desc: true }}
            empty="Nenhum app com esse filtro."
            cols={[
              { key: "name", label: "App", sort: (r) => appLabel(r.package), render: (r) => (
                <span className="app-row"><AppIcon pkg={r.package} size={32} /><span className="app-cell"><b>{appLabel(r.package)}</b><small className="mono muted">{r.package}</small></span></span>
              ) },
              { key: "src", label: "Origem", sort: (r) => (r.store ? 0 : 1), render: (r) => <LuckBadge tone={r.store ? "neutral" : "warning"}>{installerLabel(r.installer)}</LuckBadge> },
              { key: "bucket", label: "Segundo plano", sort: (r) => r.bucket ?? "", render: (r) => (r.bucket ? <LuckBadge tone={BUCKET_TONE[r.bucket] ?? "neutral"}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</LuckBadge> : <span className="muted">—</span>) },
              { key: "dis", label: "", render: (r) => r.disabled && <LuckBadge tone="danger">desativado</LuckBadge> },
              { key: "mah", label: "mAh desde a carga", align: "right", sort: (r) => r.mah ?? 0, render: (r) => (r.mah ? <b>{fmtNum(r.mah, 1)}</b> : <span className="muted">—</span>) },
            ]}
          />
        </LuckCard>
      )}
    </div>
  );
}

const SENSITIVE = new Set(["RECORD_AUDIO", "CAMERA", "ACCESS_BACKGROUND_LOCATION", "ACCESS_FINE_LOCATION", "READ_SMS", "READ_CONTACTS", "READ_CALL_LOG"]);

function AppDetailPage({ pkg }: { pkg: string }) {
  const { back: goBack, confirmAction } = useDevice();
  const detail = useLoad((s) => api.appDetail(s, pkg), [pkg]);
  const list = useLoad(api.apps);
  const hist = useLoad((s) => api.history(s, 7), [pkg]);
  const entry: AppEntry | undefined = list.data?.find((a) => a.package === pkg);
  const d = detail.data;
  const back = () => goBack({ area: "apps" });

  const daily = useMemo(() => {
    // Cada amostra é acumulada desde a última carga: o máximo do dia é o gasto daquele dia.
    const perDay = new Map<string, { ts: number; mah: number }>();
    for (const r of hist.data?.drain ?? []) {
      if (r.package !== pkg) continue;
      const k = new Date(r.ts * 1000).toDateString();
      const cur = perDay.get(k);
      perDay.set(k, { ts: r.ts, mah: Math.max(cur?.mah ?? 0, r.mah) });
    }
    return [...perDay.values()].sort((a, b) => a.ts - b.ts).map((v) => ({
      key: String(v.ts),
      label: new Date(v.ts * 1000).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      value: v.mah,
    }));
  }, [hist.data, pkg]);

  const run = async (title: string, body: string, action: Action, danger = false) => {
    const ok = await confirmAction({ title, body, action, danger });
    if (!ok) return;
    // As leituras da tela são relidas pelo App depois de qualquer ação.
    if (action.kind === "uninstall_user_app") back();
  };

  const restricted = d?.run_in_background === "ignore";
  const name = appLabel(pkg);

  return (
    <div className="page">
      <BackButton fallback={{ area: "apps" }} />
      <header className="page-head">
        <div className="row gap-md">
          <AppIcon pkg={pkg} size={64} />
          <div>
            <h1>{name}</h1>
            <p className="muted mono small">{pkg}</p>
            <div className="row gap-xs wrap" style={{ marginTop: 8 }}>
              {entry && <LuckBadge tone={entry.store ? "neutral" : "warning"}>{installerLabel(entry.installer)}</LuckBadge>}
              {d && <LuckBadge tone={restricted ? "danger" : "success"} dot>{restricted ? "segundo plano restrito" : "segundo plano permitido"}</LuckBadge>}
              {entry?.disabled && <LuckBadge tone="danger">desativado</LuckBadge>}
            </div>
          </div>
        </div>
        {d && (
          <div className="row gap-sm wrap">
            <LuckButton iconLeft={<Square size={14} />} onClick={() => run(`Forçar parada de ${name}`, "Encerra o app agora. Ele volta a abrir normalmente quando você usar.", { kind: "force_stop", package: pkg }, true)}>Forçar parada</LuckButton>
            <LuckButton
              iconLeft={<Ban size={14} />}
              onClick={() =>
                run(
                  restricted ? "Permitir segundo plano" : "Restringir segundo plano",
                  restricted ? "O app volta a poder rodar em segundo plano." : "O app não poderá rodar em segundo plano (equivale a “Restrito” em Bateria). Notificações via Google continuam chegando.",
                  { kind: "set_background", package: pkg, mode: restricted ? "allow" : "ignore" },
                )
              }
            >
              {restricted ? "Permitir 2º plano" : "Restringir 2º plano"}
            </LuckButton>
          </div>
        )}
      </header>

      {detail.error ? (
        <ErrorNote error={detail.error} title="Não foi possível ler este app" />
      ) : !d ? (
        <SkAppDetail />
      ) : (
        <>
          <div className="grid two">
            <LuckCard heading="Consumo por dia" hint="últimos 7 dias, mAh" padded>
              {hist.error ? <ErrorNote error={hist.error} /> : !hist.data ? <SkChartBody height={150} /> : <Bars data={daily} unit="mAh" label={`Consumo diário de ${name}`} />}
              {entry?.mah ? <p className="muted small">{fmtNum(entry.mah, 1)} mAh desde a última carga completa.</p> : null}
            </LuckCard>
            <LuckCard heading="Frequência em segundo plano" padded>
              <p className="muted small">Quanto o Android deixa o app rodar tarefas e alarmes quando você não está usando. “Restrito” economiza mais.</p>
              <Segmented
                label="Frequência em segundo plano"
                value={d.bucket as (typeof BUCKETS)[number]["value"] | undefined}
                options={[...BUCKETS]}
                onChange={(b) => run(`Frequência de ${name}: ${BUCKET_LABEL[b]}`, "Muda com que frequência o sistema deixa o app executar tarefas e alarmes.", { kind: "set_standby_bucket", package: pkg, bucket: b })}
              />
            </LuckCard>
          </div>

          <AppTimelineCard pkg={pkg} />

          <div className="grid two">
            <LuckCard heading="Permissões sensíveis" index={String(d.granted_sensitive.length)} padded>
              {d.granted_sensitive.length ? (
                <ul className="perm-list">
                  {d.granted_sensitive.map((p) => (
                    <li key={p}>
                      <span className="perm-name">
                        <b>{permLabel(p)}</b>
                        <small className="mono">{p}</small>
                      </span>
                      {SENSITIVE.has(p) && <LuckBadge tone="warning">alto risco</LuckBadge>}
                    </li>
                  ))}
                </ul>
              ) : <span className="muted">Nenhuma concedida.</span>}
              {d.recent_ops.length > 0 && (
                <>
                  <span className="label">Uso recente</span>
                  <ul className="perm-list">
                    {d.recent_ops.map((o) => (
                      <li key={o.op}>
                        <span className="perm-name">
                          <b>{permLabel(o.op)}</b>
                          <small className="mono">{o.op}</small>
                        </span>
                        <span className="muted small" title={o.ago}>{fmtAgo(o.ago)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </LuckCard>
            <LuckCard heading="Sobre" padded>
              <KV items={[
                ["Versão", d.version],
                ["Instalado em", d.first_install],
                ["Atualizado em", d.last_update],
                ["Instalado por", installerLabel(d.installer)],
                ["Target SDK", d.target_sdk],
              ]} />
            </LuckCard>
          </div>

          <AppNetCard pkg={pkg} />

          <LuckCard heading="Zona de risco" padded>
            <div className="row between wrap gap-sm">
              <p className="muted small" style={{ margin: 0 }}>Desinstalar remove o app e os dados dele do usuário principal. Não dá para desfazer.</p>
              <LuckButton danger iconLeft={<Trash2 size={14} />} onClick={() => run(`Desinstalar ${name}`, `Remove ${pkg} do usuário principal. Os dados do app são apagados.`, { kind: "uninstall_user_app", package: pkg }, true)}>Desinstalar</LuckButton>
            </div>
          </LuckCard>
        </>
      )}
    </div>
  );
}
