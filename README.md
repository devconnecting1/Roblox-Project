# Roblox-Project — Pixel Quest 2D (roblox-ts + Rojo + Net)

Jogo **puramente em interfaces 2D** (ScreenGui, zero peças 3D), inspirado no
[Pixel Quest](https://www.roblox.com/games/80003276594057/Pixel-Quest) do Roblox:
RPG top-down bullet-hell estilo Realm of the Mad God.

**O loop:** explore a masmorra em todas as direções → desvie dos projéteis rosas →
limpe cada área para abrir as portas → derrote a **Sereia da Praia** na área 5.
Morreu? Ganha **Valor** para a próxima run (roguelike).
- **Lobby (3 áreas, sem fog, sem tela de menu):** entra direto no lobby (mundo único por servidor — a party fica junta); fique **3s no selo** (a borda preenche em volta; sair cancela) — **MAPAS** abre o seletor, **ENCANTAMENTO** mostra em breve, **LEADERBOARDS** abre o top 20 global de Nível/Matança/Moedas (OrderedDataStores, cache 60s); fim de run tem botão LOBBY (regen + todos juntos)

- Engine: [roblox-ts](https://roblox-ts.com/) 3.x (TypeScript → Luau)
- Sync/build: [Rojo](https://rojo.space/) 7.7.0 (`servePort: 34872`)
- Deps [@rbxts](https://www.npmjs.com/org/rbxts): `@rbxts/services`, `@rbxts/t` (validação), `@rbxts/net` (remotes tipados)
- Build automático: GitHub Actions (`.github/workflows/build.yml`, Node 24) gera `build.rbxlx` a cada push na `main`.
- Qualidade: Prettier (`.prettierrc`: tabs, aspas duplas, 120 col) com `npm run check:format` no CI + ESLint oficial (`eslint-plugin-roblox-ts`, `npm run lint` no CI). Nota: o projeto usa TypeScript 7 (nativo, sem API), então o `typescript` das ferramentas é o alias `@typescript/typescript6` (recomendação oficial da MS p/ typescript-eslint) — o compilador `roblox-ts` usa o TS próprio dele, sem impacto no jogo.

## Boas práticas (docs)

- [roblox-ts API](https://roblox-ts.com/docs/api/roblox-api): `new Instance()`/`new Vector2()`, `undefined` = `nil`, validação de dados externos (aqui: `@rbxts/t` + `@rbxts/net`)
- [Indexing children](https://roblox-ts.com/docs/guides/indexing-children): `FindFirstChild + IsA`, tipos do DataModel em `src/services.d.ts`
- [Syncing with Rojo](https://roblox-ts.com/docs/guides/syncing-with-rojo): `$path` relativos a `out/`, `rbxts_include` em `ReplicatedStorage`
- [Rojo project format](https://rojo.space/docs/v7/project-format/) + [sync details](https://rojo.space/docs/v7/sync-details/): `*.server.ts` → `Script`, `*.client.ts` → `LocalScript`

## Estrutura

```
src/
  server/main.server.ts       -> leaderstats + remotes Net (validados com t strict)
  server/simulacao.ts   -> ORQUESTRADOR: novaMasmorra/escolherMapa/spawn + atualizar()
  server/estado.ts      -> tipos + mundo singleton + utils (danoTotal, empurrarBala, leaderstats)
  server/visao.ts       -> linha de visão (temVisada, alertas) — fog é o limite dos 2 lados
  server/foto.ts        -> Evento (mapa/porta/banner/fim) + Foto 20Hz com fog
  server/jogadores.ts   -> ciclo de vida, input, pausa individual, inventário, XP/quests, cots
  server/inimigos.ts    -> spawn por área, IA com sentidos, matarInimigo, separação
  server/projeteis.ts   -> balas voam/morrem na parede/colidem
  client/main.client.ts       -> bootstrap: PlayerGui -> iniciarJogo()
  client/jogo.ts              -> UI 2D + loop (menu, mapas, arena, HUD, quests, boss, fim)
  client/ui.ts          -> construtores de UI + fonte + paleta (puro, sem estado)
  client/efeitos.ts     -> floaters + cinemática de level-up (anel/flash/pisca)
  shared/pixelquest/Dados.ts  -> classes, inimigos, boss, quests, mundo aberto + colisão (puro)
  shared/pixelquest/Rede.ts   -> Remotes Net tipados (SalvarRun) + validador eSavePayload
  services.d.ts               -> ponto de extensão p/ tipos do DataModel
default.project.json          -> mapeia out/ para DataModel (ServerScriptService, ReplicatedStorage, StarterPlayer)
out/                          -> Luau gerado pelo rbxtsc (ignorado no git)
build.rbxlx                   -> place gerado pelo rojo (ignorado no git, Artifact no CI)
```

## Arquitetura anti-cheat (servidor autoritativo)

- **Servidor** (`src/server/simulacao.ts` + `mundo.ts`): mundo procedural 60×60 em 5 áreas, movimento com colisão, dano, inimigos, balas, loot, quests, portas e XP. Inputs do cliente são validados (`@rbxts/t`: faixa + posse) e normalizados (sem speed hack).
- **Rede** (`shared/pixelquest/Rede.ts`, `@rbxts/net`): cliente→servidor (`Entrada`, `Pausa`, `Equipar`, `Remover`, `EscolherMapa`); servidor→cliente (`Foto` 20Hz filtrada pelo Fog of War, `Evento` p/ mapa/portas/banners/fim).
- **Cliente** (`src/client/jogo.ts`): só renderiza (câmera livre, fog, HUD) e envia inputs. Nada de jogo é decidido aqui — trapaça de cliente não tem efeito. Sem minimapa.

## O jogo

- **Mundo quadrado 2880×2880 procedural com seed (estilo Minecraft):** mesma seed = mesma masmorra (a seed aparece na linha de debug embaixo); 5 áreas longas com salas + corredores; portas ciano abrem só ao limpar a área (áreas trancadas nascem vazias e só são povoadas ao liberar a anterior); área 5 tem o boss (spawna ao entrar). Corredores que "terminam no preto" são só fog escondendo a continuação — a conectividade é garantida por construção (salas em cadeia + ligação entre bandas)
- **IA com sentidos:** inimigos só enxergam com linha de visão (paredes bloqueiam, alcance 420px), guardam a última posição vista, vasculham e desistem; quem avista **alerta a equipe** próxima para caçar junto; patrulha com coleira na âncora; tiros e rajadas só com visão
- **Fog of War com linha de visão (simétrico):** parede bloqueia a visão do jogador E dos inimigos; o fog é o limite de visão dos dois lados; explorado fica escurecido, inexplorado some (fundo preto); balas morrem na parede
- **Tiles chapados + cache por tile do mundo:** paredes cinza sem detalhe, inexplorado invisível; o mapa é só dado (60 strings) e a tela é uma janela deslizante — o cache (char + estado de névoa por tile) pula ~90% das escritas no scroll
- **Câmera com dead zone:** o jogador se move livre no centro da tela (zona 40% + folga do HUD/placa/debug); a câmera só acompanha (suavizada) ao encostar nas margens, sem travas de borda (no limite aparece Rocha); sprite do jogador interpolado entre snapshots (fluido a 20Hz)
- **Multiplayer (Roblox + Studio):** mundo compartilhado por servidor (estilo MMO) — entrar no meio da run não reseta quem já joga; pausa individual (P/botão pausa só você, inimigos te ignoram); cada jogador tem fog/snapshot próprio; balas/coletáveis com ID + interpolação; teste com 2+ players via Test → Clients and Servers
- **Chat com balões 2D:** janela/histórico nativos (TextChatService); balão sobre o sprite por 5s só no canal geral — privado não gera balão; painel de quests foi para a direita para não cobrir o chat
- **Otimizado:** snapshots 20Hz, sem simulação sem jogadores, teto de balas, explorado recalculado só ao trocar de tile, HUD/placa só reescrevem no que muda, labels PQ_* no MicroProfiler, tiles apagados ao trocar de mundo (sem frame velho), próxima dungeon pré-gerada na vitória (DeNovo instantâneo)
- **Sem ondas:** inimigos nascem nos caminhos de cada área liberada; progressão = limpar → avançar
- **Seletor em carrossel (estilo 9Kings):** fundo preto, 5 cartas verticais sobrepostas (centro maior na frente); clique gira a carta ao centro, clique de novo confirma (cadeado + Nv nas trancadas); chrome do HUD 100% neutro (títulos, botões, painéis, bordas e moedas em branco/cinza — cor só onde é semântica: vida, XP, dano sofrido, boss)
- **Zero 3D:** `CharacterAutoLoads=false` (no `default.project.json` + fallback no servidor) — o avatar nunca nasce/morre; câmera `Scriptable`, mochila nativa desligada, UI opaca cobre a viewport
- **PC only (por enquanto):** sem D-pad/botões touch, sem pulo nativo — só teclado
- **1 classe:** Aventureiro (equilibrado); novas classes entram quando o balanceamento pedir
- **Painel ≡ OPÇÕES (diálogo horizontal):** abas **Tarefas** (missões + recompensas), **Mochila** (loot com EQUIPAR) e **Equipamentos** (arma/armadura/acessório equipados + REMOVER); abre pausa o jogo
- **Loot:** inimigos derrubam Espada de Ferro/Armadura de Couro (duplicata vira moedas); quest dá Anel de Valor; boss garante Espada Rúnica + Cota de Malha
- **Fontes:** `FontFace` Gotham em toda UI + contorno em todo texto; p/ Geist similar, suba o TTF (Creator Dashboard → Fonts) e ponha o ID em `FONTE_ID` (`src/client/jogo.ts`)
- **ZIndex à prova de regressão:** `ZIndexBehavior=Sibling` + camadas (mapa 1–20, HUD 50+, painel 65, telas 70) — HUD nunca mais fica atrás de tile
- **Inimigos do bioma Praia:** Zumbi de Alga, Papagaio Tropical, Marinheiro (tiro único!), **Caranguejo Apressado** (rápido), **Água-Viva** (leque de 3), **Tubarão** (perseguidor frenético) + **Boss: Sereia da Praia** (rajadas radiais bullet-hell); metralhadora dos dois lados com TTK preservado (dano por bala menor, HP compensado)
- **Controles (PC):** WASD/setas movem, **mouse mira**, BOTÃO ESQ segurado atira, E liga/desliga tiro automático no mouse, BOTÃO DIR = dash (invencibilidade breve), P pausa individual, ≡ OPÇÕES = tarefas/mochila/equip/títulos (pausa só você)
- **HUD do jogador sob o personagem:** plaquinha com username + barra de vida + barra de XP + nível + **título equipado** (aba TÍTULOS no painel; "Apoiador Inicial" liberado); o olho branco do sprite aponta para a mira; **inimigos mostram Nv (área+1)** abaixo deles
- **Visibilidade vs. botões nativos:** HUD do topo começa em x=175/y=36 (longe do ☰/chat e do placar), abaixo da topbar nativa
- **Quests:** Limpeza da Praia (8 abates), Caça ao Tesouro (25 moedas), Recompensa: Sereia (boss) — dão XP + Valor
- **Progressão:** XP → nível (+4 HP máx, cura total); moedas com imã; corações curam; morte/vitória salva via Net nos leaderstats (Moedas, Nivel, Valor)
- **Save em DataStore (`server/save.ts`):** conta persistente (`PixelQuestConta/conta_<UserId>`, v1) — carrega ao entrar, salva ao sair + autosave 3min + BindToClose; sair no meio da run banca as moedas e guarda o maior nível; sem acesso à API (Studio) usa padrões locais sem quebrar
- **UI por componentes (nosso "shadcn"):** shadcn React/DOM não roda no Roblox — o equivalente é `client/ui.ts` (Button/Card/Badge/Tabs/Progress/Text com variantes via parâmetros) + `efeitos.ts` + `chat.ts`, todos puros e sem estado de jogo

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
