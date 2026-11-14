/** Tipos de dados do aparelho, espelho do que o core Rust devolve. */

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


export interface Network {
  connectivity: {
    networks: { id: string; kind: string; subtype?: string | null; state: string; created: string }[];
    wifi?: { ssid: string; standard: string; rssi: number; link_mbps: number; freq_mhz: number; band: string } | null;
    dns: string[];
    private_dns_validated: string[];
    vpn_active: boolean;
  };
  operator?: string | null;
  network_type?: string | null;
  private_dns_mode?: string | null;
  private_dns_host?: string | null;
  scan: { wifi_scan_always?: string | null; ble_scan_always?: string | null; mobile_data_always_on?: string | null };
}

export interface BluetoothInfo {
  state?: string | null;
  name?: string | null;
  bonded: { address: string; kind?: string | null; name: string }[];
}

export interface BootInfo {
  uptime_s?: number;
  boot_time?: number;
  boot_reason?: string | null;
  boot_reason_last?: string | null;
  boot_history: string[];
  verified_boot?: string | null;
  bootloader_locked?: string | null;
  vbmeta_state?: string | null;
  warranty_bit?: string | null;
  fingerprint?: string | null;
  security_patch?: string | null;
  build_date?: string | null;
  bootloader?: string | null;
  baseband?: string | null;
  hardware?: string | null;
  kernel?: string;
  selinux?: string;
}

export interface SecurityInfo {
  accessibility: string[];
  notification_listeners: string[];
  device_admins: string[];
  install_unknown: string[];
  overlay: string[];
  usage_access: string[];
  all_files: string[];
  default_ime?: string | null;
  adb_enabled: boolean;
  adb_wifi: boolean;
  dev_options: boolean;
  always_on_vpn?: string | null;
  non_store_apps: { package: string; installer?: string | null }[];
}
