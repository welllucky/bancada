import { invoke } from "@tauri-apps/api/core";
import type { DeviceApi } from "./port";

/** Adapter real: comandos Tauri que chamam o core Rust (adb). */
export const tauriAdapter: DeviceApi = {
  source: "tauri",
  devices: () => invoke("list_devices"),
  overview: (serial) => invoke("overview", { serial }),
  batteryStats: (serial, refresh = false) => invoke("battery_stats", { serial, refresh }),
  batteryHistory: (serial) => invoke("battery_history", { serial }),
  processes: (serial) => invoke("processes", { serial }),
  memory: (serial) => invoke("memory", { serial }),
  apps: (serial) => invoke("apps", { serial }),
  appDetail: (serial, pkg) => invoke("app_detail", { serial, package: pkg }),
  network: (serial) => invoke("network", { serial }),
  bluetooth: (serial) => invoke("bluetooth", { serial }),
  boot: (serial) => invoke("boot", { serial }),
  security: (serial) => invoke("security", { serial }),
  optimizations: (serial) => invoke("optimizations", { serial }),
  apply: (serial, action) => invoke("apply_action", { serial, action }),
  history: (serial, days) => invoke("history", { serial, days }),
  netUsage: (serial, days, refresh = false) => invoke("net_usage", { serial, days, refresh }),
  netConnections: (serial) => invoke("net_connections", { serial }),
  netLive: (serial) => invoke("net_live", { serial }),
  appMeta: (serial, pkg) => invoke("app_meta", { serial, package: pkg }),
  appLabels: () => invoke("app_labels"),
  wifiServices: () => invoke("wifi_services"),
  wifiPair: (addr, code) => invoke("wifi_pair", { addr, code }),
  wifiConnect: (addr) => invoke("wifi_connect", { addr }),
  wifiDisconnect: (addr) => invoke("wifi_disconnect", { addr }),
  wifiFromUsb: (serial) => invoke("wifi_from_usb", { serial }),
};
