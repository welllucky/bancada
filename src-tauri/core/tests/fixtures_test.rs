//! Parser tests against real (sanitised) output captured from a Galaxy S25
//! Ultra on Android 17 / One UI 9.

use phone_deck_core::parse::*;

fn fx(name: &str) -> String {
    std::fs::read_to_string(format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
}

#[test]
fn battery() {
    let b = parse_battery(&fx("battery.txt"));
    assert!(b.level.is_some_and(|l| (0..=100).contains(&l)));
    assert_eq!(b.health.as_deref(), Some("boa"));
    assert!(b.temp_c.is_some_and(|t| t > 15.0 && t < 60.0));
    assert_eq!(b.asoc, Some(100));
    assert_eq!(b.first_use.as_deref(), Some("2026-07-12"));
    assert_eq!(b.protect_threshold, Some(80));
}

#[test]
fn uid_map_and_stats() {
    let uids = parse_uid_map(&fx("pm_uids.txt"));
    assert!(uids.get(&10369).is_some_and(|v| v.contains(&"com.whatsapp".to_string())));
    let st = parse_batterystats(&fx("batterystats.txt"), &uids);
    assert!(st.summary.time_on_battery_s > 0.0 || st.summary.discharge_mah.is_some());
    assert_eq!(st.summary.capacity_mah, Some(5000));
    assert!(!st.components.is_empty(), "global components parsed");
    assert!(!st.consumers.is_empty(), "per-uid consumers parsed");
    assert!(st.consumers.windows(2).all(|w| w[0].mah >= w[1].mah), "sorted by drain");
    assert!(!st.kernel_wakelocks.is_empty());
    assert!(!st.wakeup_reasons.is_empty());
}

#[test]
fn history() {
    let h = parse_history(&fx("history.txt"), 2026);
    assert!(h.points.len() > 5);
    assert!(h.points.iter().all(|p| (0..=100).contains(&p.level)));
    assert!(h.points.windows(2).all(|w| w[0].t <= w[1].t));
}

#[test]
fn top_and_ps() {
    let (rows, cpu) = parse_top(&fx("top.txt"));
    assert!(rows.len() > 10);
    assert_eq!(cpu.unwrap().cores, 8);
    assert!(rows.iter().any(|r| r.name.contains("system_server")));
    let ps = parse_ps(&fx("ps.txt"));
    assert!(ps.len() > 100);
    assert!(ps[0].time_s >= ps[1].time_s);
}

#[test]
fn memory_and_storage() {
    let m = parse_meminfo_s(&fx("meminfo_s.txt"));
    assert!(!m.is_empty());
    let mi = fx("meminfo.txt");
    assert!(meminfo_kb(&mi, "MemTotal").unwrap() > 1_000_000);
    let df = parse_df(&fx("df.txt")).unwrap();
    assert!(df.pct > 0.0 && df.pct < 100.0);
}

#[test]
fn apps() {
    let a = parse_third_party(&fx("pm_third.txt"));
    assert!(a.len() > 50);
    assert!(a.iter().any(|x| x.package == "com.whatsapp" && x.store));
    assert!(a.iter().any(|x| !x.store));
}

#[test]
fn connectivity() {
    let c = parse_connectivity(&fx("connectivity.txt"));
    assert!(!c.networks.is_empty());
    let w = c.wifi.expect("wifi parsed");
    assert_eq!(w.ssid, "HomeWiFi");
    assert!(w.rssi < 0);
    assert!(!c.dns.is_empty());
}

#[test]
fn bluetooth() {
    let b = parse_bluetooth(&fx("bluetooth.txt"));
    assert_eq!(b.state.as_deref(), Some("ON"));
    assert_eq!(b.bonded.len(), 2);
    assert!(b.bonded.iter().any(|d| d.name.contains("Watch")));
}
