import { Bluetooth as BtIcon, Headphones, Watch } from "lucide-react";
import { api, Json } from "../api";
import { useLoad } from "../hooks";
import { Badge, Card, ErrorBox, Kpi, Loading, Page, RefreshBtn } from "../ui";

const iconFor = (name: string) => (/watch/i.test(name) ? <Watch size={18} /> : /buds|fone|head|airpods|ear/i.test(name) ? <Headphones size={18} /> : <BtIcon size={18} />);

export default function BluetoothPage() {
  const bt = useLoad(api.bluetooth);
  const d: Json = bt.data;
  return (
    <Page title="Bluetooth" subtitle="Estado do rádio e dispositivos pareados" actions={<RefreshBtn onClick={bt.reload} loading={bt.loading} />}>
      {bt.error && <ErrorBox error={bt.error} />}
      {!d ? <Loading /> : (
        <>
          <div className="grid kpis">
            <Kpi label="Estado" value={d.state ?? "—"} tone={d.state === "ON" ? "good" : undefined} />
            <Kpi label="Nome do aparelho" value={d.name ?? "—"} />
            <Kpi label="Pareados" value={d.bonded.length} />
          </div>
          <Card title="Dispositivos pareados">
            {d.bonded.length ? (
              <ul className="device-list">
                {d.bonded.map((b: Json, i: number) => (
                  <li key={i}>
                    {iconFor(b.name)}
                    <div>
                      <strong>{b.name}</strong>
                      <span className="muted small mono">{b.address}</span>
                    </div>
                    <Badge>{b.kind}</Badge>
                  </li>
                ))}
              </ul>
            ) : <div className="empty">Nenhum dispositivo pareado.</div>}
          </Card>
        </>
      )}
    </Page>
  );
}
