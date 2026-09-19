/**
 * Rede do Pixel Quest 2D — `@rbxts/net` (remotes tipados) + `@rbxts/t`.
 *
 * Anti-cheat: o servidor NUNCA confia no cliente. Entradas e ações são
 * validadas (faixa + posse) antes de qualquer efeito; todo estado de jogo
 * (posição, vida, dano, inimigos, loot, portas) vive só no servidor e desce
 * via snapshots (`Foto`) + eventos (`Evento`).
 */
import Net from "@rbxts/net";
import { t } from "@rbxts/t";
import { EntradaPayload, EventoPayload, Foto } from "./Dados";

/** Remotes tipados. */
export const Remotes = Net.Definitions.Create({
	// Cliente → servidor
	Entrada: Net.Definitions.ClientToServerEvent<[entrada: EntradaPayload]>(),
	Pausa: Net.Definitions.ClientToServerEvent<[]>(),
	Equipar: Net.Definitions.ClientToServerEvent<[id: string]>(),
	Remover: Net.Definitions.ClientToServerEvent<[slot: string]>(),
	EscolherMapa: Net.Definitions.ClientToServerEvent<[mapa: number]>(),
	Entrar: Net.Definitions.ClientToServerEvent<[]>(),
	Lobby: Net.Definitions.ClientToServerEvent<[]>(),
	Placar: Net.Definitions.ClientToServerEvent<[]>(),
	// Servidor → cliente
	Foto: Net.Definitions.ServerToClientEvent<[foto: Foto]>(),
	Evento: Net.Definitions.ServerToClientEvent<[ev: EventoPayload]>(),
});

// ---------- Validadores (servidor) ----------
export const eEntrada = t.strictInterface({
	dx: t.numberConstrained(-1, 1),
	dy: t.numberConstrained(-1, 1),
	ax: t.numberConstrained(-1, 1),
	ay: t.numberConstrained(-1, 1),
	fogo: t.boolean,
	auto: t.boolean,
	dash: t.boolean,
});

export const eIdTexto = t.string;
export const eMapaIdx = t.numberConstrained(0, 4);
