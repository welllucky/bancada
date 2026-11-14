//! I/O layer: runs read-only adb commands and feeds the parsers.

use crate::adb::{self, Result};
use crate::parse::{self, *};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const T: Duration = Duration::from_secs(30);
const LONG: Duration = Duration::from_secs(90);

fn sh(serial: &str, tokens: &[&str]) -> String {
    adb::shell(serial, tokens, T).unwrap_or_default()
}
fn sh_long(serial: &str, tokens: &[&str]) -> String {
    adb::shell(serial, tokens, LONG).unwrap_or_default()
}

fn now_s() -> f64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0)
}

pub fn setting(serial: &str, ns: &str, key: &str) -> Option<String> {
    let v = sh(serial, &["settings", "get", ns, key]);
    let v = v.trim();
    (!v.is_empty() && v != "null").then(|| v.to_string())
}

pub fn props(serial: &str) -> HashMap<String, String> {
    parse_props(&sh(serial, &["getprop"]))
}

// ---- caches

struct Cache<T> {
    map: Mutex<HashMap<String, (Instant, Arc<T>)>>,
    ttl: Duration,
}
impl<T> Cache<T> {
    fn new(ttl: Duration) -> Self {
        Self { map: Mutex::new(HashMap::new()), ttl }
    }
    fn get_or(&self, key: &str, refresh: bool, f: impl FnOnce() -> T) -> Arc<T> {
        if !refresh {
            if let Some((t, v)) = self.map.lock().unwrap().get(key) {
                if t.elapsed() < self.ttl {
                    return v.clone();
                }
            }
        }
        let v = Arc::new(f());
        self.map.lock().unwrap().insert(key.to_string(), (Instant::now(), v.clone()));
        v
    }
}

static UIDS: LazyLock<Cache<UidMap>> = LazyLock::new(|| Cache::new(Duration::from_secs(300)));
static STATS: LazyLock<Cache<BatteryStats>> = LazyLock::new(|| Cache::new(Duration::from_secs(120)));

pub fn uid_map(serial: &str) -> Arc<UidMap> {
    UIDS.get_or(serial, false, || parse_uid_map(&sh(serial, &["pm", "list", "packages", "--user", "0", "-U"])))
}

// ---- overview

#[derive(Debug, Serialize)]
pub struct Overview {
    pub serial: String,
    pub model: Option<String>,
    pub name: Option<String>,
    pub manufacturer: Option<String>,
    pub android: Option<String>,
    pub sdk: Option<String>,
    pub oneui: Option<String>,
    pub build: Option<String>,
    pub security_patch: Option<String>,
    pub uptime_s: Option<f64>,
    pub boot_time: Option<f64>,
    pub ram_total_kb: Option<i64>,
    pub ram_avail_kb: Option<i64>,
    pub swap_total_kb: Option<i64>,
    pub swap_free_kb: Option<i64>,
    pub storage: Option<Storage>,
    pub wakefulness: Option<String>,
    pub thermal_status: Option<i64>,
    pub battery: BatteryNow,
}

pub fn uptime(serial: &str) -> Option<f64> {
    sh(serial, &["cat", "/proc/uptime"]).split_whitespace().next()?.parse().ok()
}

pub fn overview(serial: &str) -> Overview {
    let p = props(serial);
    let mem = sh(serial, &["cat", "/proc/meminfo"]);
    let up = uptime(serial);
    let therm = sh(serial, &["dumpsys", "thermalservice"]);
    let oneui = p.get("ro.build.version.oneui").map(|v| match v.parse::<u32>() {
        Ok(n) => format!("{}.{}", n / 10000, (n / 100) % 100),
        Err(_) => v.clone(),
    });
    let g = |k: &str| p.get(k).cloned().filter(|v| !v.is_empty());
    Overview {
        serial: serial.into(),
        model: g("ro.product.model"),
        name: g("ro.product.marketname").or_else(|| g("ro.product.vendor.marketname")).or_else(|| g("ro.product.device")),
        manufacturer: g("ro.product.manufacturer"),
        android: g("ro.build.version.release"),
        sdk: g("ro.build.version.sdk"),
        oneui,
        build: g("ro.build.display.id"),
        security_patch: g("ro.build.version.security_patch"),
        uptime_s: up,
        boot_time: up.map(|u| now_s() - u),
        ram_total_kb: meminfo_kb(&mem, "MemTotal"),
        ram_avail_kb: meminfo_kb(&mem, "MemAvailable"),
        swap_total_kb: meminfo_kb(&mem, "SwapTotal"),
        swap_free_kb: meminfo_kb(&mem, "SwapFree"),
        storage: parse_df(&sh(serial, &["df", "/data"])),
        wakefulness: wakefulness(&sh(serial, &["dumpsys", "power"])),
        thermal_status: regex::Regex::new(r"Thermal Status: (\d+)").unwrap().captures(&therm).and_then(|c| c[1].parse().ok()),
        battery: battery_now(serial),
    }
}

pub fn battery_now(serial: &str) -> BatteryNow {
    parse_battery(&sh(serial, &["dumpsys", "battery"]))
}

pub fn battery_stats(serial: &str, refresh: bool) -> Arc<BatteryStats> {
    STATS.get_or(serial, refresh, || {
        let t = sh_long(serial, &["dumpsys", "batterystats", "--charged"]);
        parse_batterystats(&t, &uid_map(serial))
    })
}

pub fn battery_history(serial: &str) -> History {
    use chrono::Datelike;
    let t = sh_long(serial, &["dumpsys", "batterystats", "--history"]);
    parse_history(&t, chrono::Local::now().year())
}

// ---- processes

#[derive(Debug, Serialize)]
pub struct Processes {
    pub live: Vec<LiveProc>,
    pub cumulative: Vec<CumProc>,
    pub cpu: Option<CpuInfo>,
    pub loadavg: Vec<String>,
    pub wakefulness: Option<String>,
}

pub fn processes(serial: &str) -> Processes {
    let t = sh(serial, &["top", "-b", "-n", "2", "-d", "1", "-m", "40", "-o", "PID,USER,PR,NI,%CPU,%MEM,RES,S,TIME+,ARGS"]);
    let (mut live, cpu) = parse_top(&t);
    live.truncate(40);
    let mut cumulative = parse_ps(&sh(serial, &["ps", "-A", "-o", "PID,USER,TIME,RSS,NAME"]));
    cumulative.truncate(30);
    Processes {
        live,
        cumulative,
        cpu,
        loadavg: sh(serial, &["cat", "/proc/loadavg"]).split_whitespace().take(3).map(String::from).collect(),
        wakefulness: wakefulness(&sh(serial, &["dumpsys", "power"])),
    }
}

pub fn memory(serial: &str) -> Vec<MemProc> {
    parse_meminfo_s(&sh_long(serial, &["dumpsys", "meminfo", "-s"]))
}

// ---- apps

pub fn apps(serial: &str) -> Vec<AppEntry> {
    let mut list = parse_third_party(&sh(serial, &["pm", "list", "packages", "--user", "0", "-3", "-i", "-U"]));
    let disabled: std::collections::HashSet<String> = sh(serial, &["pm", "list", "packages", "--user", "0", "-d"])
        .lines()
        .filter_map(|l| l.strip_prefix("package:").map(|s| s.trim().to_string()))
        .collect();
    let buckets = parse_bucket_events(&sh_long(serial, &["dumpsys", "usagestats"]));
    let stats = battery_stats(serial, false);
    let mut drain: HashMap<&str, f64> = HashMap::new();
    for c in &stats.consumers {
        for p in &c.who.packages {
            drain.insert(p.as_str(), c.mah);
        }
    }
    for a in &mut list {
        a.disabled = disabled.contains(&a.package);
        a.bucket = buckets.get(&a.package).cloned();
        a.mah = drain.get(a.package.as_str()).copied();
    }
    list.sort_by(|a, b| b.mah.unwrap_or(0.0).total_cmp(&a.mah.unwrap_or(0.0)).then(a.package.cmp(&b.package)));
    list
}

const DANGEROUS: &[&str] = &[
    "CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION",
    "READ_CONTACTS", "READ_SMS", "RECEIVE_SMS", "SEND_SMS", "READ_CALL_LOG", "READ_PHONE_STATE", "CALL_PHONE",
    "BODY_SENSORS", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_EXTERNAL_STORAGE", "POST_NOTIFICATIONS",
    "BLUETOOTH_SCAN", "NEARBY_WIFI_DEVICES",
];

pub fn app_detail(serial: &str, pkg: &str) -> Result<Value> {
    adb::valid_pkg(pkg)?;
    let t = sh_long(serial, &["dumpsys", "package", pkg]);
    let granted_re = regex::Regex::new(r"android\.permission\.(\w+): granted=true").unwrap();
    let mut granted: Vec<String> =
        granted_re.captures_iter(&t).map(|c| c[1].to_string()).filter(|p| DANGEROUS.contains(&p.as_str())).collect();
    granted.sort();
    granted.dedup();
    let ops = sh(serial, &["cmd", "appops", "get", pkg]);
    let bg = regex::Regex::new(r"RUN_ANY_IN_BACKGROUND: (\w+)").unwrap().captures(&ops).map(|c| c[1].to_string());
    let recent: Vec<Value> = regex::Regex::new(r"(?m)^(\w+): (?:allow|foreground); time=\+(\S+) ago")
        .unwrap()
        .captures_iter(&ops)
        .take(15)
        .map(|c| json!({"op": &c[1], "ago": &c[2]}))
        .collect();
    let bucket = sh(serial, &["am", "get-standby-bucket", pkg]);
    let k = |key: &str| parse::kv(&t, key).map(String::from);
    Ok(json!({
        "package": pkg,
        "version": k("versionName"),
        "first_install": k("firstInstallTime"),
        "last_update": k("lastUpdateTime"),
        "installer": k("installerPackageName"),
        "target_sdk": regex::Regex::new(r"targetSdk=(\d+)").unwrap().captures(&t).map(|c| c[1].to_string()),
        "granted_sensitive": granted,
        "bucket": Some(bucket.trim()).filter(|s| !s.is_empty()).map(bucket_name),
        "run_in_background": bg.unwrap_or_else(|| "allow".into()),
        "recent_ops": recent,
    }))
}

// ---- network / bluetooth

pub fn network(serial: &str) -> Value {
    let c = parse_connectivity(&sh_long(serial, &["dumpsys", "connectivity"]));
    let p = props(serial);
    json!({
        "connectivity": c,
        "operator": p.get("gsm.operator.alpha"),
        "network_type": p.get("gsm.network.type"),
        "private_dns_mode": setting(serial, "global", "private_dns_mode"),
        "private_dns_host": setting(serial, "global", "private_dns_specifier"),
        "scan": {
            "wifi_scan_always": setting(serial, "global", "wifi_scan_always_enabled"),
            "ble_scan_always": setting(serial, "global", "ble_scan_always_enabled"),
            "mobile_data_always_on": setting(serial, "global", "mobile_data_always_on"),
        }
    })
}

pub fn bluetooth(serial: &str) -> Bluetooth {
    parse_bluetooth(&sh_long(serial, &["dumpsys", "bluetooth_manager"]))
}

// ---- boot / system

pub fn boot(serial: &str) -> Value {
    let p = props(serial);
    let up = uptime(serial);
    let g = |k: &str| p.get(k).cloned().filter(|v| !v.is_empty());
    let hist: Vec<String> = g("persist.sys.boot.reason.history")
        .unwrap_or_default()
        .split(['\n', ','])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .take(20)
        .collect();
    json!({
        "uptime_s": up,
        "boot_time": up.map(|u| now_s() - u),
        "boot_reason": g("sys.boot.reason").or_else(|| g("ro.boot.bootreason")),
        "boot_reason_last": g("sys.boot.reason.last"),
        "boot_history": hist,
        "verified_boot": g("ro.boot.verifiedbootstate"),
        "bootloader_locked": g("ro.boot.flash.locked"),
        "vbmeta_state": g("ro.boot.vbmeta.device_state"),
        "warranty_bit": g("ro.boot.warranty_bit"),
        "fingerprint": g("ro.build.fingerprint"),
        "security_patch": g("ro.build.version.security_patch"),
        "build_date": g("ro.build.date"),
        "bootloader": g("ro.bootloader").or_else(|| g("ro.boot.bootloader")),
        "baseband": g("gsm.version.baseband"),
        "hardware": g("ro.hardware").or_else(|| g("ro.soc.model")),
        "kernel": sh(serial, &["uname", "-r"]).trim(),
        "selinux": sh(serial, &["getenforce"]).trim(),
    })
}

// ---- security

pub fn security(serial: &str) -> Value {
    let split = |v: Option<String>| -> Vec<String> {
        let mut x: Vec<String> = v
            .unwrap_or_default()
            .split(':')
            .filter(|s| !s.is_empty())
            .map(|s| s.split('/').next().unwrap_or(s).to_string())
            .collect();
        x.sort();
        x.dedup();
        x
    };
    let dp = sh(serial, &["dumpsys", "device_policy"]);
    let mut admins: Vec<String> = regex::Regex::new(r"admin=ComponentInfo\{([^/}]+)")
        .unwrap()
        .captures_iter(&dp)
        .map(|c| c[1].to_string())
        .collect();
    admins.sort();
    admins.dedup();
    let op_allowed = |op: &str| -> Vec<String> {
        sh(serial, &["appops", "query-op", op, "allow"])
            .split_whitespace()
            .filter(|x| adb::PKG_RE.is_match(x))
            .map(String::from)
            .collect()
    };
    let non_store: Vec<Value> = parse_third_party(&sh(serial, &["pm", "list", "packages", "--user", "0", "-3", "-i"]))
        .into_iter()
        .filter(|a| !a.store)
        .map(|a| json!({"package": a.package, "installer": a.installer}))
        .collect();
    json!({
        "accessibility": split(setting(serial, "secure", "enabled_accessibility_services")),
        "notification_listeners": split(setting(serial, "secure", "enabled_notification_listeners")),
        "device_admins": admins,
        "install_unknown": op_allowed("REQUEST_INSTALL_PACKAGES"),
        "overlay": op_allowed("SYSTEM_ALERT_WINDOW"),
        "usage_access": op_allowed("GET_USAGE_STATS"),
        "all_files": op_allowed("MANAGE_EXTERNAL_STORAGE"),
        "default_ime": setting(serial, "secure", "default_input_method"),
        "adb_enabled": setting(serial, "global", "adb_enabled").as_deref() == Some("1"),
        "adb_wifi": setting(serial, "global", "adb_wifi_enabled").as_deref() == Some("1"),
        "dev_options": setting(serial, "global", "development_settings_enabled").as_deref() == Some("1"),
        "always_on_vpn": setting(serial, "secure", "always_on_vpn_app"),
        "non_store_apps": non_store,
    })
}

// ---- settings for the optimizer

pub const WATCHED: &[(&str, &str)] = &[
    ("system", "screen_off_timeout"),
    ("system", "aod_mode"),
    ("system", "aod_tap_to_show_mode"),
    ("secure", "doze_always_on"),
    ("global", "wifi_scan_always_enabled"),
    ("global", "ble_scan_always_enabled"),
    ("global", "mobile_data_always_on"),
    ("global", "window_animation_scale"),
    ("global", "transition_animation_scale"),
    ("global", "animator_duration_scale"),
    ("global", "stay_on_while_plugged_in"),
    ("global", "adb_enabled"),
    ("global", "development_settings_enabled"),
];

pub fn settings_snapshot(serial: &str) -> HashMap<String, Option<String>> {
    WATCHED.iter().map(|(ns, k)| (format!("{ns}.{k}"), setting(serial, ns, k))).collect()
}

/// Ícone real do app como `data:` URL, extraído do APK; `None` quando não há ícone que saibamos desenhar.
///
/// Copia o `base.apk` pelo `adb pull` só na primeira vez, extrai o ícone e apaga a cópia. O resultado fica em
/// `cache_dir`, numa chave que muda quando o app é atualizado (o caminho do APK muda a cada instalação).
pub fn app_icon(serial: &str, pkg: &str, cache_dir: &std::path::Path) -> Result<Option<String>> {
    adb::valid_pkg(pkg)?;
    let out = sh(serial, &["pm", "path", "--user", "0", pkg]);
    let Some(remote) = out.lines().filter_map(|l| l.trim().strip_prefix("package:")).find(|p| p.ends_with("/base.apk")).or_else(|| {
        out.lines().filter_map(|l| l.trim().strip_prefix("package:")).next()
    }) else {
        return Ok(None);
    };
    adb::valid_apk_path(remote)?;
    std::fs::create_dir_all(cache_dir).map_err(|e| adb::AdbError(e.to_string()))?;
    let key = format!("{pkg}.{:016x}", fnv1a(remote.as_bytes()));
    let cached = cache_dir.join(format!("{key}.icon"));
    if let Ok(v) = std::fs::read_to_string(&cached) {
        return Ok((!v.is_empty()).then_some(v));
    }
    // Versões antigas do mesmo app saem do cache.
    if let Ok(rd) = std::fs::read_dir(cache_dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with(&format!("{pkg}.")) && n.ends_with(".icon") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let tmp = cache_dir.join(format!("{key}.apk.part"));
    let res = adb::pull_apk(serial, remote, &tmp, Duration::from_secs(300)).map(|_| crate::icons::extract(&tmp));
    let _ = std::fs::remove_file(&tmp);
    let icon = res?;
    let _ = std::fs::write(&cached, icon.as_deref().unwrap_or(""));
    Ok(icon)
}

/// Hash estável entre versões do Rust (o `DefaultHasher` não garante isso), para nomes de cache.
fn fnv1a(b: &[u8]) -> u64 {
    b.iter().fold(0xcbf29ce484222325, |h, &x| (h ^ x as u64).wrapping_mul(0x100000001b3))
}

// ---- rede

static NETSTATS: LazyLock<Cache<crate::netusage::NetStats>> = LazyLock::new(|| Cache::new(Duration::from_secs(60)));

/// Consumo de rede dos últimos `days` dias: linha do tempo do aparelho e total por app.
/// `dumpsys netstats detail` é grande; fica em cache por 60 s.
pub fn net_usage(serial: &str, days: f64, refresh: bool) -> Value {
    use crate::netusage::*;
    let ns = NETSTATS.get_or(serial, refresh, || parse_netstats(&sh_long(serial, &["dumpsys", "netstats", "detail"])));
    let since = (now_s() - days * 86400.0) as i64;
    let map = uid_map(serial);
    let apps: Vec<Value> = per_uid(&ns, since)
        .into_iter()
        .map(|a| {
            let who = uid_ref(&map, &a.uid.to_string());
            json!({"uid": a.uid, "packages": who.packages, "label": who.label, "rx": a.rx, "tx": a.tx, "wifi": a.wifi, "mobile": a.mobile, "foreground": a.foreground})
        })
        .collect();
    let tl = timeline(&ns, since);
    let (rx, tx) = tl.iter().fold((0u64, 0u64), |(r, t), p| (r + p.rx, t + p.tx));
    json!({"timeline": tl, "apps": apps, "rx": rx, "tx": tx, "available": !ns.xt.is_empty() || !ns.uids.is_empty()})
}

/// Conexões abertas agora, com o app dono de cada uma (`/proc/net/*` traz o UID).
pub fn net_connections(serial: &str) -> Value {
    use crate::netusage::parse_proc_net;
    let map = uid_map(serial);
    let mut readable = false;
    let mut out: Vec<Value> = Vec::new();
    for (file, proto) in [("/proc/net/tcp", "tcp"), ("/proc/net/tcp6", "tcp6"), ("/proc/net/udp", "udp"), ("/proc/net/udp6", "udp6")] {
        let text = sh(serial, &["cat", file]);
        if text.contains("local_address") {
            readable = true;
        }
        for s in parse_proc_net(&text, proto) {
            let who = uid_ref(&map, &s.uid.to_string());
            out.push(json!({
                "proto": s.proto, "local": s.local, "local_port": s.local_port, "remote": s.remote, "remote_port": s.remote_port,
                "state": s.state, "uid": s.uid, "packages": who.packages, "label": who.label,
            }));
        }
    }
    json!({"readable": readable, "sockets": out})
}

/// Contadores das interfaces agora; a UI calcula a taxa pela diferença entre leituras.
pub fn net_live(serial: &str) -> Value {
    let ifaces = crate::netusage::parse_proc_net_dev(&sh(serial, &["cat", "/proc/net/dev"]));
    json!({"t": (now_s() * 1000.0) as i64, "ifaces": ifaces})
}
