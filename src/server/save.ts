/**
 * Save (SERVIDOR) — conta persistente em DataStore.
 *
 * Salva Moedas/Nivel/Valor (conta) + títulos ao sair, a cada 3 min e ao
 * fechar o servidor. Mid-run conta como banco parcial: moedas da run somam,
 * nível salva o maior. Tudo com pcall (sem API no Studio = padrões locais).
 */
import { DataStoreService, Players } from "@rbxts/services";
import { garantirLeaderstats, mundo } from "./estado";

const NOME_STORE = "PixelQuestConta";
const INTERVALO_AUTOSAVE = 180;

export interface SaveConta {
	v: number;
	moedas: number;
	nivel: number;
	valor: number;
	titulos: string[];
	tituloEq: string;
}

const PADRAO: SaveConta = { v: 1, moedas: 0, nivel: 1, valor: 0, titulos: ["apoiador"], tituloEq: "apoiador" };
const cache = new Map<number, SaveConta>();

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
	if (t["v"] !== 1) {
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
		v: 1,
		moedas: num(t["moedas"], 0),
		nivel: math.max(1, math.floor(num(t["nivel"], 1))),
		valor: num(t["valor"], 0),
		titulos: titulos,
		tituloEq: typeIs(eq, "string") ? (eq as string) : "apoiador",
	};
}

function lerStats(player: Player): { moedas: number; nivel: number; valor: number } {
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
	return { moedas: ler("Moedas", 0), nivel: ler("Nivel", 1), valor: ler("Valor", 0) };
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
	garantirLeaderstats(player, save.moedas, save.nivel, save.valor);
	print(`[PixelQuest] Conta de ${player.Name}: Nv ${save.nivel}, $ ${save.moedas}, Valor ${save.valor}.`);
}

export function salvarDados(player: Player): void {
	const base = lerStats(player);
	const js = mundo.jogadores.get(player);
	const save: SaveConta = {
		v: 1,
		moedas: base.moedas + (js !== undefined ? math.floor(js.moedas) : 0),
		nivel: js !== undefined && js.nivel > base.nivel ? js.nivel : base.nivel,
		valor: base.valor,
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
