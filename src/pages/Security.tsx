import { ReactNode } from "react";
import { Eye, KeyRound, Layers, PackageOpen, Shield, Usb } from "lucide-react";
import { api, Json } from "../api";
import { useLoad } from "../hooks";
import { Badge, Card, ErrorBox, Kpi, Loading, Page, RefreshBtn } from "../ui";

const List = ({ items, empty = "nenhum" }: { items: string[]; empty?: string }) =>
  items.length ? <ul className="pkg-list">{items.map((p) => <li key={p} className="mono">{p}</li>)}</ul> : <span className="muted">{empty}</span>;

const Section = ({ icon, title, why, children }: { icon: ReactNode; title: string; why: string; children: ReactNode }) => (
  <Card title={title} icon={icon}>
    <p className="muted small">{why}</p>
    {children}
  </Card>
);

export default function SecurityPage() {
  const sec = useLoad(api.security);
  const d: Json = sec.data;
  return (
    <Page title="Segurança" subtitle="Quem tem acesso privilegiado ao aparelho" actions={<RefreshBtn onClick={sec.reload} loading={sec.loading} />}>
      {sec.error && <ErrorBox error={sec.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid kpis">
            <Kpi label="Acessibilidade" value={d.accessibility.length} hint="serviços ativos" tone={d.accessibility.length ? "warn" : "good"} />
            <Kpi label="Leitores de notificação" value={d.notification_listeners.length} />
            <Kpi label="Administradores" value={d.device_admins.length} />
            <Kpi label="Fora da loja" value={d.non_store_apps.length} tone={d.non_store_apps.length ? "warn" : "good"} />
            <Kpi label="Depuração USB" value={d.adb_enabled ? "ligada" : "desligada"} hint={d.adb_wifi ? "ADB por Wi-Fi ATIVO" : "desative quando não usar"} tone={d.adb_wifi ? "bad" : d.adb_enabled ? "warn" : "good"} />
          </div>
          <div className="grid two">
            <Section icon={<Eye size={16} />} title="Serviços de acessibilidade" why="Podem ler a tela e tocar por você — é a permissão mais usada por malware bancário.">
              <List items={d.accessibility} />
            </Section>
            <Section icon={<KeyRound size={16} />} title="Leitores de notificação" why="Leem todas as notificações, inclusive códigos de verificação.">
              <List items={d.notification_listeners} />
            </Section>
            <Section icon={<Shield size={16} />} title="Administradores do dispositivo" why="Podem bloquear, apagar ou impor políticas ao aparelho.">
              <List items={d.device_admins} />
            </Section>
            <Section icon={<Layers size={16} />} title="Permissões especiais" why="Sobreposição de tela, acesso a uso, todos os arquivos e instalar apps desconhecidos.">
              <div className="perm-grid">
                <div><b>Sobreposição</b><List items={d.overlay} /></div>
                <div><b>Acesso ao uso</b><List items={d.usage_access} /></div>
                <div><b>Todos os arquivos</b><List items={d.all_files} /></div>
                <div><b>Instalar desconhecidos</b><List items={d.install_unknown} /></div>
              </div>
            </Section>
          </div>
          <Section icon={<PackageOpen size={16} />} title="Apps instalados fora da Play Store / Galaxy Store" why="Apps restaurados do Samsung Cloud aparecem com instalador com.samsung.android.scloud — normalmente seguros. Revise os que você não reconhece.">
            {d.non_store_apps.length ? (
              <ul className="pkg-list two-col">
                {d.non_store_apps.map((a: Json) => (
                  <li key={a.package}><span className="mono">{a.package}</span> <Badge>{a.installer}</Badge></li>
                ))}
              </ul>
            ) : <span className="muted">nenhum</span>}
          </Section>
          <Card title="Teclado e VPN" icon={<Usb size={16} />}>
            <p><b>Teclado padrão:</b> <span className="mono">{d.default_ime}</span></p>
            <p><b>VPN sempre ativa:</b> {d.always_on_vpn ?? "nenhuma"}</p>
          </Card>
        </>
      )}
    </Page>
  );
}
