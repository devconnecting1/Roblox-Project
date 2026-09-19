/**
 * Save (SERVIDOR) — conta persistente em DataStore.
 *
 * Salva Moedas/Nivel/Valor (conta) + títulos ao sair, a cada 3 min e ao
 * fechar o servidor. Mid-run conta como banco parcial: moedas da run somam,
 * nível salva o maior. Tudo com pcall (sem API no Studio = padrões locais).
 */
import { DataStoreService, Players } from "@rbxts/services";
import { PlacarDados } from "shared/pixelquest/Dados";
import { garantirLeaderstats, mundo } from "./estado";

const NOME_STORE = "PixelQuestConta";
const INTERVALO_AUTOSAVE = 180;
const CACHE_PLACAR = 60;
const COOLDOWN_RANK = 65;

export interface SaveConta {
	v: number;
	moedas: number;
	nivel: number;
	valor: number;
	abates: number;
	titulos: string[];
	tituloEq: string;
}

const PADRAO: SaveConta = {
	v: 2,
	moedas: 0,
	nivel: 1,
	valor: 0,
	abates: 0,
	titulos: ["apoiador"],
	tituloEq: "apoiador",
};
const cache = new Map<number, SaveConta>();
const ultimoRank = new Map<number, number>();
let placarCache: { t: number; dados: PlacarDados } | undefined = undefined;

function store(): DataStore | undefined {
	const [ok, ds] = pcall(() => DataStoreService.GetDataStore(NOME_STORE));
	if (!ok || ds === undefined) {
		return undefined;
	}
	return ds;
}

function chave(player: Player): string {
	return `conta_${player.UserId}`;
}

function num(v: unknown, padrao: number): number {
	return typeIs(v, "number") ? (v as number) : padrao;
}

function validar(dados: unknown): SaveConta | undefined {
	if (!typeIs(dados, "table")) {
		return undefined;
	}
	const t = dados as { [k: string]: unknown };
	if (t["v"] !== 1 && t["v"] !== 2) {
		return undefined;
	}
	const titulos: string[] = [];
	const bruto = t["titulos"];
	if (typeIs(bruto, "table")) {
		for (const id of bruto as string[]) {
			if (typeIs(id, "string")) {
				titulos.push(id);
			}
		}
	}
	if (titulos.size() === 0) {
		titulos.push("apoiador");
	}
	const eq = t["tituloEq"];
	return {
		v: 2,
		moedas: num(t["moedas"], 0),
		nivel: math.max(1, math.floor(num(t["nivel"], 1))),
		valor: num(t["valor"], 0),
		abates: math.floor(num(t["abates"], 0)),
		titulos: titulos,
		tituloEq: typeIs(eq, "string") ? (eq as string) : "apoiador",
	};
}

function lerStats(player: Player): { moedas: number; nivel: number; valor: number; abates: number } {
	const stats = player.FindFirstChild("leaderstats");
	const ler = (nome: string, padrao: number): number => {
		if (stats !== undefined && stats.IsA("Folder")) {
			const v = (stats as Folder).FindFirstChild(nome);
			if (v !== undefined && v.IsA("IntValue")) {
				return v.Value;
			}
		}
		return padrao;
	};
	return { moedas: ler("Moedas", 0), nivel: ler("Nivel", 1), valor: ler("Valor", 0), abates: ler("Abates", 0) };
}

/** Títulos salvos (novoJogador via spawn aplica na run). */
export function titulosSalvos(player: Player): [string[], string] {
	const s = cache.get(player.UserId);
	if (s === undefined) {
		return [["apoiador"], "apoiador"];
	}
	return [s.titulos, s.tituloEq];
}

export function carregarDados(player: Player): void {
	const ds = store();
	let save: SaveConta = { ...PADRAO };
	if (ds !== undefined) {
		const [ok, bruto] = pcall(() => ds.GetAsync(chave(player)));
		if (ok) {
			const val = validar(bruto);
			if (val !== undefined) {
				save = val;
			}
		} else {
			warn(`[PixelQuest] Save indisponível p/ ${player.Name} (padrões locais).`);
		}
	}
	cache.set(player.UserId, save);
	garantirLeaderstats(player, save.moedas, save.nivel, save.valor, save.abates);
	print(`[PixelQuest] Conta de ${player.Name}: Nv ${save.nivel}, $ ${save.moedas}, Valor ${save.valor}.`);
}

export function salvarDados(player: Player): void {
	const base = lerStats(player);
	const js = mundo.jogadores.get(player);
	const save: SaveConta = {
		v: 2,
		moedas: base.moedas + (js !== undefined ? math.floor(js.moedas) : 0),
		nivel: js !== undefined && js.nivel > base.nivel ? js.nivel : base.nivel,
		valor: base.valor,
		abates: base.abates + (js !== undefined ? js.abates : 0),
		titulos: js !== undefined ? js.titulos : (cache.get(player.UserId)?.titulos ?? ["apoiador"]),
		tituloEq:
			js !== undefined && js.tituloEq !== undefined ? js.tituloEq : (cache.get(player.UserId)?.tituloEq ?? "apoiador"),
	};
	cache.set(player.UserId, save);
	const ds = store();
	if (ds === undefined) {
		return;
	}
	const [ok] = pcall(() => ds.SetAsync(chave(player), save));
	if (!ok) {
		warn(`[PixelQuest] Falha ao salvar ${player.Name} (tenta no próximo autosave).`);
	}
	atualizarRank(player, save);
}

function lojaOrdenada(nome: string): OrderedDataStore | undefined {
	const [ok, ds] = pcall(() => DataStoreService.GetOrderedDataStore(nome));
	if (!ok || ds === undefined) {
		return undefined;
	}
	return ds;
}

/** Espelha Nv/Kills/Moedas nos placares ordenados (com cooldown por jogador). */
function atualizarRank(player: Player, save: SaveConta): void {
	const agora = os.clock();
	const ultimo = ultimoRank.get(player.UserId) ?? -1000;
	if (agora - ultimo < COOLDOWN_RANK) {
		return;
	}
	ultimoRank.set(player.UserId, agora);
	const pares: [string, number][] = [
		["PixelQuestNivel", save.nivel],
		["PixelQuestAbates", save.abates],
		["PixelQuestMoedas", save.moedas],
	];
	for (const [nome, valor] of pares) {
		const ds = lojaOrdenada(nome);
		if (ds !== undefined) {
			pcall(() => ds.SetAsync(`conta_${player.UserId}`, valor));
		}
	}
}

/** Top 10 por categoria (cache 60s; nomes resolvidos com fallback). */
export function placar(): PlacarDados {
	const agora = os.clock();
	if (placarCache !== undefined && agora - placarCache.t < CACHE_PLACAR) {
		return placarCache.dados;
	}
	const ler = (nome: string): { nome: string; valor: number }[] => {
		const ds = lojaOrdenada(nome);
		if (ds === undefined) {
			return [];
		}
		const [ok, paginas] = pcall(() => ds.GetSortedAsync(false, 20));
		if (!ok || paginas === undefined) {
			return [];
		}
		const linhas: { nome: string; valor: number }[] = [];
		const itens = paginas.GetCurrentPage();
		for (const item of itens) {
			const uid = tonumber((item.key as string).gsub("conta_", "")[0]) ?? 0;
			const [okNome, nomeJog] = pcall(() => Players.GetNameFromUserIdAsync(uid as never));
			linhas.push({ nome: okNome ? (nomeJog as string) : `Jogador ${item.key}`, valor: item.value as number });
		}
		return linhas;
	};
	const dados: PlacarDados = {
		nivel: ler("PixelQuestNivel"),
		kills: ler("PixelQuestAbates"),
		moedas: ler("PixelQuestMoedas"),
	};
	placarCache = { t: agora, dados: dados };
	return dados;
}

task.spawn(() => {
	while (true) {
		task.wait(INTERVALO_AUTOSAVE);
		for (const p of Players.GetPlayers()) {
			salvarDados(p);
		}
	}
});

game.BindToClose(() => {
	for (const p of Players.GetPlayers()) {
		salvarDados(p);
	}
});
