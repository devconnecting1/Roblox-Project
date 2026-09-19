/**
 * Dados do Pixel Quest 2D — inspirado no RPG 2D bullet-hell do Roblox
 * (Realm-like: explorar, desviar de projéteis, loot, XP, quests, boss).
 *
 * Tudo aqui é dado puro (sem dependência de engine), então pode ser
 * usado pelo servidor e pelo cliente.
 */

// ---------- Mundo aberto (explorável, câmera segue o jogador) ----------
// Tiles: `W` oceano (sólido) | `~` água rasa | `.` areia | `,` areia clara
//        `G` grama | `T` palmeira | `*` moita | `R` rocha (sólida)
export const MUNDO_L = 2400;
export const MUNDO_A = 1536;
export const TILE = 48;
export const MUNDO_TX = 50; // MUNDO_L / TILE
export const MUNDO_TY = 32; // MUNDO_A / TILE

export const COR_TILE: { [chave: string]: Color3 } = {
	W: Color3.fromRGB(30, 90, 160),
	"~": Color3.fromRGB(52, 152, 219),
	".": Color3.fromRGB(140, 145, 160),
	",": Color3.fromRGB(120, 125, 140),
	G: Color3.fromRGB(100, 105, 120),
	T: Color3.fromRGB(230, 126, 34),
	"*": Color3.fromRGB(70, 130, 90),
	R: Color3.fromRGB(58, 61, 68),
};

/** Geração da masmorra (dungeon crawler): salas retangulares ligadas por
 * corredores em L, com tochas e musgo de decoração. Grade refeita a cada run. */
interface Sala {
	x: number;
	y: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
}

let grade: string[][] = [];
let nascSala: [number, number] = [MUNDO_L / 2, MUNDO_A / 2];

function porChao(tx: number, ty: number): void {
	if (tx < 1 || ty < 1 || tx >= MUNDO_TX - 1 || ty >= MUNDO_TY - 1) {
		return;
	}
	grade[ty][tx] = (tx + ty) % 9 === 0 ? "," : ".";
}

function escavarCorredor(ax: number, ay: number, bx: number, by: number): void {
	const x1 = ax < bx ? ax : bx;
	const x2 = ax < bx ? bx : ax;
	for (let x = x1; x <= x2; x++) {
		porChao(x, ay);
		porChao(x, ay + 1);
	}
	const y1 = ay < by ? ay : by;
	const y2 = ay < by ? by : ay;
	for (let y = y1; y <= y2; y++) {
		porChao(bx, y);
		porChao(bx + 1, y);
	}
}

export function gerarMasmorra(): void {
	grade = [];
	for (let ty = 0; ty < MUNDO_TY; ty++) {
		const linha: string[] = [];
		for (let tx = 0; tx < MUNDO_TX; tx++) {
			linha.push("R");
		}
		grade.push(linha);
	}
	const salas: Sala[] = [];
	for (let t = 0; t < 80 && salas.size() < 12; t++) {
		const w = 5 + math.floor(math.random() * 5);
		const h = 4 + math.floor(math.random() * 4);
		const x = 2 + math.floor(math.random() * (MUNDO_TX - w - 4));
		const y = 2 + math.floor(math.random() * (MUNDO_TY - h - 4));
		let ok = true;
		for (const s of salas) {
			if (x < s.x + s.w + 1 && x + w + 1 > s.x && y < s.y + s.h + 1 && y + h + 1 > s.y) {
				ok = false;
				break;
			}
		}
		if (!ok) {
			continue;
		}
		const cx = x + math.floor(w / 2);
		const cy = y + math.floor(h / 2);
		salas.push({ x: x, y: y, w: w, h: h, cx: cx, cy: cy });
		for (let yy = y; yy < y + h; yy++) {
			for (let xx = x; xx < x + w; xx++) {
				porChao(xx, yy);
			}
		}
	}
	if (salas.size() === 0) {
		// Fallback (praticamente impossível): sala central
		for (let yy = 13; yy < 21; yy++) {
			for (let xx = 20; xx < 30; xx++) {
				porChao(xx, yy);
			}
		}
		salas.push({ x: 20, y: 13, w: 10, h: 8, cx: 25, cy: 17 });
	}
	for (let i = 1; i < salas.size(); i++) {
		escavarCorredor(salas[i - 1].cx, salas[i - 1].cy, salas[i].cx, salas[i].cy);
	}
	// Decoração: tochas junto à parede, musgo no chão
	for (let ty = 2; ty < MUNDO_TY - 2; ty++) {
		for (let tx = 2; tx < MUNDO_TX - 2; tx++) {
			const ch = grade[ty][tx];
			if (ch !== "." && ch !== ",") {
				continue;
			}
			const r = math.random();
			const pertoParede =
				grade[ty - 1][tx] === "R" || grade[ty + 1][tx] === "R" || grade[ty][tx - 1] === "R" || grade[ty][tx + 1] === "R";
			if (r < 0.04 && pertoParede) {
				grade[ty][tx] = "T";
			} else if (r < 0.12) {
				grade[ty][tx] = "*";
			}
		}
	}
	const s0 = salas[0];
	nascSala = [(s0.cx + 0.5) * TILE, (s0.cy + 0.5) * TILE];
}

/** Tile da masmorra atual (fora da grade = parede). */
export function tileNoMundo(tx: number, ty: number): string {
	if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY || grade.size() === 0) {
		return "R";
	}
	return grade[ty][tx];
}

/** Ponto de nascimento: centro da primeira sala (entrada da dungeon). */
export function pontoNascimento(): [number, number] {
	return nascSala;
}

// ---------- Mapas (seletor: 5 slots, desbloqueio por nível da conta) ----------
export interface MapaInfo {
	nome: string;
	descricao: string;
	reqNivel: number;
}

export const MAPAS: MapaInfo[] = [
	{ nome: "Masmorra Inicial", descricao: "Dungeon crawler para todos.", reqNivel: 1 },
	{ nome: "???", descricao: "Em breve.", reqNivel: 10 },
	{ nome: "???", descricao: "Em breve.", reqNivel: 20 },
	{ nome: "???", descricao: "Em breve.", reqNivel: 30 },
	{ nome: "???", descricao: "Em breve.", reqNivel: 40 },
];

export function eSolido(ch: string): boolean {
	return ch === "W" || ch === "R";
}

/** Retorna true se o círculo (x, y, raio) encosta em tile sólido. */
export function areaSolida(x: number, y: number, raio: number): boolean {
	const tx1 = math.floor((x - raio) / TILE);
	const tx2 = math.floor((x + raio) / TILE);
	const ty1 = math.floor((y - raio) / TILE);
	const ty2 = math.floor((y + raio) / TILE);
	for (let tx = tx1; tx <= tx2; tx++) {
		for (let ty = ty1; ty <= ty2; ty++) {
			if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY) {
				return true;
			}
			if (eSolido(tileNoMundo(tx, ty))) {
				return true;
			}
		}
	}
	return false;
}

/** Procura ponto caminhável perto de (x, y): espiral determinística. */
export function acharChaoPerto(x: number, y: number, raio: number): [number, number] {
	if (!areaSolida(x, y, raio)) {
		return [x, y];
	}
	let passo = TILE;
	while (passo < 600) {
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * math.pi * 2;
			const cx = x + math.cos(a) * passo;
			const cy = y + math.sin(a) * passo;
			if (cx > 60 && cy > 60 && cx < MUNDO_L - 60 && cy < MUNDO_A - 60 && !areaSolida(cx, cy, raio)) {
				return [cx, cy];
			}
		}
		passo += TILE;
	}
	return [MUNDO_L / 2, MUNDO_A / 2];
}

// ---------- Classe única (por enquanto) ----------
export interface ClasseInfo {
	nome: string;
	descricao: string;
	hpMax: number;
	dano: number;
	cadencia: number; // segundos entre tiros
	velTiro: number; // px/s do projétil
	velocidade: number; // px/s de movimento
	cor: Color3;
	tamTiro: number;
}

export const CLASSES: ClasseInfo[] = [
	{
		nome: "Aventureiro",
		descricao: "Equilibrado e corajoso. Pronto para a ilha.",
		hpMax: 42,
		dano: 9,
		cadencia: 0.3,
		velTiro: 460,
		velocidade: 185,
		cor: Color3.fromRGB(231, 76, 60),
		tamTiro: 8,
	},
];

// ---------- Itens (mochila + equipamentos) ----------
export type SlotItem = "arma" | "armadura" | "acess";

export interface ItemInfo {
	id: string;
	nome: string;
	slot: SlotItem;
	dano: number;
	hp: number;
	descricao: string;
	preco: number; // moedas ao vender duplicata
}

export const NOME_SLOT: { [k: string]: string } = {
	arma: "Arma",
	armadura: "Armadura",
	acess: "Acessório",
};

export const ITENS_INICIAIS: ItemInfo[] = [
	{ id: "espada_treino", nome: "Espada de Treino", slot: "arma", dano: 0, hp: 0, descricao: "Confiável e sem graça.", preco: 5 },
	{ id: "traje_pano", nome: "Traje de Pano", slot: "armadura", dano: 0, hp: 0, descricao: "Melhor que nada.", preco: 5 },
];

export const LOOT_COMUM: ItemInfo[] = [
	{ id: "espada_ferro", nome: "Espada de Ferro", slot: "arma", dano: 3, hp: 0, descricao: "+3 de dano.", preco: 12 },
	{ id: "armadura_couro", nome: "Armadura de Couro", slot: "armadura", dano: 0, hp: 10, descricao: "+10 de HP máx.", preco: 12 },
];

export const ANEL_VALOR: ItemInfo = {
	id: "anel_valor",
	nome: "Anel de Valor",
	slot: "acess",
	dano: 1,
	hp: 5,
	descricao: "+1 dano, +5 HP. Recompensa de quest.",
	preco: 20,
};

export const LOOT_BOSS: ItemInfo[] = [
	{ id: "espada_runica", nome: "Espada Rúnica", slot: "arma", dano: 6, hp: 0, descricao: "+6 de dano. Loot da Sereia.", preco: 30 },
	{ id: "cota_malha", nome: "Cota de Malha", slot: "armadura", dano: 0, hp: 20, descricao: "+20 de HP máx. Loot da Sereia.", preco: 30 },
];

// ---------- Inimigos do bioma ----------
export interface InimigoInfo {
	nome: string;
	hp: number;
	danoContato: number;
	velocidade: number;
	xp: number;
	moedaMin: number;
	moedaMax: number;
	cor: Color3;
	tamanho: number;
	atira: boolean;
	cadenciaTiro: number;
	velBala: number;
	danoBala: number;
}

export const INIMIGOS: InimigoInfo[] = [
	{
		nome: "Zumbi de Alga",
		hp: 18,
		danoContato: 6,
		velocidade: 70,
		xp: 8,
		moedaMin: 1,
		moedaMax: 3,
		cor: Color3.fromRGB(46, 139, 87),
		tamanho: 22,
		atira: false,
		cadenciaTiro: 0,
		velBala: 0,
		danoBala: 0,
	},
	{
		nome: "Papagaio Tropical",
		hp: 12,
		danoContato: 4,
		velocidade: 122,
		xp: 6,
		moedaMin: 1,
		moedaMax: 2,
		cor: Color3.fromRGB(241, 196, 15),
		tamanho: 18,
		atira: false,
		cadenciaTiro: 0,
		velBala: 0,
		danoBala: 0,
	},
	{
		nome: "Marinheiro",
		hp: 32,
		danoContato: 8,
		velocidade: 62,
		xp: 12,
		moedaMin: 2,
		moedaMax: 4,
		cor: Color3.fromRGB(52, 152, 219),
		tamanho: 24,
		atira: true,
		cadenciaTiro: 2.4,
		velBala: 150,
		danoBala: 5,
	},
];

export const BOSS: InimigoInfo = {
	nome: "Sereia da Praia",
	hp: 230,
	danoContato: 12,
	velocidade: 55,
	xp: 100,
	moedaMin: 15,
	moedaMax: 25,
	cor: Color3.fromRGB(155, 89, 182),
	tamanho: 40,
	atira: true,
	cadenciaTiro: 1.4,
	velBala: 130,
	danoBala: 7,
};

// ---------- Ondas ----------
export const ONDA_BOSS = 5;

/** Quantidade de inimigos (não-chefe) por onda. */
export function inimigosDaOnda(onda: number): number {
	return 3 + onda * 2;
}

// ---------- Quests (estilo "Derrote 11...") ----------
export type TipoQuest = "abates" | "moedas" | "boss";

export interface QuestInfo {
	id: string;
	nome: string;
	descricao: string;
	meta: number;
	xp: number;
	valor: number;
	tipo: TipoQuest;
}

export const QUESTS: QuestInfo[] = [
	{
		id: "limpeza",
		nome: "Limpeza da Praia",
		descricao: "Derrote 8 inimigos",
		meta: 8,
		xp: 35,
		valor: 5,
		tipo: "abates",
	},
	{
		id: "tesouro",
		nome: "Caça ao Tesouro",
		descricao: "Colete 25 moedas",
		meta: 25,
		xp: 40,
		valor: 5,
		tipo: "moedas",
	},
	{
		id: "recompensa",
		nome: "Recompensa: Sereia",
		descricao: "Derrote a Sereia da Praia",
		meta: 1,
		xp: 100,
		valor: 20,
		tipo: "boss",
	},
];

// ---------- Progressão ----------
export function xpParaNivel(nivel: number): number {
	return 20 + (nivel - 1) * 15;
}

/** Valor (moeda de derrota roguelike) ganho ao fim da run. */
export function calcularValor(moedas: number, questsCompletas: number, venceu: boolean): number {
	let valor = math.floor(moedas / 10) + questsCompletas * 5;
	if (venceu) {
		valor += 20;
	}
	return valor;
}
