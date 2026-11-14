//! Extrai nome e ícone de APKs locais e grava uma página HTML com o resultado, para conferência visual.
//! Uso: `cargo run -p phone-deck-core --example icon -- saida.html app1.apk app2.apk …`
use std::path::Path;

fn main() {
    let mut args = std::env::args().skip(1);
    let out = args.next().expect("uso: icon <saida.html> <apk>…");
    let mut html = String::from("<!doctype html><body style='background:#222;color:#eee;font:14px sans-serif;display:flex;gap:24px;flex-wrap:wrap'>");
    for apk in args {
        let t = std::time::Instant::now();
        let meta = phone_deck_core::icons::inspect(Path::new(&apk));
        let (icon, label) = (meta.icon, meta.label.unwrap_or_else(|| "(sem nome)".into()));
        let name = Path::new(&apk).file_name().unwrap().to_string_lossy().to_string();
        let kind = icon.as_deref().map(|u| &u[5..u.find(';').unwrap_or(5)]).unwrap_or("nenhum").to_string();
        eprintln!("{name}: «{label}» {kind} {} bytes em {:?}", icon.as_ref().map_or(0, |u| u.len()), t.elapsed());
        html.push_str(&format!(
            "<figure style='text-align:center'><img src='{}' width=96 height=96 style='background:#555'><figcaption>{label}<br>{name} · {kind}</figcaption></figure>",
            icon.unwrap_or_default()
        ));
    }
    std::fs::write(out, html).unwrap();
}
