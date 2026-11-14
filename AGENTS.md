# AGENTS.md — Phone Deck

App desktop nativo (Tauri 2: Rust + React/TS no WebView do SO) que inspeciona e controla um Android conectado por USB via `adb`. Alvos: Linux, macOS, Windows a partir do mesmo código. UI em pt-BR. Tudo local: sem telemetria, sem rede além do `adb`. Única exceção: procurar/baixar atualização do próprio app nas releases do GitHub (`src-tauri/src/update.rs`), ao abrir só se a pessoa deixar ligado e instalando só com confirmação.

Visão de produto e instruções de uso para humanos: `README.md`. Este arquivo cobre o que o código não conta sozinho.

## Arquitetura

- `src-tauri/core/` — crate **`phone-deck-core`**, Rust puro, **sem dependência de Tauri/WebKit**. Toda a lógica vive aqui: `adb.rs` (execução), `parse.rs` (parsers de `dumpsys`/`top`/`ps`, funções puras), `collectors.rs` (chamam `adb` + `parse`), `optimizer.rs` (regras → recomendações), `actions.rs` (escritas permitidas), `history.rs` (SQLite). Existe separado para ser testável em qualquer máquina/CI sem webview.
- `src-tauri/src/lib.rs` — casca fina: cada `#[tauri::command]` embrulha um coletor em `spawn_blocking`; thread de amostragem (bateria a cada 60 s, consumo por app a cada 30 min) grava no SQLite em `app_data_dir()/history.db`.
- `src-tauri/src/main.rs` — workarounds de ambiente Linux antes de qualquer thread (ver _Armadilhas Linux_).
- `src-tauri/core/src/icons.rs` — nome e ícone reais do app a partir do APK (manifesto + `resources.arsc` via `apk-info`): nome em pt-BR > pt > padrão; ícone adaptativo composto em SVG, senão o bitmap mais denso. `collectors::app_meta` guarda o resultado no catálogo `app_cache_dir()/apps` (`{pkg}.{hash do caminho}.json` + `labels.json`); a chave muda quando o caminho do APK muda (instalação/atualização), e os caminhos de todos os apps vêm de um único `pm list packages -f` (cache de 2 min), então abrir o app de novo não copia APK nenhum. Conferência visual: `cargo run -p phone-deck-core --example icon -- saida.html *.apk`.
- `src-tauri/core/src/wireless.rs` — depuração por Wi-Fi: mDNS, pareamento por código, conexão, `tcpip` a partir do cabo.
- `src-tauri/core/src/netusage.rs` — rede: `dumpsys netstats detail` (consumo por período e por UID), `/proc/net/{tcp,udp}{,6}` (conexões com o UID dono) e `/proc/net/dev` (contadores; a UI calcula a taxa pela diferença). Formatos ainda sem fixture real do aparelho.
- `src-tauri/core/src/apptimeline.rs` — linha do tempo por app a partir de `batterystats --history` (mesmo texto do gráfico de bateria, cache de 2 min): `top`/`fg`/`job`/`sync`/`wake_lock`/`longwake` viram intervalos, `wakeupap`/`tmpwhitelist` viram marcas, cada um com o estado da tela. `-wake_lock` costuma vir sem dono e fecha o wakelock aberto; só o primeiro a segurar o wakelock global aparece.
- `src/api.ts` — única ponte TS→Rust (`invoke`), espelha os tipos Rust; `src/pages/*` — uma página por seção; `src/ui.tsx` — componentes compartilhados; gráficos são SVG à mão.

Fluxo: página → `api.x()` → comando Tauri → `spawn_blocking` → `collectors::x` → `adb::shell` → `parse::x` → JSON → página.

## Invariantes de segurança (inegociáveis)

1. **Nenhum shell livre.** Todo comando no aparelho passa por `adb::shell(serial, &[tokens])`, que rejeita metacaracteres (`adb::check_tokens`). Nunca concatene string de comando; nunca aceite comando vindo da UI.
2. **Escrita só pelo enum `Action`** (`actions.rs`). Cada variante valida seus argumentos (`SETTINGS_WHITELIST` de namespace/chave/valores, `BUCKETS`, regex de pacote em `adb::valid_pkg`) e gera tokens fixos. Toda execução é registrada na tabela `actions`.
3. **Destrutivos proibidos:** `pm clear`, `rm`, `wipe`, factory reset, desinstalar app de sistema. `UninstallUserApp` só atua em app de terceiros com `--user 0`.
4. A UI pede confirmação mostrando a descrição exata (`Action::describe`) antes de qualquer `Action`.
5. `capabilities/default.json` concede só `core:default`; plugins Tauri (shell, fs, http) ficam fora. O `tauri-plugin-updater` é registrado, mas a janela não ganha `updater:*`: só os comandos `update_check`/`update_install`/`app_version` (Rust) o usam, e o pacote é conferido com `plugins.updater.pubkey` antes de instalar.
6. Fora do `adb shell`, o core só usa estes subcomandos do `adb`, todos com argumento validado: `pull` de APK (caminho vindo de `pm path`, `adb::valid_apk_path`) para extrair nome e ícone em `icons.rs` (só quando o app não está no catálogo local), apagando a cópia em seguida; `pair`/`connect`/`disconnect` com `IPv4:porta` e código de 6 dígitos (`wireless.rs`); `mdns services`; `tcpip 5555` (porta fixa, registrado no histórico de ações).

Ao adicionar escrita nova: nova variante em `Action` + validação + teste de rejeição. Nunca alargue o whitelist para "qualquer valor".

## Armadilhas Android / Samsung (observadas num S25 Ultra, One UI 9 / Android 17)

- **Pasta Segura = usuário 150.** `pm list packages` sem `--user 0` falha com `SecurityException ... user 150`. Sempre passe `--user 0` em `pm`.
- `am get-standby-buckets` não existe nessa build; buckets vêm dos eventos de `dumpsys usagestats` (`parse_bucket_events`). `am get-standby-bucket <pkg>` (singular) funciona.
- `dumpsys battery` da Samsung traz `current now` em µA em algumas leituras e mA em outras; `parse` normaliza (`|c| > 20000 → /1000`). Saúde real da bateria: `mSavedBatteryAsoc`/`mSavedBatteryBsoh`, não o campo `health`.
- `batterystats --charged` é caro (segundos, centenas de KB): cache de ~2 min em `collectors`. Não chame em loop curto.
- UIDs aparecem como `u0a369` → `10369`; mapeie para pacotes via `pm list packages --user 0 -U` (uid pode ter vários pacotes).
- Timestamps de `dumpsys connectivity` são UTC (`Z`); o restante é hora local do aparelho.
- Sintoma real que o otimizador deve continuar pegando: app com CPU alta com a tela em `Dozing` (WhatsApp `WhatsApp Worker` ~50%) e wakelock de job longo (`XmppLifecycleWorker`, ~55 min em 4 h).

## Armadilhas Linux / desktop

- `main.rs` força `GIO_USE_VFS=local`: ao carregar ícones da barra de título, o GTK (via glycin) faz chamada D-Bus **síncrona** ao `gvfsd`; se o `gvfsd-metadata` travar, a janela nunca aparece / "não responde". Sintoma no log: `GVFS-WARNING ... tempo limite`. Diagnóstico: `eu-stack -p <pid>` mostrando `g_dbus_connection_send_message_with_reply_sync` sob `gtk_icon_*`.
- Com driver NVIDIA (`/proc/driver/nvidia`), `WEBKIT_DISABLE_DMABUF_RENDERER=1` (janela em branco/invisível no Wayland).
- Valores já definidos no ambiente sempre prevalecem — preserve isso.
- `pnpm tauri dev` sobe Vite em `localhost:1420` só para HMR da janela nativa; no navegador não há IPC (`isTauri()` falso) e a UI mostra aviso. O app não roda como web.

## Ferramentas

Versões fixadas em `mise.toml` (o CI usa o mesmo arquivo via `jdx/mise-action`). Rode tudo por `mise exec -- …` (ou com o mise ativado no shell). Gerenciador JS: **pnpm** (`packageManager` no `package.json`; `pnpm-workspace.yaml` libera o build script só do `esbuild`). Scripts: `package.json`.

## Receitas

**Novo dado do aparelho (coletor).** Parser puro em `parse.rs` + teste com fixture → função em `collectors.rs` → comando em `src-tauri/src/lib.rs` (registrar em `generate_handler!`) → tipo + método em `src/api.ts` → página. Pronto quando: teste do parser passa contra saída real capturada, o comando aparece no `generate_handler!`, e `pnpm build` tipa.

**Nova ação.** Variante em `Action` com validação, `describe()` e `to_tokens()`; teste que aceita o caso válido e rejeita valor fora da lista; espelho em `Action` de `src/api.ts`. Pronto quando: os dois testes passam e a ação é registrada no histórico.

**Nova regra do otimizador.** Em `optimizer::recommend`: `id` estável em kebab-case, severidade, título/detalhe em pt-BR, `evidence` com o número que disparou e, se houver correção, uma `Action` existente. Pronto quando: teste unitário com entrada que dispara e outra que não dispara.

**Nova marca.** Em `vendor.rs`: detecte em `Profile::from_props` (`ro.product.manufacturer`), declare em `Vendor::capabilities` só o que a marca realmente expõe e, se houver, a skin. Regra que depende de campo/configuração fora do AOSP checa `profile.has(Capability::…)`; sem a capacidade, a regra some em vez de sugerir algo que não existe no aparelho. Pronto quando: fixture da marca (real ou em `fixtures/synthetic/`) e teste de que ela não recebe conselho de outra marca.

**Fixtures** (`src-tauri/core/tests/fixtures/`): capture com `adb shell dumpsys … > arquivo` e **anonimize antes do commit** — SSID, BSSID/MAC, IPs (IPv4 privados e IPv6 públicos → `2001:db8:`), serial do aparelho, IMEI, nomes, e-mails, telefones, IDs de contato. Confirme com `grep` antes de commitar; o histórico já precisou ser reescrito uma vez por IPv6 vazado.

## Verificação antes de concluir

- `cargo test -p phone-deck-core` (em `src-tauri/`) — verde.
- `pnpm build` (tsc + vite) — verde.
- Mudou `src-tauri/src` ou `tauri.conf.json`: `cargo build` em `src-tauri/` (no Fedora exige `webkit2gtk4.1-devel librsvg2-devel libappindicator-gtk3-devel`).
- Com aparelho conectado: `cargo run -p phone-deck-core --example smoke` lê todos os coletores ao vivo (só leitura).

## Git e CI

- Commits Conventional Commits, autor/committer `Wellington Braga <wellingtonbat.wl@gmail.com>`, assinados por SSH. **Sem nenhuma menção a Claude/Codex/IA** em commits, trailers ou PRs (sem `Co-Authored-By` de agente). Confira: `git log -i --grep='claude\|codex'` vazio e `git log --format='%G?'` = `G`.
- Remoto: `github.com/welllucky/phone-deck` (privado), branch `main`.
- `.github/workflows/release.yml`: a cada push na `main`, `scripts/release-version.mjs` calcula a versão pelos Conventional Commits desde a última tag `v*` (`feat` → minor, `fix`/`perf` → patch, `!`/`BREAKING CHANGE` → major, minor enquanto 0.x; outros tipos não geram release). Havendo versão: testes do core → release em rascunho com as notas → build Linux/macOS (arm64 e x64)/Windows com `tauri-action` (versão gravada só na cópia de trabalho, **nenhum commit de bot**) → publica (a tag nasce aí). O `latest.json` do atualizador só sai com os secrets `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` (`--config src-tauri/tauri.updater.conf.json`). Manual (`workflow_dispatch`) sem versão nova só gera os instaladores como artefatos. Conferir localmente: `node scripts/release-version.mjs`. Toda action fixada por SHA com a versão em comentário; Dependabot propõe updates — atualize SHA e comentário juntos.
