//! Read-only smoke test against a connected device:
//! `cargo run -p phone-deck-core --example smoke`
//! Prints a compact summary of every collector + the optimizer output.

use phone_deck_core::{adb, collectors as c, optimizer};

fn main() {
    let devs = adb::devices().expect("adb");
    let Some(d) = devs.iter().find(|d| d.state == "device") else {
        eprintln!("nenhum aparelho autorizado: {devs:?}");
        std::process::exit(1);
    };
    let s = d.serial.as_str();
    let t = std::time::Instant::now();
    let ov = c::overview(s);
    println!("overview: {:?} android={:?} oneui={:?} level={:?} asoc={:?} wake={:?} storage={:?}",
        ov.model, ov.android, ov.oneui, ov.battery.level, ov.battery.asoc, ov.wakefulness, ov.storage.as_ref().map(|x| x.pct));
    let st = c::battery_stats(s, true);
    println!("stats: on_batt={:.0}s off_ma={:?} consumers={} top={:?} wakelocks={} jobs={} kernel={}",
        st.summary.time_on_battery_s, st.summary.screen_off_ma, st.consumers.len(),
        st.consumers.first().map(|x| (&x.who.label, x.mah)), st.wakelocks.len(), st.jobs.len(), st.kernel_wakelocks.len());
    let h = c::battery_history(s);
    println!("history: points={} screen={}", h.points.len(), h.screen.len());
    let p = c::processes(s);
    println!("processes: live={} cum={} cpu={:?} top={:?}", p.live.len(), p.cumulative.len(), p.cpu, p.live.first().map(|x| (&x.name, x.cpu)));
    println!("memory: {}", c::memory(s).len());
    let apps = c::apps(s);
    println!("apps: {} buckets={} with_mah={}", apps.len(), apps.iter().filter(|a| a.bucket.is_some()).count(), apps.iter().filter(|a| a.mah.is_some()).count());
    println!("app_detail(whatsapp): {}", c::app_detail(s, "com.whatsapp").map(|v| v["version"].to_string()).unwrap_or_else(|e| e.to_string()));
    let n = c::network(s);
    println!("network: wifi={} nets={}", n["connectivity"]["wifi"]["band"], n["connectivity"]["networks"].as_array().map(|a| a.len()).unwrap_or(0));
    let bt = c::bluetooth(s);
    println!("bluetooth: {:?} bonded={}", bt.state, bt.bonded.len());
    let b = c::boot(s);
    println!("boot: vb={} selinux={} reason={}", b["verified_boot"], b["selinux"], b["boot_reason"]);
    let sec = c::security(s);
    println!("security: a11y={} listeners={} admins={} non_store={}", sec["accessibility"], sec["notification_listeners"].as_array().map(|a| a.len()).unwrap_or(0),
        sec["device_admins"], sec["non_store_apps"].as_array().map(|a| a.len()).unwrap_or(0));
    let recs = optimizer::recommend(&optimizer::Input {
        battery: Some(&ov.battery),
        stats: Some(&st),
        live: &p.live,
        wakefulness: p.wakefulness.as_deref(),
        settings: c::settings_snapshot(s),
        storage: ov.storage.as_ref(),
        non_store_apps: sec["non_store_apps"].as_array().map(|a| a.len()).unwrap_or(0),
        uptime_s: ov.uptime_s,
    });
    println!("optimizer: {} recs", recs.len());
    for r in &recs {
        println!("  [{:?}] {} — {}", r.severity, r.title, r.evidence);
    }
    let nu = c::net_usage(s, 1.0, true);
    println!(
        "net_usage: disponível={} {} pontos, {} apps, rx={} tx={}",
        nu["available"], nu["timeline"].as_array().map_or(0, |a| a.len()), nu["apps"].as_array().map_or(0, |a| a.len()), nu["rx"], nu["tx"]
    );
    let nc = c::net_connections(s);
    println!("net_connections: legível={} {} sockets", nc["readable"], nc["sockets"].as_array().map_or(0, |a| a.len()));
    println!("net_live: {}", c::net_live(s)["ifaces"]);
    println!("total {:.1}s", t.elapsed().as_secs_f64());
}
