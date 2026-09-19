// Tipagem ambiente do DataModel gerenciado pelo Rojo.
// Padrão recomendado em https://roblox-ts.com/docs/guides/indexing-children
// Permite acesso tipado e seguro ao Model gerado pelo servidor.
//
// Exemplo:
//   import { Workspace } from "@rbxts/services";
//   const casa = Workspace.FindFirstChild("CasaTeste");
//   if (casa !== undefined && casa.IsA("Model")) { ... }
//
// (Acesso direto `Workspace.CasaTeste` só é seguro quando o Model
//  garantidamente existe — o servidor o destrói e recria a cada build.)

interface Workspace extends Instance {
	CasaTeste?: Model;
}
