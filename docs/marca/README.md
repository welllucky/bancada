# Marca: Bancada

Nome escolhido para substituir "Phone Deck" (já existe um app PhoneDeck). A logo é uma bancada de oficina em perspectiva isométrica, no âmbar do Luck Design System sobre o bloco escuro com degrau tátil (linguagem V4 · Tátil).

## Final (`final/`)

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

## Conceitos (`conceitos/`)

Histórico da escolha: `rascunhos/` (primeiros testes de Bancada e Prumo), `rodada-1/` (na bancada, morsa, mira, monograma) e `rodada-2/` (bancada com ferramentas, b na bancada, painel, isométrica). Cada pasta tem `apresentacao.png`.

## Regenerar (`fonte/`)

Os desenhos são gerados por Python (sem dependência além de `fonttools` para o nome):

```sh
cd docs/marca/fonte
pip install fonttools brotli
python3 outline.py ../../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2 bancada > wm.txt
python3 iso2.py    # final  -> saida/final/
python3 gen.py     # rodada 1 -> saida/rodada-1/
python3 gen2.py    # rodada 2 -> saida/rodada-2/
```

Ícones do app a partir do PNG de 1024 px: `pnpm tauri icon docs/marca/final/bancada-icone-1024.png -o <pasta>`; depois troque os tamanhos até 48 px do `.ico` e o `32x32.png` pela versão pequena.
