/**
 * Snapshots (SERVIDOR) — eventos pontuais + `Foto` 20Hz filtrada pelo Fog of War.
 *
 * Anti-cheat de visão: o cliente só recebe entidades com linha de visão.
 */
import { TOTAL_AREAS, VISAO } from "shared/pixelquest/Dados";
import { EventoPayload, Foto } from "shared/pixelquest/Dados";
import { Remotes } from "shared/pixelquest/Rede";
import { areaDe } from "./mundo";
import { JogadorS, danoTotal, dist2, mundo } from "./estado";
import { temVisada } from "./visao";

// ---------- Eventos → cliente ----------
export function enviar(player: Player, ev: EventoPayload): void {
	Remotes.Server.Get("Evento").SendToPlayer(player, ev);
}

export function difundir(ev: EventoPayload): void {
	for (const [pl] of mundo.jogadores) {
		Remotes.Server.Get("Evento").SendToPlayer(pl, ev);
	}
}

// ---------- Snapshot (só o visível: Fog of War real) ----------
function visivelPara(js: JogadorS, x: number, y: number): boolean {
	return dist2(js.x, js.y, x, y) < VISAO * VISAO && temVisada(js.x, js.y, x, y);
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
			nv: e.nv,
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
		fbalas.push({ id: b.id, x: b.x, y: b.y, amiga: b.amiga, tam: b.tam });
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
		fx: js.fx,
		fy: js.fy,
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
		titulos: js.titulos,
		tituloEq: js.tituloEq !== undefined ? js.tituloEq : "",
		eqArma: js.eqArma !== undefined ? js.eqArma.id : "",
		eqArmadura: js.eqArmadura !== undefined ? js.eqArmadura.id : "",
		eqAcess: js.eqAcess !== undefined ? js.eqAcess.id : "",
		pausado: js.pausado,
		areasAbertas: areas,
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
