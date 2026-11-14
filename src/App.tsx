import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, History, House, LayoutGrid, Moon, Smartphone, Sun, Usb, Wifi } from "lucide-react";
import { api, Action, Device, isTauri, Recommendation } from "./api";
import { command, reversal } from "./actions";
import { Area, Ctx, Route, useAnyStale, useLocal } from "./hooks";
import { LuckBadge, LuckButton, LuckCard, LuckDialog, Step, Steps } from "./luck";
import { problems } from "./recs";
import InicioPage from "./pages/Inicio";
import DiagnosticoPage from "./pages/Diagnostico";
import AppsPage from "./pages/Apps";
import AparelhoPage from "./pages/Aparelho";
import HistoricoPage from "./pages/Historico";
import { WifiPanel } from "./wifi";

const NAV: { id: Area; label: string; icon: typeof House }[] = [
  { id: "inicio", label: "Início", icon: House },
  { id: "diagnostico", label: "Diagnóstico", icon: Activity },
  { id: "apps", label: "Apps", icon: LayoutGrid },
  { id: "aparelho", label: "Aparelho", icon: Smartphone },
  { id: "historico", label: "Histórico", icon: History },
];

const PAGES: Record<Area, () => JSX.Element> = {
  inicio: InicioPage,
  diagnostico: DiagnosticoPage,
  apps: AppsPage,
  aparelho: AparelhoPage,
  historico: HistoricoPage,
};

interface ConfirmReq {
  title: string;
  body: string;
  action: Action;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export default function App() {
  const [theme, setTheme] = useLocal<"dark" | "light">("pd.theme", "dark");
  const [route, setRoute] = useLocal<Route>("pd.route", { area: "inicio" });
  const [preferred, setPreferred] = useLocal<string | null>("pd.serial", null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [polled, setPolled] = useState(false);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [busy, setBusy] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [problemCount, setProblemCount] = useState<number | null>(null);
  const tid = useRef(0);
  const refreshing = useAnyStale();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.devices();
        if (!alive) return;
        setDevices(r.devices);
        setAdbError(r.ok ? null : r.error ?? "erro no adb");
      } catch (e) {
        if (alive) setAdbError(String(e));
      } finally {
        if (alive) setPolled(true);
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

  // Contagem de problemas para o selo da navegação; o otimizador é caro, então só ao trocar de aparelho.
  useEffect(() => {
    setProblemCount(null);
    if (!serial) return;
    api.optimizations(serial).then((rs: Recommendation[]) => setProblemCount(problems(rs).length)).catch(() => {});
  }, [serial]);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const confirmAction = useCallback(
    (o: { title: string; body: string; action: Action; danger?: boolean }) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })),
    [],
  );

  const go = useCallback((to: Route) => setRoute(to), [setRoute]);
  const openApp = useCallback((pkg: string) => setRoute({ area: "apps", app: pkg }), [setRoute]);

  const cancel = useCallback(() => {
    confirm?.resolve(false);
    setConfirm(null);
  }, [confirm]);

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

  const Active = PAGES[route.area] ?? InicioPage;
  const rev = confirm ? reversal(confirm.action) : null;

  return (
    <Ctx.Provider value={{ serial, route, go, openApp, toast, confirmAction }}>
      <div className="shell">
        <nav className="rail" aria-label="Navegação principal">
          <div className="brand">
            <div className="brand-mark" aria-hidden><Smartphone size={18} /></div>
            <div className="brand-text">
              <strong>Phone Deck</strong>
              <span>visão e controle via USB</span>
            </div>
          </div>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className="nav-item"
              aria-current={route.area === n.id ? "page" : undefined}
              onClick={() => go({ area: n.id })}
            >
              <n.icon size={18} aria-hidden />
              <span className="nav-label">{n.label}</span>
              {n.id === "diagnostico" && problemCount ? <span className="nav-count" aria-label={`${problemCount} problemas`}>{problemCount}</span> : null}
            </button>
          ))}
          <div className="rail-foot">
            <LuckButton variant="ghost" size="sm" fullWidth iconLeft={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <span className="nav-label">Tema {theme === "dark" ? "claro" : "escuro"}</span>
            </LuckButton>
          </div>
        </nav>

        <main className="main" aria-busy={refreshing || undefined}>
          <header className="topbar">
            <span className={`status-dot ${serial ? "on" : pending ? "warn" : "off"}`} aria-hidden />
            {ready.length > 1 ? (
              <label className="row gap-sm">
                <span className="sr-only">Aparelho</span>
                <select className="field" value={serial ?? ""} onChange={(e) => setPreferred(e.target.value)}>
                  {ready.map((d) => (
                    <option key={d.serial} value={d.serial}>{d.model || d.serial}</option>
                  ))}
                </select>
              </label>
            ) : (
              <strong>{current ? current.model || current.serial : pending ? "Aguardando autorização" : "Nenhum aparelho"}</strong>
            )}
            {current && (
              <span className="muted small row gap-xs">
                {current.transport === "wifi" ? <Wifi size={13} aria-hidden /> : <Usb size={13} aria-hidden />}
                {current.transport === "wifi" ? "Wi-Fi" : current.transport === "usb" ? "USB" : "conectado"}
              </span>
            )}
            {api.source === "mock" && <LuckBadge tone="company">dados de demonstração</LuckBadge>}
            <span className="topbar-end">
              <LuckButton variant="ghost" size="sm" iconLeft={<Wifi size={14} />} onClick={() => setWifiOpen(true)}>Conectar por Wi-Fi</LuckButton>
            </span>
          </header>

          {serial ? (
            <div className={refreshing ? "is-stale" : undefined}><Active key={`${serial}-${route.area}`} /></div>
          ) : (
            <ConnectScreen polled={polled} adbError={adbError} found={devices.length > 0} pending={!!pending}>
              {polled && !adbError && <WifiPanel devices={devices} toast={toast} />}
            </ConnectScreen>
          )}
        </main>
      </div>

      <LuckDialog open={!!confirm} heading={confirm?.title ?? ""} description={confirm?.body} persistent={busy} onClose={cancel}>
        {confirm && rev && (
          <>
            <LuckBadge tone={rev.reversible ? "neutral" : "danger"}>{rev.text}</LuckBadge>
            <code className="l-evidence" style={{ marginTop: 0 }}>adb shell {command(confirm.action)}</code>
            <div className="row gap-sm end">
              <LuckButton variant="ghost" disabled={busy} onClick={cancel}>Cancelar</LuckButton>
              <LuckButton variant={confirm.danger ? "secondary" : "primary"} danger={confirm.danger} loading={busy} onClick={runConfirmed}>
                {busy ? "Aplicando…" : "Aplicar"}
              </LuckButton>
            </div>
          </>
        )}
      </LuckDialog>

      <LuckDialog open={wifiOpen} heading="Conectar por Wi-Fi" description="Use o Phone Deck sem o cabo, com o celular e o computador na mesma rede." onClose={() => setWifiOpen(false)}>
        {wifiOpen && <WifiPanel devices={devices} usbSerial={current?.transport === "usb" ? current.serial : null} toast={toast} />}
        <div className="row end"><LuckButton variant="ghost" onClick={() => setWifiOpen(false)}>Fechar</LuckButton></div>
      </LuckDialog>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Conexão em 3 passos com o estado real de cada um. */
function ConnectScreen({ polled, adbError, found, pending, children }: { polled: boolean; adbError: string | null; found: boolean; pending: boolean; children?: React.ReactNode }) {
  const noIpc = !isTauri() && api.source !== "mock";
  const adbOk = polled && !adbError;
  const s1 = !polled ? "current" : adbOk ? "done" : "error";
  const s2 = !adbOk ? "todo" : found ? "done" : "current";
  const s3 = !found ? "todo" : pending ? "current" : "done";
  return (
    <div className="connect">
      <div className="connect-head">
        <div className="brand-mark lg" aria-hidden><Smartphone size={24} /></div>
        <h1>{pending ? "Falta um passo para conectar" : "Conecte seu Android pelo cabo USB"}</h1>
        <p className="muted">O Phone Deck lê o aparelho pelo adb, sem root e sem enviar nada para a internet.</p>
      </div>
      <LuckCard heading="Conectando" index={`${[s1, s2, s3].filter((s) => s === "done").length}/3`} hint="verificando a cada 3 s" padded={false} style={{ width: "min(560px, 100%)" }}>
        <Steps>
          <Step state={s1} title={adbOk ? "adb encontrado" : "Procurando o adb"}>
            {adbError && (
              <div className="muted small">
                {noIpc ? "Abra pelo aplicativo Phone Deck: o navegador não acessa o adb." : <>Instale as ferramentas do Android (<code>android-tools</code> / <code>adb</code>) ou defina a variável <code>ADB</code>.</>}
                <code className="l-evidence" style={{ display: "block" }}>{adbError}</code>
              </div>
            )}
          </Step>
          <Step state={s2} title={found ? "Celular detectado no USB" : "Esperando o celular no USB"}>
            {adbOk && !found && (
              <ol className="muted small steps-help">
                <li>Configurações › Sobre o telefone › Informações de software › toque 7× em <b>Número de compilação</b>.</li>
                <li>Configurações › Opções do desenvolvedor › ative <b>Depuração USB</b>.</li>
                <li>Conecte o cabo.</li>
              </ol>
            )}
          </Step>
          <Step state={s3} title={pending ? "Aguardando sua autorização no celular" : "Autorizar este computador"}>
            {pending && (
              <p className="callout">
                Na tela do celular apareceu <b>“Permitir depuração USB?”</b>. Marque <b>“Sempre permitir deste computador”</b> e toque em <b>Permitir</b>.
              </p>
            )}
          </Step>
        </Steps>
      </LuckCard>
      {children && (
        <LuckCard heading="Sem cabo" hint="Android 11 ou mais novo" padded style={{ width: "min(560px, 100%)" }}>
          {children}
        </LuckCard>
      )}
    </div>
  );
}
