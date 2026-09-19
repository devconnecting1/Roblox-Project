/**
 * Inimigos (SERVIDOR) — spawn por área, IA com sentidos e morte com loot.
 *
 * Sentidos: visão com paredes, memória da última posição, caça em equipe,
 * patrulha com coleira. Tiros e rajadas só com visão.
 */
import {
	BOSS,
	INIMIGOS,
	INIMIGOS_POR_AREA,
	InimigoInfo,
	LOOT_BOSS,
	LOOT_COMUM,
	tiposPorArea,
} from "shared/pixelquest/Dados";
import { abrirPorta, areaDe, areaSolida, chaoNaArea } from "./mundo";
import { InimigoS, JogadorS, dist2, empurrarBala, mundo } from "./estado";
import { ALCANCE_VISAO, alertarAliados, temVisada } from "./visao";
import { checarQuest, darItem, ferirJogador, fimRun, ganharXp } from "./jogadores";
import { difundir } from "./foto";

function nascerInimigo(info: InimigoInfo, boss: boolean, area: number, x: number, y: number): void {
	const mul = 1 + area * 0.15;
	mundo.proxId++;
	const a = math.random() * math.pi * 2;
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
		estado: "patrulha",
		alvo: undefined,
		vistoX: x,
		vistoY: y,
		esperaT: math.random() * 2,
		procT: 0,
		dirWX: math.cos(a),
		dirWY: math.sin(a),
		ancoraX: x,
		ancoraY: y,
		nv: area + 1,
	});
	mundo.vivosPorArea[area]++;
}

export function spawnPack(area: number): void {
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

export function matarInimigo(idx: number, assassino: JogadorS): void {
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
		mundo.cots.push({
			id: mundo.proxId,
			x: e.x,
			y: e.y,
			vx: math.cos(a) * 90,
			vy: math.sin(a) * 90,
			tipo: "moeda",
			fase: math.random() * 6,
		});
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

export function atualizarInimigos(dt: number): void {
	// Boss entra quando alguém pisa na área 4 (só na dungeon; lobby não tem boss)
	for (const [, js] of mundo.jogadores) {
		if (
			!js.morto &&
			!js.pausado &&
			mundo.modo === "dungeon" &&
			!mundo.bossVivo &&
			!mundo.bossMorto &&
			areaDe(js.x) === 4
		) {
			spawnBoss();
		}
	}

	// Inimigos: visão com paredes, memória e caça em equipe
	debug.profilebegin("PQ_Inimigos");
	for (let i = mundo.inimigos.size() - 1; i >= 0; i--) {
		const e = mundo.inimigos[i];
		// 1. Tenta avistar (vivo mais próximo, com linha de visão)
		let avistado: JogadorS | undefined = undefined;
		let avistD = ALCANCE_VISAO * ALCANCE_VISAO;
		for (const [, js] of mundo.jogadores) {
			if (js.morto || js.pausado) {
				continue;
			}
			const dd = dist2(e.x, e.y, js.x, js.y);
			if (dd < avistD && temVisada(e.x, e.y, js.x, js.y)) {
				avistD = dd;
				avistado = js;
			}
		}
		if (avistado !== undefined) {
			if (e.estado !== "perseguir") {
				alertarAliados(avistado.x, avistado.y, e.id);
			}
			e.estado = "perseguir";
			e.alvo = avistado;
			e.vistoX = avistado.x;
			e.vistoY = avistado.y;
		} else if (e.estado === "perseguir") {
			e.estado = "cacar"; // perdeu de vista: caça a última posição
			e.procT = 7;
		}
		// 2. Age conforme o estado
		let alvoX = e.x;
		let alvoY = e.y;
		let velMul = 1;
		if (e.estado === "perseguir" && e.alvo !== undefined && !e.alvo.morto) {
			alvoX = e.alvo.x;
			alvoY = e.alvo.y;
		} else if (e.estado === "cacar") {
			alvoX = e.vistoX;
			alvoY = e.vistoY;
			if (dist2(e.x, e.y, alvoX, alvoY) < 26 * 26) {
				// Chegou onde viu: vasculha ao redor e desiste após um tempo
				if (e.esperaT > 0) {
					e.esperaT -= dt;
				} else {
					const a = math.random() * math.pi * 2;
					e.dirWX = math.cos(a);
					e.dirWY = math.sin(a);
					e.esperaT = 1 + math.random() * 1.5;
				}
				alvoX = e.x + e.dirWX * 70;
				alvoY = e.y + e.dirWY * 70;
				velMul = 0.45;
				e.procT -= dt;
				if (e.procT <= 0) {
					e.estado = "patrulha";
					e.alvo = undefined;
				}
			}
		} else {
			// Patrulha lenta na âncora (com coleira: volta se longe)
			if (dist2(e.x, e.y, e.ancoraX, e.ancoraY) > 500 * 500) {
				alvoX = e.ancoraX;
				alvoY = e.ancoraY;
				velMul = 0.5;
			} else {
				if (e.esperaT > 0) {
					e.esperaT -= dt;
				} else {
					const a = math.random() * math.pi * 2;
					e.dirWX = math.cos(a);
					e.dirWY = math.sin(a);
					e.esperaT = 1.5 + math.random() * 1.5;
				}
				alvoX = e.x + e.dirWX * 80;
				alvoY = e.y + e.dirWY * 80;
				velMul = 0.4;
			}
		}
		const mdx = alvoX - e.x;
		const mdy = alvoY - e.y;
		const md = math.sqrt(mdx * mdx + mdy * mdy);
		if (md > 1) {
			const er = e.info.tamanho / 2;
			const ex = e.x + (mdx / md) * e.info.velocidade * velMul * dt;
			if (!areaSolida(ex, e.y, er)) {
				e.x = ex;
			}
			const ey = e.y + (mdy / md) * e.info.velocidade * velMul * dt;
			if (!areaSolida(e.x, ey, er)) {
				e.y = ey;
			}
		}
		// Contato com qualquer jogador vivo
		for (const [, js] of mundo.jogadores) {
			if (js.morto || js.pausado) {
				continue;
			}
			if (dist2(e.x, e.y, js.x, js.y) < (e.info.tamanho / 2 + 10) * (e.info.tamanho / 2 + 10)) {
				ferirJogador(js, e.danoContato);
			}
		}
		// Tiros SÓ com visão (nada de atirar através da parede)
		if (e.tiroT > 0) {
			e.tiroT -= dt;
		}
		if (e.estado === "perseguir" && e.alvo !== undefined && !e.alvo.morto) {
			const tdx = e.alvo.x - e.x;
			const tdy = e.alvo.y - e.y;
			const td = math.sqrt(tdx * tdx + tdy * tdy);
			if (e.info.atira && e.tiroT <= 0 && td < 380 && td > 1) {
				if (e.boss) {
					for (let k = -1; k <= 1; k++) {
						const base = math.atan2(tdy, tdx) + k * 0.22;
						empurrarBala({
							x: e.x,
							y: e.y,
							vx: math.cos(base) * e.info.velBala,
							vy: math.sin(base) * e.info.velBala,
							vida: 3.5,
							dano: e.danoBala,
							amiga: false,
							tam: 9,
						});
					}
				} else {
					// Leque: quantidade varia por tipo (Água-Viva espalha 3)
					const n = e.info.tiros >= 1 ? e.info.tiros : 1;
					for (let k = 0; k < n; k++) {
						const base = math.atan2(tdy, tdx) + (k - (n - 1) / 2) * 0.22;
						empurrarBala({
							x: e.x,
							y: e.y,
							vx: math.cos(base) * e.info.velBala,
							vy: math.sin(base) * e.info.velBala,
							vida: 3.5,
							dano: e.danoBala,
							amiga: false,
							tam: 9,
						});
					}
				}
				e.tiroT = e.info.cadenciaTiro + math.random() * 0.6;
			}
		}
		if (e.rajadaT > 0) {
			e.rajadaT -= dt;
		}
		if (e.boss && e.estado === "perseguir" && e.rajadaT <= 0) {
			for (let k = 0; k < 12; k++) {
				const a = (k / 12) * math.pi * 2 + mundo.tempo;
				empurrarBala({
					x: e.x,
					y: e.y,
					vx: math.cos(a) * 110,
					vy: math.sin(a) * 110,
					vida: 3.5,
					dano: e.danoBala,
					amiga: false,
					tam: 9,
				});
			}
			e.rajadaT = 1.9;
		}
	}

	debug.profileend(); // PQ_Inimigos
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
}
