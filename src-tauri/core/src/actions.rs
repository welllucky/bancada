//! Write paths. ONLY the actions enumerated here can change the phone, and
//! each one is validated against an explicit whitelist before an adb command
//! is built. There is deliberately no generic "run shell" action and no
//! `pm clear` (it wipes app data).

use crate::adb::{self, AdbError, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Action {
    SetSetting { namespace: String, key: String, value: String },
    ForceStop { package: String },
    SetStandbyBucket { package: String, bucket: String },
    SetBackground { package: String, mode: String },
    TrimCaches,
    BgDexopt,
    Reboot,
    UninstallUserApp { package: String },
}

/// (namespace, key, allowed values)
pub const SETTINGS_WHITELIST: &[(&str, &str, &[&str])] = &[
    ("system", "screen_off_timeout", &["15000", "30000", "60000", "120000", "300000", "600000"]),
    ("global", "wifi_scan_always_enabled", &["0", "1"]),
    ("global", "ble_scan_always_enabled", &["0", "1"]),
    ("system", "aod_tap_to_show_mode", &["0", "1"]),
    ("global", "window_animation_scale", &["0", "0.5", "1"]),
    ("global", "transition_animation_scale", &["0", "0.5", "1"]),
    ("global", "animator_duration_scale", &["0", "0.5", "1"]),
    ("global", "mobile_data_always_on", &["0", "1"]),
];

const BUCKETS: &[&str] = &["active", "working_set", "frequent", "rare", "restricted"];

impl Action {
    pub fn describe(&self) -> String {
        match self {
            Action::SetSetting { namespace, key, value } => format!("settings put {namespace} {key} {value}"),
            Action::ForceStop { package } => format!("forçar parada de {package}"),
            Action::SetStandbyBucket { package, bucket } => format!("bucket de {package} → {bucket}"),
            Action::SetBackground { package, mode } => format!("segundo plano de {package} → {mode}"),
            Action::TrimCaches => "limpar cache de todos os apps".into(),
            Action::BgDexopt => "otimizar (dexopt) apps".into(),
            Action::Reboot => "reiniciar".into(),
            Action::UninstallUserApp { package } => format!("desinstalar {package} (usuário 0)"),
        }
    }

    /// Validate and turn into `adb shell` tokens. Pure — no I/O.
    pub fn to_tokens(&self) -> Result<Vec<String>> {
        let v = |s: &[&str]| Ok(s.iter().map(|x| x.to_string()).collect());
        match self {
            Action::SetSetting { namespace, key, value } => {
                let ok = SETTINGS_WHITELIST
                    .iter()
                    .any(|(ns, k, vals)| ns == namespace && k == key && vals.contains(&value.as_str()));
                if !ok {
                    return Err(AdbError(format!("configuração não permitida: {namespace}.{key}={value}")));
                }
                v(&["settings", "put", namespace, key, value])
            }
            Action::ForceStop { package } => v(&["am", "force-stop", adb::valid_pkg(package)?]),
            Action::SetStandbyBucket { package, bucket } => {
                if !BUCKETS.contains(&bucket.as_str()) {
                    return Err(AdbError(format!("bucket inválido: {bucket}")));
                }
                v(&["am", "set-standby-bucket", adb::valid_pkg(package)?, bucket])
            }
            Action::SetBackground { package, mode } => {
                if mode != "allow" && mode != "ignore" {
                    return Err(AdbError(format!("modo inválido: {mode}")));
                }
                v(&["cmd", "appops", "set", adb::valid_pkg(package)?, "RUN_ANY_IN_BACKGROUND", mode])
            }
            Action::TrimCaches => v(&["pm", "trim-caches", "999G"]),
            Action::BgDexopt => v(&["cmd", "package", "bg-dexopt-job"]),
            Action::Reboot => v(&["reboot"]),
            Action::UninstallUserApp { package } => v(&["pm", "uninstall", "--user", "0", adb::valid_pkg(package)?]),
        }
    }

    pub fn execute(&self, serial: &str) -> Result<String> {
        let tokens = self.to_tokens()?;
        if let Action::UninstallUserApp { package } = self {
            let third = adb::shell(serial, &["pm", "list", "packages", "--user", "0", "-3"], Duration::from_secs(30))?;
            if !third.lines().any(|l| l.trim() == format!("package:{package}")) {
                return Err(AdbError(format!("{package} não é um app de usuário; desinstalação bloqueada")));
            }
        }
        let refs: Vec<&str> = tokens.iter().map(String::as_str).collect();
        let timeout = if matches!(self, Action::BgDexopt) { Duration::from_secs(600) } else { Duration::from_secs(60) };
        let out = adb::shell(serial, &refs, timeout)?;
        Ok(out.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelist_enforced() {
        let ok = Action::SetSetting { namespace: "system".into(), key: "screen_off_timeout".into(), value: "60000".into() };
        assert_eq!(ok.to_tokens().unwrap(), vec!["settings", "put", "system", "screen_off_timeout", "60000"]);
        let bad_val = Action::SetSetting { namespace: "system".into(), key: "screen_off_timeout".into(), value: "1".into() };
        assert!(bad_val.to_tokens().is_err());
        let bad_key = Action::SetSetting { namespace: "global".into(), key: "adb_enabled".into(), value: "0".into() };
        assert!(bad_key.to_tokens().is_err());
    }

    #[test]
    fn package_and_enum_validation() {
        assert!(Action::ForceStop { package: "com.whatsapp".into() }.to_tokens().is_ok());
        assert!(Action::ForceStop { package: "com.x;reboot".into() }.to_tokens().is_err());
        assert!(Action::SetStandbyBucket { package: "com.a.b".into(), bucket: "never".into() }.to_tokens().is_err());
        assert!(Action::SetBackground { package: "com.a.b".into(), mode: "deny".into() }.to_tokens().is_err());
    }

    #[test]
    fn json_shape() {
        let a: Action = serde_json::from_str(r#"{"kind":"force_stop","package":"com.whatsapp"}"#).unwrap();
        assert_eq!(a, Action::ForceStop { package: "com.whatsapp".into() });
        assert!(serde_json::from_str::<Action>(r#"{"kind":"shell","cmd":"rm -rf /"}"#).is_err());
    }
}
