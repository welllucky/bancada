import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AppWindow, BatteryCharging, Bluetooth, Cpu, History, LayoutDashboard, Moon, Power, ShieldCheck, Smartphone, Sparkles, Sun, Usb, Wifi,
} from "lucide-react";
import { api, Action, Device, isTauri } from "./api";
import { Ctx } from "./hooks";
import { useLocal } from "./hooks";
import OverviewPage from "./pages/Overview";
import BatteryPage from "./pages/Battery";
import ProcessesPage from "./pages/Processes";
import AppsPage from "./pages/Apps";
import NetworkPage from "./pages/Network";
import BluetoothPage from "./pages/Bluetooth";
import BootPage from "./pages/Boot";
import SecurityPage from "./pages/Security";
import OptimizePage from "./pages/Optimize";
import HistoryPage from "./pages/History";

const NAV = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard, el: OverviewPage },
  { id: "optimize", label: "Otimizações", icon: Sparkles, el: OptimizePage },
  { id: "battery", label: "Bateria", icon: BatteryCharging, el: BatteryPage },
  { id: "processes", label: "Processos", icon: Cpu, el: ProcessesPage },
  { id: "apps", label: "Apps", icon: AppWindow, el: AppsPage },
  { id: "network", label: "Rede", icon: Wifi, el: NetworkPage },
  { id: "bluetooth", label: "Bluetooth", icon: Bluetooth, el: BluetoothPage },
  { id: "boot", label: "Boot & Sistema", icon: Power, el: BootPage },
  { id: "security", label: "Segurança", icon: ShieldCheck, el: SecurityPage },
  { id: "history", label: "Histórico", icon: History, el: HistoryPage },
] as const;

type PageId = (typeof NAV)[number]["id"];

interface ConfirmReq {
  title: string;
  body: string;
  action: Action;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export default function App() {
  const [theme, setTheme] = useLocal<"dark" | "light">("pd.theme", "dark");
  const [page, setPage] = useLocal<PageId>("pd.page", "overview");
  const [preferred, setPreferred] = useLocal<string | null>("pd.serial", null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [busy, setBusy] = useState(false);
  const tid = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!isTauri()) {
      setAdbError("Abra pelo aplicativo Phone Deck (npm run tauri dev) — o navegador não tem acesso ao ADB.");
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.devices();
        if (!alive) return;
        setDevices(r.devices);
        setAdbError(r.ok ? null : r.error ?? "erro no adb");
      } catch (e) {
        if (alive) setAdbError(String(e));
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const ready = devices.filter((d) => d.state === "device");
  const current = ready.find((d) => d.serial === preferred) ?? ready[0] ?? null;
  const serial = current?.serial ?? null;
  const pending = devices.find((d) => d.state === "unauthorized");

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const confirmAction = useCallback(
    (o: { title: string; body: string; action: Action; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })),
    [],
  );

  const runConfirmed = async () => {
    if (!confirm || !serial) return;
    setBusy(true);
    try {
      const out = await api.apply(serial, confirm.action);
      toast(`${confirm.title}: ${out.slice(0, 120)}`, "ok");
      confirm.resolve(true);
    } catch (e) {
      toast(`${confirm.title} falhou: ${e}`, "err");
      confirm.resolve(false);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const Active = NAV.find((n) => n.id === page)?.el ?? OverviewPage;

  return (
    <Ctx.Provider value={{ serial, toast, confirmAction }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark"><Smartphone size={18} /></div>
            <div>
              <strong>Phone Deck</strong>
              <span>visão e controle via USB</span>
            </div>
          </div>
          <nav>
            {NAV.map((n) => (
              <button key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
                <n.icon size={17} /> {n.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <button className="btn ghost full" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} Tema {theme === "dark" ? "claro" : "escuro"}
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div className="row gap">
              <span className={`status-dot ${serial ? "on" : pending ? "warn" : "off"}`} />
              {ready.length > 1 ? (
                <select value={serial ?? ""} onChange={(e) => setPreferred(e.target.value)}>
                  {ready.map((d) => (
                    <option key={d.serial} value={d.serial}>{d.model || d.serial}</option>
                  ))}
                </select>
              ) : (
                <strong>{current ? current.model || current.serial : pending ? "Aguardando autorização" : "Nenhum aparelho"}</strong>
              )}
              {current && <span className="muted small"><Usb size={13} /> {current.transport || "conectado"}</span>}
            </div>
            <span className="muted small"><Activity size={13} /> atualização automática a cada 3 s</span>
          </div>

          {serial ? (
            <Active key={serial} />
          ) : (
            <div className="connect">
              <Smartphone size={42} />
              <h2>{pending ? "Autorize este computador no celular" : "Conecte seu Android pelo cabo USB"}</h2>
              {adbError ? (
                <p className="error-box">{adbError}</p>
              ) : pending ? (
                <p>Na tela do celular apareceu <b>“Permitir depuração USB?”</b>. Marque “Sempre permitir” e toque em <b>Permitir</b>.</p>
              ) : (
                <ol>
                  <li>Configurações → Sobre o telefone → Informações de software → toque 7× em <b>Número de compilação</b>.</li>
                  <li>Configurações → Opções do desenvolvedor → ative <b>Depuração USB</b>.</li>
                  <li>Conecte o cabo e aceite o pedido <b>“Permitir depuração USB?”</b>.</li>
                </ol>
              )}
            </div>
          )}
        </main>
      </div>

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h3>{confirm.title}</h3>
            <p>{confirm.body}</p>
            <code className="cmd">adb shell · {describe(confirm.action)}</code>
            <div className="row gap end">
              <button className="btn ghost" disabled={busy} onClick={() => { confirm.resolve(false); setConfirm(null); }}>Cancelar</button>
              <button className={`btn ${confirm.danger ? "danger" : "primary"}`} disabled={busy} onClick={runConfirmed}>
                {busy ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function describe(a: Action): string {
  switch (a.kind) {
    case "set_setting": return `settings put ${a.namespace} ${a.key} ${a.value}`;
    case "force_stop": return `am force-stop ${a.package}`;
    case "set_standby_bucket": return `am set-standby-bucket ${a.package} ${a.bucket}`;
    case "set_background": return `cmd appops set ${a.package} RUN_ANY_IN_BACKGROUND ${a.mode}`;
    case "trim_caches": return "pm trim-caches 999G";
    case "bg_dexopt": return "cmd package bg-dexopt-job";
    case "reboot": return "reboot";
    case "uninstall_user_app": return `pm uninstall --user 0 ${a.package}`;
  }
}
