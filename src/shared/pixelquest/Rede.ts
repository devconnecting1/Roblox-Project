/**
 * Rede do Pixel Quest 2D — `@rbxts/net` (biblioteca recomendada na doc
 * roblox-ts para tráfego tipado) + validação `@rbxts/t` no servidor.
 *
 * Regra da doc (api/roblox-api): tráfego cliente→servidor NÃO é confiável.
 * O Net gera os remotes; o servidor ainda valida o payload estrito
 * antes de tocar nos leaderstats.
 */
import Net from "@rbxts/net";
import { t } from "@rbxts/t";

export interface SavePayload {
	moedas: number;
	nivel: number;
	valor: number;
	vitoria: boolean;
}

/** Remotes tipados (cliente→servidor). */
export const Remotes = Net.Definitions.Create({
	SalvarRun: Net.Definitions.ClientToServerEvent<[payload: SavePayload]>(),
});

/** Validador estrito: rejeita campos extras, tipos errados ou fora da faixa. */
export const eSavePayload = t.strictInterface({
	moedas: t.numberConstrained(0, 999999),
	nivel: t.numberConstrained(1, 100),
	valor: t.numberConstrained(0, 999999),
	vitoria: t.boolean,
});
