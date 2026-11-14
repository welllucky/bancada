import { useEffect, useState } from "react";
import { Link2, Unplug, Wifi } from "lucide-react";
import { api, Device, WifiService } from "./api";
import { LuckBadge, LuckButton } from "./luck";

const ADDR = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/;

/**
 * Depuração por Wi-Fi: ligar a partir do cabo, parear com código (Android 11+) ou conectar a um aparelho já
 * pareado. Os aparelhos anunciados na rede (mDNS) aparecem sozinhos e preenchem os campos.
 */
export function WifiPanel({ devices, usbSerial, toast }: { devices: Device[]; usbSerial?: string | null; toast: (m: string, k?: "ok" | "err") => void }) {
  const [services, setServices] = useState<WifiService[]>([]);
  const [pairAddr, setPairAddr] = useState("");
  const [code, setCode] = useState("");
  const [connAddr, setConnAddr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = () => api.wifiServices().then((s) => alive && setServices(s)).catch(() => {});
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(label);
    try {
      toast(await f(), "ok");
      return true;
    } catch (e) {
      toast(String(e), "err");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const pair = async () => {
    const ok = await run("pair", () => api.wifiPair(pairAddr.trim(), code.trim()));
    if (!ok) return;
    setCode("");
    // Depois de parear, o aparelho anuncia o endereço de conexão; conecta sozinho se ele aparecer.
    const name = services.find((s) => s.addr === pairAddr.trim())?.name;
    const fresh = await api.wifiServices().catch(() => [] as WifiService[]);
    const target = fresh.find((s) => s.kind === "connect" && (!name || s.name === name));
    if (target) await run("connect", () => api.wifiConnect(target.addr));
    else toast("Pareado. Agora informe o endereço de conexão mostrado em Depuração por Wi-Fi.", "ok");
  };

  const pairing = services.filter((s) => s.kind === "pairing");
  const connectable = services.filter((s) => s.kind === "connect" && !devices.some((d) => d.serial === s.addr || d.serial.startsWith(s.name)));
  const wifiDevices = devices.filter((d) => d.transport === "wifi");
  const pairOk = ADDR.test(pairAddr.trim()) && /^\d{6}$/.test(code.trim());

  return (
    <div className="wifi">
      {usbSerial && (
        <section>
          <h3>Pelo cabo</h3>
          <p className="muted small">Liga o Wi-Fi e conecta. Depois é só tirar o cabo.</p>
          <div>
            <LuckButton variant="primary" iconLeft={<Wifi size={16} />} loading={busy === "usb"} disabled={!!busy} onClick={() => run("usb", () => api.wifiFromUsb(usbSerial))}>
              Usar sem cabo
            </LuckButton>
          </div>
        </section>
      )}

      <section>
        <h3>Parear com código</h3>
        <p className="muted small">No celular: Depuração por Wi-Fi › <b>Parear com código</b>.</p>
        {pairing.length > 0 && (
          <div className="row gap-xs wrap">
            {pairing.map((s) => (
              <button key={s.addr} type="button" className="chip" onClick={() => setPairAddr(s.addr)} aria-pressed={pairAddr === s.addr}>
                {s.addr}
              </button>
            ))}
          </div>
        )}
        <div className="row gap-sm wrap">
          <input className="field mono" placeholder="192.168.0.10:37123" aria-label="Endereço de pareamento" value={pairAddr} onChange={(e) => setPairAddr(e.target.value)} style={{ flex: "2 1 180px" }} />
          <input className="field mono" placeholder="código" aria-label="Código de pareamento" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ flex: "1 1 90px" }} />
          <LuckButton iconLeft={<Link2 size={16} />} loading={busy === "pair"} disabled={!pairOk || !!busy} onClick={pair}>Parear</LuckButton>
        </div>
      </section>

      <section>
        <h3>Já pareado</h3>
        {connectable.length > 0 && (
          <ul className="pkg-list">
            {connectable.map((s) => (
              <li key={s.addr} className="row between gap-sm">
                <span className="mono small">{s.addr}</span>
                <LuckButton size="sm" loading={busy === s.addr} disabled={!!busy} onClick={() => run(s.addr, () => api.wifiConnect(s.addr))}>Conectar</LuckButton>
              </li>
            ))}
          </ul>
        )}
        <div className="row gap-sm wrap">
          <input className="field mono" placeholder="192.168.0.10:41234" aria-label="Endereço de conexão" value={connAddr} onChange={(e) => setConnAddr(e.target.value)} style={{ flex: "1 1 200px" }} />
          <LuckButton loading={busy === "connect"} disabled={!ADDR.test(connAddr.trim()) || !!busy} onClick={() => run("connect", () => api.wifiConnect(connAddr.trim()))}>Conectar</LuckButton>
        </div>
      </section>

      {wifiDevices.length > 0 && (
        <section>
          <h3>Conectados</h3>
          <ul className="pkg-list">
            {wifiDevices.map((d) => (
              <li key={d.serial} className="row between gap-sm">
                <span>{d.model || d.serial} <LuckBadge tone={d.state === "device" ? "success" : "warning"}>{d.state === "device" ? "conectado" : d.state}</LuckBadge></span>
                {ADDR.test(d.serial) && (
                  <LuckButton size="sm" variant="ghost" iconLeft={<Unplug size={14} />} disabled={!!busy} onClick={() => run(d.serial, () => api.wifiDisconnect(d.serial))}>Desconectar</LuckButton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
