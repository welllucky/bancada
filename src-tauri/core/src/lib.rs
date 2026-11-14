//! Phone Deck core: everything that talks to `adb` or interprets its output.
//! Kept free of Tauri so it can be unit-tested on any machine.

pub mod actions;
pub mod adb;
pub mod collectors;
pub mod history;
pub mod icons;
pub mod wireless;
pub mod optimizer;
pub mod parse;
