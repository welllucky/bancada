//! Consumo de rede: bytes por app e por hora (`dumpsys netstats detail`), conexões abertas por app
//! (`/proc/net/{tcp,tcp6,udp,udp6}`, que trazem o UID dono do socket) e contadores das interfaces
//! (`/proc/net/dev`) para a taxa ao vivo. Funções puras; os coletores ficam em `collectors.rs`.
//!
//! Privacidade: o `ident` do netstats traz SSID e IDs de assinante; aqui só o tipo de rede é lido.

use serde::Serialize;
use std::collections::BTreeMap;
use std::net::{Ipv4Addr, Ipv6Addr};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Transport {
    Wifi,
    Mobile,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bucket {
    /// Início do intervalo (epoch, s).
    pub st: i64,
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UidSeries {
    pub uid: u32,
    /// `FOREGROUND` quando o app estava em primeiro plano; `DEFAULT` é segundo plano.
    pub foreground: bool,
    pub transport: Transport,
    pub buckets: Vec<Bucket>,
}

#[derive(Debug, Default, PartialEq)]
pub struct NetStats {
    /// Totais do aparelho por tipo de rede (seção `Xt stats`).
    pub xt: Vec<(Transport, Vec<Bucket>)>,
    /// Por app (seção `UID stats`, só `tag=0x0`, que é o total do app).
    pub uids: Vec<UidSeries>,
}

fn transport_of(ident: &str) -> Transport {
    let t = ident.split("type=").nth(1).unwrap_or("");
    let t: String = t.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    match t.as_str() {
        "WIFI" | "1" => Transport::Wifi,
        "MOBILE" | "0" => Transport::Mobile,
        _ => Transport::Other,
    }
}

fn field<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let i = line.find(key)?;
    let rest = &line[i + key.len()..];
    Some(rest.split(|c: char| c.is_whitespace() || c == ',' || c == '}' || c == ']').next().unwrap_or(""))
}

fn parse_bucket(line: &str) -> Option<Bucket> {
    let t = line.trim_start();
    if !t.starts_with("st=") {
        return None;
    }
    Some(Bucket { st: field(t, "st=")?.parse().ok()?, rx: field(t, "rb=")?.parse().ok()?, tx: field(t, "tb=")?.parse().ok()? })
}

/// `dumpsys netstats detail`. Aceita os formatos de `type=WIFI` (Android 12+) e `type=1` (antigos),
/// com `uid=` na mesma linha do `ident` ou na seguinte.
pub fn parse_netstats(text: &str) -> NetStats {
    #[derive(PartialEq)]
    enum Sec {
        None,
        Xt,
        Uid,
    }
    let mut sec = Sec::None;
    let mut out = NetStats::default();
    let mut transport = Transport::Other;
    // Destino dos próximos `st=`: índice em xt, índice em uids, ou nada.
    enum Target {
        None,
        Xt(usize),
        Uid(usize),
    }
    let mut target = Target::None;

    for line in text.lines() {
        let t = line.trim();
        if !line.starts_with(' ') && t.ends_with(':') {
            sec = match t {
                "Xt stats:" => Sec::Xt,
                "UID stats:" => Sec::Uid,
                _ => Sec::None,
            };
            target = Target::None;
            continue;
        }
        if sec == Sec::None {
            continue;
        }
        if t.starts_with("ident=") {
            transport = transport_of(t);
            target = Target::None;
            if sec == Sec::Xt {
                out.xt.push((transport, Vec::new()));
                target = Target::Xt(out.xt.len() - 1);
            }
        }
        if sec == Sec::Uid && t.contains("uid=") && t.contains("set=") {
            target = Target::None;
            let tag_ok = field(t, "tag=").is_none_or(|g| g == "0x0");
            if let (Some(uid), true) = (field(t, "uid=").and_then(|u| u.parse::<i64>().ok()), tag_ok) {
                if uid >= 0 {
                    let set = field(t, "set=").unwrap_or("");
                    out.uids.push(UidSeries { uid: uid as u32, foreground: set == "FOREGROUND" || set == "1", transport, buckets: Vec::new() });
                    target = Target::Uid(out.uids.len() - 1);
                }
            }
            continue;
        }
        if let Some(b) = parse_bucket(line) {
            match target {
                Target::Xt(i) => out.xt[i].1.push(b),
                Target::Uid(i) => out.uids[i].buckets.push(b),
                Target::None => {}
            }
        }
    }
    out
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Point {
    pub t: i64,
    pub rx: u64,
    pub tx: u64,
    pub wifi: u64,
    pub mobile: u64,
}

/// Linha do tempo do aparelho a partir de `since`, somando os tipos de rede por intervalo.
pub fn timeline(ns: &NetStats, since: i64) -> Vec<Point> {
    let mut m: BTreeMap<i64, Point> = BTreeMap::new();
    for (tr, bs) in &ns.xt {
        for b in bs.iter().filter(|b| b.st >= since) {
            let p = m.entry(b.st).or_insert_with(|| Point { t: b.st, ..Default::default() });
            p.rx += b.rx;
            p.tx += b.tx;
            match tr {
                Transport::Wifi => p.wifi += b.rx + b.tx,
                Transport::Mobile => p.mobile += b.rx + b.tx,
                Transport::Other => {}
            }
        }
    }
    m.into_values().collect()
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct AppUsage {
    pub uid: u32,
    pub rx: u64,
    pub tx: u64,
    pub wifi: u64,
    pub mobile: u64,
    /// Bytes com o app em primeiro plano; o resto foi em segundo plano.
    pub foreground: u64,
}

/// Consumo por UID a partir de `since`, do maior para o menor.
pub fn per_uid(ns: &NetStats, since: i64) -> Vec<AppUsage> {
    let mut m: BTreeMap<u32, AppUsage> = BTreeMap::new();
    for s in &ns.uids {
        let (rx, tx) = s.buckets.iter().filter(|b| b.st >= since).fold((0, 0), |(r, t), b| (r + b.rx, t + b.tx));
        if rx + tx == 0 {
            continue;
        }
        let a = m.entry(s.uid).or_insert_with(|| AppUsage { uid: s.uid, ..Default::default() });
        a.rx += rx;
        a.tx += tx;
        match s.transport {
            Transport::Wifi => a.wifi += rx + tx,
            Transport::Mobile => a.mobile += rx + tx,
            Transport::Other => {}
        }
        if s.foreground {
            a.foreground += rx + tx;
        }
    }
    let mut v: Vec<AppUsage> = m.into_values().collect();
    v.sort_by(|a, b| (b.rx + b.tx).cmp(&(a.rx + a.tx)).then(a.uid.cmp(&b.uid)));
    v
}

// ---------------------------------------------------------------- conexões

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Socket {
    pub proto: &'static str,
    pub local: String,
    pub local_port: u16,
    pub remote: String,
    pub remote_port: u16,
    /// Estado TCP em pt-BR (`estabelecida`, `ouvindo`…); UDP sem destino vira `aberta`.
    pub state: &'static str,
    pub uid: u32,
}

fn tcp_state(hex: &str) -> &'static str {
    match hex {
        "01" => "estabelecida",
        "02" => "abrindo",
        "03" => "abrindo",
        "04" | "05" | "08" | "09" | "0B" => "fechando",
        "06" => "aguardando",
        "07" => "fechada",
        "0A" => "ouvindo",
        _ => "outra",
    }
}

/// `0100007F:1F90` → (`127.0.0.1`, 8080). IPv6 vem em 4 palavras de 32 bits little-endian.
fn addr(hex: &str) -> Option<(String, u16)> {
    let (ip, port) = hex.split_once(':')?;
    let port = u16::from_str_radix(port, 16).ok()?;
    let ip = match ip.len() {
        8 => Ipv4Addr::from(u32::from_str_radix(ip, 16).ok()?.swap_bytes()).to_string(),
        32 => {
            let mut b = [0u8; 16];
            for w in 0..4 {
                let word = u32::from_str_radix(&ip[w * 8..w * 8 + 8], 16).ok()?.swap_bytes();
                b[w * 4..w * 4 + 4].copy_from_slice(&word.to_be_bytes());
            }
            let v6 = Ipv6Addr::from(b);
            v6.to_ipv4_mapped().map(|v4| v4.to_string()).unwrap_or_else(|| v6.to_string())
        }
        _ => return None,
    };
    Some((ip, port))
}

/// Uma tabela de `/proc/net/{tcp,tcp6,udp,udp6}`.
pub fn parse_proc_net(text: &str, proto: &'static str) -> Vec<Socket> {
    text.lines()
        .skip(1)
        .filter_map(|l| {
            let f: Vec<&str> = l.split_whitespace().collect();
            if f.len() < 8 {
                return None;
            }
            let (local, local_port) = addr(f[1])?;
            let (remote, remote_port) = addr(f[2])?;
            let udp = proto.starts_with("udp");
            let state = if udp { if remote_port == 0 { "aberta" } else { "estabelecida" } } else { tcp_state(f[3]) };
            Some(Socket { proto: if udp { "UDP" } else { "TCP" }, local, local_port, remote, remote_port, state, uid: f[7].parse().ok()? })
        })
        .collect()
}

// ---------------------------------------------------------------- interfaces

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Iface {
    pub name: String,
    pub transport: Transport,
    pub rx: u64,
    pub tx: u64,
}

/// `/proc/net/dev`: contadores acumulados por interface (sem `lo` e interfaces zeradas).
pub fn parse_proc_net_dev(text: &str) -> Vec<Iface> {
    text.lines()
        .filter_map(|l| {
            let (name, rest) = l.split_once(':')?;
            let name = name.trim();
            let f: Vec<u64> = rest.split_whitespace().filter_map(|x| x.parse().ok()).collect();
            if name == "lo" || f.len() < 9 || f[0] + f[8] == 0 {
                return None;
            }
            let transport = if name.starts_with("wlan") || name.starts_with("swlan") {
                Transport::Wifi
            } else if ["rmnet", "ccmni", "seth", "v4-rmnet", "pdp", "qmi"].iter().any(|p| name.starts_with(p)) {
                Transport::Mobile
            } else {
                Transport::Other
            };
            Some(Iface { name: name.to_string(), transport, rx: f[0], tx: f[8] })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NETSTATS: &str = "Active interfaces:
  iface=wlan0 ident=[{type=WIFI, ratType=COMBINED, wifiNetworkKey=\"REDACTED\", metered=false}]
Dev stats:
  Pending bytes: 100
  ident=[{type=WIFI}]
    NetworkStatsHistory: bucketDuration=3600
      st=1762900000 rb=999 rp=1 tb=999 tp=1 op=0
Xt stats:
  Pending bytes: 100
  ident=[{type=WIFI, ratType=COMBINED, wifiNetworkKey=\"REDACTED\", metered=false}]
    NetworkStatsHistory: bucketDuration=3600
      st=1762900000 rb=1000 rp=10 tb=200 tp=5 op=0
      st=1762903600 rb=3000 rp=10 tb=400 tp=5 op=0
  ident=[{type=MOBILE, ratType=COMBINED, subscriberId=REDACTED, metered=true}]
    NetworkStatsHistory: bucketDuration=3600
      st=1762903600 rb=500 rp=2 tb=50 tp=1 op=0
UID stats:
  Pending bytes: 100
  ident=[{type=WIFI, ratType=COMBINED}] uid=10369 set=DEFAULT tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1762900000 rb=700 rp=10 tb=100 tp=5 op=0
  ident=[{type=WIFI, ratType=COMBINED}] uid=10369 set=FOREGROUND tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1762903600 rb=2000 rp=10 tb=300 tp=5 op=0
  ident=[{type=MOBILE, ratType=COMBINED}] uid=10288 set=DEFAULT tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1762903600 rb=400 rp=10 tb=40 tp=5 op=0
  ident=[{type=WIFI}] uid=-5 set=DEFAULT tag=0x0
    NetworkStatsHistory: bucketDuration=7200
      st=1762903600 rb=1 rp=1 tb=1 tp=1 op=0
UID tag stats:
  ident=[{type=WIFI}] uid=10369 set=DEFAULT tag=0xff
    NetworkStatsHistory: bucketDuration=7200
      st=1762900000 rb=99999 rp=10 tb=99999 tp=5 op=0
";

    #[test]
    fn netstats_sections() {
        let ns = parse_netstats(NETSTATS);
        assert_eq!(ns.xt.len(), 2, "só Xt stats, sem Dev stats");
        assert_eq!(ns.xt[0].0, Transport::Wifi);
        assert_eq!(ns.xt[1].0, Transport::Mobile);
        assert_eq!(ns.uids.len(), 3, "sem uid negativo nem tag != 0x0");
        assert!(ns.uids[1].foreground);
    }

    #[test]
    fn netstats_legacy_format() {
        let legacy = "UID stats:\n  ident=[{type=1, subType=COMBINED, networkId=\"x\"}]\n  uid=10001 set=DEFAULT tag=0x0\n    NetworkStatsHistory: bucketDuration=7200\n      bucket{st=1 rb=5 rp=1 tb=6 tp=1 op=0}\n      st=2 rb=7 rp=1 tb=8 tp=1 op=0\n";
        let ns = parse_netstats(legacy);
        assert_eq!(ns.uids.len(), 1);
        assert_eq!(ns.uids[0].transport, Transport::Wifi);
        assert_eq!(ns.uids[0].buckets, vec![Bucket { st: 2, rx: 7, tx: 8 }]);
    }

    #[test]
    fn aggregates() {
        let ns = parse_netstats(NETSTATS);
        let tl = timeline(&ns, 0);
        assert_eq!(tl.len(), 2);
        assert_eq!(tl[1], Point { t: 1762903600, rx: 3500, tx: 450, wifi: 3400, mobile: 550 });
        assert_eq!(timeline(&ns, 1762903600).len(), 1);

        let apps = per_uid(&ns, 0);
        assert_eq!(apps[0].uid, 10369);
        assert_eq!((apps[0].rx, apps[0].tx, apps[0].foreground), (2700, 400, 2300));
        assert_eq!(apps[1], AppUsage { uid: 10288, rx: 400, tx: 40, wifi: 0, mobile: 440, foreground: 0 });
        assert_eq!(per_uid(&ns, 1762903600)[0].rx, 2000);
    }

    #[test]
    fn proc_net_v4_v6() {
        let tcp = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 1 1 0000000000000000 100 0 0 10 0\n   1: 0A00A8C0:C350 0D0D0D0D:01BB 01 00000000:00000000 00:00000000 00000000 10369        0 2 1 0000000000000000 20 4 30 10 -1\n";
        let s = parse_proc_net(tcp, "tcp");
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].local.as_str(), s[0].local_port, s[0].state), ("127.0.0.1", 8080, "ouvindo"));
        assert_eq!((s[1].local.as_str(), s[1].remote.as_str(), s[1].remote_port, s[1].uid, s[1].state), ("192.168.0.10", "13.13.13.13", 443, 10369, "estabelecida"));

        let tcp6 = "  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0000000000000000FFFF00000A00A8C0:C351 0000000000000000FFFF00000D0D0D0D:01BB 01 00000000:00000000 00:00000000 00000000 10288        0 3 1\n   1: B80D0120000000000000000001000000:C352 B80D0120000000000000000002000000:0050 01 00000000:00000000 00:00000000 00000000 10288        0 4 1\n";
        let s6 = parse_proc_net(tcp6, "tcp6");
        assert_eq!(s6[0].remote, "13.13.13.13", "IPv4 mapeado vira IPv4");
        assert_eq!(s6[1].remote, "2001:db8::2");
        assert_eq!(s6[1].remote_port, 80);

        let udp = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops\n  10: 00000000:14E9 00000000:0000 07 00000000:00000000 00:00000000 00000000 10120        0 5 2 0 0\n";
        let su = parse_proc_net(udp, "udp");
        assert_eq!((su[0].proto, su[0].state, su[0].local_port), ("UDP", "aberta", 5353));
    }

    #[test]
    fn proc_net_dev() {
        let t = "Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n    lo:  5000 10 0 0 0 0 0 0  5000 10 0 0 0 0 0 0\n wlan0: 123456 100 0 0 0 0 0 0 7890 50 0 0 0 0 0 0\nrmnet_data0: 1000 5 0 0 0 0 0 0 200 3 0 0 0 0 0 0\n  dummy0: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n";
        let i = parse_proc_net_dev(t);
        assert_eq!(i.len(), 2);
        assert_eq!(i[0], Iface { name: "wlan0".into(), transport: Transport::Wifi, rx: 123456, tx: 7890 });
        assert_eq!(i[1].transport, Transport::Mobile);
    }
}
