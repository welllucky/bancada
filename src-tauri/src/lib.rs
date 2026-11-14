//! Tauri shell: exposes core collectors/actions as async commands and runs
//! the background history sampler.

use phone_deck_core::{actions::Action, adb, collectors as c, history::Db, optimizer, wireless};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;

struct AppState {
    db: Arc<Mutex<Db>>,
    /// Cache dos ícones extraídos dos APKs.
    apps_dir: std::path::PathBuf,
    /// Uma cópia de APK por vez: evita saturar o cabo e baixar o mesmo APK duas vezes.
    pull_lock: Arc<Mutex<()>>,
}

type R<T> = Result<T, String>;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> R<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())
}

fn to_value<T: serde::Serialize>(v: T) -> R<Value> {
    serde_json::to_value(v).map_err(|e| e.to_string())
}

fn since(days: f64) -> i64 {
    chrono_now() - (days * 86400.0) as i64
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[tauri::command]
async fn list_devices() -> R<Value> {
    blocking(|| match adb::devices() {
        Ok(d) => json!({"ok": true, "devices": d}),
        Err(e) => json!({"ok": false, "error": e.to_string(), "devices": []}),
    })
    .await
}

#[tauri::command]
async fn overview(serial: String) -> R<Value> {
    blocking(move || to_value(c::overview(&serial))).await?
}

#[tauri::command]
async fn battery_stats(serial: String, refresh: bool) -> R<Value> {
    blocking(move || to_value(&*c::battery_stats(&serial, refresh))).await?
}

#[tauri::command]
async fn battery_history(serial: String) -> R<Value> {
    blocking(move || to_value(c::battery_history(&serial))).await?
}

#[tauri::command]
async fn processes(serial: String) -> R<Value> {
    blocking(move || to_value(c::processes(&serial))).await?
}

#[tauri::command]
async fn memory(serial: String) -> R<Value> {
    blocking(move || to_value(c::memory(&serial))).await?
}

#[tauri::command]
async fn apps(serial: String) -> R<Value> {
    blocking(move || to_value(c::apps(&serial))).await?
}

#[tauri::command]
async fn app_detail(serial: String, package: String) -> R<Value> {
    blocking(move || c::app_detail(&serial, &package).map_err(|e| e.to_string())).await?
}

#[tauri::command]
async fn network(serial: String) -> R<Value> {
    blocking(move || c::network(&serial)).await
}

#[tauri::command]
async fn bluetooth(serial: String) -> R<Value> {
    blocking(move || to_value(c::bluetooth(&serial))).await?
}

#[tauri::command]
async fn boot(serial: String) -> R<Value> {
    blocking(move || c::boot(&serial)).await
}

#[tauri::command]
async fn security(serial: String) -> R<Value> {
    blocking(move || c::security(&serial)).await
}

#[tauri::command]
async fn optimizations(serial: String) -> R<Value> {
    blocking(move || {
        let ov = c::overview(&serial);
        let stats = c::battery_stats(&serial, false);
        let procs = c::processes(&serial);
        let sec = c::security(&serial);
        let input = optimizer::Input {
            battery: Some(&ov.battery),
            stats: Some(&stats),
            live: &procs.live,
            wakefulness: procs.wakefulness.as_deref(),
            settings: c::settings_snapshot(&serial),
            storage: ov.storage.as_ref(),
            non_store_apps: sec["non_store_apps"].as_array().map(|a| a.len()).unwrap_or(0),
            uptime_s: ov.uptime_s,
        };
        to_value(optimizer::recommend(&input))
    })
    .await?
}

#[tauri::command]
async fn apply_action(state: tauri::State<'_, AppState>, serial: String, action: Action) -> R<String> {
    let db = state.db.clone();
    blocking(move || {
        let desc = action.describe();
        let res = action.execute(&serial);
        let (ok, out) = match &res {
            Ok(o) => (true, o.clone()),
            Err(e) => (false, e.to_string()),
        };
        if let Ok(db) = db.lock() {
            let _ = db.log_action(&serial, &desc, ok, &out);
        }
        res.map(|o| if o.is_empty() { "ok".into() } else { o }).map_err(|e| e.to_string())
    })
    .await?
}

#[tauri::command]
async fn history(state: tauri::State<'_, AppState>, serial: String, days: f64) -> R<Value> {
    let db = state.db.clone();
    blocking(move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        Ok(json!({
            "samples": db.samples(&serial, since(days)).map_err(|e| e.to_string())?,
            "drain": db.drain(&serial, since(days)).map_err(|e| e.to_string())?,
            "actions": db.actions(Some(&serial), 200).map_err(|e| e.to_string())?,
            "devices": db.devices().map_err(|e| e.to_string())?,
        }))
    })
    .await?
}

/// Every 60 s: battery sample per connected device. Every 30 min: per-app drain.
fn start_sampler(db: Arc<Mutex<Db>>) {
    std::thread::spawn(move || {
        let mut last_drain: std::collections::HashMap<String, Instant> = Default::default();
        loop {
            if let Ok(devs) = adb::devices() {
                for d in devs.into_iter().filter(|d| d.state == "device") {
                    let b = c::battery_now(&d.serial);
                    let wake = phone_deck_core::parse::wakefulness(
                        &adb::shell(&d.serial, &["dumpsys", "power"], Duration::from_secs(20)).unwrap_or_default(),
                    );
                    let due = last_drain.get(&d.serial).is_none_or(|t| t.elapsed() > Duration::from_secs(1800));
                    let stats = due.then(|| c::battery_stats(&d.serial, false));
                    if let Ok(db) = db.lock() {
                        let _ = db.touch_device(&d.serial, &d.model);
                        if b.level.is_some() {
                            let _ = db.add_sample(&d.serial, &b, wake.as_deref());
                        }
                        if let Some(s) = stats {
                            let _ = db.add_drain(&d.serial, &s);
                            last_drain.insert(d.serial.clone(), Instant::now());
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_secs(60));
        }
    });
}

#[tauri::command]
async fn app_meta(state: tauri::State<'_, AppState>, serial: String, package: String) -> R<phone_deck_core::icons::Meta> {
    let (dir, lock) = (state.apps_dir.clone(), state.pull_lock.clone());
    blocking(move || c::app_meta(&serial, &package, &dir, &lock).map_err(|e| e.to_string())).await?
}

#[tauri::command]
async fn app_labels(state: tauri::State<'_, AppState>) -> R<std::collections::HashMap<String, String>> {
    let dir = state.apps_dir.clone();
    blocking(move || Ok(c::app_labels(&dir))).await?
}

#[tauri::command]
async fn net_usage(serial: String, days: f64, refresh: Option<bool>) -> R<Value> {
    blocking(move || c::net_usage(&serial, days, refresh.unwrap_or(false))).await
}

#[tauri::command]
async fn net_connections(serial: String) -> R<Value> {
    blocking(move || c::net_connections(&serial)).await
}

#[tauri::command]
async fn net_live(serial: String) -> R<Value> {
    blocking(move || c::net_live(&serial)).await
}

#[tauri::command]
async fn wifi_services() -> R<Value> {
    blocking(|| wireless::services().map_err(|e| e.to_string()).and_then(to_value)).await?
}

#[tauri::command]
async fn wifi_pair(addr: String, code: String) -> R<String> {
    blocking(move || wireless::pair(&addr, &code).map_err(|e| e.to_string())).await?
}

#[tauri::command]
async fn wifi_connect(addr: String) -> R<String> {
    blocking(move || wireless::connect(&addr).map_err(|e| e.to_string())).await?
}

#[tauri::command]
async fn wifi_disconnect(addr: String) -> R<String> {
    blocking(move || wireless::disconnect(&addr).map_err(|e| e.to_string())).await?
}

/// Liga a depuração por Wi-Fi a partir do cabo (`adb tcpip`). Fica no registro de ações, como as escritas.
#[tauri::command]
async fn wifi_from_usb(state: tauri::State<'_, AppState>, serial: String) -> R<String> {
    let db = state.db.clone();
    blocking(move || {
        let res = wireless::enable_from_usb(&serial);
        if let Ok(db) = db.lock() {
            let (ok, out) = match &res {
                Ok(o) => (true, o.clone()),
                Err(e) => (false, e.to_string()),
            };
            let _ = db.log_action(&serial, &format!("depuração por Wi-Fi (adb tcpip {})", wireless::TCPIP_PORT), ok, &out);
        }
        res.map_err(|e| e.to_string())
    })
    .await?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app data dir");
            let db = Db::open(&dir.join("history.db")).map_err(|e| e.to_string())?;
            let db = Arc::new(Mutex::new(db));
            start_sampler(db.clone());
            let cache = app.path().app_cache_dir().unwrap_or_else(|_| dir.clone());
            // Cache antigo, só de ícones: o catálogo em `apps/` o substitui.
            let _ = std::fs::remove_dir_all(cache.join("icons"));
            let apps_dir = cache.join("apps");
            app.manage(AppState { db, apps_dir, pull_lock: Arc::new(Mutex::new(())) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_devices,
            overview,
            battery_stats,
            battery_history,
            processes,
            memory,
            apps,
            app_detail,
            network,
            bluetooth,
            boot,
            security,
            optimizations,
            apply_action,
            history,
            app_meta,
            app_labels,
            wifi_services,
            wifi_pair,
            wifi_connect,
            wifi_disconnect,
            wifi_from_usb,
            net_usage,
            net_connections,
            net_live
        ])
        .run(tauri::generate_context!())
        .expect("error while running Phone Deck");
}
