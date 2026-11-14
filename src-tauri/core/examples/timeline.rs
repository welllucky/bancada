//! Resumo da linha do tempo de um UID num histórico salvo: `cargo run -p phone-deck-core --example timeline -- history.txt u0a369`
fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let text = std::fs::read_to_string(&a[0]).unwrap();
    let tl = phone_deck_core::apptimeline::parse_app_timeline(&text, &a[1..], 2026);
    let mut by: std::collections::BTreeMap<(String, bool), (usize, i64)> = Default::default();
    for s in &tl.spans {
        let e = by.entry((s.kind.clone(), s.screen_off)).or_default();
        e.0 += 1;
        e.1 += s.end - s.start;
    }
    for ((k, off), (n, ms)) in by {
        println!("{k:10} tela {:9} {n:4}x {:6.1} min", if off { "desligada" } else { "ligada" }, ms as f64 / 60000.0);
    }
    for m in &tl.marks {
        println!("marca {} {} tela_off={}", m.kind, m.tag, m.screen_off);
    }
    println!("{} trechos de tela desligada", tl.screen_off.len());
}
