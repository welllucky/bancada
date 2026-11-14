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
    let update = match app.updater().map_err(|e| e.to_string())?.check().await {
        Ok(u) => u,
        // Sem latest.json publicado (nenhuma release com atualizador ainda) ou sem pacote para esta
        // plataforma: não é falha, só não há atualização.
        Err(tauri_plugin_updater::Error::ReleaseNotFound)
        | Err(tauri_plugin_updater::Error::TargetNotFound(_))
        | Err(tauri_plugin_updater::Error::TargetsNotFound(_)) => None,
        Err(e) => return Err(friendly(e)),
    };
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

/// Mensagem em pt-BR para a pessoa; o texto original vai só para o log.
fn friendly(e: tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error as E;
    let s = e.to_string();
    eprintln!("atualização: {s}");
    match e {
        E::Minisign(_) | E::Base64(_) | E::SignatureUtf8(_) => {
            "O pacote baixado não tem a assinatura esperada e não foi instalado.".into()
        }
        E::Reqwest(ref r) if r.is_timeout() => "O servidor de atualizações demorou demais para responder.".into(),
        E::Reqwest(ref r) if r.is_connect() || r.is_request() => "Sem conexão com o servidor de atualizações.".into(),
        E::Reqwest(_) | E::Network(_) => "A conexão caiu durante o download da atualização.".into(),
        E::Serialization(_) | E::ReleaseNotFound => "O servidor de atualizações respondeu algo inesperado.".into(),
        E::Io(_) => "Não foi possível gravar a atualização no disco.".into(),
        _ if s.contains("signature") || s.contains("Signature") => {
            "O pacote baixado não tem a assinatura esperada e não foi instalado.".into()
        }
        _ => "Não foi possível instalar a atualização.".into(),
    }
}
