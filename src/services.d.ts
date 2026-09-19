// Tipagem ambiente do DataModel gerenciado pelo Rojo.
// Padrão: https://roblox-ts.com/docs/guides/indexing-children
//
// Neste jogo (UI 2D pura) o servidor não cria instâncias na Workspace —
// os remotes são gerados e tipados pelo `@rbxts/net` (`shared/pixelquest/Rede.ts`),
// então nenhum `interface` ambiente é necessário aqui. Mantemos o arquivo
// como ponto de extensão: declare filhos fixos do DataModel conforme o jogo crescer.
//
// Exemplo:
//   interface ReplicatedStorage extends Instance {
//       MinhaPasta?: Folder;
//   }
