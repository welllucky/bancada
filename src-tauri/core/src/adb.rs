//! Safe wrapper around the `adb` binary.
//!
//! * Commands are always built from an argument vector — no host shell.
//! * Tokens forwarded to `adb shell` are rejected if they contain device-side
//!   shell metacharacters, so a crafted value can't inject commands.

use regex::Regex;
use serde::Serialize;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::LazyLock;
use std::time::Duration;
use wait_timeout::ChildExt;

pub static PKG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$").unwrap());
static BAD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"[;&|`$<>\\\n'"()*?{}\[\]~#!]"#).unwrap());
static SERIAL_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9._:\-]{1,64}$").unwrap());

#[derive(Debug)]
pub struct AdbError(pub String);

impl std::fmt::Display for AdbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for AdbError {}

pub type Result<T> = std::result::Result<T, AdbError>;

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// Locate adb: $ADB, PATH, then the default Android SDK locations per OS.
pub fn adb_path() -> Result<PathBuf> {
    let exe = if cfg!(windows) { "adb.exe" } else { "adb" };
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Some(p) = std::env::var_os("ADB") {
        cands.push(PathBuf::from(p));
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            cands.push(dir.join(exe));
        }
    }
    for var in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Some(p) = std::env::var_os(var) {
            cands.push(PathBuf::from(p).join("platform-tools").join(exe));
        }
    }
    if let Some(h) = home() {
        cands.push(h.join("Android/Sdk/platform-tools").join(exe));
        cands.push(h.join("Library/Android/sdk/platform-tools").join(exe));
    }
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        cands.push(PathBuf::from(l).join("Android\\Sdk\\platform-tools").join(exe));
    }
    for c in ["/opt/homebrew/bin/adb", "/usr/local/bin/adb", "/usr/bin/adb"] {
        cands.push(PathBuf::from(c));
    }
    cands
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| AdbError("adb não encontrado. Instale o Android platform-tools ou defina a variável ADB.".into()))
}

/// Run adb with the given args, optionally targeting a serial.
pub fn run(args: &[&str], serial: Option<&str>, timeout: Duration) -> Result<String> {
    let mut cmd = Command::new(adb_path()?);
    if let Some(s) = serial {
        if !SERIAL_RE.is_match(s) {
            return Err(AdbError(format!("serial inválido: {s}")));
        }
        cmd.args(["-s", s]);
    }
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| AdbError(format!("falha ao executar adb: {e}")))?;
    let mut out = child.stdout.take().unwrap();
    let mut err = child.stderr.take().unwrap();
    let t_out = std::thread::spawn(move || {
        let mut v = Vec::new();
        let _ = out.read_to_end(&mut v);
        v
    });
    let t_err = std::thread::spawn(move || {
        let mut v = Vec::new();
        let _ = err.read_to_end(&mut v);
        v
    });
    let status = match child.wait_timeout(timeout).map_err(|e| AdbError(e.to_string()))? {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AdbError(format!("timeout: adb {}", args.iter().take(4).cloned().collect::<Vec<_>>().join(" "))));
        }
    };
    let stdout = String::from_utf8_lossy(&t_out.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&t_err.join().unwrap_or_default()).into_owned();
    if !status.success() && stdout.trim().is_empty() {
        let msg = stderr.trim();
        return Err(AdbError(if msg.is_empty() { format!("adb falhou ({status})") } else { msg.to_string() }));
    }
    Ok(stdout)
}

pub fn check_tokens(tokens: &[&str]) -> Result<()> {
    for t in tokens {
        if BAD.is_match(t) {
            return Err(AdbError(format!("token inválido: {t:?}")));
        }
    }
    Ok(())
}

/// `adb shell <tokens…>` with metacharacter validation.
pub fn shell(serial: &str, tokens: &[&str], timeout: Duration) -> Result<String> {
    check_tokens(tokens)?;
    let mut args = vec!["shell"];
    args.extend_from_slice(tokens);
    run(&args, Some(serial), timeout)
}

pub fn valid_pkg(pkg: &str) -> Result<&str> {
    if PKG_RE.is_match(pkg) {
        Ok(pkg)
    } else {
        Err(AdbError(format!("pacote inválido: {pkg:?}")))
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Device {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub transport: String,
}

pub fn parse_devices(out: &str) -> Vec<Device> {
    out.lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                return None;
            }
            let find = |pfx: &str| parts.iter().find_map(|p| p.strip_prefix(pfx)).unwrap_or("").to_string();
            Some(Device {
                serial: parts[0].into(),
                state: parts[1].into(),
                model: find("model:").replace('_', "-"),
                transport: find("usb:"),
            })
        })
        .collect()
}

pub fn devices() -> Result<Vec<Device>> {
    Ok(parse_devices(&run(&["devices", "-l"], None, Duration::from_secs(10))?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_metachars() {
        assert!(check_tokens(&["settings", "get", "global", "x"]).is_ok());
        assert!(check_tokens(&["pm", "clear;reboot"]).is_err());
        assert!(check_tokens(&["$(id)"]).is_err());
        assert!(check_tokens(&["a|b"]).is_err());
    }

    #[test]
    fn pkg_validation() {
        assert!(valid_pkg("com.whatsapp").is_ok());
        assert!(valid_pkg("org.chromium.webapk.a807bc77855b2feb9_v2").is_ok());
        assert!(valid_pkg("whatsapp").is_err());
        assert!(valid_pkg("com.x;rm").is_err());
    }

    #[test]
    fn devices_parse() {
        let d = parse_devices("List of devices attached\nSERIAL0001             device usb:3-2 product:pa3qxxx model:SM_S938B device:pa3q transport_id:1\nABC unauthorized usb:1-1 transport_id:2\n\n");
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].model, "SM-S938B");
        assert_eq!(d[1].state, "unauthorized");
    }
}
