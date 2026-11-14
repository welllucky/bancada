//! Atualização dentro do app. Tudo pelo lado Rust: a janela não recebe permissão do plugin (`updater:*`),
//! só estes comandos. O pacote baixado é conferido com a chave pública de `plugins.updater.pubkey` antes de
//! instalar; sem chave configurada, o app só informa a versão atual.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Atualização encontrada na última procura, guardada até a pessoa confirmar.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct Info {
    /// Versão instalada.
    current: String,
    /// Versão nova, quando houver.
    available: Option<String>,
    notes: Option<String>,
    date: Option<String>,
    /// Falso quando esta build não tem chave de atualização (build local, por exemplo).
    configured: bool,
}

fn configured<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

#[tauri::command]
pub fn app_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>) -> Result<Info, String> {
    let current = app.package_info().version.to_string();
    if !configured(&app) {
        return Ok(Info { current, available: None, notes: None, date: None, configured: false });
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(friendly)?;
    let info = Info {
        current,
        available: update.as_ref().map(|u| u.version.clone()),
        notes: update.as_ref().and_then(|u| u.body.clone()),
        date: update.as_ref().and_then(|u| u.date).map(|d| d.date().to_string()),
        configured: true,
    };
    *app.state::<Pending>().0.lock().unwrap_or_else(|e| e.into_inner()) = update;
    Ok(info)
}

#[derive(Clone, Serialize)]
struct Progress {
    done: usize,
    total: Option<u64>,
}

/// Baixa, confere a assinatura, instala e reinicia. O progresso sai no evento `update-progress`.
#[tauri::command]
pub async fn update_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let update = app.state::<Pending>().0.lock().unwrap_or_else(|e| e.into_inner()).take();
    let Some(update) = update else { return Err("Procure a atualização de novo antes de instalar.".into()) };
    let mut done = 0usize;
    let ev = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk;
                let _ = ev.emit("update-progress", Progress { done, total });
            },
            || {},
        )
        .await
        .map_err(friendly)?;
    app.restart();
}

fn friendly(e: tauri_plugin_updater::Error) -> String {
    let s = e.to_string();
    if s.contains("signature") || s.contains("Signature") {
        format!("O pacote baixado não tem a assinatura esperada e não foi instalado. ({s})")
    } else if s.contains("error sending request") || s.contains("dns") || s.contains("connect") {
        "Sem conexão com o servidor de atualizações.".into()
    } else {
        s
    }
}
