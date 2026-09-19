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
  shared/pixelquest/Dados.ts  -> classes, inimigos, boss, quests, mapa, progressão (puro)
  shared/pixelquest/Rede.ts   -> Remotes Net tipados (SalvarRun) + validador eSavePayload
  services.d.ts               -> ponto de extensão p/ tipos do DataModel
default.project.json          -> mapeia out/ para DataModel (ServerScriptService, ReplicatedStorage, StarterPlayer)
out/                          -> Luau gerado pelo rbxtsc (ignorado no git)
build.rbxlx                   -> place gerado pelo rojo (ignorado no git, Artifact no CI)
```

## O jogo

- **Classes:** Guerreiro (HP 46, dano alto), Mago (HP 36, tiro rápido), Ladino (HP 40, veloz)
- **Inimigos do bioma Praia:** Zumbi de Alga, Papagaio Tropical, Marinheiro (atira!) + **Boss: Sereia da Praia** (rajadas radiais bullet-hell)
- **Controles:** WASD/setas ou D-pad (mover em todas as direções), tiro automático no inimigo mais próximo, SHIFT/L ou botão DASH (invencibilidade breve), P pausa
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
