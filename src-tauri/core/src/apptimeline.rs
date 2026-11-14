//! Linha do tempo de um app a partir de `dumpsys batterystats --history`: quando ele esteve na tela, rodou em
//! segundo plano (tarefas, sincronização, wakelocks) e quando acordou o aparelho (alarme, push de alta
//! prioridade), com os trechos de tela desligada para separar uso real de atividade escondida.

use chrono::{Local, NaiveDateTime, TimeZone};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::LazyLock;

/// Tipos de intervalo, na ordem em que a UI desenha as faixas.
pub const SPAN_KINDS: &[&str] = &["top", "fg", "job", "sync", "wake_lock", "longwake"];
/// Eventos pontuais: `wakeupap` (alarme do app acordou o processador), `tmpwhitelist` (push de alta prioridade
/// liberou o app para rodar).
pub const MARK_KINDS: &[&str] = &["wakeupap", "tmpwhitelist"];

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Span {
    pub kind: String,
    pub start: i64,
    pub end: i64,
    pub tag: String,
    /// Começou com a tela desligada (o app acordou ou manteve o aparelho acordado sem você usar).
    pub screen_off: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Mark {
    pub kind: String,
    pub t: i64,
    pub tag: String,
    pub screen_off: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Timeline {
    pub start: Option<i64>,
    pub end: Option<i64>,
    /// Trechos com a tela desligada `[início, fim]`.
    pub screen_off: Vec<(i64, i64)>,
    pub spans: Vec<Span>,
    pub marks: Vec<Mark>,
}

static LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s+(\d\d-\d\d \d\d:\d\d:\d\d)\.(\d+) (?:\d{3}\b)?(.*)").unwrap());
static EVENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"([+-]?)(\w+)=(u\d+a\d+|\d+):"([^"]*)""#).unwrap());

/// UID numérico → forma usada no histórico (`10369` → `u0a369`).
pub fn uid_token(uid: u32) -> String {
    if uid >= 10_000 { format!("u{}a{}", uid / 100_000, uid % 100_000 - 10_000) } else { uid.to_string() }
}

/// `uids` na forma do histórico (ver [`uid_token`]). `year` completa as datas "MM-DD" (hora local do aparelho).
pub fn parse_app_timeline(text: &str, uids: &[String], year: i32) -> Timeline {
    let mut tl = Timeline::default();
    let mut open: HashMap<(String, String), (i64, bool)> = HashMap::new(); // (tipo, tag) → (início, tela desligada)
    let mut wake_open: Option<(i64, String, bool)> = None; // `-wake_lock` costuma vir sem dono
    let mut screen_on = true;
    let mut off_since: Option<i64> = None;
    let mut last = 0i64;

    for line in text.lines() {
        let Some(c) = LINE.captures(line) else { continue };
        let Ok(nd) = NaiveDateTime::parse_from_str(&format!("{year}-{}", &c[1]), "%Y-%m-%d %H:%M:%S") else { continue };
        let Some(sec) = Local.from_local_datetime(&nd).earliest().map(|d| d.timestamp()) else { continue };
        let ms: i64 = c[2].get(..3).and_then(|s| s.parse().ok()).unwrap_or(0);
        let t = sec * 1000 + ms;
        tl.start.get_or_insert(t);
        last = t;
        let rest = &c[3];
        // Eventos da mesma linha valem para o estado da tela de antes dela (ex.: o push que acendeu a tela).
        let off = !screen_on;

        for tok in rest.split_whitespace() {
            match tok {
                "+screen" if !screen_on => {
                    screen_on = true;
                    if let Some(s) = off_since.take() {
                        tl.screen_off.push((s, t));
                    }
                }
                "-screen" if screen_on => {
                    screen_on = false;
                    off_since = Some(t);
                }
                "-wake_lock" => {
                    if let Some((s, tag, off)) = wake_open.take() {
                        tl.spans.push(Span { kind: "wake_lock".into(), start: s, end: t, tag, screen_off: off });
                    }
                }
                _ => {}
            }
        }

        for e in EVENT.captures_iter(rest) {
            let (sign, kind, uid, tag) = (&e[1], &e[2], &e[3], e[4].to_string());
            let mine = uids.iter().any(|u| u == uid);
            if kind == "wake_lock" {
                // Quem acende o wakelock global: só o primeiro a segurar aparece no histórico.
                match sign {
                    "+" if mine => wake_open = Some((t, tag, off)),
                    "+" => wake_open = None,
                    "-" if mine => {
                        if let Some((s, tag, off)) = wake_open.take() {
                            tl.spans.push(Span { kind: "wake_lock".into(), start: s, end: t, tag, screen_off: off });
                        }
                    }
                    _ => {}
                }
                continue;
            }
            if !mine {
                continue;
            }
            if MARK_KINDS.contains(&kind) && sign != "-" {
                tl.marks.push(Mark { kind: kind.into(), t, tag, screen_off: off });
            } else if SPAN_KINDS.contains(&kind) {
                let key = (kind.to_string(), tag.clone());
                match sign {
                    "+" => {
                        open.entry(key).or_insert((t, off));
                    }
                    "-" => {
                        if let Some((s, off)) = open.remove(&key) {
                            tl.spans.push(Span { kind: kind.into(), start: s, end: t, tag, screen_off: off });
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // O que ainda está aberto vai até a última leitura.
    for ((kind, tag), (s, off)) in open {
        tl.spans.push(Span { kind, start: s, end: last, tag, screen_off: off });
    }
    if let Some((s, tag, off)) = wake_open {
        tl.spans.push(Span { kind: "wake_lock".into(), start: s, end: last, tag, screen_off: off });
    }
    if let Some(s) = off_since {
        tl.screen_off.push((s, last));
    }
    tl.end = tl.start.map(|_| last);
    let order = |k: &str| SPAN_KINDS.iter().position(|x| *x == k).unwrap_or(99);
    tl.spans.sort_by_key(|s| (s.start, order(&s.kind)));
    tl
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_tokens() {
        assert_eq!(uid_token(10369), "u0a369");
        assert_eq!(uid_token(1000), "1000");
        assert_eq!(uid_token(1_010_123), "u10a123");
    }

    #[test]
    fn spans_marks_and_screen() {
        let text = r#"Battery History [Format: 2]:
  11-13 19:00:00.000 RESET:TIME: 2026-11-13-19-00-00-000
  11-13 19:00:00.000 090 status=discharging +running +screen
  11-13 19:00:01.000 090 +top=u0a369:"com.whatsapp"
  11-13 19:00:31.000 090 -top=u0a369:"com.whatsapp" +top=u0a170:"com.sec.android.app.launcher"
  11-13 19:01:00.000 090 -screen
  11-13 19:10:00.000 089 +wake_lock=u0a369:"*job*/com.whatsapp/X" +job=u0a369:"com.whatsapp/X"
  11-13 19:10:05.000 089 wakeupap=u0a369:"*walarm*:com.whatsapp.ALARM"
  11-13 19:10:20.000 089 -job=u0a369:"com.whatsapp/X"
  11-13 19:10:21.000 089 -wake_lock
  11-13 19:11:00.000 089 +wake_lock=u0a100:"outro"
  11-13 19:11:02.000 089 -wake_lock
  11-13 19:20:00.000 089 +tmpwhitelist=u0a369:"push" +screen
  11-13 19:20:10.000 089 -tmpwhitelist=u0a369:"push"
"#;
        let tl = parse_app_timeline(text, &["u0a369".into()], 2026);
        let kinds: Vec<(&str, bool)> = tl.spans.iter().map(|s| (s.kind.as_str(), s.screen_off)).collect();
        assert_eq!(kinds, vec![("top", false), ("job", true), ("wake_lock", true)]);
        assert_eq!(tl.spans[0].end - tl.spans[0].start, 30_000);
        assert_eq!(tl.spans[2].end - tl.spans[2].start, 21_000, "o -wake_lock sem dono fecha o do app");
        assert_eq!(tl.marks.len(), 2);
        assert!(tl.marks[0].kind == "wakeupap" && tl.marks[0].screen_off);
        // `+tmpwhitelist` e `+screen` na mesma linha: o push chegou com a tela ainda desligada.
        assert!(tl.marks[1].kind == "tmpwhitelist" && tl.marks[1].screen_off);
        assert_eq!(tl.screen_off.len(), 1);
        assert_eq!(tl.screen_off[0].1 - tl.screen_off[0].0, 19 * 60_000);
    }
}
