/**
 * Dados do Pixel Quest 2D — inspirado no RPG 2D bullet-hell do Roblox
 * (Realm-like: explorar, desviar de projéteis, loot, XP, quests, boss).
 *
 * Tudo aqui é dado puro (sem dependência de engine), então pode ser
 * usado pelo servidor e pelo cliente.
 */

// ---------- Arena (bioma Praia, 15x10 tiles de 32px) ----------
// `.` areia | `,` areia clara | `~` água rasa | `T` palmeira | `*` moita
export const ARENA_L = 480;
export const ARENA_A = 320;
export const TILE = 32;

export const MAPA: string[] = [
	"................",
	".,..TT....,,....",
	"....TT.....,,...",
	"..,,......**....",
	"~~~~,,....**..T.",
	"~~~~~,,......TT.",
	".~~~~,,...,,....",
	"..~~~,,.........",
	"..,,......,,....",
	"................",
];

// ---------- Classes jogáveis (Guerreiro 46HP / Mago 36HP) ----------
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
		nome: "Guerreiro",
		descricao: "Muralha de ferro. Bate forte, aguenta mais.",
		hpMax: 46,
		dano: 12,
		cadencia: 0.45,
		velTiro: 430,
		velocidade: 175,
		cor: Color3.fromRGB(231, 76, 60),
		tamTiro: 8,
	},
	{
		nome: "Mago",
		descricao: "Corpo frágil, magia devastadora.",
		hpMax: 36,
		dano: 9,
		cadencia: 0.27,
		velTiro: 470,
		velocidade: 180,
		cor: Color3.fromRGB(88, 140, 255),
		tamTiro: 10,
	},
	{
		nome: "Ladino",
		descricao: "Rápido e silencioso. Chuva de adagas.",
		hpMax: 40,
		dano: 6,
		cadencia: 0.16,
		velTiro: 530,
		velocidade: 215,
		cor: Color3.fromRGB(88, 214, 141),
		tamTiro: 6,
	},
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
