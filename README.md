# Phone Deck

Aplicativo **nativo** (Linux, macOS e Windows, um único código) para ter visão e controle do ciclo de vida de um celular Android conectado por **USB (ADB)**.

- **Visão geral** — aparelho, versão do Android/One UI, bateria, saúde (ASOC/BSOH Samsung), temperatura, RAM, armazenamento, uptime.
- **Bateria** — consumo desde a última carga, mA com tela ligada/desligada, deep doze, linha do tempo de nível/temperatura com faixas de tela ligada, quem gastou (por app e por componente), wakelocks, jobs, wakelocks de kernel e motivos de despertar.
- **Processos** — top em tempo real (3 s), CPU acumulada desde o boot, memória PSS; destaca processos com CPU alta **com a tela desligada** e permite forçar a parada.
- **Apps** — apps de usuário, origem (Play/Galaxy Store ou não), bucket de standby, consumo; detalhe com permissões sensíveis e uso recente; restringir segundo plano, mudar bucket, forçar parada, desinstalar.
- **Rede / Bluetooth** — Wi-Fi (SSID, sinal, banda, padrão), redes ativas, DNS/DNS privado, VPN, buscas em segundo plano; dispositivos pareados.
- **Boot & Sistema** — Verified Boot, bootloader, Knox warranty bit, SELinux, firmware, motivos de boot; manutenção (limpar caches, dexopt, reiniciar).
- **Segurança** — acessibilidade, leitores de notificação, administradores, sobreposição, acesso ao uso, todos os arquivos, instalar desconhecidos, apps fora da loja.
- **Otimizações** — motor de regras que gera recomendações com evidência e um botão **Aplicar**.
- **Histórico** — amostras de bateria a cada minuto e consumo por app a cada 30 min gravados em SQLite local, com gráficos de dias/meses e log de todas as ações aplicadas.

Feito com [Tauri 2](https://v2.tauri.app) (backend Rust + WebView nativo do sistema) e React + TypeScript. Nada sai do seu computador: sem telemetria, sem chamadas de rede.

## Requisitos

| SO | Para usar | Para desenvolver |
|---|---|---|
| Linux | `adb` (`sudo dnf install android-tools` / `sudo apt install adb`) | `webkit2gtk4.1-devel librsvg2-devel libappindicator-gtk3-devel openssl-devel` (Fedora) ou `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev` (Debian/Ubuntu), Rust, Node 20+ |
| macOS | `brew install android-platform-tools` | Xcode Command Line Tools, Rust, Node 20+ |
| Windows | [SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools) | WebView2 (já vem no Windows 11), Visual Studio Build Tools (C++), Rust, Node 20+ |

O app encontra o `adb` em: variável `ADB`, `PATH`, `ANDROID_HOME`/`ANDROID_SDK_ROOT`, `~/Android/Sdk/platform-tools` (Linux), `~/Library/Android/sdk/platform-tools` e Homebrew (macOS), `%LOCALAPPDATA%\Android\Sdk\platform-tools` (Windows).

No celular: **Configurações → Sobre o telefone → Informações de software → toque 7× em “Número de compilação”**, depois **Opções do desenvolvedor → Depuração USB** e aceite o pedido ao conectar o cabo.

## Rodar em desenvolvimento

```bash
npm install
npm run tauri dev
```

## Gerar instaladores

```bash
npm run tauri build            # todos os formatos do SO atual
npm run tauri build -- --bundles deb,rpm,appimage   # Linux
npm run tauri build -- --bundles dmg               # macOS
npm run tauri build -- --bundles msi,nsis          # Windows
```

Os pacotes saem em `src-tauri/target/release/bundle/`. Para gerar os três sistemas de uma vez, use o workflow `.github/workflows/release.yml` (matriz Ubuntu / macOS arm64 + x64 / Windows com `tauri-apps/tauri-action`): crie uma tag `v*` ou rode manualmente em *Actions*.

## Testes

```bash
cd src-tauri
cargo test -p phone-deck-core                      # parsers, otimizador, whitelist e SQLite (fixtures reais sanitizadas)
cargo run -p phone-deck-core --example smoke        # leitura somente-leitura do aparelho conectado
```

## Modelo de segurança

- Todo comando `adb` é montado a partir de uma lista de argumentos (sem shell no computador), e tokens com metacaracteres de shell (`; | & $ \` ( ) …`) são rejeitados antes de chegar ao `adb shell`.
- Nomes de pacote e serial são validados por regex.
- **Só as ações em `src-tauri/core/src/actions.rs` podem alterar o aparelho**, cada uma validada contra uma whitelist:
  - `settings put` apenas para chaves e valores listados (tempo de tela, buscas Wi-Fi/BLE, AOD tocar-para-mostrar, escalas de animação, dados móveis sempre ativos);
  - forçar parada, bucket de standby, `RUN_ANY_IN_BACKGROUND`, limpar caches (`pm trim-caches`), `bg-dexopt-job`, reiniciar;
  - desinstalar apenas apps de usuário (`pm uninstall --user 0`, conferido contra `pm list packages -3`).
- Não existe ação genérica de shell e **`pm clear` nunca é usado** (apagaria dados do app).
- Toda ação pede confirmação mostrando o comando exato e fica registrada no histórico.
- Desative a Depuração USB quando não estiver usando o app.

## Estrutura

```
src/                    React + TypeScript (páginas em src/pages)
src-tauri/src/lib.rs    comandos Tauri + coletor de histórico em segundo plano
src-tauri/core/         crate Rust puro: adb, parsers, coletores, otimizador, ações, SQLite
src-tauri/core/tests/   testes com saídas reais de dumpsys (sanitizadas)
```
