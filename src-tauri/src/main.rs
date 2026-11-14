// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    linux_env_workarounds();
    phone_deck_lib::run()
}

/// WebKitGTK/GTK workarounds, applied before any thread is spawned. A value
/// already set by the user always wins.
#[cfg(target_os = "linux")]
fn linux_env_workarounds() {
    let mut vars = vec![
        // GTK loads header-bar icons via glycin, which deletes a temp file
        // through GIO; with the default GVFS backend that does a *synchronous*
        // D-Bus call to gvfsd. If gvfsd-metadata is stuck, the UI thread
        // blocks ~25 s per icon: the window never shows or is "not
        // responding". The app needs no GVFS features, so use the local VFS.
        ("GIO_USE_VFS", "local"),
    ];
    // Proprietary NVIDIA driver + WebKitGTK DMA-BUF renderer is known to give
    // blank/invisible windows (notably on Wayland).
    if std::path::Path::new("/proc/driver/nvidia").exists() {
        vars.push(("WEBKIT_DISABLE_DMABUF_RENDERER", "1"));
    }
    for (k, v) in vars {
        if std::env::var_os(k).is_none() {
            std::env::set_var(k, v);
        }
    }
}
