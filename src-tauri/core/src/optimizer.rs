//! Rule engine: turns collected data into prioritised recommendations, each
//! optionally carrying a whitelisted `Action` the UI can apply.

use crate::actions::Action;
use crate::parse::{BatteryNow, BatteryStats, LiveProc, Storage};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Critical,
    Warn,
    Info,
}

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub detail: String,
    pub evidence: String,
    pub action: Option<Action>,
    pub action_label: Option<String>,
    /// A correção já está aplicada no aparelho; a evidência é histórica e some sozinha com o tempo.
    pub resolved: bool,
}

#[derive(Default)]
pub struct Input<'a> {
    pub battery: Option<&'a BatteryNow>,
    pub stats: Option<&'a BatteryStats>,
    pub live: &'a [LiveProc],
    pub wakefulness: Option<&'a str>,
    pub settings: HashMap<String, Option<String>>,
    pub storage: Option<&'a Storage>,
    pub non_store_apps: usize,
    pub uptime_s: Option<f64>,
}

fn set(ns: &str, k: &str, v: &str) -> Option<Action> {
    Some(Action::SetSetting { namespace: ns.into(), key: k.into(), value: v.into() })
}

fn mins(s: f64) -> String {
    if s >= 3600.0 {
        format!("{}h{:02}m", (s / 3600.0) as i64, ((s % 3600.0) / 60.0) as i64)
    } else {
        format!("{} min", (s / 60.0).round() as i64)
    }
}

/// Package name owning a `top` row (strip ":process" suffix and args).
fn proc_pkg(name: &str) -> Option<String> {
    let first = name.split_whitespace().next()?;
    let base = first.split(':').next()?;
    crate::adb::PKG_RE.is_match(base).then(|| base.to_string())
}

pub fn recommend(i: &Input) -> Vec<Recommendation> {
    let mut r: Vec<Recommendation> = Vec::new();
    let mut push = |id: &str, sev, title: &str, detail: String, evidence: String, action: Option<Action>, label: Option<&str>| {
        r.push(Recommendation {
            id: id.into(),
            severity: sev,
            title: title.into(),
            detail,
            evidence,
            action,
            action_label: label.map(String::from),
            resolved: false,
        })
    };
    let s = |k: &str| i.settings.get(k).cloned().flatten();

    // --- live CPU while the screen is off (e.g. WhatsApp Worker at 50% while Dozing)
    let asleep = i.wakefulness.is_some_and(|w| w != "Awake");
    if asleep {
        let mut seen = std::collections::HashSet::new();
        for p in i.live.iter().filter(|p| p.cpu >= 20.0) {
            let Some(pkg) = proc_pkg(&p.name) else { continue };
            if !seen.insert(pkg.clone()) || pkg == "com.android.shell" {
                continue;
            }
            push(
                &format!("cpu-asleep-{pkg}"),
                Severity::Critical,
                &format!("{pkg} usando CPU com a tela desligada"),
                "Com o aparelho em repouso, nenhum app deveria manter a CPU ocupada. Isso drena bateria e aquece. Forçar a parada interrompe o loop; se voltar, restrinja o segundo plano do app.".into(),
                format!("{:.0}% de CPU (PID {}) com estado {}", p.cpu, p.pid, i.wakefulness.unwrap_or("?")),
                Some(Action::ForceStop { package: pkg.clone() }),
                Some("Forçar parada"),
            );
        }
    }

    // --- battery stats rules
    if let Some(st) = i.stats {
        let sm = &st.summary;
        if let Some(ma) = sm.screen_off_ma {
            if ma > 60.0 && sm.screen_off_s > 1800.0 {
                push(
                    "screen-off-drain",
                    if ma > 120.0 { Severity::Critical } else { Severity::Warn },
                    "Consumo alto com a tela desligada",
                    "Em repouso, um aparelho saudável consome 15–40 mA. Veja em Diagnóstico › Bateria o que mantém o aparelho acordado para achar o responsável.".into(),
                    format!("{ma:.0} mA médio em {} de tela desligada ({:.0} mAh)", mins(sm.screen_off_s), sm.screen_off_mah.unwrap_or(0.0)),
                    None,
                    None,
                );
            }
        }
        if sm.deep_doze_mah == Some(0.0) && sm.screen_off_s > 3.0 * 3600.0 {
            push(
                "no-deep-doze",
                Severity::Warn,
                "Aparelho nunca entrou em Deep Doze",
                "O modo de sono profundo exige o aparelho parado com a tela desligada por ~30 min. Se ele nunca entra, algo o mantém acordado (movimento constante, wakelocks, sensores).".into(),
                format!("0 mAh em deep doze após {} de tela desligada", mins(sm.screen_off_s)),
                None,
                None,
            );
        }
        for (idx, w) in st.wakelocks.iter().enumerate().filter(|(_, w)| w.seconds > 15.0 * 60.0) {
            let who = w.who.as_ref();
            let pkg = who.and_then(|u| u.packages.first().cloned()).filter(|p| !p.starts_with("android") && who.is_some_and(|u| u.uid.starts_with('u')));
            push(
                &format!("wakelock-{}-{idx}", who.map(|u| u.uid.as_str()).unwrap_or("?")),
                if w.seconds > 45.0 * 60.0 { Severity::Critical } else { Severity::Warn },
                &format!("{} mantém o aparelho acordado", who.map(|u| u.label.as_str()).unwrap_or("Processo")),
                "Wakelocks parciais impedem a CPU de dormir. Se for um app, restringir o segundo plano costuma resolver sem perder notificações push.".into(),
                format!("{} em {} vezes desde a última carga — {}", mins(w.seconds), w.count, w.name.chars().take(90).collect::<String>()),
                pkg.clone().map(|p| Action::SetBackground { package: p, mode: "ignore".into() }),
                pkg.map(|_| "Restringir segundo plano"),
            );
        }
        if let Some(c) = sm.connectivity_changes {
            if sm.time_on_battery_s > 3600.0 && c as f64 / (sm.time_on_battery_s / 3600.0) > 120.0 {
                push(
                    "connectivity-churn",
                    Severity::Info,
                    "Muitas mudanças de conectividade",
                    "Eventos de rede frequentes acordam apps que escutam mudanças de conexão. Verifique roteador, Wi-Fi instável ou troca automática para dados móveis.".into(),
                    format!("{c} eventos em {}", mins(sm.time_on_battery_s)),
                    None,
                    None,
                );
            }
        }
    }

    // --- battery hardware
    if let Some(b) = i.battery {
        if let Some(a) = b.asoc {
            if a < 80 {
                push("battery-wear", Severity::Warn, "Bateria com desgaste", "Abaixo de 80% de capacidade a autonomia cai bastante; considere a troca na assistência.".into(), format!("ASOC {a}%"), None, None);
            }
        }
        if let Some(t) = b.temp_c {
            if t > 42.0 {
                push("battery-hot", Severity::Critical, "Bateria quente", "Temperatura alta acelera o desgaste. Tire a capinha, evite carregar enquanto joga e veja os processos com CPU alta.".into(), format!("{t:.1} °C"), None, None);
            }
        }
        if b.protect_mode == Some(0) || b.protect_threshold.is_none() {
            push("battery-protect", Severity::Info, "Ative a proteção de bateria", "Em Configurações → Bateria → Proteção da bateria, limitar a carga a 80–85% prolonga a vida útil.".into(), "proteção não detectada".into(), None, None);
        }
    }

    // --- settings
    if let Some(t) = s("system.screen_off_timeout").and_then(|v| v.parse::<i64>().ok()) {
        if t > 60_000 {
            push("screen-timeout", Severity::Warn, "Tempo de tela longo", "A tela acesa é o maior consumidor. 30 s a 1 min é suficiente para a maioria dos usos.".into(), format!("{} s", t / 1000), set("system", "screen_off_timeout", "60000"), Some("Mudar para 1 min"));
        }
    }
    let aod_on = s("system.aod_mode").as_deref() == Some("1") || s("secure.doze_always_on").as_deref() == Some("1");
    if aod_on && s("system.aod_tap_to_show_mode").as_deref() != Some("1") {
        push("aod", Severity::Info, "Always On Display sempre ligado", "O AOD contínuo consome ~3–5% por dia. Use 'Tocar para mostrar' ou um horário.".into(), "AOD ativo o tempo todo".into(), set("system", "aod_tap_to_show_mode", "1"), Some("Tocar para mostrar"));
    }
    if s("global.wifi_scan_always_enabled").as_deref() == Some("1") {
        push("wifi-scan", Severity::Info, "Busca de Wi-Fi sempre ativa", "Mesmo com o Wi-Fi desligado o rádio continua procurando redes para melhorar a localização.".into(), "wifi_scan_always_enabled=1".into(), set("global", "wifi_scan_always_enabled", "0"), Some("Desativar"));
    }
    if s("global.ble_scan_always_enabled").as_deref() == Some("1") {
        push("ble-scan", Severity::Info, "Busca de Bluetooth sempre ativa", "Mesmo com o Bluetooth desligado o rádio continua escaneando dispositivos próximos.".into(), "ble_scan_always_enabled=1".into(), set("global", "ble_scan_always_enabled", "0"), Some("Desativar"));
    }
    if s("global.mobile_data_always_on").as_deref() == Some("1") {
        push("mobile-always-on", Severity::Info, "Dados móveis sempre ativos", "Mantém o rádio celular ligado mesmo no Wi-Fi.".into(), "mobile_data_always_on=1".into(), set("global", "mobile_data_always_on", "0"), Some("Desativar"));
    }
    let anim = s("global.window_animation_scale");
    if anim.as_deref().is_none_or(|v| v == "1" || v == "1.0") && s("global.development_settings_enabled").as_deref() == Some("1") {
        push("animations", Severity::Info, "Animações em 1x", "Reduzir para 0,5x deixa o aparelho mais ágil (escala de janela; aplique também transição e duração nas Opções do desenvolvedor).".into(), format!("window_animation_scale={}", anim.unwrap_or_else(|| "1".into())), set("global", "window_animation_scale", "0.5"), Some("Usar 0,5x"));
    }
    if s("global.adb_enabled").as_deref() == Some("1") {
        push("adb-on", Severity::Info, "Depuração USB ativada", "Necessária para este app, mas desative quando não estiver usando: com ela ligada, um computador autorizado tem amplo acesso ao aparelho.".into(), "adb_enabled=1".into(), None, None);
    }

    // --- storage / maintenance
    if let Some(st) = i.storage {
        if st.pct > 85.0 {
            push("storage-full", Severity::Warn, "Armazenamento quase cheio", "Com pouco espaço o sistema fica lento e atualizações falham.".into(), format!("{:.0}% usado", st.pct), Some(Action::TrimCaches), Some("Limpar caches"));
        }
    }
    push("trim-caches", Severity::Info, "Limpar cache dos apps", "Remove apenas arquivos temporários de todos os apps (não apaga conversas, fotos ou logins). Útil após atualizações do sistema.".into(), "manutenção".into(), Some(Action::TrimCaches), Some("Limpar caches"));
    if i.uptime_s.is_some_and(|u| u < 3.0 * 86400.0) {
        push("dexopt", Severity::Info, "Concluir otimização pós-atualização", "Após atualizar ou reiniciar, o Android recompila apps aos poucos. Rodar agora (de preferência carregando) evita esse gasto ao longo dos dias.".into(), "reinício recente".into(), Some(Action::BgDexopt), Some("Otimizar agora"));
    }
    if i.non_store_apps > 0 {
        push("non-store", Severity::Info, "Apps fora da loja", "Revise os apps instalados fora da Play Store/Galaxy Store em Aparelho › Segurança. Apps restaurados do Samsung Cloud também aparecem aqui.".into(), format!("{} apps", i.non_store_apps), None, None);
    }

    r.sort_by_key(|x| x.severity);
    r
}

/// Apps cujo "Restringir segundo plano" a recomendação sugere, para conferir o estado atual no aparelho.
pub fn background_targets(recs: &[Recommendation]) -> Vec<String> {
    let mut v: Vec<String> = recs
        .iter()
        .filter_map(|r| match &r.action {
            Some(Action::SetBackground { package, mode }) if mode == "ignore" => Some(package.clone()),
            _ => None,
        })
        .collect();
    v.sort();
    v.dedup();
    v
}

/// Marca como resolvidas as recomendações cuja correção já foi aplicada. Os números de bateria são
/// acumulados desde a última carga, então o problema continuaria aparecendo mesmo depois da correção.
pub fn mark_resolved(recs: &mut [Recommendation], restricted_bg: &std::collections::HashSet<String>) {
    for r in recs.iter_mut() {
        if let Some(Action::SetBackground { package, mode }) = &r.action {
            if mode == "ignore" && restricted_bg.contains(package) {
                r.resolved = true;
                r.severity = Severity::Info;
                r.detail = "O segundo plano deste app já está restrito. O número abaixo é acumulado desde a última carga completa e zera na próxima.".into();
                r.action = None;
                r.action_label = None;
            }
        }
    }
    // Resolvidas vão para o fim, depois de tudo que ainda pede ação.
    recs.sort_by_key(|r| r.resolved);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proc(name: &str, cpu: f64) -> LiveProc {
        LiveProc { pid: "1".into(), user: "u0_a1".into(), cpu, mem: 0.0, res: "".into(), state: "S".into(), time: "".into(), name: name.into() }
    }

    #[test]
    fn restricted_app_marks_wakelock_rec_resolved() {
        let rec = |pkg: &str| Recommendation {
            id: format!("wakelock-{pkg}"),
            severity: Severity::Critical,
            title: "t".into(),
            detail: "d".into(),
            evidence: "e".into(),
            action: Some(Action::SetBackground { package: pkg.into(), mode: "ignore".into() }),
            action_label: Some("Restringir segundo plano".into()),
            resolved: false,
        };
        let mut recs = vec![rec("com.whatsapp"), rec("com.spotify.music")];
        assert_eq!(background_targets(&recs), vec!["com.spotify.music".to_string(), "com.whatsapp".to_string()]);
        let restricted: std::collections::HashSet<String> = ["com.whatsapp".to_string()].into();
        mark_resolved(&mut recs, &restricted);
        assert!(!recs[0].resolved && recs[0].action.is_some(), "o que não foi corrigido continua pedindo ação, primeiro");
        assert!(recs[1].resolved && recs[1].action.is_none() && recs[1].severity == Severity::Info);
    }

    #[test]
    fn flags_cpu_while_dozing() {
        let live = vec![proc("com.whatsapp", 51.7), proc("system_server", 30.0)];
        let i = Input { live: &live, wakefulness: Some("Dozing"), ..Default::default() };
        let r = recommend(&i);
        let w = r.iter().find(|x| x.id == "cpu-asleep-com.whatsapp").expect("whatsapp flagged");
        assert_eq!(w.severity, Severity::Critical);
        assert_eq!(w.action, Some(Action::ForceStop { package: "com.whatsapp".into() }));
        assert!(!r.iter().any(|x| x.id.contains("system_server")));
    }

    #[test]
    fn no_cpu_flag_when_awake() {
        let live = vec![proc("com.whatsapp", 80.0)];
        let i = Input { live: &live, wakefulness: Some("Awake"), ..Default::default() };
        assert!(!recommend(&i).iter().any(|x| x.id.starts_with("cpu-asleep")));
    }

    #[test]
    fn settings_rules_carry_valid_actions() {
        let mut settings = HashMap::new();
        settings.insert("system.screen_off_timeout".into(), Some("300000".into()));
        settings.insert("global.wifi_scan_always_enabled".into(), Some("1".into()));
        settings.insert("global.ble_scan_always_enabled".into(), Some("1".into()));
        settings.insert("system.aod_mode".into(), Some("1".into()));
        settings.insert("system.aod_tap_to_show_mode".into(), Some("0".into()));
        let i = Input { settings, ..Default::default() };
        let r = recommend(&i);
        for id in ["screen-timeout", "wifi-scan", "ble-scan", "aod"] {
            let rec = r.iter().find(|x| x.id == id).unwrap_or_else(|| panic!("{id}"));
            rec.action.as_ref().unwrap().to_tokens().expect("action passes whitelist");
        }
    }
}
