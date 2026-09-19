import { Players, RunService } from "@rbxts/services";
import { eEntrada, eIdTexto, eMapaIdx, Remotes } from "shared/pixelquest/Rede";
import { alternarPausa, aplicarEntrada, equiparItem, removerJogador, removerSlot } from "./jogadores";
import { garantirLeaderstats, mundo, nivelConta } from "./estado";
import { atualizar, escolherMapa } from "./simulacao";

// Jogo 100% interface 2D: o avatar 3D nunca nasce.
Players.CharacterAutoLoads = false;
// Chat: TextChatService nativo (ChatVersion é read-only em runtime — garanta
// TextChatService nas propriedades do place). A janela/histórico é nativa; os
// balões 2D sobre os sprites são desenhados pelo cliente.

Players.PlayerAdded.Connect((player) => garantirLeaderstats(player));
for (const player of Players.GetPlayers()) {
	garantirLeaderstats(player);
}
Players.PlayerRemoving.Connect((player) => removerJogador(player));

// Cliente → servidor (tudo validado; estado mora no servidor)
Remotes.Server.Get("Entrada").Connect((player, entrada) => {
	if (!eEntrada(entrada)) {
		warn(`[PixelQuest] Entrada inválida de ${player.Name} (ignorada).`);
		return;
	}
	if (!mundo.jogadores.has(player)) {
		warn(`[PixelQuest] Entrada de ${player.Name} sem run ativa (ignorada).`);
		return;
	}
	aplicarEntrada(player, entrada);
});

Remotes.Server.Get("Pausa").Connect((player) => {
	alternarPausa(player);
});

Remotes.Server.Get("Equipar").Connect((player, id) => {
	if (!eIdTexto(id)) {
		return;
	}
	equiparItem(player, id);
});

Remotes.Server.Get("Remover").Connect((player, slot) => {
	if (!eIdTexto(slot) || (slot !== "arma" && slot !== "armadura" && slot !== "acess" && slot !== "titulo")) {
		return;
	}
	removerSlot(player, slot);
});

Remotes.Server.Get("EscolherMapa").Connect((player, mapa) => {
	if (!eMapaIdx(mapa)) {
		return;
	}
	if (nivelConta(player) < 1) {
		return;
	}
	escolherMapa(player, mapa);
});

// Loop autoritativo
RunService.Heartbeat.Connect((dt) => {
	atualizar(dt);
});

print("[PixelQuest] Servidor autoritativo no ar (sim + snapshots + leaderstats).");
