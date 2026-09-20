/**
 * Estado compartilhado (SERVIDOR) — tipos, mundo singleton e utilidades puras.
 *
 * Base do DAG de módulos: todos importam daqui, nada daqui importa irmãos.
 * Contém também `danoTotal` e `empurrarBala` (puros/compartilhados) para que
 * `foto` e `inimigos`/`projeteis` não precisem importar `jogadores`.
 */
import { CLASSES, InimigoInfo, ItemInfo, MUNDO_A, MUNDO_L } from "shared/pixelquest/Dados";
import { Porta } from "./mundo";

export type EstadoInimigo = "patrulha" | "perseguir" | "cacar";

export interface InimigoS {
	id: number;
	info: InimigoInfo;
	boss: boolean;
	area: number;
	x: number;
	y: number;
	hp: number;
	hpMax: number;
	danoContato: number;
	danoBala: number;
	tiroT: number;
	rajadaT: number;
	dormindo: boolean; // zumbi dormente: espera até barulho/proximidade (estilo WWZ)
	nv: number; // nível = área + 1 (exibido abaixo do inimigo)
	// Sentidos: visão com paredes, memória e caça em equipe
	estado: EstadoInimigo;
	alvo: JogadorS | undefined;
	vistoX: number;
	vistoY: number;
	esperaT: number;
	procT: number;
	dirWX: number;
	dirWY: number;
	ancoraX: number;
	ancoraY: number;
}

export interface BalaS {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	vida: number;
	dano: number;
	amiga: boolean;
	tam: number;
}

export interface CotS {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	tipo: "moeda" | "coracao";
	fase: number;
}

export interface QuestS {
	id: string;
	prog: number;
	completa: boolean;
}

export interface JogadorS {
	player: Player;
	x: number;
	y: number;
	fx: number;
	fy: number;
	hp: number;
	hpMax: number;
	nivel: number;
	xp: number;
	xpProx: number;
	moedas: number;
	abates: number;
	moedasColetadas: number;
	quests: QuestS[];
	questsCompletas: number;
	mochila: ItemInfo[];
	eqArma: ItemInfo | undefined;
	eqArmadura: ItemInfo | undefined;
	eqAcess: ItemInfo | undefined;
	invencT: number;
	tiroT: number;
	dashT: number;
	dashCdT: number;
	dirX: number;
	dirY: number;
	ax: number; // mira do mouse (unitário)
	ay: number;
	fogo: boolean; // atirando (mouse segurado)
	auto: boolean; // tiro automático (tecla E)
	titulos: string[]; // títulos desbloqueados (ids)
	tituloEq: string | undefined; // título equipado
	morto: boolean;
	pausado: boolean; // pausa individual (multiplayer: um pausa sem congelar os outros)
}

interface Mundo {
	ativo: boolean;
	modo: "lobby" | "dungeon"; // um mundo por servidor (party fica junta)
	mapaIdx: number; // 0 = masmorra, 1 = hospital
	hospTotal: number; // zumbis gerados no hospital (vitória = zerar)
	portas: Porta[];
	nasc: [number, number];
	areasLimpas: boolean[];
	vivosPorArea: number[];
	inimigos: InimigoS[];
	balas: BalaS[];
	cots: CotS[];
	jogadores: Map<Player, JogadorS>;
	tempo: number;
	bossVivo: boolean;
	bossMorto: boolean;
	proxId: number;
	snapT: number;
	seed: number;
}

export const mundo: Mundo = {
	ativo: false,
	modo: "lobby",
	mapaIdx: 0,
	hospTotal: 0,
	portas: [],
	nasc: [MUNDO_L / 2, MUNDO_A / 2],
	areasLimpas: [false, false, false, false, false],
	vivosPorArea: [0, 0, 0, 0, 0],
	inimigos: [],
	balas: [],
	cots: [],
	jogadores: new Map(),
	tempo: 0,
	bossVivo: false,
	bossMorto: false,
	proxId: 1,
	snapT: 0,
	seed: 0,
};

export function dist2(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
}

// ---------- Leaderstats ----------
export function garantirLeaderstats(player: Player, moedas = 0, nivel = 1, valor = 0, abates = 0): void {
	let stats = player.FindFirstChild("leaderstats");
	if (stats === undefined || !stats.IsA("Folder")) {
		const pasta = new Instance("Folder");
		pasta.Name = "leaderstats";
		pasta.Parent = player;
		stats = pasta;
	}
	const pasta = stats as Folder;
	for (const nome of ["Moedas", "Nivel", "Valor", "Abates"]) {
		const achou = pasta.FindFirstChild(nome);
		if (achou === undefined || !achou.IsA("IntValue")) {
			const v = new Instance("IntValue");
			v.Name = nome;
			v.Value = nome === "Nivel" ? nivel : nome === "Moedas" ? moedas : nome === "Abates" ? abates : valor;
			v.Parent = pasta;
		}
	}
}

export function statInt(player: Player, nome: string): IntValue | undefined {
	const stats = player.FindFirstChild("leaderstats");
	if (stats === undefined || !stats.IsA("Folder")) {
		return undefined;
	}
	const v = (stats as Folder).FindFirstChild(nome);
	if (v !== undefined && v.IsA("IntValue")) {
		return v;
	}
	return undefined;
}

export function nivelConta(player: Player): number {
	const n = statInt(player, "Nivel");
	if (n !== undefined && n.Value >= 1) {
		return n.Value;
	}
	return 1;
}

// ---------- Combate puro ----------
export function danoTotal(js: JogadorS): number {
	let d = CLASSES[0].dano;
	if (js.eqArma !== undefined) {
		d += js.eqArma.dano;
	}
	if (js.eqAcess !== undefined) {
		d += js.eqAcess.dano;
	}
	return d;
}

// ---------- Balas ----------
const MAX_BALAS = 260; // teto maior p/ tiroteio dos dois lados

/** Push com teto (anti-spam/lag: descarta excedente). */
export function empurrarBala(b: Omit<BalaS, "id">): void {
	if (mundo.balas.size() < MAX_BALAS) {
		mundo.proxId++;
		mundo.balas.push({ ...b, id: mundo.proxId });
	}
}
