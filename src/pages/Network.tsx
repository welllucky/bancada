import { Radar, Signal, Wifi } from "lucide-react";
import { api, Json } from "../api";
import { useDevice, useLoad } from "../hooks";
import { Badge, Card, ErrorBox, Kpi, KV, Loading, Page, RefreshBtn, Table } from "../ui";

const rssiTone = (r: number) => (r >= -60 ? "good" : r >= -72 ? "warn" : "bad");

export default function NetworkPage() {
  const { confirmAction } = useDevice();
  const net = useLoad(api.network, [], 10000);
  const d: Json = net.data;
  const toggle = (key: string, label: string, cur: string | null) => {
    const value = cur === "1" ? "0" : "1";
    confirmAction({
      title: `${value === "1" ? "Ativar" : "Desativar"} ${label}`,
      body: "Essas buscas permitem localização mais precisa mesmo com Wi-Fi/Bluetooth desligados, ao custo de bateria.",
      action: { kind: "set_setting", namespace: "global", key, value },
    }).then((ok) => {
      if (ok) net.reload();
    });
  };
  return (
    <Page title="Rede" subtitle="Wi-Fi, dados móveis, DNS e buscas em segundo plano" actions={<RefreshBtn onClick={net.reload} loading={net.loading} />}>
      {net.error && <ErrorBox error={net.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid kpis">
            {d.connectivity.wifi ? (
              <>
                <Kpi label="Wi-Fi" value={<><Wifi size={16} /> {d.connectivity.wifi.ssid}</>} hint={`${d.connectivity.wifi.standard} · ${d.connectivity.wifi.band}`} />
                <Kpi label="Sinal" value={`${d.connectivity.wifi.rssi} dBm`} hint={`${d.connectivity.wifi.freq_mhz} MHz`} tone={rssiTone(d.connectivity.wifi.rssi)} />
                <Kpi label="Velocidade do link" value={`${d.connectivity.wifi.link_mbps} Mbps`} />
              </>
            ) : <Kpi label="Wi-Fi" value="desconectado" />}
            <Kpi label="Operadora" value={<><Signal size={16} /> {d.operator || "—"}</>} hint={d.network_type} />
            <Kpi label="VPN" value={d.connectivity.vpn_active ? "ativa" : "nenhuma"} tone={d.connectivity.vpn_active ? "warn" : undefined} />
          </div>
          <div className="grid two">
            <Card title="Redes ativas">
              <Table
                rows={d.connectivity.networks}
                rowKey={(r: Json) => r.id}
                cols={[
                  { key: "id", label: "ID", render: (r: Json) => r.id },
                  { key: "k", label: "Tipo", render: (r: Json) => <Badge tone="accent">{r.kind}{r.subtype ? ` · ${r.subtype}` : ""}</Badge> },
                  { key: "s", label: "Estado", render: (r: Json) => r.state },
                  { key: "c", label: "Criada", render: (r: Json) => new Date(r.created).toLocaleString("pt-BR") },
                ]}
              />
            </Card>
            <Card title="DNS">
              <KV items={[
                ["DNS privado", d.private_dns_mode ?? "automático"],
                ["Servidor", d.private_dns_host],
                ["Validados", d.connectivity.private_dns_validated.join(", ") || "—"],
                ["Servidores", d.connectivity.dns.join(", ")],
              ]} />
            </Card>
          </div>
          <Card title="Buscas em segundo plano" icon={<Radar size={16} />}>
            <div className="toggles">
              {[["wifi_scan_always_enabled", "Busca de Wi-Fi", d.scan.wifi_scan_always], ["ble_scan_always_enabled", "Busca de Bluetooth", d.scan.ble_scan_always], ["mobile_data_always_on", "Dados móveis sempre ativos", d.scan.mobile_data_always_on]].map(([k, l, v]) => (
                <div key={k} className="toggle-row">
                  <div>
                    <strong>{l}</strong>
                    <span className="muted small">{k}</span>
                  </div>
                  <button className={`switch ${v === "1" ? "on" : ""}`} onClick={() => toggle(k, l, v)} aria-label={l}><span /></button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}
