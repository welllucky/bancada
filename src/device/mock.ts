import type { DeviceApi } from "./port";
import { logLabel } from "../actions";
import type { NetApp, NetSocket, AppTimeline } from "./types";
import type { Action, AppEntry, BatteryStats, HistoryData, Recommendation } from "./types";

/**
 * Adapter de demonstração: dados fixos e anonimizados, no formato que o core devolve.
 * Usado no navegador (`pnpm dev`), em revisão visual e como base para testes da UI.
 */

const SERIAL = "DEMO0000";
const now = () => Math.floor(Date.now() / 1000);
const wait = <T,>(v: T, ms = 180) => new Promise<T>((r) => setTimeout(() => r(v), ms));
/** Onda determinística para séries: sem aleatoriedade, a tela de demo é sempre igual. */
const wave = (i: number, period: number, amp: number) => Math.sin((i / period) * Math.PI * 2) * amp;

const applied: { ts: number; serial: string; action: string; ok: boolean; output: string }[] = [];

/** Estado de demonstração: o que já foi aplicado muda o que as leituras devolvem, como no aparelho. */
const demo = { restricted: new Set<string>(), stopped: new Set<string>(), settings: new Set<string>() };

function demoRecs(): Recommendation[] {
  return RECS.flatMap((r): Recommendation[] => {
    const a = r.action;
    if (a?.kind === "force_stop" && demo.stopped.has(a.package)) return [];
    if (a?.kind === "set_setting" && demo.settings.has(a.key)) return [];
    if (a?.kind === "set_background" && a.mode === "ignore" && demo.restricted.has(a.package)) {
      return [{ ...r, severity: "info", resolved: true, action: undefined, action_label: undefined, detail: "O segundo plano deste app já está restrito. O número abaixo é acumulado desde a última carga completa e zera na próxima." }];
    }
    return [r];
  }).sort((x, y) => Number(!!x.resolved) - Number(!!y.resolved));
}

const RECS: Recommendation[] = [
  {
    id: "cpu-asleep-com.whatsapp",
    severity: "critical",
    title: "com.whatsapp usando CPU com a tela desligada",
    detail: "Com o aparelho em repouso, nenhum app deveria manter a CPU ocupada. Isso drena bateria e aquece. Forçar a parada interrompe o loop; se voltar, restrinja o segundo plano do app.",
    evidence: "48% de CPU (PID 12345) com estado Dozing",
    action: { kind: "force_stop", package: "com.whatsapp" },
    action_label: "Forçar parada",
  },
  {
    id: "wakelock-u0a369-0",
    severity: "critical",
    title: "WhatsApp mantém o aparelho acordado",
    detail: "Wakelocks parciais impedem a CPU de dormir. Se for um app, restringir o segundo plano costuma resolver sem perder notificações push.",
    evidence: "55 min em 212 vezes desde a última carga — *job*/com.whatsapp/androidx.work.impl.background.systemjob.SystemJobService",
    action: { kind: "set_background", package: "com.whatsapp", mode: "ignore" },
    action_label: "Restringir segundo plano",
  },
  {
    id: "screen-timeout",
    severity: "warn",
    title: "Tempo de tela longo",
    detail: "A tela acesa é o maior consumidor. 30 s a 1 min é suficiente para a maioria dos usos.",
    evidence: "300 s",
    action: { kind: "set_setting", namespace: "system", key: "screen_off_timeout", value: "60000" },
    action_label: "Mudar para 1 min",
  },
  {
    id: "wifi-scan",
    severity: "info",
    title: "Busca de Wi-Fi sempre ativa",
    detail: "Mesmo com o Wi-Fi desligado o rádio continua procurando redes para melhorar a localização.",
    evidence: "wifi_scan_always_enabled=1",
    action: { kind: "set_setting", namespace: "global", key: "wifi_scan_always_enabled", value: "0" },
    action_label: "Desativar",
  },
  {
    id: "animations",
    severity: "info",
    title: "Animações em 1x",
    detail: "Reduzir para 0,5x deixa o aparelho mais ágil (escala de janela; aplique também transição e duração nas Opções do desenvolvedor).",
    evidence: "window_animation_scale=1",
    action: { kind: "set_setting", namespace: "global", key: "window_animation_scale", value: "0.5" },
    action_label: "Usar 0,5x",
  },
  {
    id: "trim-caches",
    severity: "info",
    title: "Limpar cache dos apps",
    detail: "Remove apenas arquivos temporários de todos os apps (não apaga conversas, fotos ou logins). Útil após atualizações do sistema.",
    evidence: "manutenção",
    action: { kind: "trim_caches" },
    action_label: "Limpar caches",
  },
  {
    id: "adb-on",
    severity: "info",
    title: "Depuração USB ativada",
    detail: "Necessária para este app, mas desative quando não estiver usando: com ela ligada, um computador autorizado tem amplo acesso ao aparelho.",
    evidence: "adb_enabled=1",
  },
  {
    id: "non-store",
    severity: "info",
    title: "Apps fora da loja",
    detail: "Revise os apps instalados fora da Play Store/Galaxy Store em Aparelho › Segurança. Apps restaurados do Samsung Cloud também aparecem aqui.",
    evidence: "2 apps",
  },
];

const APPS: AppEntry[] = [
  { package: "com.whatsapp", uid: 10369, installer: "com.android.vending", store: true, bucket: "active", disabled: false, mah: 331.4 },
  { package: "com.instagram.android", uid: 10288, installer: "com.android.vending", store: true, bucket: "working_set", disabled: false, mah: 212.7 },
  { package: "com.google.android.youtube", uid: 10190, installer: "com.android.vending", store: true, bucket: "frequent", disabled: false, mah: 140.2 },
  { package: "com.spotify.music", uid: 10301, installer: "com.android.vending", store: true, bucket: "working_set", disabled: false, mah: 96.5 },
  { package: "org.telegram.messenger", uid: 10322, installer: "com.android.vending", store: true, bucket: "rare", disabled: false, mah: 18.3 },
  { package: "com.x8bit.bitwarden", uid: 10255, installer: "com.android.vending", store: true, bucket: "frequent", disabled: false },
  { package: "com.nubank.android", uid: 10233, installer: "com.android.vending", store: true, bucket: "rare", disabled: false, mah: 4.1 },
  { package: "com.samsung.android.app.watchmanager", uid: 10120, installer: "com.sec.android.app.samsungapps", store: true, bucket: "active", disabled: false, mah: 22.9 },
  { package: "com.example.sideload", uid: 10401, installer: "com.android.chrome", store: false, bucket: "restricted", disabled: false },
  { package: "com.example.restored", uid: 10402, installer: "com.samsung.android.scloud", store: false, bucket: "rare", disabled: false },
];

const MB = 1024 * 1024;
/** Peso de cada app no tráfego da demonstração: [pacote, uid, fração, fração em 2º plano, fração no Wi-Fi]. */
const NET_APPS: [string, number, number, number, number][] = [
  ["com.google.android.youtube", 10190, 0.42, 0.05, 0.9],
  ["com.instagram.android", 10288, 0.22, 0.15, 0.7],
  ["com.whatsapp", 10369, 0.12, 0.55, 0.8],
  ["com.spotify.music", 10301, 0.1, 0.6, 0.6],
  ["com.google.android.gms", 10150, 0.06, 0.95, 0.85],
  ["org.telegram.messenger", 10322, 0.04, 0.3, 1],
];
const NET_SOCKETS: NetSocket[] = [
  { proto: "TCP", local: "192.168.0.10", local_port: 50312, remote: "157.240.12.53", remote_port: 443, state: "estabelecida", uid: 10369, packages: ["com.whatsapp"], label: "com.whatsapp" },
  { proto: "TCP", local: "192.168.0.10", local_port: 50318, remote: "157.240.12.60", remote_port: 5222, state: "estabelecida", uid: 10369, packages: ["com.whatsapp"], label: "com.whatsapp" },
  { proto: "TCP", local: "192.168.0.10", local_port: 41022, remote: "142.250.79.110", remote_port: 443, state: "estabelecida", uid: 10190, packages: ["com.google.android.youtube"], label: "com.google.android.youtube" },
  { proto: "UDP", local: "192.168.0.10", local_port: 39811, remote: "142.250.79.110", remote_port: 443, state: "estabelecida", uid: 10190, packages: ["com.google.android.youtube"], label: "com.google.android.youtube" },
  { proto: "TCP", local: "192.168.0.10", local_port: 38200, remote: "142.251.0.188", remote_port: 5228, state: "estabelecida", uid: 10150, packages: ["com.google.android.gms"], label: "com.google.android.gms" },
  { proto: "TCP", local: "192.168.0.10", local_port: 44590, remote: "35.186.224.25", remote_port: 443, state: "estabelecida", uid: 10301, packages: ["com.spotify.music"], label: "com.spotify.music" },
  { proto: "TCP", local: "192.168.0.10", local_port: 46010, remote: "192.168.0.20", remote_port: 8009, state: "estabelecida", uid: 10301, packages: ["com.spotify.music"], label: "com.spotify.music" },
  { proto: "TCP", local: "0.0.0.0", local_port: 5555, remote: "0.0.0.0", remote_port: 0, state: "ouvindo", uid: 2000, packages: [], label: "shell/adb" },
  { proto: "UDP", local: "0.0.0.0", local_port: 5353, remote: "0.0.0.0", remote_port: 0, state: "aberta", uid: 10150, packages: ["com.google.android.gms"], label: "com.google.android.gms" },
];
let liveRx = 8_000 * MB;
let liveTx = 900 * MB;

export const mockAdapter: DeviceApi = {
  source: "mock",
  devices: () => wait({ ok: true, devices: [{ serial: SERIAL, state: "device", model: "Galaxy S25 Ultra (demo)", transport: "usb" }] }, 60),
  overview: (serial) =>
    wait({
      serial,
      model: "SM-S938B",
      name: "Galaxy S25 Ultra",
      manufacturer: "samsung",
      android: "17",
      sdk: "37",
      oneui: "9.0",
      build: "S938BXXU0DEMO",
      security_patch: "2026-10-01",
      uptime_s: 3 * 86400 + 4 * 3600,
      boot_time: now() - (3 * 86400 + 4 * 3600),
      ram_total_kb: 11_800_000,
      ram_avail_kb: 4_100_000,
      swap_total_kb: 8_388_608,
      swap_free_kb: 6_100_000,
      storage: { total_kb: 244_000_000, used_kb: 173_000_000, pct: 71 },
      wakefulness: "Asleep",
      thermal_status: 0,
      battery: {
        level: 64, status: "Discharging", health: "Good", temp_c: 37.8, voltage_mv: 3912, current_ma: -412, plugged: undefined,
        asoc: 93, bsoh: 95, first_use: "2026-03-12", max_temp_c: 41.2, protect_threshold: 85, protect_mode: 1, discharge_level_total: 12000,
      },
    }),
  batteryStats: () =>
    wait<BatteryStats>({
      summary: {
        start: "2026-11-13-08-12",
        time_on_battery_s: 9 * 3600,
        screen_on_s: 3.4 * 3600,
        screen_off_s: 5.6 * 3600,
        discharge_mah: 2100,
        screen_on_mah: 1302,
        screen_off_mah: 798,
        light_doze_mah: 120,
        deep_doze_mah: 40,
        screen_on_ma: 383,
        screen_off_ma: 142,
        capacity_mah: 5000,
        connectivity_changes: 310,
        partial_wakelock_s: 5100,
        full_wakelock_s: 240,
      },
      components: [["screen", 812], ["cpu", 501], ["mobile_radio", 288], ["wifi", 190], ["wakelock", 140], ["audio", 92], ["bluetooth", 41], ["video", 36]],
      consumers: [
        { uid: "u0a369", packages: ["com.whatsapp"], label: "com.whatsapp", mah: 331.4, fg_mah: 96, bg_mah: 235.4, parts: { cpu: 160, wakelock: 70, mobile_radio: 51, screen: 50 } },
        { uid: "u0a288", packages: ["com.instagram.android"], label: "com.instagram.android", mah: 212.7, fg_mah: 190, bg_mah: 22.7, parts: { screen: 120, cpu: 60, wifi: 32.7 } },
        { uid: "u0a190", packages: ["com.google.android.youtube"], label: "com.google.android.youtube", mah: 140.2, fg_mah: 138, bg_mah: 2.2, parts: { screen: 70, video: 36, cpu: 34.2 } },
        { uid: "1000", packages: ["android"], label: "Sistema Android", mah: 120.5, fg_mah: 0, bg_mah: 120.5, parts: { cpu: 90, wakelock: 30.5 } },
        { uid: "u0a301", packages: ["com.spotify.music"], label: "com.spotify.music", mah: 96.5, fg_mah: 20, bg_mah: 76.5, parts: { audio: 60, cpu: 26.5, wifi: 10 } },
      ],
      wakelocks: [
        { uid: "u0a369", packages: ["com.whatsapp"], label: "com.whatsapp", name: "*job*/com.whatsapp/androidx.work.impl.background.systemjob.SystemJobService", seconds: 3300, count: 212 },
        { uid: "u0a301", packages: ["com.spotify.music"], label: "com.spotify.music", name: "Spotify:PlaybackWakeLock", seconds: 1500, count: 4 },
        { uid: "1000", packages: ["android"], label: "Sistema Android", name: "*alarm*", seconds: 420, count: 380 },
      ],
      kernel_wakelocks: [{ name: "PowerManagerService.WakeLocks", seconds: 5100, count: 1900 }],
      wakeup_reasons: [{ name: "Abort:Pending Wakeup Sources", seconds: 900, count: 640 }],
      jobs: [{ uid: "u0a369", packages: ["com.whatsapp"], label: "com.whatsapp", name: "XmppLifecycleWorker", seconds: 3300, count: 48 }],
    }, 500),
  batteryHistory: () => {
    const t0 = now() - 9 * 3600;
    const points = Array.from({ length: 55 }, (_, i) => ({ t: t0 + i * 600, level: Math.round(100 - i * 0.66), temp: 33 + wave(i, 18, 3) + i * 0.05 }));
    const screen = [
      { t: t0 + 1200, on: true }, { t: t0 + 5400, on: false }, { t: t0 + 12000, on: true }, { t: t0 + 16800, on: false },
      { t: t0 + 24000, on: true }, { t: t0 + 28200, on: false },
    ];
    return wait({ points, screen });
  },
  processes: () =>
    wait({
      live: [
        { pid: "12345", user: "u0_a369", cpu: 48.2, mem: 2.1, res: "260M", state: "S", time: "38:12.40", name: "com.whatsapp:WhatsApp Worker" },
        { pid: "1543", user: "system", cpu: 6.1, mem: 3.4, res: "410M", state: "S", time: "120:02.11", name: "system_server" },
        { pid: "22011", user: "u0_a301", cpu: 3.2, mem: 1.4, res: "180M", state: "S", time: "12:40.03", name: "com.spotify.music" },
        { pid: "998", user: "root", cpu: 1.0, mem: 0.1, res: "12M", state: "S", time: "02:01.00", name: "surfaceflinger" },
        { pid: "30111", user: "shell", cpu: 0.8, mem: 0.0, res: "4M", state: "R", time: "00:00.20", name: "top" },
      ],
      cumulative: [
        { pid: "1543", user: "system", time_s: 7202, rss_kb: 410_000, name: "system_server" },
        { pid: "12345", user: "u0_a369", time_s: 2292, rss_kb: 260_000, name: "com.whatsapp" },
        { pid: "22011", user: "u0_a301", time_s: 760, rss_kb: 180_000, name: "com.spotify.music" },
      ],
      cpu: { cores: 8, busy_pct: 31.4 },
      loadavg: ["4.12", "3.80", "3.55"],
      wakefulness: "Asleep",
    }, 120),
  memory: () =>
    wait([
      { kb: 612_000, name: "system_server", pid: "1543" },
      { kb: 402_000, name: "com.instagram.android", pid: "20001" },
      { kb: 260_000, name: "com.whatsapp", pid: "12345" },
      { kb: 180_000, name: "com.spotify.music", pid: "22011" },
      { kb: 140_000, name: "com.sec.android.app.launcher", pid: "3020" },
    ]),
  apps: () => wait(APPS),
  appDetail: (_serial, pkg) => {
    const a = APPS.find((x) => x.package === pkg);
    return wait({
      package: pkg,
      version: pkg === "com.whatsapp" ? "2.26.21.7" : "1.0.0",
      first_install: "2026-03-12 10:02:11",
      last_update: "2026-11-10 22:40:03",
      installer: a?.installer,
      target_sdk: "36",
      granted_sensitive: pkg === "com.whatsapp" ? ["RECORD_AUDIO", "CAMERA", "READ_CONTACTS", "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS"] : ["POST_NOTIFICATIONS"],
      bucket: a?.bucket,
      run_in_background: demo.restricted.has(pkg) ? "ignore" : "allow",
      recent_ops: pkg === "com.whatsapp" ? [{ op: "RECORD_AUDIO", ago: "2h4m12s310ms" }, { op: "CAMERA", ago: "1d2h7m3s5ms" }, { op: "WAKE_LOCK", ago: "34s30ms" }, { op: "FINE_LOCATION", ago: "3d0h54m53s831ms" }] : [],
    });
  },
  network: () =>
    wait({
      connectivity: {
        networks: [{ id: "101", kind: "WIFI", subtype: null, state: "CONNECTED", created: new Date((now() - 7200) * 1000).toISOString() }],
        wifi: { ssid: "Rede de casa", standard: "Wi-Fi 7", rssi: -58, link_mbps: 1729, freq_mhz: 5180, band: "5 GHz" },
        dns: ["192.0.2.1"],
        private_dns_validated: ["dns.example.org"],
        vpn_active: false,
      },
      operator: "Operadora",
      network_type: "NR",
      private_dns_mode: "hostname",
      private_dns_host: "dns.example.org",
      scan: { wifi_scan_always: "1", ble_scan_always: "0", mobile_data_always_on: "0" },
    }),
  bluetooth: () =>
    wait({
      state: "ON",
      name: "Galaxy S25 Ultra",
      bonded: [
        { address: "00:00:5E:00:53:01", kind: "LE", name: "Galaxy Watch" },
        { address: "00:00:5E:00:53:02", kind: "DUAL", name: "Galaxy Buds" },
        { address: "00:00:5E:00:53:03", kind: "CLASSIC", name: "Som do carro" },
      ],
    }),
  boot: () =>
    wait({
      uptime_s: 3 * 86400 + 4 * 3600,
      boot_time: now() - (3 * 86400 + 4 * 3600),
      boot_reason: "reboot,userrequested",
      boot_reason_last: "reboot,ota",
      boot_history: ["reboot,userrequested,1762900000", "reboot,ota,1762300000"],
      verified_boot: "green",
      bootloader_locked: "1",
      vbmeta_state: "locked",
      warranty_bit: "0",
      fingerprint: "samsung/demo/demo:17/DEMO/S938BXXU0DEMO:user/release-keys",
      security_patch: "2026-10-01",
      build_date: "Wed Oct 15 2026",
      bootloader: "S938BXXU0DEMO",
      baseband: "S938BXXU0DEMO",
      hardware: "sun",
      kernel: "6.6.50-android16",
      selinux: "Enforcing",
    }),
  security: () =>
    wait({
      accessibility: ["com.x8bit.bitwarden"],
      notification_listeners: ["com.samsung.android.app.watchmanager", "com.google.android.projection.gearhead"],
      device_admins: ["com.google.android.gms"],
      install_unknown: ["com.android.chrome"],
      overlay: ["com.whatsapp"],
      usage_access: ["com.samsung.android.lool"],
      all_files: [],
      default_ime: "com.samsung.android.honeyboard/.service.HoneyBoardService",
      adb_enabled: true,
      adb_wifi: false,
      dev_options: true,
      always_on_vpn: null,
      non_store_apps: [
        { package: "com.example.sideload", installer: "com.android.chrome" },
        { package: "com.example.restored", installer: "com.samsung.android.scloud" },
      ],
    }),
  optimizations: () => wait(demoRecs(), 600),
  apply: (serial, action: Action) => {
    applied.unshift({ ts: now(), serial, action: logLabel(action), ok: true, output: "Success" });
    if (action.kind === "set_background") action.mode === "ignore" ? demo.restricted.add(action.package) : demo.restricted.delete(action.package);
    if (action.kind === "force_stop") demo.stopped.add(action.package);
    if (action.kind === "set_setting") demo.settings.add(action.key);
    return wait("Success (demo: nada foi enviado a um aparelho)", 400);
  },
  history: (serial, days) => {
    const end = now();
    const start = end - days * 86400;
    const step = Math.max(60, Math.floor((days * 86400) / 600));
    const samples: HistoryData["samples"] = [];
    for (let t = start, i = 0; t <= end; t += step, i++) {
      const hourOfDay = ((t / 3600) % 24 + 24) % 24;
      const charging = hourOfDay >= 1 && hourOfDay < 3;
      const level = charging ? Math.min(100, 30 + (hourOfDay - 1) * 35) : Math.max(15, 100 - ((hourOfDay - 3 + 24) % 24) * 3.6);
      samples.push({
        ts: t, level: Math.round(level), temp_c: 32 + wave(i, 40, 3), voltage_mv: 3900, current_ma: charging ? 2400 : -380 + wave(i, 30, 120),
        asoc: 93 + (t < end - 20 * 86400 ? 1 : 0), bsoh: 95, status: charging ? "Charging" : "Discharging", screen: "Asleep",
      });
    }
    const drain = APPS.filter((a) => a.mah).flatMap((a) =>
      Array.from({ length: Math.min(days, 30) }, (_, d) => ({ ts: end - d * 86400, package: a.package, mah: (a.mah ?? 0) * (1 - d * 0.06) })),
    );
    const actions = [
      ...applied.filter((a) => a.ts >= start),
      { ts: end - 2.2 * 86400, serial, action: "settings put global window_animation_scale 0.5", ok: true, output: "" },
      { ts: end - 2.21 * 86400, serial, action: "forçar parada de com.whatsapp", ok: true, output: "" },
    ];
    return wait({
      samples,
      drain,
      actions,
      devices: [{ serial: SERIAL, model: "Galaxy S25 Ultra (demo)", first_seen: end - 40 * 86400, last_seen: end, samples: samples.length }],
    });
  },
  // A demonstração não tem APKs: a UI mostra a inicial do nome.
  appMeta: () => wait({ label: null, icon: null }, 40),
  appLabels: () => wait({}, 10),
  updateCheck: () =>
    wait({ current: "0.1.0", available: "0.2.0", date: "2026-11-14", configured: true, notes: "### Novidades\n\n- Linha do tempo de uso na tela e em segundo plano (apps) — eb09ca2\n- Seção de rede no diagnóstico — 0b62490\n\n### Correções\n\n- Tela e diagnóstico refletem a ação aplicada — 73e5a4d\n" }, 400),
  appVersion: () => wait("0.1.0", 10),
  updateInstall: async (onProgress) => {
    const total = 12 * 1024 * 1024;
    for (let done = 0; done <= total; done += total / 10) {
      onProgress({ done, total });
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("Demonstração: nada foi baixado.");
  },
  appTimeline: (_serial, pkg) => {
    // 8 h de demonstração: uso à noite, depois tela desligada com tarefas, alarmes e push acordando o app.
    const end = Date.now();
    const start = end - 8 * 3600_000;
    const at = (h: number) => start + h * 3600_000;
    const heavy = pkg === "com.whatsapp" ? 1 : 0.4;
    const screen_off: [number, number][] = [[at(0.6), at(2.1)], [at(2.3), at(7.2)], [at(7.5), end]];
    const spans: AppTimeline["spans"] = [
      { kind: "top", start: at(0.1), end: at(0.35), tag: pkg, screen_off: false },
      { kind: "top", start: at(2.15), end: at(2.25), tag: pkg, screen_off: false },
      { kind: "top", start: at(7.25), end: at(7.4), tag: pkg, screen_off: false },
    ];
    const marks: AppTimeline["marks"] = [];
    for (let h = 0.8; h < 7.9; h += 0.55 / heavy) {
      const off = screen_off.some(([a, b]) => at(h) >= a && at(h) <= b);
      spans.push({ kind: "job", start: at(h), end: at(h) + 25_000, tag: `${pkg}/androidx.work.impl.background.systemjob.SystemJobService`, screen_off: off });
      if (Math.round(h * 10) % 3 === 0) spans.push({ kind: "wake_lock", start: at(h), end: at(h) + 40_000, tag: `*job*/${pkg}/SystemJobService`, screen_off: off });
      if (Math.round(h * 10) % 4 === 0) marks.push({ kind: "wakeupap", t: at(h) - 2000, tag: `*walarm*:${pkg}.ALARM`, screen_off: off });
      if (Math.round(h * 10) % 5 === 1) marks.push({ kind: "tmpwhitelist", t: at(h + 0.1), tag: "com.google.android.c2dm.intent.RECEIVE", screen_off: off });
    }
    spans.sort((a, b) => a.start - b.start);
    return wait({ start, end, screen_off, spans, marks }, 500);
  },
  wifiServices: () =>
    wait([
      { name: "adb-DEMO0000-AbCdEf", kind: "pairing" as const, addr: "192.168.0.10:37123" },
      { name: "adb-DEMO0000-AbCdEf", kind: "connect" as const, addr: "192.168.0.10:41234" },
    ]),
  wifiPair: (addr) => wait(`Pareado com ${addr}`, 600),
  wifiConnect: (addr) => wait(`Conectado a ${addr}`, 400),
  wifiDisconnect: (addr) => wait(`Desconectado de ${addr}`),
  wifiFromUsb: () => wait("Conectado a 192.168.0.10:5555", 900),
  netUsage: (_serial, days) => {
    const end = Math.floor(now() / 3600) * 3600;
    const hours = Math.round(days * 24);
    const timeline = Array.from({ length: hours }, (_, k) => {
      const t = end - (hours - 1 - k) * 3600;
      const h = new Date(t * 1000).getHours();
      const day = h >= 8 && h <= 23 ? 1 : 0.15;
      const rx = Math.round((40 + wave(k, 24, 30) + (h === 21 ? 160 : 0)) * day * MB);
      const tx = Math.round(rx * 0.08);
      return { t, rx, tx, wifi: Math.round((rx + tx) * 0.78), mobile: Math.round((rx + tx) * 0.22) };
    });
    const rx = timeline.reduce((a, p) => a + p.rx, 0);
    const tx = timeline.reduce((a, p) => a + p.tx, 0);
    const apps: NetApp[] = NET_APPS.map(([pkg, uid, share, bg, wifi]) => {
      const total = (rx + tx) * share;
      return { uid, packages: [pkg], label: pkg, rx: Math.round(total * 0.9), tx: Math.round(total * 0.1), wifi: Math.round(total * wifi), mobile: Math.round(total * (1 - wifi)), foreground: Math.round(total * (1 - bg)) };
    });
    return wait({ timeline, apps, rx, tx, available: true }, 300);
  },
  netConnections: () => wait({ readable: true, sockets: NET_SOCKETS }, 150),
  netLive: () => {
    const k = Date.now() / 2000;
    liveRx += Math.round((350 + Math.sin(k / 3) * 250 + (Math.sin(k / 11) > 0.7 ? 2500 : 0)) * 1024 * 2);
    liveTx += Math.round((40 + Math.sin(k / 2) * 25) * 1024 * 2);
    return wait({ t: Date.now(), ifaces: [{ name: "wlan0", transport: "wifi" as const, rx: liveRx, tx: liveTx }] }, 60);
  },
};
