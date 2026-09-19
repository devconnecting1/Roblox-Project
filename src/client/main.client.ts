import { Players } from "@rbxts/services";
import { iniciarJogo } from "client/jogo";

const jogador = Players.LocalPlayer;
if (jogador === undefined) {
	warn("[PixelQuest] LocalPlayer indisponível.");
} else {
	const playerGui = jogador.WaitForChild("PlayerGui") as PlayerGui;
	iniciarJogo(playerGui);
	print("[PixelQuest] Cliente iniciado: UI 2D pronta.");
}
