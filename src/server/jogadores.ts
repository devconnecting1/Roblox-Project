/**
 * Jogadores (SERVIDOR) — ciclo de vida, inputs, pausa individual, inventário,
 * XP/quests/loot, coletáveis e movimento + tiro automático.
 */
import {
	ANEL_VALOR,
	CLASSES,
	ITENS_INICIAIS,
	ItemInfo,
	MUNDO_A,
	MUNDO_L,
	QUESTS,
	TITULOS,
	calcularValor,
	xpParaNivel,
} from "shared/pixelquest/Dados";
import { EntradaPayload } from "shared/pixelquest/Dados";
import { areaDe, areaSolida } from "./mundo";
import { JogadorS, QuestS, danoTotal, dist2, empurrarBala, mundo, statInt } from "./estado";
import { difundir, enviar } from "./foto";

// ---------- Construção ----------
export function novoJogador(player: Player, nasc: [number, number]): JogadorS {
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
		ax: 0,
		ay: 0,
		fogo: false,
		auto: false,
		morto: false,
		pausado: false,
		titulos: ["apoiador"],
		tituloEq: "apoiador",
	};
}

export function removerJogador(player: Player): void {
	mundo.jogadores.delete(player);
}

// ---------- Inventário (servidor) ----------
function temItem(js: JogadorS, id: string): boolean {
	for (const it of js.mochila) {
		if (it.id === id) {
			return true;
		}
	}
	return js.eqArma?.id === id || js.eqArmadura?.id === id || js.eqAcess?.id === id;
}

export function darItem(js: JogadorS, info: ItemInfo): void {
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
	for (const t of TITULOS) {
		if (t.id === id) {
			for (const m of js.titulos) {
				if (m === id) {
					js.tituloEq = id;
					break;
				}
			}
			return;
		}
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
	} else if (slot === "titulo") {
		js.tituloEq = undefined;
	}
}

// ---------- Inputs (validados + normalizados: sem speed hack) ----------
export function aplicarEntrada(player: Player, e: EntradaPayload): void {
	const js = mundo.jogadores.get(player);
	if (js === undefined || js.morto || js.pausado) {
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
	let ax = e.ax;
	let ay = e.ay;
	const ma = math.sqrt(ax * ax + ay * ay);
	if (ma > 1) {
		ax /= ma;
		ay /= ma;
	}
	js.ax = ax;
	js.ay = ay;
	js.fogo = e.fogo;
	js.auto = e.auto;
	if (e.dash && js.dashCdT <= 0) {
		js.dashT = 0.18;
		js.dashCdT = 3;
		if (js.invencT < 0.25) {
			js.invencT = 0.25;
		}
	}
}

export function alternarPausa(player: Player): void {
	const js = mundo.jogadores.get(player);
	if (js !== undefined && !js.morto) {
		js.pausado = !js.pausado;
	}
}

// ---------- Progressão ----------
export function ganharXp(js: JogadorS, q: number): void {
	js.xp += q;
	while (js.xp >= js.xpProx) {
		js.xp -= js.xpProx;
		js.nivel++;
		js.xpProx = xpParaNivel(js.nivel);
		js.hpMax += 4;
		js.hp = js.hpMax;
		// Sem banner aqui: o cliente mostra o título no flash do level-up
	}
}

export function checarQuest(js: JogadorS, tipo: "abates" | "moedas" | "boss"): void {
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

export function ferirJogador(js: JogadorS, dano: number): void {
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

export function fimRun(js: JogadorS, venceu: boolean): void {
	js.morto = true;
	js.dirX = 0;
	js.dirY = 0;
	const valor = calcularValor(js.moedas, js.questsCompletas, venceu);
	const m = statInt(js.player, "Moedas");
	const n = statInt(js.player, "Nivel");
	const v = statInt(js.player, "Valor");
	const a = statInt(js.player, "Abates");
	if (m !== undefined) {
		m.Value += math.floor(js.moedas);
	}
	if (n !== undefined && js.nivel > n.Value) {
		n.Value = js.nivel;
	}
	if (v !== undefined) {
		v.Value += math.floor(valor);
	}
	if (a !== undefined) {
		a.Value += js.abates;
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

export function jogadorMaisProximo(x: number, y: number): JogadorS | undefined {
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
export function atualizarJogadores(dt: number): void {
	const c = CLASSES[0];
	debug.profilebegin("PQ_Jogadores");

	// Jogadores: movimento (deslizamento) + tiro automático
	for (const [, js] of mundo.jogadores) {
		if (js.morto || js.pausado) {
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
		// Tiro mirado no mouse (botão segurado ou automático com E)
		if (js.tiroT > 0) {
			js.tiroT -= dt;
		}
		if ((js.fogo || js.auto) && js.tiroT <= 0) {
			let ax = js.ax;
			let ay = js.ay;
			if (ax * ax + ay * ay < 0.001) {
				ax = js.fx;
				ay = js.fy;
			}
			const ma = math.sqrt(ax * ax + ay * ay);
			if (ma > 0) {
				ax /= ma;
				ay /= ma;
			}
			empurrarBala({
				x: js.x,
				y: js.y,
				vx: ax * c.velTiro,
				vy: ay * c.velTiro,
				vida: 1.6,
				dano: danoTotal(js),
				amiga: true,
				tam: c.tamTiro,
			});
			js.fx = ax;
			js.fy = ay;
			js.tiroT = c.cadencia;
		}
	}

	// Colisão jogador↔jogador: corpos sólidos (sem stacking no spawn)
	const vivos: JogadorS[] = [];
	for (const [, js] of mundo.jogadores) {
		if (!js.morto && !js.pausado) {
			vivos.push(js);
		}
	}
	for (let i = 0; i < vivos.size(); i++) {
		for (let j = i + 1; j < vivos.size(); j++) {
			const a = vivos[i];
			const b = vivos[j];
			const d2 = dist2(a.x, a.y, b.x, b.y);
			if (d2 > 1 && d2 < 20 * 20) {
				const d = math.sqrt(d2);
				const overlap = (20 - d) / 2;
				const nx = (b.x - a.x) / d;
				const ny = (b.y - a.y) / d;
				const ax2 = a.x - nx * overlap;
				if (!areaSolida(ax2, a.y, 10)) {
					a.x = ax2;
				}
				const ay2 = a.y - ny * overlap;
				if (!areaSolida(a.x, ay2, 10)) {
					a.y = ay2;
				}
				const bx2 = b.x + nx * overlap;
				if (!areaSolida(bx2, b.y, 10)) {
					b.x = bx2;
				}
				const by2 = b.y + ny * overlap;
				if (!areaSolida(b.x, by2, 10)) {
					b.y = by2;
				}
			}
		}
	}

	debug.profileend(); // PQ_Jogadores
}

export function atualizarCots(dt: number): void {
	// Coletáveis (imã por jogador)
	for (let i = mundo.cots.size() - 1; i >= 0; i--) {
		const col = mundo.cots[i];
		col.fase += dt * 6;
		col.vx *= 1 - 3 * dt;
		col.vy *= 1 - 3 * dt;
		const dono = jogadorMaisProximo(col.x, col.y);
		if (dono !== undefined && !dono.pausado) {
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
}
