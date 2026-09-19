/**
 * Simulação autoritativa (SERVIDOR) — todo estado de jogo vive aqui.
 *
 * Anti-cheat: posição, vida, dano, inimigos, loot, portas e quests são
 * calculados no servidor. O cliente envia só inputs (validados) e recebe
 * snapshots filtrados pelo Fog of War. Um mundo compartilhado por servidor
 * (estilo MMO): áreas 0–3 liberam portas ao limpar; área 4 tem o boss.
 */
import {
	ANEL_VALOR,
	BOSS,
	CLASSES,
	INIMIGOS,
	INIMIGOS_POR_AREA,
	ITENS_INICIAIS,
	InimigoInfo,
	ItemInfo,
	LOOT_BOSS,
	LOOT_COMUM,
	MAPAS,
	MUNDO_A,
	MUNDO_L,
	QUESTS,
	TILE,
	TOTAL_AREAS,
	VISAO,
	calcularValor,
	eSolido,
	tiposPorArea,
	xpParaNivel,
} from "shared/pixelquest/Dados";
import { Remotes } from "shared/pixelquest/Rede";
import { EntradaPayload, EventoPayload, Foto } from "shared/pixelquest/Dados";
import { Porta, abrirPorta, acharChaoPerto, areaDe, areaSolida, chaoNaArea, gerarMundo, gradeStrings, lerTile } from "./mundo";

interface InimigoS {
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
}

interface BalaS {
	x: number;
	y: number;
	vx: number;
	vy: number;
	vida: number;
	dano: number;
	amiga: boolean;
	tam: number;
}

interface CotS {
	id: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	tipo: "moeda" | "coracao";
	fase: number;
}

interface QuestS {
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
	morto: boolean;
}

interface Mundo {
	ativo: boolean;
	portas: Porta[];
	nasc: [number, number];
	areasLimpas: boolean[];
	vivosPorArea: number[];
	inimigos: InimigoS[];
	balas: BalaS[];
	cots: CotS[];
	jogadores: Map<Player, JogadorS>;
	tempo: number;
	pausado: boolean;
	bossVivo: boolean;
	bossMorto: boolean;
	proxId: number;
	snapT: number;
}

export const mundo: Mundo = {
	ativo: false,
	portas: [],
	nasc: [MUNDO_L / 2, MUNDO_A / 2],
	areasLimpas: [false, false, false, false, false],
	vivosPorArea: [0, 0, 0, 0, 0],
	inimigos: [],
	balas: [],
	cots: [],
	jogadores: new Map(),
	tempo: 0,
	pausado: false,
	bossVivo: false,
	bossMorto: false,
	proxId: 1,
	snapT: 0,
};

function dist2(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
}

// ---------- Leaderstats ----------
export function garantirLeaderstats(player: Player): void {
	let stats = player.FindFirstChild("leaderstats");
	if (stats === undefined || !stats.IsA("Folder")) {
		const pasta = new Instance("Folder");
		pasta.Name = "leaderstats";
		pasta.Parent = player;
		stats = pasta;
	}
	const pasta = stats as Folder;
	for (const nome of ["Moedas", "Nivel", "Valor"]) {
		const achou = pasta.FindFirstChild(nome);
		if (achou === undefined || !achou.IsA("IntValue")) {
			const v = new Instance("IntValue");
			v.Name = nome;
			v.Value = nome === "Nivel" ? 1 : 0;
			v.Parent = pasta;
		}
	}
}

function statInt(player: Player, nome: string): IntValue | undefined {
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

// ---------- Eventos → cliente ----------
function enviar(player: Player, ev: EventoPayload): void {
	Remotes.Server.Get("Evento").SendToPlayer(player, ev);
}

function difundir(ev: EventoPayload): void {
	for (const [pl] of mundo.jogadores) {
		Remotes.Server.Get("Evento").SendToPlayer(pl, ev);
	}
}

// ---------- Mundo ----------
function nascerInimigo(info: InimigoInfo, boss: boolean, area: number, x: number, y: number): void {
	const mul = 1 + area * 0.15;
	mundo.proxId++;
	mundo.inimigos.push({
		id: mundo.proxId,
		info: info,
		boss: boss,
		area: area,
		x: x,
		y: y,
		hp: info.hp * mul,
		hpMax: info.hp * mul,
		danoContato: info.danoContato + area,
		danoBala: info.danoBala + area,
		tiroT: 1 + math.random(),
		rajadaT: 2,
	});
	mundo.vivosPorArea[area]++;
}

function spawnPack(area: number): void {
	const tipos = tiposPorArea(area);
	for (let i = 0; i < INIMIGOS_POR_AREA[area]; i++) {
		const pos = chaoNaArea(area, 20);
		if (pos === undefined) {
			continue;
		}
		nascerInimigo(INIMIGOS[tipos[math.random(0, tipos.size() - 1)]], false, area, pos[0], pos[1]);
	}
}

function spawnBoss(): void {
	const pos = chaoNaArea(4, 30);
	if (pos === undefined) {
		return;
	}
	nascerInimigo(BOSS, true, 4, pos[0], pos[1]);
	mundo.bossVivo = true;
	difundir({ tipo: "banner", texto: "SEREIA DA PRAIA!", duracao: 3 });
	print("[PixelQuest] Boss nasceu.");
}

function novaMasmorra(): void {
	const gen = gerarMundo();
	mundo.portas = gen.portas;
	mundo.nasc = gen.nasc;
	mundo.areasLimpas = [false, false, false, false, false];
	mundo.vivosPorArea = [0, 0, 0, 0, 0];
	mundo.inimigos = [];
	mundo.balas = [];
	mundo.cots = [];
	mundo.bossVivo = false;
	mundo.bossMorto = false;
	mundo.tempo = 0;
	mundo.ativo = true;
	// Só a área 0 nasce com a masmorra; as demais surgem ao liberar a anterior
	spawnPack(0);
	print(`[PixelQuest] Masmorra gerada: ${mundo.inimigos.size()} inimigos, ${mundo.portas.size()} portas.`);
}

function novoJogador(player: Player, nasc: [number, number]): JogadorS {
	const c = CLASSES[0];
	const quests: QuestS[] = [];
	for (const q of QUESTS) {
		quests.push({ id: q.id, prog: 0, completa: false });
	}
	return {
		player: player,
		x: nasc[0],
		y: nasc[1],
		fx: 1,
		fy: 0,
		hp: c.hpMax,
		hpMax: c.hpMax,
		nivel: 1,
		xp: 0,
		xpProx: xpParaNivel(1),
		moedas: 0,
		abates: 0,
		moedasColetadas: 0,
		quests: quests,
		questsCompletas: 0,
		mochila: [],
		eqArma: ITENS_INICIAIS[0],
		eqArmadura: ITENS_INICIAIS[1],
		eqAcess: undefined,
		invencT: 0,
		tiroT: 0,
		dashT: 0,
		dashCdT: 0,
		dirX: 0,
		dirY: 0,
		morto: false,
	};
}

/** Entrada na run (validação de mapa/nível é anti-cheat de verdade). */
export function escolherMapa(player: Player, mapa: number): void {
	if (mapa !== 0) {
		return; // só o Mapa 1 existe por enquanto
	}
	if (mapa >= MAPAS.size() || nivelConta(player) < MAPAS[mapa].reqNivel) {
		return;
	}
	if (!mundo.ativo || mundo.bossMorto) {
		novaMasmorra();
	}
	// Entra na dungeon atual (sem regen p/ quem já está jogando)
	spawnJogadorEm(player, mundo.nasc);
}

function spawnJogadorEm(player: Player, nasc: [number, number]): void {
	garantirLeaderstats(player);
	const [nx, ny] = acharChaoPerto(nasc[0], nasc[1], 12);
	const js = novoJogador(player, [nx, ny]);
	mundo.jogadores.set(player, js);
	enviar(player, { tipo: "mapa", grade: gradeStrings() });
	enviar(player, { tipo: "banner", texto: "MASMORRA INICIAL — explore as salas!", duracao: 2.5 });
	print(`[PixelQuest] ${player.Name} entrou na run.`);
}

export function removerJogador(player: Player): void {
	mundo.jogadores.delete(player);
}

// ---------- Inventário (servidor) ----------
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

function temItem(js: JogadorS, id: string): boolean {
	for (const it of js.mochila) {
		if (it.id === id) {
			return true;
		}
	}
	return js.eqArma?.id === id || js.eqArmadura?.id === id || js.eqAcess?.id === id;
}

function darItem(js: JogadorS, info: ItemInfo): void {
	if (temItem(js, info.id)) {
		js.moedas += info.preco;
	} else {
		js.mochila.push(info);
		enviar(js.player, { tipo: "banner", texto: `ITEM: ${info.nome}!`, duracao: 1.6 });
	}
}

function ajustarHpBonus(js: JogadorS, antigo: number, novo: number): void {
	js.hpMax += novo - antigo;
	js.hp += novo - antigo;
	if (js.hp > js.hpMax) {
		js.hp = js.hpMax;
	}
	if (js.hp < 1) {
		js.hp = 1;
	}
}

export function equiparItem(player: Player, id: string): void {
	const js = mundo.jogadores.get(player);
	if (js === undefined || js.morto) {
		return;
	}
	for (let i = 0; i < js.mochila.size(); i++) {
		if (js.mochila[i].id !== id) {
			continue;
		}
		const it = js.mochila[i];
		js.mochila[i] = js.mochila[js.mochila.size() - 1];
		js.mochila.pop();
		if (it.slot === "arma") {
			if (js.eqArma !== undefined) {
				js.mochila.push(js.eqArma);
			}
			js.eqArma = it;
		} else if (it.slot === "armadura") {
			if (js.eqArmadura !== undefined) {
				js.mochila.push(js.eqArmadura);
				ajustarHpBonus(js, js.eqArmadura.hp, 0);
			}
			js.eqArmadura = it;
			ajustarHpBonus(js, 0, it.hp);
		} else {
			if (js.eqAcess !== undefined) {
				js.mochila.push(js.eqAcess);
				ajustarHpBonus(js, js.eqAcess.hp, 0);
			}
			js.eqAcess = it;
			ajustarHpBonus(js, 0, it.hp);
		}
		break;
	}
}

export function removerSlot(player: Player, slot: string): void {
	const js = mundo.jogadores.get(player);
	if (js === undefined || js.morto) {
		return;
	}
	if (slot === "arma" && js.eqArma !== undefined) {
		js.mochila.push(js.eqArma);
		js.eqArma = undefined;
	} else if (slot === "armadura" && js.eqArmadura !== undefined) {
		ajustarHpBonus(js, js.eqArmadura.hp, 0);
		js.mochila.push(js.eqArmadura);
		js.eqArmadura = undefined;
	} else if (slot === "acess" && js.eqAcess !== undefined) {
		ajustarHpBonus(js, js.eqAcess.hp, 0);
		js.mochila.push(js.eqAcess);
		js.eqAcess = undefined;
	}
}

// ---------- Inputs (validados + normalizados: sem speed hack) ----------
export function aplicarEntrada(player: Player, e: EntradaPayload): void {
	const js = mundo.jogadores.get(player);
	if (js === undefined || js.morto || mundo.pausado) {
		return;
	}
	let dx = e.dx;
	let dy = e.dy;
	const m = math.sqrt(dx * dx + dy * dy);
	if (m > 1) {
		dx /= m;
		dy /= m;
	}
	js.dirX = dx;
	js.dirY = dy;
	if (e.dash && js.dashCdT <= 0) {
		js.dashT = 0.18;
		js.dashCdT = 3;
		if (js.invencT < 0.25) {
			js.invencT = 0.25;
		}
	}
}

export function alternarPausa(): void {
	mundo.pausado = !mundo.pausado;
}

// ---------- Combate ----------
function ganharXp(js: JogadorS, q: number): void {
	js.xp += q;
	while (js.xp >= js.xpProx) {
		js.xp -= js.xpProx;
		js.nivel++;
		js.xpProx = xpParaNivel(js.nivel);
		js.hpMax += 4;
		js.hp = js.hpMax;
		enviar(js.player, { tipo: "banner", texto: `NÍVEL ${js.nivel}!`, duracao: 1.6 });
	}
}

function checarQuest(js: JogadorS, tipo: "abates" | "moedas" | "boss"): void {
	for (const q of js.quests) {
		if (q.completa) {
			continue;
		}
		const info = QUESTS[qMetaIdx(q.id)];
		let prog = 0;
		if (tipo === "abates" && q.id === "limpeza") {
			prog = js.abates;
		} else if (tipo === "moedas" && q.id === "tesouro") {
			prog = js.moedasColetadas;
		} else if (tipo === "boss" && q.id === "recompensa") {
			prog = mundo.bossMorto ? 1 : 0;
		} else {
			continue;
		}
		q.prog = prog > info.meta ? info.meta : prog;
		if (q.prog >= info.meta) {
			q.completa = true;
			js.questsCompletas++;
			ganharXp(js, info.xp);
			if (q.id === "limpeza") {
				darItem(js, ANEL_VALOR);
			}
			enviar(js.player, { tipo: "banner", texto: `QUEST: ${info.nome}!`, duracao: 2 });
		}
	}
}

function qMetaIdx(id: string): number {
	for (let i = 0; i < QUESTS.size(); i++) {
		if (QUESTS[i].id === id) {
			return i;
		}
	}
	return 0;
}

function ferirJogador(js: JogadorS, dano: number): void {
	if (js.invencT > 0 || js.morto) {
		return;
	}
	js.hp -= dano;
	js.invencT = 0.9;
	if (js.hp <= 0) {
		js.hp = 0;
		fimRun(js, false);
	}
}

function fimRun(js: JogadorS, venceu: boolean): void {
	js.morto = true;
	js.dirX = 0;
	js.dirY = 0;
	const valor = calcularValor(js.moedas, js.questsCompletas, venceu);
	const m = statInt(js.player, "Moedas");
	const n = statInt(js.player, "Nivel");
	const v = statInt(js.player, "Valor");
	if (m !== undefined) {
		m.Value += math.floor(js.moedas);
	}
	if (n !== undefined && js.nivel > n.Value) {
		n.Value = js.nivel;
	}
	if (v !== undefined) {
		v.Value += math.floor(valor);
	}
	enviar(js.player, {
		tipo: "fim",
		venceu: venceu,
		area: areaDe(js.x),
		nivel: js.nivel,
		abates: js.abates,
		moedas: js.moedas,
		quests: js.questsCompletas,
		valor: valor,
	});
	print(`[PixelQuest] Fim: ${js.player.Name} venceu=${venceu} valor=${valor}.`);
}

function matarInimigo(idx: number, assassino: JogadorS): void {
	const e = mundo.inimigos[idx];
	mundo.inimigos[idx] = mundo.inimigos[mundo.inimigos.size() - 1];
	mundo.inimigos.pop();
	mundo.vivosPorArea[e.area]--;
	assassino.abates++;
	ganharXp(assassino, e.info.xp);
	const nMoedas = math.random(e.info.moedaMin, e.info.moedaMax);
	for (let k = 0; k < nMoedas; k++) {
		const a = math.random() * math.pi * 2;
		mundo.proxId++;
		mundo.cots.push({ id: mundo.proxId, x: e.x, y: e.y, vx: math.cos(a) * 90, vy: math.sin(a) * 90, tipo: "moeda", fase: math.random() * 6 });
	}
	if (math.random() < 0.12) {
		mundo.proxId++;
		mundo.cots.push({ id: mundo.proxId, x: e.x, y: e.y, vx: 0, vy: 0, tipo: "coracao", fase: 0 });
	}
	if (e.boss) {
		for (const item of LOOT_BOSS) {
			darItem(assassino, item);
		}
	} else if (math.random() < 0.06 && LOOT_COMUM.size() > 0) {
		darItem(assassino, LOOT_COMUM[math.random(0, LOOT_COMUM.size() - 1)]);
	}
	checarQuest(assassino, "abates");
	if (e.boss) {
		mundo.bossVivo = false;
		mundo.bossMorto = true;
		for (const [, outro] of mundo.jogadores) {
			if (!outro.morto) {
				checarQuest(outro, "boss");
				fimRun(outro, true);
			}
		}
	} else if (e.area < 4) {
		// Área limpa? Abre as portas E povoa a próxima (áreas trancadas não têm inimigos)
		if (!mundo.areasLimpas[e.area] && mundo.vivosPorArea[e.area] <= 0) {
			mundo.areasLimpas[e.area] = true;
			for (const p of mundo.portas) {
				if (p.area === e.area) {
					abrirPorta(p.tx, p.ty);
					difundir({ tipo: "porta", tx: p.tx, ty: p.ty });
				}
			}
			spawnPack(e.area + 1);
			assassino.moedas += 5 + e.area * 2;
			difundir({ tipo: "banner", texto: `ÁREA ${e.area + 1} LIMPA! Inimigos à frente...`, duracao: 2.5 });
			print(`[PixelQuest] Área ${e.area} limpa: portas abertas + área ${e.area + 1} povoada.`);
		}
	}
}

function jogadorMaisProximo(x: number, y: number): JogadorS | undefined {
	let melhor: JogadorS | undefined = undefined;
	let melhorD = math.huge;
	for (const [, js] of mundo.jogadores) {
		if (js.morto) {
			continue;
		}
		const d = dist2(x, y, js.x, js.y);
		if (d < melhorD) {
			melhorD = d;
			melhor = js;
		}
	}
	return melhor;
}

// ---------- Update ----------
const MAX_BALAS = 160;

/** Push com teto (anti-spam/lag: descarta excedente). */
function empurrarBala(b: BalaS): void {
	if (mundo.balas.size() < MAX_BALAS) {
		mundo.balas.push(b);
	}
}

export function atualizar(dt: number): void {
	if (!mundo.ativo || mundo.jogadores.size() === 0) {
		return; // sem jogadores, sem simulação (economiza CPU)
	}
	if (mundo.pausado) {
		return;
	}
	if (dt > 0.1) {
		dt = 0.1;
	}
	mundo.tempo += dt;
	const c = CLASSES[0];

	// Jogadores: movimento (deslizamento) + tiro automático
	for (const [, js] of mundo.jogadores) {
		if (js.morto) {
			continue;
		}
		let vel = c.velocidade;
		if (js.dashT > 0) {
			vel *= 2.6;
			js.dashT -= dt;
		}
		if (js.dashCdT > 0) {
			js.dashCdT -= dt;
		}
		const r = 10;
		const nx = math.clamp(js.x + js.dirX * vel * dt, 20, MUNDO_L - 20);
		if (!areaSolida(nx, js.y, r)) {
			js.x = nx;
		}
		const ny = math.clamp(js.y + js.dirY * vel * dt, 20, MUNDO_A - 20);
		if (!areaSolida(js.x, ny, r)) {
			js.y = ny;
		}
		if (js.dirX !== 0 || js.dirY !== 0) {
			const m = math.sqrt(js.dirX * js.dirX + js.dirY * js.dirY);
			js.fx = js.dirX / m;
			js.fy = js.dirY / m;
		}
		if (js.invencT > 0) {
			js.invencT -= dt;
		}
		// Boss entra quando alguém pisa na área 4
		if (!mundo.bossVivo && !mundo.bossMorto && areaDe(js.x) === 4) {
			spawnBoss();
		}
		// Tiro automático no mais próximo
		if (js.tiroT > 0) {
			js.tiroT -= dt;
		}
		if (js.tiroT <= 0) {
			let melhor: InimigoS | undefined = undefined;
			let melhorD = 420 * 420;
			for (const e of mundo.inimigos) {
				const d = dist2(js.x, js.y, e.x, e.y);
				if (d < melhorD) {
					melhorD = d;
					melhor = e;
				}
			}
			if (melhor !== undefined) {
				const dx = melhor.x - js.x;
				const dy = melhor.y - js.y;
				const d = math.sqrt(dx * dx + dy * dy);
				if (d > 1) {
					empurrarBala({ x: js.x, y: js.y, vx: (dx / d) * c.velTiro, vy: (dy / d) * c.velTiro, vida: 1.6, dano: danoTotal(js), amiga: true, tam: c.tamTiro });
					js.fx = dx / d;
					js.fy = dy / d;
				}
			}
			js.tiroT = c.cadencia;
		}
	}

	// Inimigos: persegue o jogador mais próximo + tiros
	for (let i = mundo.inimigos.size() - 1; i >= 0; i--) {
		const e = mundo.inimigos[i];
		const alvo = jogadorMaisProximo(e.x, e.y);
		if (alvo === undefined) {
			continue;
		}
		const dx = alvo.x - e.x;
		const dy = alvo.y - e.y;
		const d = math.sqrt(dx * dx + dy * dy);
		if (d > 1) {
			const er = e.info.tamanho / 2;
			const ex = e.x + (dx / d) * e.info.velocidade * dt;
			if (!areaSolida(ex, e.y, er)) {
				e.x = ex;
			}
			const ey = e.y + (dy / d) * e.info.velocidade * dt;
			if (!areaSolida(e.x, ey, er)) {
				e.y = ey;
			}
		}
		// Contato com qualquer jogador vivo
		for (const [, js] of mundo.jogadores) {
			if (js.morto) {
				continue;
			}
			if (dist2(e.x, e.y, js.x, js.y) < (e.info.tamanho / 2 + 10) * (e.info.tamanho / 2 + 10)) {
				ferirJogador(js, e.danoContato);
			}
		}
		if (e.tiroT > 0) {
			e.tiroT -= dt;
		}
		if (e.info.atira && e.tiroT <= 0 && d < 380 && d > 1) {
			if (e.boss) {
				for (let k = -1; k <= 1; k++) {
					const base = math.atan2(dy, dx) + k * 0.22;
					empurrarBala({ x: e.x, y: e.y, vx: math.cos(base) * e.info.velBala, vy: math.sin(base) * e.info.velBala, vida: 3.5, dano: e.danoBala, amiga: false, tam: 9 });
				}
			} else {
				empurrarBala({ x: e.x, y: e.y, vx: (dx / d) * e.info.velBala, vy: (dy / d) * e.info.velBala, vida: 3.5, dano: e.danoBala, amiga: false, tam: 9 });
			}
			e.tiroT = e.info.cadenciaTiro + math.random() * 0.6;
		}
		if (e.rajadaT > 0) {
			e.rajadaT -= dt;
		}
		if (e.boss && e.rajadaT <= 0) {
			for (let k = 0; k < 12; k++) {
				const a = (k / 12) * math.pi * 2 + mundo.tempo;
				empurrarBala({ x: e.x, y: e.y, vx: math.cos(a) * 110, vy: math.sin(a) * 110, vida: 3.5, dano: e.danoBala, amiga: false, tam: 9 });
			}
			e.rajadaT = 2.6;
		}
	}

	// Separação leve anti-empilhamento
	if (mundo.inimigos.size() <= 30) {
		for (let i = 0; i < mundo.inimigos.size(); i++) {
			for (let j = i + 1; j < mundo.inimigos.size(); j++) {
				const a = mundo.inimigos[i];
				const b = mundo.inimigos[j];
				const rr = a.info.tamanho / 2 + b.info.tamanho / 2;
				const d2 = dist2(a.x, a.y, b.x, b.y);
				if (d2 > 1 && d2 < rr * rr) {
					const d = math.sqrt(d2);
					const emp = ((rr - d) / d) * 0.4;
					const sx = (b.x - a.x) * emp;
					const sy = (b.y - a.y) * emp;
					if (!areaSolida(a.x - sx, a.y - sy, a.info.tamanho / 2)) {
						a.x -= sx;
						a.y -= sy;
					}
					if (!areaSolida(b.x + sx, b.y + sy, b.info.tamanho / 2)) {
						b.x += sx;
						b.y += sy;
					}
				}
			}
		}
	}

	// Balas (morrem na parede)
	for (let i = mundo.balas.size() - 1; i >= 0; i--) {
		const b = mundo.balas[i];
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		b.vida -= dt;
		let morta = b.vida <= 0 || b.x < 0 || b.x > MUNDO_L || b.y < 0 || b.y > MUNDO_A || tileSolidoEm(b.x, b.y);
		if (!morta) {
			if (b.amiga) {
				for (let j = mundo.inimigos.size() - 1; j >= 0; j--) {
					const e = mundo.inimigos[j];
					const rr = b.tam / 2 + e.info.tamanho / 2;
					if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
						e.hp -= b.dano;
						morta = true;
						if (e.hp <= 0) {
							// assassino = jogador vivo mais próximo do abate
							const dono = jogadorMaisProximo(e.x, e.y);
							if (dono !== undefined) {
								matarInimigo(j, dono);
							} else {
								mundo.inimigos[j] = mundo.inimigos[mundo.inimigos.size() - 1];
								mundo.inimigos.pop();
								mundo.vivosPorArea[e.area]--;
							}
						}
						break;
					}
				}
			} else {
				for (const [, js] of mundo.jogadores) {
					if (js.morto) {
						continue;
					}
					const rr = b.tam / 2 + 10;
					if (dist2(b.x, b.y, js.x, js.y) < rr * rr) {
						ferirJogador(js, b.dano);
						morta = true;
						break;
					}
				}
			}
		}
		if (morta) {
			mundo.balas[i] = mundo.balas[mundo.balas.size() - 1];
			mundo.balas.pop();
		}
	}

	// Coletáveis (imã por jogador)
	for (let i = mundo.cots.size() - 1; i >= 0; i--) {
		const col = mundo.cots[i];
		col.fase += dt * 6;
		col.vx *= 1 - 3 * dt;
		col.vy *= 1 - 3 * dt;
		const dono = jogadorMaisProximo(col.x, col.y);
		if (dono !== undefined) {
			const d2 = dist2(col.x, col.y, dono.x, dono.y);
			if (d2 < 80 * 80) {
				const d = math.sqrt(d2);
				if (d > 1) {
					col.vx = ((dono.x - col.x) / d) * 280;
					col.vy = ((dono.y - col.y) / d) * 280;
				}
			}
			const cx = col.x + col.vx * dt;
			if (!areaSolida(cx, col.y, 6)) {
				col.x = cx;
			}
			const cy = col.y + col.vy * dt;
			if (!areaSolida(col.x, cy, 6)) {
				col.y = cy;
			}
			if (d2 < 22 * 22) {
				if (col.tipo === "moeda") {
					dono.moedas++;
					dono.moedasColetadas++;
					checarQuest(dono, "moedas");
				} else {
					if (dono.hp + 12 > dono.hpMax) {
						dono.hp = dono.hpMax;
					} else {
						dono.hp += 12;
					}
				}
				mundo.cots[i] = mundo.cots[mundo.cots.size() - 1];
				mundo.cots.pop();
			}
		}
	}

	// Snapshots 20 Hz filtrados pelo Fog of War (fluidez sem flood)
	mundo.snapT += dt;
	if (mundo.snapT >= 1 / 20) {
		mundo.snapT = 0;
		for (const [, js] of mundo.jogadores) {
			if (!js.morto) {
				enviarFoto(js);
			}
		}
	}
}

function tileSolidoEm(x: number, y: number): boolean {
	const tx = math.floor(x / TILE);
	const ty = math.floor(y / TILE);
	return eSolido(lerTile(tx, ty));
}

// ---------- Snapshot (só o visível: Fog of War real) ----------
function visivelPara(js: JogadorS, x: number, y: number): boolean {
	return dist2(js.x, js.y, x, y) < VISAO * VISAO;
}

function enviarFoto(js: JogadorS): void {
	const fins: Foto["inimigos"] = [];
	let bossFracao = -1;
	for (const e of mundo.inimigos) {
		if (!visivelPara(js, e.x, e.y)) {
			continue;
		}
		fins.push({
			id: e.id,
			x: e.x,
			y: e.y,
			hp: e.hp,
			hpMax: e.hpMax,
			tam: e.info.tamanho,
			boss: e.boss,
			r: e.info.cor.R * 255,
			g: e.info.cor.G * 255,
			b: e.info.cor.B * 255,
		});
		if (e.boss) {
			bossFracao = e.hp / e.hpMax;
		}
	}
	const fbalas: Foto["balas"] = [];
	for (const b of mundo.balas) {
		if (!visivelPara(js, b.x, b.y)) {
			continue;
		}
		fbalas.push({ x: b.x, y: b.y, amiga: b.amiga, tam: b.tam });
	}
	const fcots: Foto["cots"] = [];
	for (const c of mundo.cots) {
		if (!visivelPara(js, c.x, c.y)) {
			continue;
		}
		fcots.push({ id: c.id, x: c.x, y: c.y, tipo: c.tipo });
	}
	const fjogs: Foto["jogadores"] = [];
	for (const [, outro] of mundo.jogadores) {
		if (outro === js || outro.morto || !visivelPara(js, outro.x, outro.y)) {
			continue;
		}
		fjogs.push({ nome: outro.player.Name, x: outro.x, y: outro.y, nv: outro.nivel, r: 90, g: 220, b: 120 });
	}
	const fquests: Foto["quests"] = [];
	for (const q of js.quests) {
		fquests.push({ id: q.id, prog: q.prog, completa: q.completa });
	}
	const mochilaIds: string[] = [];
	for (const it of js.mochila) {
		mochilaIds.push(it.id);
	}
	let areas = 0;
	for (let k = 0; k < TOTAL_AREAS; k++) {
		if (mundo.areasLimpas[k]) {
			areas += 2 ** k;
		}
	}
	const foto: Foto = {
		px: js.x,
		py: js.y,
		hp: js.hp,
		hpMax: js.hpMax,
		nivel: js.nivel,
		xp: js.xp,
		xpProx: js.xpProx,
		moedas: js.moedas,
		dano: danoTotal(js),
		area: areaDe(js.x),
		abates: js.abates,
		inimigos: fins,
		balas: fbalas,
		cots: fcots,
		jogadores: fjogs,
		quests: fquests,
		questsCompletas: js.questsCompletas,
		bossFracao: bossFracao,
		mochila: mochilaIds,
		eqArma: js.eqArma !== undefined ? js.eqArma.id : "",
		eqArmadura: js.eqArmadura !== undefined ? js.eqArmadura.id : "",
		eqAcess: js.eqAcess !== undefined ? js.eqAcess.id : "",
		pausado: mundo.pausado,
		areasAbertas: areas,
	};
	Remotes.Server.Get("Foto").SendToPlayer(js.player, foto);
}
