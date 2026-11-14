//! Depuração por Wi-Fi: descoberta (mDNS), pareamento por código (Android 11+), conexão e o modo
//! `adb tcpip` ligado a partir do cabo. Endereços e códigos são validados antes de chegar ao `adb`.

use crate::adb::{self, AdbError, Result};
use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;
use std::time::Duration;

const T: Duration = Duration::from_secs(20);
/// Porta usada pelo modo `adb tcpip`, fixa.
pub const TCPIP_PORT: u16 = 5555;

static ADDR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$").unwrap());
static CODE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d{6}$").unwrap());
static INET_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"inet (\d{1,3}(?:\.\d{1,3}){3})/").unwrap());

/// `IPv4:porta`, com octetos e porta no intervalo certo.
pub fn valid_addr(a: &str) -> Result<&str> {
    let ok = ADDR_RE.captures(a).is_some_and(|c| {
        (1..=4).all(|i| c[i].parse::<u16>().is_ok_and(|n| n <= 255)) && c[5].parse::<u32>().is_ok_and(|p| (1..=65535).contains(&p))
    });
    if ok { Ok(a) } else { Err(AdbError(format!("endereço inválido: {a:?} (use IP:porta, ex.: 192.168.0.10:37123)"))) }
}

pub fn valid_code(c: &str) -> Result<&str> {
    if CODE_RE.is_match(c) { Ok(c) } else { Err(AdbError("o código de pareamento tem 6 dígitos".into())) }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MdnsService {
    /// Nome anunciado (`adb-R5CX…-AbCdEf`).
    pub name: String,
    /// `pairing` (tela "Parear com código") ou `connect` (depuração por Wi-Fi já pareada).
    pub kind: String,
    pub addr: String,
}

/// Saída de `adb mdns services`: `nome\t_adb-tls-pairing._tcp\t192.168.0.10:37123`.
pub fn parse_mdns(out: &str) -> Vec<MdnsService> {
    out.lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            let (name, svc, addr) = (it.next()?, it.next()?, it.next()?);
            let kind = if svc.starts_with("_adb-tls-pairing") {
                "pairing"
            } else if svc.starts_with("_adb-tls-connect") || svc.starts_with("_adb._tcp") {
                "connect"
            } else {
                return None;
            };
            valid_addr(addr).ok()?;
            Some(MdnsService { name: name.to_string(), kind: kind.into(), addr: addr.to_string() })
        })
        .collect()
}

pub fn services() -> Result<Vec<MdnsService>> {
    Ok(parse_mdns(&adb::run(&["mdns", "services"], None, T)?))
}

/// `adb pair IP:porta código` (código mostrado em Opções do desenvolvedor › Depuração por Wi-Fi › Parear com código).
pub fn pair(addr: &str, code: &str) -> Result<String> {
    valid_addr(addr)?;
    valid_code(code)?;
    let out = adb::run(&["pair", addr, code], None, T)?;
    if out.contains("Successfully paired") {
        Ok(format!("Pareado com {addr}"))
    } else {
        Err(AdbError(friendly(&out, "Não foi possível parear. Confira o código e o endereço na tela do celular.")))
    }
}

pub fn connect(addr: &str) -> Result<String> {
    valid_addr(addr)?;
    let out = adb::run(&["connect", addr], None, T)?;
    if out.contains("connected to") && !out.contains("failed") && !out.contains("cannot") {
        Ok(format!("Conectado a {addr}"))
    } else {
        Err(AdbError(friendly(&out, "Não foi possível conectar. O celular e o computador estão na mesma rede?")))
    }
}

pub fn disconnect(addr: &str) -> Result<String> {
    valid_addr(addr)?;
    adb::run(&["disconnect", addr], None, T).map(|_| format!("Desconectado de {addr}"))
}

/// IP do Wi-Fi do aparelho (`ip -f inet addr show wlan0`).
pub fn parse_wlan_ip(out: &str) -> Option<String> {
    INET_RE.captures(out).map(|c| c[1].to_string()).filter(|ip| !ip.starts_with("127."))
}

pub fn wlan_ip(serial: &str) -> Option<String> {
    let out = adb::shell(serial, &["ip", "-f", "inet", "addr", "show", "wlan0"], T).ok()?;
    parse_wlan_ip(&out)
}

/// Com o aparelho no cabo: liga o `adb tcpip 5555` e conecta pelo IP do Wi-Fi. Vale até o aparelho reiniciar.
pub fn enable_from_usb(serial: &str) -> Result<String> {
    let ip = wlan_ip(serial).ok_or_else(|| AdbError("O celular não está conectado a uma rede Wi-Fi.".into()))?;
    let port = TCPIP_PORT.to_string();
    adb::run(&["tcpip", &port], Some(serial), T)?;
    let addr = format!("{ip}:{TCPIP_PORT}");
    let mut last = None;
    // O adbd reinicia em modo TCP; leva um ou dois segundos para aceitar conexão.
    for _ in 0..5 {
        std::thread::sleep(Duration::from_millis(1500));
        match connect(&addr) {
            Ok(m) => return Ok(m),
            Err(e) => last = Some(e),
        }
    }
    Err(last.unwrap_or_else(|| AdbError("Não foi possível conectar por Wi-Fi.".into())))
}

fn friendly(out: &str, fallback: &str) -> String {
    let o = out.trim();
    if o.is_empty() { fallback.into() } else { format!("{fallback} ({o})") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addr_validation() {
        assert!(valid_addr("192.168.0.10:37123").is_ok());
        assert!(valid_addr("10.0.0.1:5555").is_ok());
        assert!(valid_addr("256.1.1.1:5555").is_err());
        assert!(valid_addr("192.168.0.10:70000").is_err());
        assert!(valid_addr("192.168.0.10").is_err());
        assert!(valid_addr("evil.com:5555").is_err());
        assert!(valid_addr("1.2.3.4:5555;reboot").is_err());
    }

    #[test]
    fn code_validation() {
        assert!(valid_code("123456").is_ok());
        assert!(valid_code("12345").is_err());
        assert!(valid_code("12345a").is_err());
    }

    #[test]
    fn mdns_parse() {
        let out = "List of discovered mdns services\nadb-SERIAL0001-AbCdEf\t_adb-tls-pairing._tcp\t192.168.0.10:37123\nadb-SERIAL0001-AbCdEf\t_adb-tls-connect._tcp\t192.168.0.10:41234\nbroken line\nx\t_other._tcp\t1.2.3.4:1\n";
        let s = parse_mdns(out);
        assert_eq!(s.len(), 2);
        assert_eq!(s[0], MdnsService { name: "adb-SERIAL0001-AbCdEf".into(), kind: "pairing".into(), addr: "192.168.0.10:37123".into() });
        assert_eq!(s[1].kind, "connect");
    }

    #[test]
    fn wlan_ip_parse() {
        let out = "47: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    inet 192.168.0.10/24 brd 192.168.0.255 scope global wlan0\n";
        assert_eq!(parse_wlan_ip(out).as_deref(), Some("192.168.0.10"));
        assert_eq!(parse_wlan_ip("Device \"wlan0\" does not exist."), None);
    }
}
