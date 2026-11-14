//! Pure parsers for `dumpsys`/`top`/`ps` output. No I/O here, so every
//! function is unit-testable against captured fixtures. Parsers are tolerant:
//! unknown formats yield `None`/empty instead of errors, because dumpsys
//! layouts drift between Android and One UI releases.

use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::LazyLock;

macro_rules! re {
    ($name:ident, $pat:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($pat).unwrap());
    };
}

// ---------------------------------------------------------------- helpers

re!(DUR, r"(\d+)(ms|d|h|m|s)");

/// "1h 26m 46s 640ms" -> seconds.
pub fn dur_s(text: &str) -> f64 {
    DUR.captures_iter(text)
        .map(|c| {
            let n: f64 = c[1].parse().unwrap_or(0.0);
            n * match &c[2] {
                "d" => 86400.0,
                "h" => 3600.0,
                "m" => 60.0,
                "s" => 1.0,
                _ => 0.001,
            }
        })
        .sum()
}

/// First `key: value` / `key=value` on its own line.
pub fn kv<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    for line in text.lines() {
        let l = line.trim_start();
        if let Some(rest) = l.strip_prefix(key) {
            let rest = rest.trim_start();
            if let Some(v) = rest.strip_prefix(':').or_else(|| rest.strip_prefix('=')) {
                return Some(v.trim());
            }
        }
    }
    None
}

fn cap<T: std::str::FromStr>(re: &Regex, text: &str) -> Option<T> {
    re.captures(text).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse().ok())
}

/// "u0a369" -> 10369, "1000" -> 1000.
pub fn uid_num(tok: &str) -> Option<u32> {
    re!(U, r"^u(\d+)a(\d+)$");
    if let Some(c) = U.captures(tok) {
        let user: u32 = c[1].parse().ok()?;
        let app: u32 = c[2].parse().ok()?;
        return Some(user * 100_000 + 10_000 + app);
    }
    tok.parse().ok()
}

pub fn system_uid_label(uid: u32) -> Option<&'static str> {
    Some(match uid {
        0 => "root (kernel/daemons)",
        1000 => "Sistema Android",
        1001 => "Telefonia",
        1002 => "Bluetooth",
        1010 => "Wi-Fi",
        1013 => "Mídia",
        1036 => "Logs",
        1041 => "Áudio",
        1046 => "Mídia (codec)",
        2000 => "shell/adb",
        _ => return None,
    })
}

pub type UidMap = HashMap<u32, Vec<String>>;

/// `pm list packages -U`
pub fn parse_uid_map(text: &str) -> UidMap {
    re!(L, r"package:(\S+) uid:([\d,]+)");
    let mut m: UidMap = HashMap::new();
    for c in L.captures_iter(text) {
        for u in c[2].split(',') {
            if let Ok(u) = u.parse() {
                m.entry(u).or_default().push(c[1].to_string());
            }
        }
    }
    m
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct UidRef {
    pub uid: String,
    pub packages: Vec<String>,
    pub label: String,
}

pub fn uid_ref(map: &UidMap, tok: &str) -> UidRef {
    let n = uid_num(tok);
    let pk = n.and_then(|n| map.get(&n)).cloned().unwrap_or_default();
    let sys = n.filter(|n| *n < 10_000).and_then(system_uid_label);
    UidRef {
        uid: tok.to_string(),
        label: sys.map(String::from).or_else(|| pk.first().cloned()).unwrap_or_else(|| tok.to_string()),
        packages: pk,
    }
}

pub fn parse_props(text: &str) -> HashMap<String, String> {
    re!(P, r"(?m)^\[(.+?)\]: \[(.*)\]$");
    P.captures_iter(text).map(|c| (c[1].to_string(), c[2].to_string())).collect()
}

// ---------------------------------------------------------------- battery

#[derive(Debug, Clone, Serialize, Default)]
pub struct BatteryNow {
    pub level: Option<i64>,
    pub status: Option<String>,
    pub health: Option<String>,
    pub temp_c: Option<f64>,
    pub voltage_mv: Option<i64>,
    pub current_ma: Option<f64>,
    pub plugged: Option<String>,
    pub asoc: Option<i64>,
    pub bsoh: Option<f64>,
    pub first_use: Option<String>,
    pub max_temp_c: Option<f64>,
    pub protect_threshold: Option<i64>,
    pub protect_mode: Option<i64>,
    pub discharge_level_total: Option<i64>,
}

pub fn parse_battery(t: &str) -> BatteryNow {
    re!(ASOC, r"mSavedBatteryAsoc: \[(\d+)\]");
    re!(BSOH, r"mSavedBatteryBsoh: ([\d.]+)");
    re!(FIRST, r"FirstUseDate: \[(\d{8})\]");
    re!(MAXT, r"mSavedBatteryMaxTemp: (\d+)");
    re!(PTH, r"mProtectionThreshold: (\d+)");
    re!(PMODE, r"mProtectBatteryMode: (\d+)");
    re!(USAGE, r"mSavedBatteryUsage: \[(\d+)\]");
    let status = kv(t, "status").map(|s| {
        match s {
            "2" => "carregando",
            "3" => "descarregando",
            "4" => "sem carregar",
            "5" => "cheia",
            _ => "desconhecido",
        }
        .to_string()
    });
    let health = kv(t, "health").map(|s| {
        match s {
            "2" => "boa",
            "3" => "superaquecida",
            "4" => "morta",
            "5" => "sobretensão",
            "6" => "falha",
            "7" => "fria",
            _ => "desconhecida",
        }
        .to_string()
    });
    let cur: Option<f64> = kv(t, "current now").and_then(|v| v.parse().ok());
    let is_true = |k: &str| kv(t, k) == Some("true");
    let plugged = if is_true("AC powered") {
        Some("AC")
    } else if is_true("USB powered") {
        Some("USB")
    } else if is_true("Wireless powered") {
        Some("sem fio")
    } else {
        None
    };
    BatteryNow {
        level: kv(t, "level").and_then(|v| v.parse().ok()),
        status,
        health,
        temp_c: kv(t, "temperature").and_then(|v| v.parse::<f64>().ok()).map(|v| v / 10.0),
        voltage_mv: kv(t, "voltage").and_then(|v| v.parse().ok()),
        // Samsung reports µA (≈1e6); AOSP devices often report mA or µA.
        current_ma: cur.map(|c| if c.abs() > 20_000.0 { c / 1000.0 } else { c }),
        plugged: plugged.map(String::from),
        asoc: cap(&ASOC, t),
        bsoh: cap(&BSOH, t),
        first_use: FIRST.captures(t).map(|c| {
            let d = &c[1];
            format!("{}-{}-{}", &d[..4], &d[4..6], &d[6..])
        }),
        max_temp_c: cap::<f64>(&MAXT, t).map(|v| v / 10.0),
        protect_threshold: cap(&PTH, t),
        protect_mode: cap(&PMODE, t),
        discharge_level_total: cap(&USAGE, t),
    }
}

// ---------------------------------------------------------------- batterystats

#[derive(Debug, Clone, Serialize, Default)]
pub struct StatsSummary {
    pub start: Option<String>,
    pub time_on_battery_s: f64,
    pub screen_on_s: f64,
    pub screen_off_s: f64,
    pub discharge_mah: Option<f64>,
    pub screen_on_mah: Option<f64>,
    pub screen_off_mah: Option<f64>,
    pub light_doze_mah: Option<f64>,
    pub deep_doze_mah: Option<f64>,
    pub screen_on_ma: Option<f64>,
    pub screen_off_ma: Option<f64>,
    pub capacity_mah: Option<i64>,
    pub connectivity_changes: Option<i64>,
    pub partial_wakelock_s: f64,
    pub full_wakelock_s: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Consumer {
    #[serde(flatten)]
    pub who: UidRef,
    pub mah: f64,
    pub fg_mah: f64,
    pub bg_mah: f64,
    pub parts: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Timed {
    #[serde(flatten)]
    pub who: Option<UidRef>,
    pub name: String,
    pub seconds: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct BatteryStats {
    pub summary: StatsSummary,
    pub components: Vec<(String, f64)>,
    pub consumers: Vec<Consumer>,
    pub wakelocks: Vec<Timed>,
    pub kernel_wakelocks: Vec<Timed>,
    pub wakeup_reasons: Vec<Timed>,
    pub jobs: Vec<Timed>,
}

fn line_dur(sec: &str, key: &str) -> f64 {
    for line in sec.lines() {
        if let Some(rest) = line.trim_start().strip_prefix(key) {
            if let Some(rest) = rest.strip_prefix(':') {
                let v = rest.split('(').next().unwrap_or("");
                return dur_s(v);
            }
        }
    }
    0.0
}

fn line_mah(sec: &str, key: &str) -> Option<f64> {
    for line in sec.lines() {
        if let Some(rest) = line.trim_start().strip_prefix(key) {
            if let Some(rest) = rest.strip_prefix(": ") {
                return rest.trim_end_matches(" mAh").trim().parse().ok();
            }
        }
    }
    None
}

pub fn parse_batterystats(t: &str, uids: &UidMap) -> BatteryStats {
    re!(START, r"Start clock time: (\S+)");
    re!(CAP, r"Estimated battery capacity: (\d+)");
    re!(CONN, r"Connectivity changes: (\d+)");
    re!(COMP, r"(?m)^\s+(\w+): ([\d.]+) apps");
    re!(UIDL, r"(?m)^\s+UID (\S+): ([\d.]+)(.*)\n\s+(.*)$");
    re!(FG, r"\bfg: ([\d.]+)");
    re!(BG, r"\bbg: ([\d.]+)");
    re!(PART, r"\b(screen|cpu|wakelock|mobile_radio|wifi|bluetooth|gnss|audio|video|sensors|camera|flashlight)=([\d.]+)");
    re!(WL, r"^\s+Wake lock (\S+) (.+?): ((?:\d+\w+ ?)+)\((\d+) times\)");
    re!(KWL, r"^\s+(?:Kernel Wake lock|Wakeup reason) (.+?): ((?:\d+\w+ ?)+)\((\d+) times\)");
    re!(UIDHDR, r"^  (u\d+a\d+|\d+):$");
    re!(JOB, r"^\s+Job (\S+): ((?:\d+\w+ ?)+)realtime \((\d+) times\)");

    let sec = t.split("Statistics since last charge:").nth(1).unwrap_or(t);
    let mut s = StatsSummary {
        start: START.captures(sec).map(|c| c[1].to_string()),
        time_on_battery_s: line_dur(sec, "Time on battery"),
        screen_off_s: line_dur(sec, "Time on battery screen off"),
        screen_on_s: line_dur(sec, "Screen on"),
        discharge_mah: line_mah(sec, "Discharge"),
        screen_on_mah: line_mah(sec, "Screen on discharge"),
        screen_off_mah: line_mah(sec, "Screen off discharge"),
        light_doze_mah: line_mah(sec, "Device light doze discharge"),
        deep_doze_mah: line_mah(sec, "Device deep doze discharge"),
        capacity_mah: cap(&CAP, sec),
        connectivity_changes: cap(&CONN, sec),
        partial_wakelock_s: line_dur(sec, "Total partial wakelock time"),
        full_wakelock_s: line_dur(sec, "Total full wakelock time"),
        ..Default::default()
    };
    if let (Some(m), true) = (s.screen_off_mah, s.screen_off_s > 60.0) {
        s.screen_off_ma = Some((m / (s.screen_off_s / 3600.0) * 10.0).round() / 10.0);
    }
    if let (Some(m), true) = (s.screen_on_mah, s.screen_on_s > 60.0) {
        s.screen_on_ma = Some((m / (s.screen_on_s / 3600.0) * 10.0).round() / 10.0);
    }

    let mut out = BatteryStats { summary: s, ..Default::default() };

    if let Some(pw) = sec.split("Estimated power use (mAh):").nth(1) {
        let global = pw.split("Global").nth(1).unwrap_or("");
        let global = global.split("(on battery, screen on)").next().unwrap_or("");
        out.components = COMP.captures_iter(global).filter_map(|c| Some((c[1].to_string(), c[2].parse().ok()?))).collect();
        out.components.sort_by(|a, b| b.1.total_cmp(&a.1));
        for c in UIDL.captures_iter(pw).take(40) {
            let head = &c[3];
            let mut parts = HashMap::new();
            for p in PART.captures_iter(&c[4]) {
                parts.entry(p[1].to_string()).or_insert(p[2].parse().unwrap_or(0.0));
            }
            out.consumers.push(Consumer {
                who: uid_ref(uids, &c[1]),
                mah: c[2].parse().unwrap_or(0.0),
                fg_mah: cap(&FG, head).unwrap_or(0.0),
                bg_mah: cap(&BG, head).unwrap_or(0.0),
                parts,
            });
        }
    }

    let block = |header: &str| -> Vec<&str> {
        match sec.split(header).nth(1) {
            Some(b) => b.lines().skip(1).take_while(|l| !l.trim().is_empty()).collect(),
            None => vec![],
        }
    };
    out.wakelocks = block("All partial wake locks:")
        .iter()
        .filter_map(|l| {
            let c = WL.captures(l)?;
            Some(Timed {
                who: Some(uid_ref(uids, &c[1])),
                name: c[2].to_string(),
                seconds: dur_s(&c[3]),
                count: c[4].parse().ok()?,
            })
        })
        .take(30)
        .collect();
    let simple = |header: &str| -> Vec<Timed> {
        block(header)
            .iter()
            .filter_map(|l| {
                let c = KWL.captures(l)?;
                Some(Timed { who: None, name: c[1].to_string(), seconds: dur_s(&c[2]), count: c[3].parse().ok()? })
            })
            .take(25)
            .collect()
    };
    out.kernel_wakelocks = simple("All kernel wake locks:");
    out.wakeup_reasons = simple("All wakeup reasons:");

    let mut current: Option<String> = None;
    for line in sec.lines() {
        if let Some(c) = UIDHDR.captures(line) {
            current = Some(c[1].to_string());
            continue;
        }
        if let (Some(cur), Some(c)) = (&current, JOB.captures(line)) {
            out.jobs.push(Timed {
                who: Some(uid_ref(uids, cur)),
                name: c[1].to_string(),
                seconds: dur_s(&c[2]),
                count: c[3].parse().unwrap_or(0),
            });
        }
    }
    out.jobs.sort_by(|a, b| b.seconds.total_cmp(&a.seconds));
    out.jobs.truncate(25);
    out
}

// ---------------------------------------------------------------- history

#[derive(Debug, Clone, Serialize)]
pub struct HistPoint {
    pub t: i64,
    pub level: i64,
    pub temp: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScreenEvent {
    pub t: i64,
    pub on: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct History {
    pub points: Vec<HistPoint>,
    pub screen: Vec<ScreenEvent>,
}

/// `dumpsys batterystats --history`. `year` fills the missing year in
/// "MM-DD HH:MM:SS" timestamps (local time).
pub fn parse_history(t: &str, year: i32) -> History {
    use chrono::{Local, NaiveDateTime, TimeZone};
    re!(L, r"^\s+(\d\d-\d\d \d\d:\d\d:\d\d)\.\d+ (\d{3})\b(.*)");
    re!(TEMP, r"\btemp=(\d+)");
    let mut h = History::default();
    let mut last = -1;
    for line in t.lines() {
        let Some(c) = L.captures(line) else { continue };
        let Ok(nd) = NaiveDateTime::parse_from_str(&format!("{year}-{}", &c[1]), "%Y-%m-%d %H:%M:%S") else { continue };
        let ts = Local.from_local_datetime(&nd).earliest().map(|d| d.timestamp()).unwrap_or(0);
        let lvl: i64 = c[2].parse().unwrap_or(0);
        let rest = &c[3];
        let temp = cap::<f64>(&TEMP, rest).map(|v| v / 10.0);
        if lvl != last || temp.is_some() {
            h.points.push(HistPoint { t: ts, level: lvl, temp });
            last = lvl;
        }
        for tok in rest.split_whitespace() {
            match tok {
                "+screen" => h.screen.push(ScreenEvent { t: ts, on: true }),
                "-screen" => h.screen.push(ScreenEvent { t: ts, on: false }),
                _ => {}
            }
        }
    }
    fn keep<T>(v: &mut Vec<T>) {
        let n = v.len();
        if n > 3000 {
            v.drain(..n - 3000);
        }
    }
    keep(&mut h.points);
    keep(&mut h.screen);
    h
}

// ---------------------------------------------------------------- processes

#[derive(Debug, Clone, Serialize)]
pub struct LiveProc {
    pub pid: String,
    pub user: String,
    pub cpu: f64,
    pub mem: f64,
    pub res: String,
    pub state: String,
    pub time: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct CpuInfo {
    pub cores: i64,
    pub busy_pct: f64,
}

/// `top -b -n2 -o PID,USER,PR,NI,%CPU,%MEM,RES,S,TIME+,ARGS` — uses the last frame.
pub fn parse_top(t: &str) -> (Vec<LiveProc>, Option<CpuInfo>) {
    re!(HEAD, r"(\d+)%cpu\s+\d+%user\s+\d+%nice\s+\d+%sys\s+(\d+)%idle");
    re!(PIDH, r"(?m)^\s*PID USER");
    let last_head = HEAD.captures_iter(t).last();
    let cpu = last_head.map(|c| {
        let total: f64 = c[1].parse().unwrap_or(100.0);
        let idle: f64 = c[2].parse().unwrap_or(total);
        CpuInfo { cores: (total / 100.0) as i64, busy_pct: ((total - idle) * 1000.0 / total).round() / 10.0 }
    });
    let frame = PIDH.split(t).last().unwrap_or("");
    let mut rows: Vec<LiveProc> = frame
        .lines()
        .skip(1)
        .filter_map(|l| {
            let c: Vec<&str> = l.split_whitespace().collect();
            if c.len() < 10 || c[0].parse::<u32>().is_err() {
                return None;
            }
            Some(LiveProc {
                pid: c[0].into(),
                user: c[1].into(),
                cpu: c[4].parse().unwrap_or(0.0),
                mem: c[5].parse().unwrap_or(0.0),
                res: c[6].into(),
                state: c[7].into(),
                time: c[8].into(),
                name: c[9..].join(" ").chars().take(160).collect(),
            })
        })
        .collect();
    rows.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
    (rows, cpu)
}

#[derive(Debug, Clone, Serialize)]
pub struct CumProc {
    pub pid: String,
    pub user: String,
    pub time_s: i64,
    pub rss_kb: i64,
    pub name: String,
}

fn cputime(s: &str) -> i64 {
    let mut p: Vec<i64> = s.split(':').filter_map(|x| x.parse().ok()).collect();
    while p.len() < 3 {
        p.insert(0, 0);
    }
    let n = p.len();
    p[n - 3] * 3600 + p[n - 2] * 60 + p[n - 1]
}

/// `ps -A -o PID,USER,TIME,RSS,NAME`
pub fn parse_ps(t: &str) -> Vec<CumProc> {
    let mut v: Vec<CumProc> = t
        .lines()
        .skip(1)
        .filter_map(|l| {
            let c: Vec<&str> = l.split_whitespace().collect();
            if c.len() < 5 {
                return None;
            }
            Some(CumProc {
                pid: c[0].into(),
                user: c[1].into(),
                time_s: cputime(c[2]),
                rss_kb: c[3].parse().unwrap_or(0),
                name: c[4..].join(" "),
            })
        })
        .collect();
    v.sort_by(|a, b| b.time_s.cmp(&a.time_s));
    v
}

#[derive(Debug, Clone, Serialize)]
pub struct MemProc {
    pub kb: i64,
    pub name: String,
    pub pid: String,
}

/// `dumpsys meminfo -s` → "Total PSS by process" block.
pub fn parse_meminfo_s(t: &str) -> Vec<MemProc> {
    re!(L, r"(?m)^\s+([\d,]+)K: (\S+) \(pid (\d+)");
    let blk = t.split("Total PSS by process:").nth(1).unwrap_or("");
    let blk = blk.split("Total PSS by OOM").next().unwrap_or("");
    L.captures_iter(blk)
        .take(40)
        .map(|c| MemProc { kb: c[1].replace(',', "").parse().unwrap_or(0), name: c[2].into(), pid: c[3].into() })
        .collect()
}

/// /proc/meminfo value in kB.
pub fn meminfo_kb(t: &str, key: &str) -> Option<i64> {
    kv(t, key).and_then(|v| v.split_whitespace().next()).and_then(|v| v.parse().ok())
}

#[derive(Debug, Clone, Serialize)]
pub struct Storage {
    pub total_kb: i64,
    pub used_kb: i64,
    pub pct: f64,
}

/// `df /data` (1K-blocks)
pub fn parse_df(t: &str) -> Option<Storage> {
    let last = t.lines().filter(|l| !l.trim().is_empty()).last()?;
    let c: Vec<&str> = last.split_whitespace().collect();
    let total: i64 = c.get(1)?.parse().ok()?;
    let used: i64 = c.get(2)?.parse().ok()?;
    Some(Storage { total_kb: total, used_kb: used, pct: if total > 0 { (used as f64 * 1000.0 / total as f64).round() / 10.0 } else { 0.0 } })
}

pub fn wakefulness(power: &str) -> Option<String> {
    re!(W, r"mWakefulness=(\w+)");
    W.captures(power).map(|c| c[1].to_string())
}

// ---------------------------------------------------------------- apps

#[derive(Debug, Clone, Serialize)]
pub struct AppEntry {
    pub package: String,
    pub uid: Option<u32>,
    pub installer: Option<String>,
    pub store: bool,
    pub bucket: Option<String>,
    pub disabled: bool,
    pub mah: Option<f64>,
}

pub fn bucket_name(n: &str) -> String {
    match n {
        "5" => "exempted",
        "10" => "active",
        "20" => "working_set",
        "30" => "frequent",
        "40" => "rare",
        "45" => "restricted",
        "50" => "never",
        other => other,
    }
    .to_string()
}

pub const STORE_INSTALLERS: [&str; 2] = ["com.android.vending", "com.sec.android.app.samsungapps"];

/// `pm list packages -3 -i -U`
pub fn parse_third_party(t: &str) -> Vec<AppEntry> {
    re!(PKG, r"package:(\S+)");
    re!(INST, r"installer=(\S+)");
    re!(UID, r"uid:(\d+)");
    t.lines()
        .filter_map(|l| {
            let pkg = PKG.captures(l)?[1].to_string();
            let inst = INST.captures(l).map(|c| c[1].to_string()).filter(|i| i != "null");
            Some(AppEntry {
                store: inst.as_deref().is_some_and(|i| STORE_INSTALLERS.contains(&i)),
                package: pkg,
                uid: cap(&UID, l),
                installer: inst,
                bucket: None,
                disabled: false,
                mah: None,
            })
        })
        .collect()
}

/// Latest bucket per package from `dumpsys usagestats` STANDBY_BUCKET_CHANGED events.
pub fn parse_bucket_events(t: &str) -> HashMap<String, String> {
    re!(E, r"type=STANDBY_BUCKET_CHANGED package=(\S+) standbyBucket=(\d+)");
    let mut m = HashMap::new();
    for c in E.captures_iter(t) {
        m.insert(c[1].to_string(), bucket_name(&c[2]));
    }
    m
}

// ---------------------------------------------------------------- network

#[derive(Debug, Clone, Serialize)]
pub struct NetAgent {
    pub id: String,
    pub kind: String,
    pub subtype: Option<String>,
    pub state: String,
    pub created: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WifiInfo {
    pub ssid: String,
    pub standard: String,
    pub rssi: i64,
    pub link_mbps: i64,
    pub freq_mhz: i64,
    pub band: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Connectivity {
    pub networks: Vec<NetAgent>,
    pub wifi: Option<WifiInfo>,
    pub dns: Vec<String>,
    pub private_dns_validated: Vec<String>,
    pub vpn_active: bool,
}

pub fn parse_connectivity(c: &str) -> Connectivity {
    re!(NA, r"NetworkAgentInfo\{network\{(\d+)\}.*?ni\{(\w+)(?:\[([\w-]+)\])? (\w+)[^}]*\} created=(\S+)");
    re!(WI, r#"SSID: "([^"]*)",.*?Wi-Fi standard: (\w+), RSSI: (-?\d+), Link speed: (-?\d+)Mbps.*?Frequency: (\d+)MHz"#);
    re!(DNS, r"DnsAddresses: \[([^\]]*)\]");
    re!(PDNS, r"ValidatedPrivateDnsAddresses: \[([^\]]*)\]");
    let cur = c.split("Current Networks:").nth(1).unwrap_or(c);
    let cur = cur.split("Network Requests:").next().unwrap_or(cur);
    let networks: Vec<NetAgent> = NA
        .captures_iter(cur)
        .map(|m| NetAgent {
            id: m[1].into(),
            kind: m[2].into(),
            subtype: m.get(3).map(|x| x.as_str().into()),
            state: m[4].into(),
            created: m[5].into(),
        })
        .collect();
    let wifi = WI.captures(cur).map(|m| {
        let f: i64 = m[5].parse().unwrap_or(0);
        WifiInfo {
            ssid: m[1].into(),
            standard: m[2].into(),
            rssi: m[3].parse().unwrap_or(0),
            link_mbps: m[4].parse().unwrap_or(0),
            freq_mhz: f,
            band: if f >= 5925 { "6 GHz" } else if f >= 4900 { "5 GHz" } else { "2.4 GHz" }.into(),
        }
    });
    let split = |s: &str| -> Vec<String> {
        s.split(',').map(|x| x.trim().trim_start_matches('/').to_string()).filter(|x| !x.is_empty()).collect()
    };
    Connectivity {
        vpn_active: networks.iter().any(|n| n.kind == "VPN"),
        networks,
        wifi,
        dns: DNS.captures(cur).map(|m| split(&m[1])).unwrap_or_default(),
        private_dns_validated: PDNS.captures(cur).map(|m| split(&m[1])).unwrap_or_default(),
    }
}

// ---------------------------------------------------------------- bluetooth

#[derive(Debug, Clone, Serialize)]
pub struct BtDevice {
    pub address: String,
    pub kind: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Bluetooth {
    pub state: Option<String>,
    pub name: Option<String>,
    pub bonded: Vec<BtDevice>,
}

pub fn parse_bluetooth(t: &str) -> Bluetooth {
    re!(STATE, r"(?m)^\s+State:\s+(\S+)");
    re!(NAME, r"(?m)^\s+Name:\s+(.+)$");
    re!(DEV, r"^\s+([0-9A-Fa-fX:]{11,17})\(\w+\s*\) => .*?\) \[\s*([\w/ ]+?)\s*\].*\]\s+(.+?)\s*$");
    let mut bt = Bluetooth {
        state: STATE.captures(t).map(|c| c[1].to_string()),
        name: NAME.captures(t).map(|c| c[1].trim().to_string()),
        bonded: vec![],
    };
    if let Some(b) = t.split("Bonded devices:").nth(1) {
        for l in b.lines().skip(1) {
            if let Some(c) = DEV.captures(l) {
                bt.bonded.push(BtDevice { address: c[1].into(), kind: Some(c[2].into()), name: c[3].into() });
            } else if !l.starts_with("        ") && !l.trim().is_empty() && !bt.bonded.is_empty() {
                break;
            }
        }
    }
    bt
}

/// Aggregate CPU% per package from a thread-mode or process top frame.
pub fn cpu_by_name(rows: &[LiveProc]) -> HashMap<String, f64> {
    let mut m = HashMap::new();
    for r in rows {
        let base = r.name.split_whitespace().next().unwrap_or("").split(':').next().unwrap_or("").to_string();
        *m.entry(base).or_insert(0.0) += r.cpu;
    }
    m
}
