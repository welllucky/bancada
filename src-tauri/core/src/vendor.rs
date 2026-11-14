//! Per-manufacturer profile. Android skins expose different extras on top of
//! AOSP (battery health, charge protection, AOD modes, app stores). Instead of
//! assuming a Galaxy, collectors/rules ask the profile whether a capability
//! exists, so unsupported blocks stay hidden and support can be added brand by
//! brand: detect the vendor in `from_props`, then list what it offers in
//! `capabilities`.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Vendor {
    Samsung,
    Google,
    Xiaomi,
    /// Anything not profiled yet: only AOSP behaviour is assumed.
    #[default]
    Other,
}

/// Data or setting that is not part of AOSP and only some vendors provide.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    /// Real battery health % (`mSavedBatteryAsoc`/`Bsoh` in `dumpsys battery`).
    BatteryHealth,
    /// Charge limit setting (`mProtectionThreshold`/`mProtectBatteryMode`).
    BatteryProtection,
    /// `system.aod_mode` / `system.aod_tap_to_show_mode` settings.
    AodTapToShow,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct Profile {
    pub vendor: Vendor,
    /// Vendor skin and version, e.g. "One UI 9.0", "HyperOS OS2.0".
    pub skin: Option<String>,
    pub capabilities: Vec<Capability>,
}

impl Vendor {
    fn capabilities(self) -> &'static [Capability] {
        use Capability::*;
        match self {
            Vendor::Samsung => &[BatteryHealth, BatteryProtection, AodTapToShow],
            Vendor::Google | Vendor::Xiaomi | Vendor::Other => &[],
        }
    }

    /// Store apps of this vendor, for wording ("Play Store/Galaxy Store").
    pub fn store_label(self) -> &'static str {
        match self {
            Vendor::Samsung => "Play Store/Galaxy Store",
            Vendor::Xiaomi => "Play Store/GetApps",
            Vendor::Google | Vendor::Other => "Play Store ou loja do fabricante",
        }
    }
}

impl Profile {
    pub fn new(vendor: Vendor) -> Self {
        Profile { vendor, skin: None, capabilities: vendor.capabilities().to_vec() }
    }

    /// Detect from `getprop` output (see `parse::parse_props`).
    pub fn from_props(p: &HashMap<String, String>) -> Self {
        let g = |k: &str| p.get(k).map(|v| v.trim()).filter(|v| !v.is_empty());
        let maker = g("ro.product.manufacturer").or_else(|| g("ro.product.brand")).unwrap_or("").to_ascii_lowercase();
        let vendor = match maker.as_str() {
            "samsung" => Vendor::Samsung,
            "google" => Vendor::Google,
            "xiaomi" | "redmi" | "poco" => Vendor::Xiaomi,
            _ => Vendor::Other,
        };
        let skin = match vendor {
            Vendor::Samsung => g("ro.build.version.oneui").map(|v| match v.parse::<u32>() {
                Ok(n) => format!("One UI {}.{}", n / 10000, (n / 100) % 100),
                Err(_) => format!("One UI {v}"),
            }),
            Vendor::Xiaomi => g("ro.mi.os.version.name")
                .map(|v| format!("HyperOS {v}"))
                .or_else(|| g("ro.miui.ui.version.name").map(|v| format!("MIUI {v}"))),
            Vendor::Google | Vendor::Other => None,
        };
        Profile { skin, ..Profile::new(vendor) }
    }

    pub fn has(&self, c: Capability) -> bool {
        self.capabilities.contains(&c)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn props(kv: &[(&str, &str)]) -> HashMap<String, String> {
        kv.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn samsung_has_extras() {
        let p = Profile::from_props(&props(&[("ro.product.manufacturer", "samsung"), ("ro.build.version.oneui", "90000")]));
        assert_eq!(p.vendor, Vendor::Samsung);
        assert_eq!(p.skin.as_deref(), Some("One UI 9.0"));
        assert!(p.has(Capability::BatteryProtection));
    }

    #[test]
    fn unknown_vendor_assumes_only_aosp() {
        let p = Profile::from_props(&props(&[("ro.product.manufacturer", "Fairphone")]));
        assert_eq!(p.vendor, Vendor::Other);
        assert!(p.capabilities.is_empty());
        assert_eq!(Profile::from_props(&HashMap::new()).vendor, Vendor::Other);
    }
}
