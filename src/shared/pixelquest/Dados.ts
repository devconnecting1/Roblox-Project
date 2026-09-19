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
export const MUNDO_L = 2880;
export const MUNDO_A = 2880;
export const TILE = 48;
export const MUNDO_TX = 60; // MUNDO_L / TILE
export const MUNDO_TY = 60; // MUNDO_A / TILE

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
		dano: 5, // metralhadora: balas rápidas e fracas (DPS ~45)
		cadencia: 0.11,
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
	{
		id: "espada_treino",
		nome: "Espada de Treino",
		slot: "arma",
		dano: 0,
		hp: 0,
		descricao: "Confiável e sem graça.",
		preco: 5,
	},
	{
		id: "traje_pano",
		nome: "Traje de Pano",
		slot: "armadura",
		dano: 0,
		hp: 0,
		descricao: "Melhor que nada.",
		preco: 5,
	},
];

export const LOOT_COMUM: ItemInfo[] = [
	{ id: "espada_ferro", nome: "Espada de Ferro", slot: "arma", dano: 3, hp: 0, descricao: "+3 de dano.", preco: 12 },
	{
		id: "armadura_couro",
		nome: "Armadura de Couro",
		slot: "armadura",
		dano: 0,
		hp: 10,
		descricao: "+10 de HP máx.",
		preco: 12,
	},
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
	{
		id: "espada_runica",
		nome: "Espada Rúnica",
		slot: "arma",
		dano: 6,
		hp: 0,
		descricao: "+6 de dano. Loot da Sereia.",
		preco: 30,
	},
	{
		id: "cota_malha",
		nome: "Cota de Malha",
		slot: "armadura",
		dano: 0,
		hp: 20,
		descricao: "+20 de HP máx. Loot da Sereia.",
		preco: 30,
	},
];

const TODOS_ITENS: ItemInfo[] = [
	ITENS_INICIAIS[0],
	ITENS_INICIAIS[1],
	LOOT_COMUM[0],
	LOOT_COMUM[1],
	ANEL_VALOR,
	LOOT_BOSS[0],
	LOOT_BOSS[1],
];

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
	tiros: number; // balas por disparo (1 = mira única, 3 = leque)
}

export const INIMIGOS: InimigoInfo[] = [
	{
		nome: "Zumbi de Alga",
		hp: 26,
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
		tiros: 1,
	},
	{
		nome: "Papagaio Tropical",
		hp: 18,
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
		tiros: 1,
	},
	{
		nome: "Marinheiro",
		hp: 48,
		danoContato: 8,
		velocidade: 62,
		xp: 12,
		moedaMin: 2,
		moedaMax: 4,
		cor: Color3.fromRGB(52, 152, 219),
		tamanho: 24,
		atira: true,
		cadenciaTiro: 1.1,
		velBala: 170,
		danoBala: 5,
		tiros: 1,
	},
	{
		nome: "Caranguejo Apressado",
		hp: 22,
		danoContato: 6,
		velocidade: 150,
		xp: 10,
		moedaMin: 1,
		moedaMax: 3,
		cor: Color3.fromRGB(210, 110, 40),
		tamanho: 20,
		atira: false,
		cadenciaTiro: 0,
		velBala: 0,
		danoBala: 0,
		tiros: 1,
	},
	{
		nome: "Água-Viva",
		hp: 26,
		danoContato: 5,
		velocidade: 55,
		xp: 12,
		moedaMin: 2,
		moedaMax: 4,
		cor: Color3.fromRGB(255, 130, 190),
		tamanho: 22,
		atira: true,
		cadenciaTiro: 1.6,
		velBala: 140,
		danoBala: 4,
		tiros: 3,
	},
	{
		nome: "Tubarão",
		hp: 40,
		danoContato: 10,
		velocidade: 170,
		xp: 16,
		moedaMin: 2,
		moedaMax: 5,
		cor: Color3.fromRGB(120, 140, 170),
		tamanho: 26,
		atira: false,
		cadenciaTiro: 0,
		velBala: 0,
		danoBala: 0,
		tiros: 1,
	},
];

export const BOSS: InimigoInfo = {
	nome: "Sereia da Praia",
	hp: 340,
	danoContato: 12,
	velocidade: 55,
	xp: 100,
	moedaMin: 15,
	moedaMax: 25,
	cor: Color3.fromRGB(155, 89, 182),
	tamanho: 40,
	atira: true,
	cadenciaTiro: 0.8,
	velBala: 145,
	danoBala: 7,
	tiros: 3,
};

/** Inimigos por área (0–3; área 4 = boss). Nascem ao liberar a área. */
export const INIMIGOS_POR_AREA: number[] = [7, 8, 9, 10];

/** Tipos desbloqueados por área (índices em INIMIGOS). */
export function tiposPorArea(area: number): number[] {
	if (area < 1) {
		return [0];
	} else if (area < 2) {
		return [0, 1, 3];
	} else if (area < 3) {
		return [0, 1, 2, 3, 4];
	}
	return [1, 2, 3, 4, 5];
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
	dx: number; // -1..1 (mover)
	dy: number; // -1..1 (mover)
	ax: number; // -1..1 (mira do mouse)
	ay: number; // -1..1 (mira do mouse)
	fogo: boolean; // botão do mouse segurado
	auto: boolean; // tiro automático ligado (tecla E)
	dash: boolean; // borda de subida: servidor aplica se cooldown ok
}

export interface FotoInimigo {
	id: number;
	x: number;
	y: number;
	hp: number;
	hpMax: number;
	tam: number;
	nv: number; // nível = área + 1
	boss: boolean;
	r: number;
	g: number;
	b: number;
}

export interface FotoBala {
	id: number;
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
	fx: number; // direção do olhar (unitário, p/ olho do sprite)
	fy: number;
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
	titulos: string[]; // títulos desbloqueados (ids)
	tituloEq: string; // título equipado ("" = nenhum)
	eqArma: string;
	eqArmadura: string;
	eqAcess: string;
	pausado: boolean;
	areasAbertas: number; // bitmask das áreas liberadas
	lobby: boolean; // mundo atual é o lobby (sem inimigos/boss)
}

export type EventoPayload =
	| { tipo: "mapa"; grade: string[]; seed: number; lobby: boolean }
	| { tipo: "porta"; tx: number; ty: number }
	| { tipo: "banner"; texto: string; duracao: number }
	| { tipo: "placar"; dados: PlacarDados }
	| {
			tipo: "fim";
			venceu: boolean;
			area: number;
			nivel: number;
			abates: number;
			moedas: number;
			quests: number;
			valor: number;
	  };

// ---------- Placar de líderes (top 10 por categoria) ----------
export interface LinhaPlacar {
	nome: string;
	valor: number;
}

export interface PlacarDados {
	nivel: LinhaPlacar[];
	kills: LinhaPlacar[];
	moedas: LinhaPlacar[];
}

// ---------- Lobby (layout fixo: 3 áreas + selo MAPAS) ----------
export interface SalaLobby {
	x: number;
	y: number;
	w: number;
	h: number;
}

export const LOBBY_SALAS: { [nome: string]: SalaLobby } = {
	centro: { x: 24, y: 24, w: 12, h: 12 },
	mapas: { x: 24, y: 4, w: 12, h: 10 },
	encant: { x: 4, y: 24, w: 12, h: 12 },
	rank: { x: 44, y: 24, w: 12, h: 12 },
};

export interface ZonaLobby {
	id: "mapas" | "encant" | "rank";
	nome: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	cor: Color3;
}

export const LOBBY_ZONAS: ZonaLobby[] = [
	{ id: "mapas", nome: "MAPAS", x0: 24, y0: 4, x1: 35, y1: 13, cor: Color3.fromRGB(70, 76, 90) },
	{ id: "encant", nome: "ENCANTAMENTO", x0: 4, y0: 24, x1: 15, y1: 35, cor: Color3.fromRGB(60, 66, 78) },
	{ id: "rank", nome: "LEADERBOARDS", x0: 44, y0: 24, x1: 55, y1: 35, cor: Color3.fromRGB(50, 56, 68) },
];

// ---------- Títulos (aba do painel; exibido abaixo do jogador) ----------
export interface TituloInfo {
	id: string;
	nome: string;
	descricao: string;
}

export const TITULOS: TituloInfo[] = [
	{ id: "apoiador", nome: "Apoiador Inicial", descricao: "Para quem chegou cedo na masmorra." },
];
