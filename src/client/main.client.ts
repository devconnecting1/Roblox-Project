import { Workspace } from "@rbxts/services";

task.wait(2);

// FindFirstChild + IsA em vez de indexação direta `Workspace.CasaTeste`:
// indexar um filho inexistente gera erro em Luau
// (ver guides/indexing-children + src/services.d.ts).
const casa = Workspace.FindFirstChild("CasaTeste");
if (casa !== undefined && casa.IsA("Model")) {
	print(`[Client] CasaTeste encontrada com ${casa.GetChildren().size()} partes.`);
} else {
	print("[Client] CasaTeste ainda não existe (aguarde o servidor ou o Rojo).");
}
