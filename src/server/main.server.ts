import { Players } from "@rbxts/services";
import { Remotes, eSavePayload } from "shared/pixelquest/Rede";

/** Cria leaderstats (Moedas/Nivel/Valor) se ainda não existir. */
function configurarLeaderstats(jogador: Player): void {
	let stats = jogador.FindFirstChild("leaderstats");
	if (stats === undefined || !stats.IsA("Folder")) {
		const pasta = new Instance("Folder");
		pasta.Name = "leaderstats";
		pasta.Parent = jogador;
		stats = pasta;
	}
	const pasta = stats as Folder;
	const nomes = ["Moedas", "Nivel", "Valor"];
	for (const nome of nomes) {
		const achou = pasta.FindFirstChild(nome);
		if (achou === undefined || !achou.IsA("IntValue")) {
			const v = new Instance("IntValue");
			v.Name = nome;
			v.Value = nome === "Nivel" ? 1 : 0;
			v.Parent = pasta;
		}
	}
}

function aplicarSave(jogador: Player, moedas: number, nivel: number, valor: number): void {
	configurarLeaderstats(jogador);
	const stats = jogador.FindFirstChild("leaderstats") as Folder;
	const m = stats.FindFirstChild("Moedas") as IntValue;
	const n = stats.FindFirstChild("Nivel") as IntValue;
	const v = stats.FindFirstChild("Valor") as IntValue;
	// Acumula (roguelike: cada run soma ao total da conta)
	m.Value += math.floor(moedas);
	if (math.floor(nivel) > n.Value) {
		n.Value = math.floor(nivel);
	}
	v.Value += math.floor(valor);
}

// Salva fim de run via Net — payload validado (t strict) antes de tocar nos stats.
Remotes.Server.Get("SalvarRun").Connect((jogador, payload) => {
	if (!eSavePayload(payload)) {
		warn(`[PixelQuest] Payload inválido de ${jogador.Name} — ignorado.`);
		return;
	}
	aplicarSave(jogador, payload.moedas, payload.nivel, payload.valor);
	print(`[PixelQuest] Run salva: ${jogador.Name} nv${payload.nivel} $${payload.moedas} +${payload.valor} valor (vitoria=${payload.vitoria}).`);
});

Players.PlayerAdded.Connect((jogador) => configurarLeaderstats(jogador));
for (const jogador of Players.GetPlayers()) {
	configurarLeaderstats(jogador);
}

print("[PixelQuest] Servidor pronto: remotes Net + leaderstats no ar.");
