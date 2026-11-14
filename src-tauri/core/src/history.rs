//! Local SQLite store for the phone's lifecycle: periodic battery samples,
//! per-app drain snapshots and an audit log of every action applied.

use crate::parse::{BatteryNow, BatteryStats};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

pub struct Db {
    conn: Connection,
}

#[derive(Debug, Serialize)]
pub struct Sample {
    pub ts: i64,
    pub level: Option<i64>,
    pub temp_c: Option<f64>,
    pub voltage_mv: Option<i64>,
    pub current_ma: Option<f64>,
    pub asoc: Option<i64>,
    pub bsoh: Option<f64>,
    pub status: Option<String>,
    pub screen: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AppDrain {
    pub ts: i64,
    pub package: String,
    pub mah: f64,
}

#[derive(Debug, Serialize)]
pub struct ActionLog {
    pub ts: i64,
    pub serial: String,
    pub action: String,
    pub ok: bool,
    pub output: String,
}

#[derive(Debug, Serialize)]
pub struct DeviceSeen {
    pub serial: String,
    pub model: Option<String>,
    pub first_seen: i64,
    pub last_seen: i64,
    pub samples: i64,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    pub fn memory() -> rusqlite::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> rusqlite::Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS devices(serial TEXT PRIMARY KEY, model TEXT, first_seen INTEGER, last_seen INTEGER);
             CREATE TABLE IF NOT EXISTS samples(serial TEXT, ts INTEGER, level INTEGER, temp_c REAL, voltage_mv INTEGER,
                 current_ma REAL, asoc INTEGER, bsoh REAL, status TEXT, screen TEXT);
             CREATE INDEX IF NOT EXISTS samples_idx ON samples(serial, ts);
             CREATE TABLE IF NOT EXISTS app_drain(serial TEXT, ts INTEGER, package TEXT, mah REAL);
             CREATE INDEX IF NOT EXISTS drain_idx ON app_drain(serial, ts);
             CREATE TABLE IF NOT EXISTS actions(serial TEXT, ts INTEGER, action TEXT, ok INTEGER, output TEXT);",
        )?;
        Ok(Self { conn })
    }

    pub fn touch_device(&self, serial: &str, model: &str) -> rusqlite::Result<()> {
        let t = now();
        self.conn.execute(
            "INSERT INTO devices(serial, model, first_seen, last_seen) VALUES(?1, ?2, ?3, ?3)
             ON CONFLICT(serial) DO UPDATE SET last_seen=?3, model=COALESCE(NULLIF(?2,''), model)",
            params![serial, model, t],
        )?;
        Ok(())
    }

    pub fn add_sample(&self, serial: &str, b: &BatteryNow, screen: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO samples VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![serial, now(), b.level, b.temp_c, b.voltage_mv, b.current_ma, b.asoc, b.bsoh, b.status, screen],
        )?;
        Ok(())
    }

    pub fn add_drain(&self, serial: &str, stats: &BatteryStats) -> rusqlite::Result<()> {
        let t = now();
        let tx = self.conn.unchecked_transaction()?;
        for c in stats.consumers.iter().take(25) {
            tx.execute("INSERT INTO app_drain VALUES(?1,?2,?3,?4)", params![serial, t, c.who.label, c.mah])?;
        }
        tx.commit()
    }

    pub fn log_action(&self, serial: &str, action: &str, ok: bool, output: &str) -> rusqlite::Result<()> {
        let out: String = output.chars().take(2000).collect();
        self.conn.execute("INSERT INTO actions VALUES(?1,?2,?3,?4,?5)", params![serial, now(), action, ok as i64, out])?;
        Ok(())
    }

    pub fn samples(&self, serial: &str, since: i64) -> rusqlite::Result<Vec<Sample>> {
        let mut st = self.conn.prepare(
            "SELECT ts, level, temp_c, voltage_mv, current_ma, asoc, bsoh, status, screen FROM samples
             WHERE serial=?1 AND ts>=?2 ORDER BY ts",
        )?;
        let rows = st.query_map(params![serial, since], |r| {
            Ok(Sample {
                ts: r.get(0)?,
                level: r.get(1)?,
                temp_c: r.get(2)?,
                voltage_mv: r.get(3)?,
                current_ma: r.get(4)?,
                asoc: r.get(5)?,
                bsoh: r.get(6)?,
                status: r.get(7)?,
                screen: r.get(8)?,
            })
        })?;
        rows.collect()
    }

    pub fn drain(&self, serial: &str, since: i64) -> rusqlite::Result<Vec<AppDrain>> {
        let mut st = self.conn.prepare("SELECT ts, package, mah FROM app_drain WHERE serial=?1 AND ts>=?2 ORDER BY ts")?;
        let rows = st.query_map(params![serial, since], |r| Ok(AppDrain { ts: r.get(0)?, package: r.get(1)?, mah: r.get(2)? }))?;
        rows.collect()
    }

    pub fn actions(&self, serial: Option<&str>, limit: i64) -> rusqlite::Result<Vec<ActionLog>> {
        let mut st = self.conn.prepare(
            "SELECT ts, serial, action, ok, output FROM actions WHERE (?1 IS NULL OR serial=?1) ORDER BY ts DESC LIMIT ?2",
        )?;
        let rows = st.query_map(params![serial, limit], |r| {
            Ok(ActionLog { ts: r.get(0)?, serial: r.get(1)?, action: r.get(2)?, ok: r.get::<_, i64>(3)? != 0, output: r.get(4)? })
        })?;
        rows.collect()
    }

    pub fn devices(&self) -> rusqlite::Result<Vec<DeviceSeen>> {
        let mut st = self.conn.prepare(
            "SELECT d.serial, d.model, d.first_seen, d.last_seen, (SELECT COUNT(*) FROM samples s WHERE s.serial=d.serial)
             FROM devices d ORDER BY d.last_seen DESC",
        )?;
        let rows = st.query_map([], |r| {
            Ok(DeviceSeen { serial: r.get(0)?, model: r.get(1)?, first_seen: r.get(2)?, last_seen: r.get(3)?, samples: r.get(4)? })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let db = Db::memory().unwrap();
        db.touch_device("S1", "SM-S938B").unwrap();
        let b = BatteryNow { level: Some(64), temp_c: Some(33.2), asoc: Some(100), ..Default::default() };
        db.add_sample("S1", &b, Some("Awake")).unwrap();
        db.log_action("S1", "force-stop com.whatsapp", true, "").unwrap();
        assert_eq!(db.samples("S1", 0).unwrap()[0].level, Some(64));
        assert_eq!(db.actions(Some("S1"), 10).unwrap().len(), 1);
        assert_eq!(db.devices().unwrap()[0].samples, 1);
    }
}
