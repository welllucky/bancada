import type {
  Action, AppDetail, AppEntry, BatteryHistory, BatteryStats, BluetoothInfo, BootInfo, Device, HistoryData, Network,
  Overview, Processes, Recommendation, SecurityInfo, WifiService,
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
  /** Ícone real do app (`data:` URL) extraído do APK, ou nulo. */
  appIcon(serial: string, pkg: string): Promise<string | null>;
  wifiServices(): Promise<WifiService[]>;
  wifiPair(addr: string, code: string): Promise<string>;
  wifiConnect(addr: string): Promise<string>;
  wifiDisconnect(addr: string): Promise<string>;
  /** Liga a depuração por Wi-Fi a partir do cabo e conecta pelo IP do aparelho. */
  wifiFromUsb(serial: string): Promise<string>;
}
