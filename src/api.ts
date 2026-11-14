import { invoke } from "@tauri-apps/api/core";

export interface Device {
  serial: string;
  state: string;
  model: string;
  transport: string;
}

export interface BatteryNow {
  level?: number;
  status?: string;
  health?: string;
  temp_c?: number;
  voltage_mv?: number;
  current_ma?: number;
  plugged?: string;
  asoc?: number;
  bsoh?: number;
  first_use?: string;
  max_temp_c?: number;
  protect_threshold?: number;
  protect_mode?: number;
  discharge_level_total?: number;
}

export interface Overview {
  serial: string;
  model?: string;
  name?: string;
  manufacturer?: string;
  android?: string;
  sdk?: string;
  oneui?: string;
  build?: string;
  security_patch?: string;
  uptime_s?: number;
  boot_time?: number;
  ram_total_kb?: number;
  ram_avail_kb?: number;
  swap_total_kb?: number;
  swap_free_kb?: number;
  storage?: { total_kb: number; used_kb: number; pct: number };
  wakefulness?: string;
  thermal_status?: number;
  battery: BatteryNow;
}

export interface UidRef {
  uid: string;
  packages: string[];
  label: string;
}

export interface Consumer extends UidRef {
  mah: number;
  fg_mah: number;
  bg_mah: number;
  parts: Record<string, number>;
}

export interface Timed extends Partial<UidRef> {
  name: string;
  seconds: number;
  count: number;
}

export interface BatteryStats {
  summary: {
    start?: string;
    time_on_battery_s: number;
    screen_on_s: number;
    screen_off_s: number;
    discharge_mah?: number;
    screen_on_mah?: number;
    screen_off_mah?: number;
    light_doze_mah?: number;
    deep_doze_mah?: number;
    screen_on_ma?: number;
    screen_off_ma?: number;
    capacity_mah?: number;
    connectivity_changes?: number;
    partial_wakelock_s: number;
    full_wakelock_s: number;
  };
  components: [string, number][];
  consumers: Consumer[];
  wakelocks: Timed[];
  kernel_wakelocks: Timed[];
  wakeup_reasons: Timed[];
  jobs: Timed[];
}

export interface BatteryHistory {
  points: { t: number; level: number; temp?: number }[];
  screen: { t: number; on: boolean }[];
}

export interface LiveProc {
  pid: string;
  user: string;
  cpu: number;
  mem: number;
  res: string;
  state: string;
  time: string;
  name: string;
}

export interface Processes {
  live: LiveProc[];
  cumulative: { pid: string; user: string; time_s: number; rss_kb: number; name: string }[];
  cpu?: { cores: number; busy_pct: number };
  loadavg: string[];
  wakefulness?: string;
}

export interface AppEntry {
  package: string;
  uid?: number;
  installer?: string;
  store: boolean;
  bucket?: string;
  disabled: boolean;
  mah?: number;
}

export interface AppDetail {
  package: string;
  version?: string;
  first_install?: string;
  last_update?: string;
  installer?: string;
  target_sdk?: string;
  granted_sensitive: string[];
  bucket?: string;
  run_in_background: string;
  recent_ops: { op: string; ago: string }[];
}

export type Action =
  | { kind: "set_setting"; namespace: string; key: string; value: string }
  | { kind: "force_stop"; package: string }
  | { kind: "set_standby_bucket"; package: string; bucket: string }
  | { kind: "set_background"; package: string; mode: "allow" | "ignore" }
  | { kind: "trim_caches" }
  | { kind: "bg_dexopt" }
  | { kind: "reboot" }
  | { kind: "uninstall_user_app"; package: string };

export interface Recommendation {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
  evidence: string;
  action?: Action;
  action_label?: string;
}

export interface HistoryData {
  samples: {
    ts: number;
    level?: number;
    temp_c?: number;
    voltage_mv?: number;
    current_ma?: number;
    asoc?: number;
    bsoh?: number;
    status?: string;
    screen?: string;
  }[];
  drain: { ts: number; package: string; mah: number }[];
  actions: { ts: number; serial: string; action: string; ok: boolean; output: string }[];
  devices: { serial: string; model?: string; first_seen: number; last_seen: number; samples: number }[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;

export const api = {
  devices: () => invoke<{ ok: boolean; error?: string; devices: Device[] }>("list_devices"),
  overview: (serial: string) => invoke<Overview>("overview", { serial }),
  batteryStats: (serial: string, refresh = false) => invoke<BatteryStats>("battery_stats", { serial, refresh }),
  batteryHistory: (serial: string) => invoke<BatteryHistory>("battery_history", { serial }),
  processes: (serial: string) => invoke<Processes>("processes", { serial }),
  memory: (serial: string) => invoke<{ kb: number; name: string; pid: string }[]>("memory", { serial }),
  apps: (serial: string) => invoke<AppEntry[]>("apps", { serial }),
  appDetail: (serial: string, pkg: string) => invoke<AppDetail>("app_detail", { serial, package: pkg }),
  network: (serial: string) => invoke<Json>("network", { serial }),
  bluetooth: (serial: string) => invoke<Json>("bluetooth", { serial }),
  boot: (serial: string) => invoke<Json>("boot", { serial }),
  security: (serial: string) => invoke<Json>("security", { serial }),
  optimizations: (serial: string) => invoke<Recommendation[]>("optimizations", { serial }),
  apply: (serial: string, action: Action) => invoke<string>("apply_action", { serial, action }),
  history: (serial: string, days: number) => invoke<HistoryData>("history", { serial, days }),
};

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
