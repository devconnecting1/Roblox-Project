/**
 * Dados do Pixel Quest 2D — inspirado no RPG 2D bullet-hell do Roblox
 * (Realm-like: explorar, desviar de projéteis, loot, XP, quests, boss).
 *
 * Arquitetura anti-cheat: o SERVIDOR é autoridade de tudo (posição, dano,
 * inimigos, loot, portas). O cliente só renderiza e envia inputs. Tudo aqui
 * é dado puro + tipos de protocolo, usável dos dois lados.
 */

// ---------- Mundo (quadrado, procedural no servidor) ----------
// Tiles: `W` (sólido) | `~` água | `.`/`,` chão | `G` pedra | `T` tocha
//        `*` musgo | `R` parede (sólida) | `D` porta trancada (sólida)
export const MUNDO_L = 2400;
export const MUNDO_A = 2400;
export const TILE = 48;
export const MUNDO_TX = 50; // MUNDO_L / TILE
export const MUNDO_TY = 50; // MUNDO_A / TILE

/** Raio de visão do Fog of War (px). */
export const VISAO = 340;

/** Total de áreas da masmorra (última = boss). */
export const TOTAL_AREAS = 5;

export const COR_TILE: { [chave: string]: Color3 } = {
	W: Color3.fromRGB(30, 90, 160),
	"~": Color3.fromRGB(52, 152, 219),
	".": Color3.fromRGB(140, 145, 160),
	",": Color3.fromRGB(120, 125, 140),
	G: Color3.fromRGB(100, 105, 120),
	T: Color3.fromRGB(230, 126, 34),
	"*": Color3.fromRGB(70, 130, 90),
	R: Color3.fromRGB(58, 61, 68),
	D: Color3.fromRGB(94, 234, 212),
};

export function eSolido(ch: string): boolean {
	return ch === "W" || ch === "R" || ch === "D";
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
		descricao: "Equilibrado e corajoso. Pronto para a masmorra.",
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

const TODOS_ITENS: ItemInfo[] = [ITENS_INICIAIS[0], ITENS_INICIAIS[1], LOOT_COMUM[0], LOOT_COMUM[1], ANEL_VALOR, LOOT_BOSS[0], LOOT_BOSS[1]];

export const ITEM_POR_ID: { [id: string]: ItemInfo } = {};
for (const it of TODOS_ITENS) {
	ITEM_POR_ID[it.id] = it;
}

// ---------- Inimigos ----------
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

/** Inimigos por área (0–3; área 4 = boss). */
export const INIMIGOS_POR_AREA: number[] = [6, 7, 8, 9];

/** Tipos desbloqueados por área (índices em INIMIGOS). */
export function tiposPorArea(area: number): number[] {
	if (area < 1) {
		return [0];
	} else if (area < 2) {
		return [0, 1];
	}
	return [0, 1, 2];
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
		nome: "Limpeza da Masmorra",
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

/** Valor (moeda roguelike) ganho ao fim da run. */
export function calcularValor(moedas: number, questsCompletas: number, venceu: boolean): number {
	let valor = math.floor(moedas / 10) + questsCompletas * 5;
	if (venceu) {
		valor += 20;
	}
	return valor;
}

// ---------- Protocolo rede (cliente↔servidor, via @rbxts/net) ----------
export interface EntradaPayload {
	dx: number; // -1..1
	dy: number; // -1..1
	dash: boolean; // borda de subida: servidor aplica se cooldown ok
}

export interface FotoInimigo {
	id: number;
	x: number;
	y: number;
	hp: number;
	hpMax: number;
	tam: number;
	boss: boolean;
	r: number;
	g: number;
	b: number;
}

export interface FotoBala {
	x: number;
	y: number;
	amiga: boolean;
	tam: number;
}

export interface FotoCot {
	id: number;
	x: number;
	y: number;
	tipo: string; // "moeda" | "coracao"
}

export interface FotoJogador {
	nome: string;
	x: number;
	y: number;
	nv: number;
	r: number;
	g: number;
	b: number;
}

export interface FotoQuest {
	id: string;
	prog: number;
	completa: boolean;
}

export interface Foto {
	px: number;
	py: number;
	hp: number;
	hpMax: number;
	nivel: number;
	xp: number;
	xpProx: number;
	moedas: number;
	dano: number;
	area: number; // área atual do jogador (0–4)
	abates: number;
	inimigos: FotoInimigo[];
	balas: FotoBala[];
	cots: FotoCot[];
	jogadores: FotoJogador[];
	quests: FotoQuest[];
	questsCompletas: number;
	bossFracao: number; // -1 = sem boss à vista
	mochila: string[];
	eqArma: string;
	eqArmadura: string;
	eqAcess: string;
	pausado: boolean;
	areasAbertas: number; // bitmask das áreas liberadas
}

export type EventoPayload =
	| { tipo: "mapa"; grade: string[] }
	| { tipo: "porta"; tx: number; ty: number }
	| { tipo: "banner"; texto: string; duracao: number }
	| { tipo: "fim"; venceu: boolean; area: number; nivel: number; abates: number; moedas: number; quests: number; valor: number };
