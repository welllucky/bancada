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

#[test]
fn app_timeline_from_real_history() {
    use phone_deck_core::apptimeline::parse_app_timeline;
    let tl = parse_app_timeline(&fx("history.txt"), &["u0a369".into()], 2026);
    assert!(tl.start.is_some() && tl.end > tl.start);
    assert!(tl.spans.iter().any(|s| s.kind == "top"), "WhatsApp aparece na tela no histórico real");
    assert!(tl.spans.iter().all(|s| s.end >= s.start));
    assert!(!tl.screen_off.is_empty());
}

// ---- other vendors (synthetic AOSP-format fixtures, see fixtures/synthetic/README.md)

mod other_vendors {
    use super::fx;
    use phone_deck_core::optimizer::{recommend, Input};
    use phone_deck_core::parse::*;
    use phone_deck_core::vendor::{Capability, Profile, Vendor};

    fn syn(name: &str) -> String {
        fx(&format!("synthetic/{name}"))
    }

    #[test]
    fn pixel_battery_without_samsung_fields() {
        let b = parse_battery(&syn("pixel_battery.txt"));
        assert_eq!(b.level, Some(78));
        assert_eq!(b.status.as_deref(), Some("carregando"));
        assert_eq!(b.plugged.as_deref(), Some("USB"));
        assert_eq!(b.temp_c, Some(29.4));
        assert_eq!(b.current_ma, None, "AOSP has no `current now`");
        assert!(b.asoc.is_none() && b.bsoh.is_none() && b.protect_threshold.is_none() && b.first_use.is_none());
    }

    #[test]
    fn xiaomi_small_current_in_microamps() {
        let b = parse_battery(&syn("xiaomi_battery.txt"));
        assert_eq!(b.level, Some(52));
        assert_eq!(b.current_ma, Some(-15.2), "15 200 µA, not 15 A");
    }

    #[test]
    fn vendor_detection() {
        let pixel = Profile::from_props(&parse_props(&syn("pixel_getprop.txt")));
        assert_eq!(pixel.vendor, Vendor::Google);
        assert!(pixel.skin.is_none());
        let mi = Profile::from_props(&parse_props(&syn("xiaomi_getprop.txt")));
        assert_eq!(mi.vendor, Vendor::Xiaomi);
        assert_eq!(mi.skin.as_deref(), Some("HyperOS OS2.0"));
        assert!(!mi.has(Capability::BatteryProtection));
    }

    #[test]
    fn vendor_stores_count_as_store() {
        let apps = parse_third_party(&syn("pm_third_mixed.txt"));
        let off: Vec<_> = apps.iter().filter(|a| !a.store).map(|a| a.package.as_str()).collect();
        assert_eq!(off, ["com.example.sideload", "com.example.browserdl"]);
    }

    #[test]
    fn pixel_gets_no_samsung_advice() {
        let b = parse_battery(&syn("pixel_battery.txt"));
        let profile = Profile::from_props(&parse_props(&syn("pixel_getprop.txt")));
        let r = recommend(&Input { battery: Some(&b), non_store_apps: 1, profile, ..Default::default() });
        for rec in &r {
            assert_ne!(rec.id, "battery-protect");
            let text = format!("{} {}", rec.title, rec.detail);
            assert!(!text.contains("Samsung") && !text.contains("Galaxy") && !text.contains("One UI"), "{}: {text}", rec.id);
        }
    }
}
