import type {
  AppMeta,
  AppTimeline,
  Action, AppDetail, AppEntry, BatteryHistory, BatteryStats, BluetoothInfo, BootInfo, Device, HistoryData, Network,
  Overview, Processes, Recommendation, SecurityInfo, WifiService, NetConnections, NetLive, NetUsage,
} from "./types";

/**
 * Porta de dados do aparelho. A UI só conhece esta interface; cada adapter decide de onde os dados vêm
 * (Tauri + adb hoje, mock no navegador, outras fontes no futuro).
 */
export interface DeviceApi {
  /** Nome curto da fonte, mostrado quando não é o aparelho real. */
  readonly source: "tauri" | "mock";
  devices(): Promise<{ ok: boolean; error?: string; devices: Device[] }>;
  overview(serial: string): Promise<Overview>;
  batteryStats(serial: string, refresh?: boolean): Promise<BatteryStats>;
  batteryHistory(serial: string): Promise<BatteryHistory>;
  processes(serial: string): Promise<Processes>;
  memory(serial: string): Promise<{ kb: number; name: string; pid: string }[]>;
  apps(serial: string): Promise<AppEntry[]>;
  appDetail(serial: string, pkg: string): Promise<AppDetail>;
  network(serial: string): Promise<Network>;
  bluetooth(serial: string): Promise<BluetoothInfo>;
  boot(serial: string): Promise<BootInfo>;
  security(serial: string): Promise<SecurityInfo>;
  optimizations(serial: string): Promise<Recommendation[]>;
  apply(serial: string, action: Action): Promise<string>;
  history(serial: string, days: number): Promise<HistoryData>;
  netUsage(serial: string, days: number, refresh?: boolean): Promise<NetUsage>;
  netConnections(serial: string): Promise<NetConnections>;
  netLive(serial: string): Promise<NetLive>;
  /** Ícone real do app (`data:` URL) extraído do APK, ou nulo. */
  /** Nome e ícone do app, do catálogo local; o APK só é copiado do aparelho quando o app muda. */
  appMeta(serial: string, pkg: string): Promise<AppMeta>;
  /** Nomes já guardados no catálogo local, sem tocar no aparelho. */
  appLabels(): Promise<Record<string, string>>;
  /** Quando o app esteve na tela, rodou em segundo plano e acordou o aparelho, desde a última carga. */
  appTimeline(serial: string, pkg: string): Promise<AppTimeline>;
  wifiServices(): Promise<WifiService[]>;
  wifiPair(addr: string, code: string): Promise<string>;
  wifiConnect(addr: string): Promise<string>;
  wifiDisconnect(addr: string): Promise<string>;
  /** Liga a depuração por Wi-Fi a partir do cabo e conecta pelo IP do aparelho. */
  wifiFromUsb(serial: string): Promise<string>;
}
