import { useState } from "react";
import { Ban, MoonStar, Square, Trash2 } from "lucide-react";
import { Action, api, AppEntry } from "../api";
import { fmtNum } from "../format";
import { useDevice, useLoad } from "../hooks";
import { Badge, Card, Drawer, ErrorBox, KV, Loading, Page, RefreshBtn, Segmented, Table } from "../ui";

const BUCKET_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  active: "good", working_set: "accent", frequent: "neutral", rare: "warn", restricted: "bad", exempted: "neutral",
};

export default function AppsPage() {
  const apps = useLoad(api.apps);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "drain" | "nonstore" | "restricted">("all");
  const [sel, setSel] = useState<AppEntry | null>(null);

  const rows = (apps.data ?? []).filter((a) => {
    if (q && !a.package.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "drain") return (a.mah ?? 0) > 0;
    if (filter === "nonstore") return !a.store;
    if (filter === "restricted") return a.bucket === "restricted" || a.bucket === "rare";
    return true;
  });

  return (
    <Page
      title="Apps"
      subtitle={apps.data ? `${apps.data.length} apps de usuário instalados` : "Apps de usuário"}
      actions={
        <>
          <input className="search" placeholder="Buscar pacote…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Segmented value={filter} onChange={setFilter} options={[["all", "Todos"], ["drain", "Com consumo"], ["nonstore", "Fora da loja"], ["restricted", "Restritos"]]} />
          <RefreshBtn onClick={apps.reload} loading={apps.loading} />
        </>
      }
    >
      {apps.error && <ErrorBox error={apps.error} />}
      {!apps.data ? (
        <Loading label="Listando apps…" />
      ) : (
        <Card>
          <Table
            rows={rows}
            rowKey={(r) => r.package}
            onRow={setSel}
            initialSort={{ key: "mah", desc: true }}
            cols={[
              { key: "pkg", label: "Pacote", render: (r) => <span className="mono">{r.package}</span>, sort: (r) => r.package },
              { key: "src", label: "Origem", render: (r) => r.store ? <Badge tone="good">{r.installer === "com.android.vending" ? "Play Store" : "Galaxy Store"}</Badge> : <Badge tone="warn">{r.installer ?? "desconhecida"}</Badge>, sort: (r) => (r.store ? 0 : 1) },
              { key: "bucket", label: "Standby", render: (r) => r.bucket ? <Badge tone={BUCKET_TONE[r.bucket] ?? "neutral"}>{r.bucket}</Badge> : <span className="muted">—</span>, sort: (r) => r.bucket ?? "" },
              { key: "dis", label: "", render: (r) => r.disabled && <Badge tone="bad">desativado</Badge> },
              { key: "mah", label: "mAh desde a carga", align: "right", render: (r) => r.mah ? <b>{fmtNum(r.mah, 1)}</b> : <span className="muted">—</span>, sort: (r) => r.mah ?? 0 },
            ]}
          />
        </Card>
      )}
      <AppDrawer app={sel} onClose={() => setSel(null)} onChanged={apps.reload} />
    </Page>
  );
}

function AppDrawer({ app, onClose, onChanged }: { app: AppEntry | null; onClose: () => void; onChanged: () => void }) {
  const { confirmAction } = useDevice();
  const detail = useLoad(app ? (s) => api.appDetail(s, app.package) : null, [app?.package]);
  if (!app) return null;
  const d = detail.data;
  const run = async (title: string, body: string, action: Action, danger = false) => {
    const ok = await confirmAction({ title, body, action, danger });
    if (ok) {
      detail.reload();
      onChanged();
      if (action.kind === "uninstall_user_app") onClose();
    }
  };
  const restricted = d?.run_in_background === "ignore";
  return (
    <Drawer open onClose={onClose} title={<span className="mono">{app.package}</span>}>
      {!d ? (
        detail.error ? <ErrorBox error={detail.error} /> : <Loading />
      ) : (
        <>
          <KV items={[
            ["Versão", d.version],
            ["Instalado em", d.first_install],
            ["Atualizado em", d.last_update],
            ["Instalador", d.installer],
            ["Target SDK", d.target_sdk],
            ["Bucket de standby", d.bucket],
            ["Segundo plano", restricted ? <Badge tone="bad">restrito</Badge> : <Badge tone="good">permitido</Badge>],
            ["Consumo desde a carga", app.mah ? `${fmtNum(app.mah, 1)} mAh` : "—"],
          ]} />
          <h4>Permissões sensíveis concedidas</h4>
          <div className="row gap wrap">
            {d.granted_sensitive.length ? d.granted_sensitive.map((p) => <Badge key={p} tone={["RECORD_AUDIO", "CAMERA", "ACCESS_BACKGROUND_LOCATION", "READ_SMS"].includes(p) ? "warn" : "neutral"}>{p}</Badge>) : <span className="muted">nenhuma</span>}
          </div>
          {d.recent_ops.length > 0 && (
            <>
              <h4>Uso recente (appops)</h4>
              <ul className="ops">{d.recent_ops.map((o) => <li key={o.op}><code>{o.op}</code><span className="muted">há {o.ago}</span></li>)}</ul>
            </>
          )}
          <h4>Ações</h4>
          <div className="actions-grid">
            <button className="btn" onClick={() => run("Forçar parada", "Encerra o app agora.", { kind: "force_stop", package: app.package }, true)}><Square size={15} /> Forçar parada</button>
            <button className="btn" onClick={() => run(restricted ? "Permitir segundo plano" : "Restringir segundo plano", restricted ? "O app volta a poder rodar em segundo plano." : "O app não poderá rodar em segundo plano (equivale a 'Restrito' em Bateria). Mensagens push via Google continuam chegando para a maioria dos apps.", { kind: "set_background", package: app.package, mode: restricted ? "allow" : "ignore" })}>
              <Ban size={15} /> {restricted ? "Permitir 2º plano" : "Restringir 2º plano"}
            </button>
            <select className="btn" value="" onChange={(e) => e.target.value && run(`Bucket → ${e.target.value}`, "Muda com que frequência o sistema deixa o app executar jobs e alarmes.", { kind: "set_standby_bucket", package: app.package, bucket: e.target.value })}>
              <option value="">⏾ Mudar bucket…</option>
              {["active", "working_set", "frequent", "rare", "restricted"].map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <button className="btn danger" onClick={() => run("Desinstalar", `Remove ${app.package} do usuário principal. Os dados do app serão apagados.`, { kind: "uninstall_user_app", package: app.package }, true)}><Trash2 size={15} /> Desinstalar</button>
          </div>
          <p className="muted small"><MoonStar size={12} /> Nenhuma ação apaga dados do app, exceto desinstalar.</p>
        </>
      )}
    </Drawer>
  );
}
