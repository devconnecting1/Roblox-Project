# Roblox-Project — Pixel Quest 2D (roblox-ts + Rojo + Net)

Jogo **puramente em interfaces 2D** (ScreenGui, zero peças 3D), inspirado no
[Pixel Quest](https://www.roblox.com/games/80003276594057/Pixel-Quest) do Roblox:
RPG top-down bullet-hell estilo Realm of the Mad God.

**O loop:** mova-se em todas as direções → desvie dos projéteis rosas →
derrote inimigos → colete moedas → suba de nível → complete quests →
vença a **Sereia da Praia** na onda 5. Morreu? Ganha **Valor** para a próxima run (roguelike).

- Engine: [roblox-ts](https://roblox-ts.com/) 3.x (TypeScript → Luau)
- Sync/build: [Rojo](https://rojo.space/) 7.7.0 (`servePort: 34872`)
- Deps [@rbxts](https://www.npmjs.com/org/rbxts): `@rbxts/services`, `@rbxts/t` (validação), `@rbxts/net` (remotes tipados)
- Build automático: GitHub Actions (`.github/workflows/build.yml`, Node 24) gera `build.rbxlx` a cada push na `main`.

## Boas práticas (docs)

- [roblox-ts API](https://roblox-ts.com/docs/api/roblox-api): `new Instance()`/`new Vector2()`, `undefined` = `nil`, validação de dados externos (aqui: `@rbxts/t` + `@rbxts/net`)
- [Indexing children](https://roblox-ts.com/docs/guides/indexing-children): `FindFirstChild + IsA`, tipos do DataModel em `src/services.d.ts`
- [Syncing with Rojo](https://roblox-ts.com/docs/guides/syncing-with-rojo): `$path` relativos a `out/`, `rbxts_include` em `ReplicatedStorage`
- [Rojo project format](https://rojo.space/docs/v7/project-format/) + [sync details](https://rojo.space/docs/v7/sync-details/): `*.server.ts` → `Script`, `*.client.ts` → `LocalScript`

## Estrutura

```
src/
  server/main.server.ts       -> leaderstats + save via Net (payload validado com t strict)
  client/main.client.ts       -> bootstrap: PlayerGui -> iniciarJogo()
  client/jogo.ts              -> UI 2D + loop (menu, classes, arena, HUD, quests, boss, fim)
  shared/pixelquest/Dados.ts  -> classes, inimigos, boss, quests, mundo aberto + colisão (puro)
  shared/pixelquest/Rede.ts   -> Remotes Net tipados (SalvarRun) + validador eSavePayload
  services.d.ts               -> ponto de extensão p/ tipos do DataModel
default.project.json          -> mapeia out/ para DataModel (ServerScriptService, ReplicatedStorage, StarterPlayer)
out/                          -> Luau gerado pelo rbxtsc (ignorado no git)
build.rbxlx                   -> place gerado pelo rojo (ignorado no git, Artifact no CI)
```

## O jogo

- **Mundo aberto em tela cheia:** Mapa 1 = **Masmorra Inicial** (dungeon crawler: salas + corredores gerados por run, tochas, rochas com colisão); câmera segue o jogador com culling de tiles + **minimapa** com pontos de inimigos/boss
- **Seletor de mapas (5 slots):** Mapa 1 liberado para todos; Mapas 2–5 mostram `Nv 10/20/30/40 • EM BREVE` (desbloqueio pelo Nível da conta nos leaderstats)
- **Zero 3D:** `CharacterAutoLoads=false` (no `default.project.json` + fallback no servidor) — o avatar nunca nasce/morre; câmera `Scriptable`, mochila nativa desligada, UI opaca cobre a viewport
- **PC only (por enquanto):** sem D-pad/botões touch, sem pulo nativo — só teclado
- **1 classe:** Aventureiro (equilibrado); novas classes entram quando o balanceamento pedir
- **Painel ≡ OPÇÕES (diálogo horizontal):** abas **Tarefas** (missões + recompensas), **Mochila** (loot com EQUIPAR) e **Equipamentos** (arma/armadura/acessório equipados + REMOVER); abre pausa o jogo
- **Loot:** inimigos derrubam Espada de Ferro/Armadura de Couro (duplicata vira moedas); quest dá Anel de Valor; boss garante Espada Rúnica + Cota de Malha
- **Fontes:** `FontFace` Gotham em toda UI + contorno em todo texto; p/ Geist similar, suba o TTF (Creator Dashboard → Fonts) e ponha o ID em `FONTE_ID` (`src/client/jogo.ts`)
- **ZIndex à prova de regressão:** `ZIndexBehavior=Sibling` + camadas (mapa 1–20, HUD 50+, painel 65, telas 70) — HUD nunca mais fica atrás de tile
- **Inimigos do bioma Praia:** Zumbi de Alga, Papagaio Tropical, Marinheiro (atira!) + **Boss: Sereia da Praia** (rajadas radiais bullet-hell)
- **Controles (PC):** WASD/setas movem em todas as direções, tiro automático no inimigo mais próximo, SHIFT/L = dash (invencibilidade breve), P pausa, ≡ OPÇÕES = tarefas/mochila/equipamentos (pausa o jogo)
- **HUD do jogador sob o personagem:** plaquinha pequena com barra de vida + barra de XP + nível (topo só tem moedas, onda, quests e minimapa)
- **Visibilidade vs. botões nativos:** HUD do topo começa em x=175/y=36 (longe do ☰/chat e do placar), abaixo da topbar nativa
- **Quests:** Limpeza da Praia (8 abates), Caça ao Tesouro (25 moedas), Recompensa: Sereia (boss) — dão XP + Valor
- **Progressão:** XP → nível (+4 HP máx, cura total); moedas com imã; corações curam; morte/vitória salva via Net nos leaderstats (Moedas, Nivel, Valor)

## Rodar local

```bash
npm install
npm run build        # rbxtsc: src/*.ts -> out/*.luau
rojo build -o build.rbxlx   # gera o place
```

Dev com live-sync:

```bash
# terminal 1
npm run watch
# terminal 2
rojo serve
```

No Studio: instale o **plugin Rojo**, abra um Baseplate vazio, clique em **Connect** (`localhost:34872`). Dê Play e a UI 2D aparece — escolha a classe e jogue.

## Build automático (GitHub)

A cada `push` na `main` o workflow (Node 24, `ubuntu-24.04`):

1. `npm ci`
2. `npm run build` (rbxtsc)
3. instala Rojo 7.7.0 via download direto
4. `rojo build -o build.rbxlx`
5. publica `build.rbxlx` como Artifact (`place`)

Baixe em **Actions → último run → Artifacts → place** e abra no Studio, ou use `rojo serve` para sync direto.
