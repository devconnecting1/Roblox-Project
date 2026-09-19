# Roblox-Project — Casa 3D de Teste (roblox-ts + Rojo)

Casa construída 100% via código TypeScript compilado para Luau, pronta para usar no **Roblox Studio via plugin do Rojo**.

- Engine: [roblox-ts](https://roblox-ts.com/) 3.x (TypeScript → Luau)
- Sync/build: [Rojo](https://rojo.space/) 7.7.0 (`servePort: 34872`)
- Deps [@rbxts](https://www.npmjs.com/org/rbxts): `@rbxts/services` (acesso tipado aos Services), `@rbxts/t` (validação runtime)
- Build automático: GitHub Actions (`.github/workflows/build.yml`) gera `build.rbxlx` a cada push na `main`.

## Boas práticas (docs)

- [roblox-ts API](https://roblox-ts.com/docs/api/roblox-api): `new Instance()`/`new Vector3()`, `undefined` = `nil`, `typeIs`/validadores para dados externos
- [Indexing children](https://roblox-ts.com/docs/guides/indexing-children): `FindFirstChild + IsA` em vez de indexação direta; tipos do DataModel em `src/services.d.ts`
- [Syncing with Rojo](https://roblox-ts.com/docs/guides/syncing-with-rojo): `$path` relativos a `out/`, `rbxts_include` em `ReplicatedStorage`
- [Rojo project format](https://rojo.space/docs/v7/project-format/): `servePort` fixo; [sync details](https://rojo.space/docs/v7/sync-details/): `*.server.ts` → `Script`, `*.client.ts` → `LocalScript`

## Estrutura

```
src/
  server/main.server.ts   -> chama construirCasa()
  client/main.client.ts   -> verifica CasaTeste na Workspace (services + IsA guard)
  shared/Casa.ts          -> construtor da casa (Part, WedgePart, Cylinder, Ball, PointLight + validação @rbxts/t)
  services.d.ts           -> tipagem ambiente do DataModel (Workspace.CasaTeste?)
default.project.json      -> mapeia out/ para DataModel (ServerScriptService, ReplicatedStorage, StarterPlayer)
out/                      -> Luau gerado pelo rbxtsc (ignorado no git)
build.rbxlx               -> place gerado pelo rojo (ignorado no git, disponível como Artifact no CI)
```

## A Casa (Model `CasaTeste`)

Elementos 3D de teste incluídos:

- Fundação + piso, 4 paredes de tijolos
- Telhado 2 águas (2 Parts inclinados) + cumeeira + 2 frontões `WedgePart`
- Porta de madeira, 5 janelas de vidro (`Glass`, transparência 0.3)
- Chaminé, 2 colunas `Cylinder`, lâmpada `Ball` neon, escada com 3 degraus
- `PointLight` interna + tudo `Anchored`

Para mudar tamanho/posição edite `src/shared/Casa.ts` → `construirCasa({ centro, largura, alturaParede, profundidade })`.

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

No Studio: instale o **plugin Rojo**, abra um Baseplate vazio, clique em **Connect** (porta do `rojo serve`, ex `localhost:34872`). Edite `src/` e veja a `CasaTeste` atualizar em tempo real.

## Build automático (GitHub)

A cada `push` na `main` o workflow:

1. `npm ci`
2. `npm run build` (rbxtsc)
3. instala Rojo via `rojo-rbx/setup-rojo`
4. `rojo build -o build.rbxlx`
5. publica `build.rbxlx` como Artifact (`place`)

Baixe em **Actions → último run → Artifacts → place** e abra no Studio, ou use `rojo serve` para sync direto.

## Publicar / conectar no Studio

- Opção A (arquivo): baixe `build.rbxlx` do CI e abra no Roblox Studio.
- Opção B (Rojo): `rojo serve` + plugin Rojo → Connect.
