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
import { abrirPorta, areaDe, areaSolida, chaoEmRet, chaoNaArea } from "./mundo";
import { InimigoS, JogadorS, dist2, empurrarBala, mundo, sujarChao } from "./estado";
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
		dormindo: !boss, // zumbis nascem dormentes (WWZ); boss já acorda caçando
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
	difundir({ tipo: "banner", texto: "REI ZUMBI!", duracao: 3 });
	print("[PixelQuest] Boss nasceu.");
}

/** Horda do hospital: salão + 12 enfermarias cheios de zumbis dormentes. */
export function spawnHospital(): void {
	// [x0, y0, x1, y1, quantidade]: salão central + 12 enfermarias
	const regioes: [number, number, number, number, number][] = [
		[23, 23, 36, 36, 30],
		[7, 9, 12, 14, 8],
		[19, 9, 24, 14, 8],
		[35, 9, 40, 14, 8],
		[47, 9, 52, 14, 8],
		[7, 23, 12, 28, 8],
		[7, 35, 12, 40, 8],
		[47, 23, 52, 28, 8],
		[47, 35, 52, 40, 8],
		[7, 45, 12, 50, 8],
		[19, 45, 24, 50, 8],
		[35, 45, 40, 50, 8],
		[47, 45, 52, 50, 8],
	];
	let gerados = 0;
	for (const r of regioes) {
		for (let k = 0; k < r[4]; k++) {
			const pos = chaoEmRet(r[0], r[1], r[2], r[3], 20);
			if (pos === undefined) {
				continue;
			}
			const s = math.random();
			const tipo = s < 0.7 ? 0 : s < 0.9 ? 1 : 2;
			nascerInimigo(INIMIGOS[tipo], false, 0, pos[0], pos[1]);
			gerados++;
		}
	}
	mundo.hospTotal = gerados;
	print(`[PixelQuest] Hospital gerado: ${gerados} zumbis dormentes.`);
}

export function matarInimigo(idx: number, assassino: JogadorS): void {
	const e = mundo.inimigos[idx];
	mundo.inimigos[idx] = mundo.inimigos[mundo.inimigos.size() - 1];
	mundo.inimigos.pop();
	mundo.vivosPorArea[e.area]--;
	assassino.abates++;
	ganharXp(assassino, e.info.xp);
	// Corpo no chão + espirro de sangue verde
	sujarChao(
		"corpo",
		e.x,
		e.y,
		e.info.tamanho,
		math.floor(e.info.cor.R * 255 * 0.45),
		math.floor(e.info.cor.G * 255 * 0.45),
		math.floor(e.info.cor.B * 255 * 0.45),
	);
	sujarChao("sangue", e.x + 14, e.y - 8, 11, 35, 150, 75);
	sujarChao("sangue", e.x - 12, e.y + 10, 9, 35, 150, 75);
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
	} else if (mundo.mapaIdx === 0 && e.area < 4) {
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
	// Boss entra quando alguém pisa na área 4 (só na masmorra; hospital não tem boss)
	for (const [, js] of mundo.jogadores) {
		if (
			!js.morto &&
			!js.pausado &&
			mundo.modo === "dungeon" &&
			mundo.mapaIdx === 0 &&
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
		// 0. Dormente (WWZ): parado até barulho/proximidade acordar
		if (e.dormindo) {
			let perto: JogadorS | undefined = undefined;
			let pertoD = 260 * 260;
			for (const [, js] of mundo.jogadores) {
				if (js.morto || js.pausado) {
					continue;
				}
				const dd = dist2(e.x, e.y, js.x, js.y);
				if (dd < pertoD) {
					pertoD = dd;
					perto = js;
				}
			}
			if (perto !== undefined) {
				e.dormindo = false;
				e.estado = "perseguir";
				e.alvo = perto;
				e.vistoX = perto.x;
				e.vistoY = perto.y;
				alertarAliados(perto.x, perto.y, e.id);
			}
			continue;
		}
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
		// Contato sólido com qualquer jogador vivo (mordida + empurrão físico)
		for (const [, js] of mundo.jogadores) {
			if (js.morto || js.pausado) {
				continue;
			}
			const rr = e.info.tamanho / 2 + 10;
			const d2 = dist2(e.x, e.y, js.x, js.y);
			if (d2 < rr * rr) {
				ferirJogador(js, e.danoContato);
				if (d2 > 1) {
					// Corpos sólidos: ninguém fica dentro do mesmo pixel
					const d = math.sqrt(d2);
					const overlap = rr - d;
					const nx = (js.x - e.x) / d;
					const ny = (js.y - e.y) / d;
					const er = e.info.tamanho / 2;
					const ex = e.x - nx * overlap * 0.7;
					if (!areaSolida(ex, e.y, er)) {
						e.x = ex;
					}
					const ey = e.y - ny * overlap * 0.7;
					if (!areaSolida(e.x, ey, er)) {
						e.y = ey;
					}
					const jx = js.x + nx * overlap * 0.3;
					if (!areaSolida(jx, js.y, 10)) {
						js.x = jx;
					}
					const jy = js.y + ny * overlap * 0.3;
					if (!areaSolida(js.x, jy, 10)) {
						js.y = jy;
					}
				}
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
	}

	debug.profileend(); // PQ_Inimigos
	// Separação sólida anti-empilhamento (hordas WWZ se apertam, mas não fundem)
	if (mundo.inimigos.size() <= 150) {
		for (let i = 0; i < mundo.inimigos.size(); i++) {
			for (let j = i + 1; j < mundo.inimigos.size(); j++) {
				const a = mundo.inimigos[i];
				const b = mundo.inimigos[j];
				const rr = a.info.tamanho / 2 + b.info.tamanho / 2;
				const d2 = dist2(a.x, a.y, b.x, b.y);
				if (d2 > 1 && d2 < rr * rr) {
					const d = math.sqrt(d2);
					const emp = ((rr - d) / d) * 0.55;
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
