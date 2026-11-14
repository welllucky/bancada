# Marca: Bancada

Nome escolhido para substituir "Phone Deck" (já existe um app PhoneDeck). A logo é uma bancada de oficina em perspectiva isométrica, no âmbar do Luck Design System sobre o bloco escuro com degrau tátil (linguagem V4 · Tátil).

## Arquivos

| Arquivo | Uso |
|---|---|
| `bancada-icone.svg` / `bancada-icone-1024.png` | Ícone do app, de 64 px para cima |
| `bancada-icone-pequeno.svg` / `bancada-icone-pequeno-1024.png` | 16 a 48 px: traço mais grosso, uma gaveta só |
| `bancada-logo-escuro.svg` / `bancada-logo-claro.svg` | Ícone + nome, para fundo escuro e claro |
| `bancada-nome-escuro.svg` / `bancada-nome-claro.svg` | Só o nome |
| `bancada-apresentacao.png` | Folha com todas as versões |
| `icones-app/` | Ícones do Tauri com os mesmos nomes de `src-tauri/icons` (o `.ico` usa a versão pequena até 48 px) |

O nome é Manrope ExtraBold (800) convertida em curvas, com espaçamento −0,03 em; não depende da fonte instalada.

Cores: âmbar `#F5B301` (tampo), `#A87A00` e `#6E5000` (faces em sombra), borda de luz `#FFD34D`, bloco `#1A1A18` com degrau `#050505`, puxadores `#F4F4F2`.

## Ícones do app

Gerados a partir do PNG de 1024 px: `pnpm tauri icon docs/marca/bancada-icone-1024.png -o <pasta>`; depois troque os tamanhos até 48 px do `.ico` e o `32x32.png` pela versão pequena (`bancada-icone-pequeno-1024.png`). O resultado fica em `icones-app/` e em `src-tauri/icons/`.
