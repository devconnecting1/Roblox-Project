/**
 * Snapshots (SERVIDOR) — eventos pontuais + `Foto` 20Hz filtrada pelo Fog of War.
 *
 * Anti-cheat de visão: o cliente só recebe entidades com linha de visão.
 */
import { TOTAL_AREAS } from "shared/pixelquest/Dados";
import { EventoPayload, Foto } from "shared/pixelquest/Dados";
import { Remotes } from "shared/pixelquest/Rede";
import { areaDe } from "./mundo";
import { JogadorS, danoTotal, mundo } from "./estado";
import { dirLamp, noConeLamp, temVisada } from "./visao";

// ---------- Eventos → cliente ----------
export function enviar(player: Player, ev: EventoPayload): void {
	Remotes.Server.Get("Evento").SendToPlayer(player, ev);
}

export function difundir(ev: EventoPayload): void {
	for (const [pl] of mundo.jogadores) {
		Remotes.Server.Get("Evento").SendToPlayer(pl, ev);
	}
}

// ---------- Snapshot (só o iluminado: Fog of War real em cone) ----------
function visivelPara(js: JogadorS, x: number, y: number): boolean {
	return noConeLamp(js, x, y) && temVisada(js.x, js.y, x, y);
}

function enviarFoto(js: JogadorS): void {
	const fins: Foto["inimigos"] = [];
	const semFog = mundo.modo === "lobby"; // lobby: todos se veem
	let bossFracao = -1;
	let bossHp = 0;
	let bossMax = 0;
	for (const e of mundo.inimigos) {
		if (!semFog && !visivelPara(js, e.x, e.y)) {
			continue;
		}
		fins.push({
			id: e.id,
			x: e.x,
			y: e.y,
			hp: e.hp,
			hpMax: e.hpMax,
			tam: e.info.tamanho,
			nv: e.nv,
			boss: e.boss,
			r: e.info.cor.R * 255,
			g: e.info.cor.G * 255,
			b: e.info.cor.B * 255,
		});
		if (e.boss) {
			bossFracao = e.hp / e.hpMax;
			bossHp = math.floor(e.hp);
			bossMax = math.floor(e.hpMax);
		}
	}
	const fbalas: Foto["balas"] = [];
	for (const b of mundo.balas) {
		if (!semFog && !visivelPara(js, b.x, b.y)) {
			continue;
		}
		fbalas.push({ id: b.id, x: b.x, y: b.y, amiga: b.amiga, tam: b.tam });
	}
	const fcots: Foto["cots"] = [];
	for (const c of mundo.cots) {
		if (!semFog && !visivelPara(js, c.x, c.y)) {
			continue;
		}
		fcots.push({ id: c.id, x: c.x, y: c.y, tipo: c.tipo });
	}
	const fjogs: Foto["jogadores"] = [];
	for (const [, outro] of mundo.jogadores) {
		if (outro === js || outro.morto || (!semFog && !visivelPara(js, outro.x, outro.y))) {
			continue;
		}
		fjogs.push({
			nome: outro.player.Name,
			x: outro.x,
			y: outro.y,
			nv: outro.nivel,
			flash: outro.flashT > 0,
			r: 90,
			g: 220,
			b: 120,
		});
	}
	const fmanchas: Foto["manchas"] = [];
	for (const m of mundo.manchas) {
		if (!semFog && !visivelPara(js, m.x, m.y)) {
			continue;
		}
		fmanchas.push({ x: m.x, y: m.y, tipo: m.tipo, tam: m.tam, r: m.r, g: m.g, b: m.b });
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
	const [olhoX, olhoY] = dirLamp(js); // mira AO VIVO: olho + cone seguem o mouse
	const foto: Foto = {
		px: js.x,
		py: js.y,
		fx: olhoX,
		fy: olhoY,
		flash: js.flashT > 0,
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
		manchas: fmanchas,
		bossFracao: bossFracao,
		bossHp: bossHp,
		bossMax: bossMax,
		mochila: mochilaIds,
		titulos: js.titulos,
		tituloEq: js.tituloEq !== undefined ? js.tituloEq : "",
		eqArma: js.eqArma !== undefined ? js.eqArma.id : "",
		eqArmadura: js.eqArmadura !== undefined ? js.eqArmadura.id : "",
		eqAcess: js.eqAcess !== undefined ? js.eqAcess.id : "",
		pausado: js.pausado,
		areasAbertas: areas,
		mapaIdx: mundo.mapaIdx,
		lobby: mundo.modo === "lobby",
	};
	Remotes.Server.Get("Foto").SendToPlayer(js.player, foto);
}

export function enviarSnapshots(dt: number): void {
	mundo.snapT += dt;
	if (mundo.snapT >= 1 / 20) {
		mundo.snapT = 0;
		debug.profilebegin("PQ_Snapshots");
		for (const [, js] of mundo.jogadores) {
			if (!js.morto) {
				enviarFoto(js);
			}
		}
		debug.profileend(); // PQ_Snapshots
	}
}
