const workspace = game.GetService("Workspace");

task.wait(2);
const casa = workspace.FindFirstChild("CasaTeste");
if (casa !== undefined) {
	print(`[Client] CasaTeste encontrada com ${casa.GetChildren().size()} partes.`);
} else {
	print("[Client] CasaTeste ainda não existe (aguarde o servidor ou o Rojo).");
}
