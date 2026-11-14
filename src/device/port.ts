import type {
  Action, AppDetail, AppEntry, BatteryHistory, BatteryStats, BluetoothInfo, BootInfo, Device, HistoryData, Network,
  Overview, Processes, Recommendation, SecurityInfo,
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
}
