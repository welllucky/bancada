#!/usr/bin/env node
// Próxima versão a partir dos Conventional Commits desde a última tag `v*`, sem dependências.
//
//   node scripts/release-version.mjs            → imprime a análise
//   node scripts/release-version.mjs --apply    → também grava a versão em package.json, tauri.conf.json, Cargo.toml e Cargo.lock
//   node scripts/release-version.mjs --set 1.2.3 → só grava a versão dada nos manifestos (usado no build)
//
// Regras: `feat` → minor, `fix`/`perf` → patch, `!` ou `BREAKING CHANGE` → major (minor enquanto a versão for 0.x).
// Outros tipos (docs, chore, ci, refactor, test, style, build) não geram versão.
// No GitHub Actions escreve `release`, `version`, `tag` em $GITHUB_OUTPUT e as notas em release-notes.md.
// Depois de publicar, o workflow devolve a versão para a main num commit `chore(release)` (não gera release).

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const writeVersion = (version) => {
  const json = (p, f) => {
    const o = JSON.parse(readFileSync(p, "utf8"));
    f(o);
    writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
  };
  json("package.json", (o) => (o.version = version));
  json("src-tauri/tauri.conf.json", (o) => (o.version = version));
  for (const p of ["src-tauri/Cargo.toml", "src-tauri/core/Cargo.toml"]) {
    // Só a versão do [package].
    const t = readFileSync(p, "utf8").replace(/(\[package\][^[]*?\nversion = )"[^"]*"/, `$1"${version}"`);
    writeFileSync(p, t);
  }
  // E no Cargo.lock, senão o primeiro `cargo build` depois do pull deixa a árvore suja.
  const lock = "src-tauri/Cargo.lock";
  let l = readFileSync(lock, "utf8");
  for (const name of ["phone-deck", "phone-deck-core"]) {
    l = l.replace(new RegExp(`(\\nname = "${name}"\\nversion = )"[^"]*"`), `$1"${version}"`);
  }
  writeFileSync(lock, l);
  console.log(`Versão ${version} gravada nos manifestos.`);
};

const set = process.argv.indexOf("--set");
if (set > 0) {
  const v = process.argv[set + 1];
  if (!/^\d+\.\d+\.\d+$/.test(v ?? "")) throw new Error(`versão inválida: ${v}`);
  writeVersion(v);
  process.exit(0);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// Maior tag de versão, mesmo que não seja ancestral do HEAD (histórico reescrito): os commits contados são
// os que ela ainda não contém.
const last = git("tag", "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-v:refname").split("\n")[0] ?? "";
const base = last ? last.slice(1) : "0.0.0";
const range = last ? [`${last}..HEAD`] : ["HEAD"];
const raw = git("log", ...range, "--no-merges", "--format=%H%x1f%s%x1f%b%x1e");

const RE = /^(\w+)(?:\(([^)]*)\))?(!)?: (.+)$/;
const commits = raw
  .split("\x1e")
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [hash, subject, body = ""] = c.split("\x1f");
    const m = RE.exec(subject);
    if (!m) return null;
    const [, type, scope, bang, text] = m;
    return { hash: hash.slice(0, 7), type, scope, text, breaking: !!bang || /^BREAKING[ -]CHANGE:/m.test(body) };
  })
  .filter(Boolean);

let [maj, min, pat] = base.split(".").map(Number);
const breaking = commits.some((c) => c.breaking);
const feat = commits.some((c) => c.type === "feat");
const fix = commits.some((c) => c.type === "fix" || c.type === "perf");
let bump = null;
if (breaking) bump = maj === 0 ? "minor" : "major";
else if (feat) bump = "minor";
else if (fix) bump = "patch";

if (bump === "major") [maj, min, pat] = [maj + 1, 0, 0];
if (bump === "minor") [min, pat] = [min + 1, 0];
if (bump === "patch") pat += 1;
const version = `${maj}.${min}.${pat}`;

const SECTIONS = [
  ["Mudanças incompatíveis", (c) => c.breaking],
  ["Novidades", (c) => c.type === "feat" && !c.breaking],
  ["Correções", (c) => c.type === "fix" && !c.breaking],
  ["Desempenho", (c) => c.type === "perf" && !c.breaking],
];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
let notes = "";
for (const [title, pick] of SECTIONS) {
  const items = commits.filter(pick);
  if (!items.length) continue;
  notes += `### ${title}\n\n${items.map((c) => `- ${cap(c.text)}${c.scope ? ` (${c.scope})` : ""} — ${c.hash}`).join("\n")}\n\n`;
}
notes = notes.trim() + "\n";

console.log(bump ? `${base} → ${version} (${bump}, ${commits.length} commits)` : `Sem mudança que gere versão desde ${last || "o início"}.`);
if (bump) console.log(`\n${notes}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `release=${bump ? "true" : "false"}\nversion=${version}\ntag=v${version}\n`);
}
if (bump) writeFileSync("release-notes.md", notes);

if (bump && process.argv.includes("--apply")) writeVersion(version);
