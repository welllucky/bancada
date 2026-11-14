import { Bluetooth as BtIcon, Headphones, Watch } from "lucide-react";
import { api } from "../api";
import { fmtDate, fmtDur } from "../format";
import { useDevice, useLoad } from "../hooks";
import { ErrorNote, Issue, Loading, LuckBadge, LuckCard, LuckStat, LuckSwitch, Severity } from "../luck";
import { AppLink, KV, PageHead, PkgList, Refresh, Tabs, useTab } from "./common";

const TABS = ["sistema", "seguranca", "rede", "bluetooth"] as const;
type Tab = (typeof TABS)[number];

export default function AparelhoPage() {
  const [tab, setTab] = useTab<Tab>("sistema", TABS);
  return (
    <div className="page">
      <PageHead title="Aparelho" subtitle="Sistema, segurança e conexões" />
      <Tabs
        label="Seções do aparelho"
        value={tab}
        onChange={setTab}
        items={[
          { value: "sistema", label: "Sistema" },
          { value: "seguranca", label: "Segurança" },
          { value: "rede", label: "Rede" },
          { value: "bluetooth", label: "Bluetooth" },
        ]}
      />
      {tab === "sistema" && <Sistema />}
      {tab === "seguranca" && <Seguranca />}
      {tab === "rede" && <Rede />}
      {tab === "bluetooth" && <Bluetooth />}
    </div>
  );
}

interface Check {
  tone: Severity;
  title: string;
  detail: string;
  value: string;
}

function Sistema() {
  const boot = useLoad(api.boot);
  const d = boot.data;
  if (boot.error) return <ErrorNote error={boot.error} />;
  if (!d) return <Loading />;
  const locked = d.bootloader_locked === "1" || d.vbmeta_state === "locked";
  // Cada item só aparece quando o aparelho informa o dado (Knox, por exemplo, só existe na Samsung).
  const checks: Check[] = [];
  if (d.verified_boot)
    checks.push({ tone: d.verified_boot === "green" ? "success" : "danger", title: "Sistema original", value: d.verified_boot, detail: d.verified_boot === "green" ? "O Verified Boot confirma que o sistema não foi alterado." : "O Verified Boot não está verde: o sistema pode ter sido modificado." });
  if (d.bootloader_locked != null || d.vbmeta_state)
    checks.push({ tone: locked ? "success" : "warning", title: locked ? "Bootloader bloqueado" : "Bootloader desbloqueado", value: d.vbmeta_state ?? d.bootloader_locked ?? "", detail: locked ? "Ninguém consegue gravar outro sistema sem apagar o aparelho." : "Permite gravar outro sistema. Se não foi você, investigue." });
  if (d.warranty_bit != null)
    checks.push({ tone: d.warranty_bit === "0" ? "success" : "danger", title: d.warranty_bit === "0" ? "Knox intacto" : "Knox violado", value: `warranty_bit=${d.warranty_bit}`, detail: d.warranty_bit === "0" ? "O aparelho nunca rodou software não oficial." : "Recursos como Pasta Segura e Samsung Pay podem não funcionar." });
  if (d.selinux)
    checks.push({ tone: d.selinux === "Enforcing" ? "success" : "danger", title: d.selinux === "Enforcing" ? "SELinux ativo" : "SELinux desligado", value: d.selinux, detail: d.selinux === "Enforcing" ? "O isolamento entre apps está funcionando." : "O isolamento entre apps está relaxado." });

  return (
    <>
      <div className="row between">
        <span className="muted small">Ligado há {fmtDur(d.uptime_s)} · desde {fmtDate(d.boot_time)}</span>
        <Refresh onClick={boot.reload} loading={boot.loading} at={boot.at} />
      </div>
      {checks.length > 0 && (
        <LuckCard heading="Integridade" index={`${checks.filter((c) => c.tone === "success").length}/${checks.length}`} padded={false}>
          <div>{checks.map((c) => <Issue key={c.title} tone={c.tone} title={c.title} detail={c.detail} evidence={c.value} />)}</div>
        </LuckCard>
      )}
      <div className="grid two">
        <LuckCard heading="Firmware" padded>
          <KV items={[
            ["Patch de segurança", d.security_patch],
            ["Data do build", d.build_date],
            ["Bootloader", d.bootloader],
            ["Baseband", d.baseband],
            ["Hardware", d.hardware],
            ["Kernel", d.kernel && <span className="mono small">{d.kernel}</span>],
            ["Fingerprint", d.fingerprint && <span className="mono small">{d.fingerprint}</span>],
          ]} />
        </LuckCard>
        <LuckCard heading="Reinícios" padded>
          <KV items={[["Motivo do boot atual", d.boot_reason], ["Motivo anterior", d.boot_reason_last]]} />
          {d.boot_history.length > 0 && <ul className="ops">{d.boot_history.map((h, i) => <li key={i}><code>{h}</code></li>)}</ul>}
        </LuckCard>
      </div>
    </>
  );
}

function Seguranca() {
  const sec = useLoad(api.security);
  const d = sec.data;
  if (sec.error) return <ErrorNote error={sec.error} />;
  if (!d) return <Loading />;
  const sections: { title: string; why: string; items: string[]; risky?: boolean }[] = [
    { title: "Acessibilidade", why: "Podem ler a tela e tocar por você. É a permissão mais usada por golpes bancários.", items: d.accessibility, risky: true },
    { title: "Leitores de notificação", why: "Leem todas as notificações, inclusive códigos de verificação.", items: d.notification_listeners, risky: true },
    { title: "Administradores do aparelho", why: "Podem bloquear, apagar ou impor regras ao aparelho.", items: d.device_admins },
    { title: "Instalar apps desconhecidos", why: "Podem instalar outros apps fora da loja.", items: d.install_unknown, risky: true },
    { title: "Sobrepor a outros apps", why: "Podem desenhar por cima de outros apps.", items: d.overlay },
    { title: "Acesso ao uso", why: "Sabem quais apps você usa e por quanto tempo.", items: d.usage_access },
    { title: "Todos os arquivos", why: "Leem e alteram qualquer arquivo do armazenamento.", items: d.all_files },
  ];
  return (
    <>
      <div className="row between">
        <span className="muted small">Quem tem acesso privilegiado ao aparelho. Clique num app para ver detalhes ou restringir.</span>
        <Refresh onClick={sec.reload} loading={sec.loading} at={sec.at} />
      </div>
      <LuckCard heading="Depuração" padded={false}>
        <div>
          <Issue
            tone={d.adb_enabled ? "warning" : "success"}
            title={d.adb_wifi ? "Depuração por Wi-Fi ligada" : d.adb_enabled ? "Depuração USB ligada" : "Depuração desligada"}
            detail={d.adb_wifi ? "Útil para usar o Phone Deck sem cabo, mas qualquer computador autorizado na mesma rede controla o celular. Desligue quando terminar." : d.adb_enabled ? "O Phone Deck precisa dela, mas desligue quando terminar: um computador autorizado tem amplo acesso ao aparelho." : "Nenhum computador consegue controlar o aparelho."}
            evidence={`adb_enabled=${d.adb_enabled ? 1 : 0}${d.adb_wifi ? " · adb_wifi=1" : ""}${d.dev_options ? " · opções do desenvolvedor ativas" : ""}`}
          />
        </div>
      </LuckCard>
      <div className="grid two">
        {sections.map((s) => (
          <LuckCard key={s.title} heading={s.title} index={String(s.items.length)} padded>
            <p className="muted small" style={{ margin: 0 }}>{s.why}</p>
            <PkgList items={s.items} />
          </LuckCard>
        ))}
      </div>
      <div className="grid two">
        <LuckCard heading="Instalados fora da loja" index={String(d.non_store_apps.length)} padded>
          <p className="muted small" style={{ margin: 0 }}>Apps restaurados do Samsung Cloud costumam ser seguros. Revise os que você não reconhece.</p>
          {d.non_store_apps.length ? (
            <ul className="pkg-list">
              {d.non_store_apps.map((a) => (
                <li key={a.package} className="row between gap-sm"><AppLink pkg={a.package} /><LuckBadge>{a.installer ?? "desconhecido"}</LuckBadge></li>
              ))}
            </ul>
          ) : <span className="muted small">nenhum</span>}
        </LuckCard>
        <LuckCard heading="Teclado e VPN" padded>
          <KV items={[
            ["Teclado padrão", d.default_ime && <span className="mono small">{d.default_ime}</span>],
            ["VPN sempre ativa", d.always_on_vpn ?? "nenhuma"],
          ]} />
        </LuckCard>
      </div>
    </>
  );
}

const rssiTone = (r: number) => (r >= -60 ? "success" : r >= -72 ? "warning" : "danger");
const SCANS = [
  { key: "wifi_scan_always_enabled", label: "Busca de Wi-Fi", hint: "procura redes mesmo com o Wi-Fi desligado", field: "wifi_scan_always" },
  { key: "ble_scan_always_enabled", label: "Busca de Bluetooth", hint: "procura dispositivos mesmo com o Bluetooth desligado", field: "ble_scan_always" },
  { key: "mobile_data_always_on", label: "Dados móveis sempre ativos", hint: "mantém os dados ligados mesmo no Wi-Fi", field: "mobile_data_always_on" },
] as const;

function Rede() {
  const { confirmAction } = useDevice();
  const net = useLoad(api.network, [], 10000);
  const d = net.data;
  if (net.error) return <ErrorNote error={net.error} />;
  if (!d) return <Loading />;
  const w = d.connectivity.wifi;
  const toggle = (key: string, label: string, on: boolean) =>
    confirmAction({
      title: `${on ? "Desativar" : "Ativar"} ${label.toLowerCase()}`,
      body: "Essas buscas deixam a localização mais precisa com o rádio desligado, ao custo de bateria.",
      action: { kind: "set_setting", namespace: "global", key, value: on ? "0" : "1" },
    });

  return (
    <>
      <div className="row between">
        <span className="muted small">{d.operator ? `${d.operator}${d.network_type ? ` · ${d.network_type}` : ""}` : "Sem operadora"}</span>
        <Refresh onClick={net.reload} loading={net.loading} at={net.at} />
      </div>
      <div className="grid stats">
        <LuckCard padded><LuckStat value={w ? w.ssid : "Desconectado"} caption={w ? `Wi-Fi ${w.standard} · ${w.band}` : "Wi-Fi"} /></LuckCard>
        {w && (
          <LuckCard padded>
            <LuckStat value={w.rssi} unit="dBm" caption={`sinal · ${w.link_mbps} Mbps`} />
            <LuckBadge tone={rssiTone(w.rssi)} dot>{rssiTone(w.rssi) === "success" ? "bom" : rssiTone(w.rssi) === "warning" ? "regular" : "fraco"}</LuckBadge>
          </LuckCard>
        )}
        <LuckCard padded><LuckStat value={d.connectivity.vpn_active ? "Ativa" : "Nenhuma"} caption="VPN" /></LuckCard>
      </div>
      <LuckCard heading="Buscas em segundo plano" hint="gastam bateria" padded={false}>
        <ul className="toggles">
          {SCANS.map((s) => {
            const on = d.scan[s.field] === "1";
            return (
              <li key={s.key}>
                <div>
                  <strong>{s.label}</strong>
                  <span className="muted small">{s.hint}</span>
                </div>
                <LuckSwitch checked={on} label={s.label} onChange={() => toggle(s.key, s.label, on)} />
              </li>
            );
          })}
        </ul>
      </LuckCard>
      <div className="grid two">
        <LuckCard heading="DNS" padded>
          <KV items={[
            ["DNS privado", d.private_dns_mode ?? "automático"],
            ["Servidor", d.private_dns_host],
            ["Validados", d.connectivity.private_dns_validated.join(", ") || "—"],
            ["Servidores", d.connectivity.dns.join(", ")],
          ]} />
        </LuckCard>
        <LuckCard heading="Redes ativas" index={String(d.connectivity.networks.length)} padded>
          <ul className="ops">
            {d.connectivity.networks.map((n) => (
              <li key={n.id}>
                <span><LuckBadge tone="accent">{n.kind}{n.subtype ? ` · ${n.subtype}` : ""}</LuckBadge> {n.state}</span>
                <span className="muted">{new Date(n.created).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </LuckCard>
      </div>
    </>
  );
}

const iconFor = (name: string) => (/watch/i.test(name) ? <Watch size={18} /> : /buds|fone|head|airpods|ear/i.test(name) ? <Headphones size={18} /> : <BtIcon size={18} />);

function Bluetooth() {
  const bt = useLoad(api.bluetooth);
  const d = bt.data;
  if (bt.error) return <ErrorNote error={bt.error} />;
  if (!d) return <Loading />;
  return (
    <>
      <div className="row between">
        <span className="muted small">{d.name ? `Visível como “${d.name}”` : ""}</span>
        <Refresh onClick={bt.reload} loading={bt.loading} at={bt.at} />
      </div>
      <LuckCard heading="Pareados" index={String(d.bonded.length)} hint={d.state === "ON" ? "rádio ligado" : "rádio desligado"} padded={false}>
        {d.bonded.length ? (
          <ul className="device-list">
            {d.bonded.map((b, i) => (
              <li key={i}>
                <span className="device-icon" aria-hidden>{iconFor(b.name)}</span>
                <div>
                  <strong>{b.name}</strong>
                  <span className="muted small mono">{b.address}</span>
                </div>
                {b.kind && <LuckBadge>{b.kind}</LuckBadge>}
              </li>
            ))}
          </ul>
        ) : <div className="l-empty">Nenhum dispositivo pareado.</div>}
      </LuckCard>
    </>
  );
}
