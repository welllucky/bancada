import { RotateCcw, Wrench } from "lucide-react";
import { api, Json } from "../api";
import { fmtDate, fmtDur } from "../format";
import { useDevice, useLoad } from "../hooks";
import { Badge, Card, ErrorBox, Kpi, KV, Loading, Page, RefreshBtn } from "../ui";

export default function BootPage() {
  const { confirmAction } = useDevice();
  const boot = useLoad(api.boot);
  const d: Json = boot.data;
  const locked = d?.bootloader_locked === "1" || d?.vbmeta_state === "locked";
  const warranty = d?.warranty_bit;
  return (
    <Page title="Boot & Sistema" subtitle="Integridade, firmware e manutenção" actions={<RefreshBtn onClick={boot.reload} loading={boot.loading} />}>
      {boot.error && <ErrorBox error={boot.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid kpis">
            <Kpi label="Ligado há" value={fmtDur(d.uptime_s)} hint={`desde ${fmtDate(d.boot_time)}`} />
            <Kpi label="Verified Boot" value={d.verified_boot ?? "—"} tone={d.verified_boot === "green" ? "good" : "bad"} hint="green = sistema original" />
            <Kpi label="Bootloader" value={locked ? "bloqueado" : d.bootloader_locked == null ? "—" : "desbloqueado"} tone={locked ? "good" : "warn"} />
            <Kpi label="Knox warranty" value={warranty === "0" ? "intacto" : warranty ?? "—"} tone={warranty === "0" ? "good" : warranty ? "bad" : undefined} />
            <Kpi label="SELinux" value={d.selinux || "—"} tone={d.selinux === "Enforcing" ? "good" : "bad"} />
          </div>
          <div className="grid two">
            <Card title="Firmware">
              <KV items={[
                ["Fingerprint", <span className="mono small">{d.fingerprint}</span>],
                ["Patch de segurança", d.security_patch],
                ["Data do build", d.build_date],
                ["Bootloader", d.bootloader],
                ["Baseband", d.baseband],
                ["Hardware", d.hardware],
                ["Kernel", <span className="mono small">{d.kernel}</span>],
              ]} />
            </Card>
            <Card title="Histórico de boot">
              <KV items={[["Motivo do boot atual", d.boot_reason], ["Último motivo", d.boot_reason_last]]} />
              {d.boot_history.length > 0 && (
                <ul className="ops">{d.boot_history.map((h: string, i: number) => <li key={i}><code>{h}</code></li>)}</ul>
              )}
            </Card>
          </div>
          <Card title="Manutenção" icon={<Wrench size={16} />}>
            <div className="actions-grid">
              <button className="btn" onClick={() => confirmAction({ title: "Limpar cache dos apps", body: "Remove só arquivos temporários de todos os apps. Não apaga conversas, fotos ou logins.", action: { kind: "trim_caches" } })}>Limpar caches</button>
              <button className="btn" onClick={() => confirmAction({ title: "Otimizar apps (dexopt)", body: "Conclui a compilação de apps pendente após atualizações. Pode levar minutos; prefira com o aparelho carregando.", action: { kind: "bg_dexopt" } })}>Otimizar apps</button>
              <button className="btn danger" onClick={() => confirmAction({ title: "Reiniciar aparelho", body: "O celular vai reiniciar agora e a conexão ADB cai até ele voltar.", action: { kind: "reboot" }, danger: true })}><RotateCcw size={15} /> Reiniciar</button>
            </div>
            <p className="muted small">Celulares com atualização A/B (Galaxy S2x recentes) não têm mais “Wipe cache partition” no recovery — use “Limpar caches” acima. <Badge tone="warn">Nunca use “Wipe data/factory reset” sem backup.</Badge></p>
          </Card>
        </>
      )}
    </Page>
  );
}
