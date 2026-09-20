/**
 * Visão (SERVIDOR) — linha de visão compartilhada por inimigos e fog.
 *
 * Paredes bloqueiam dos dois lados; o fog é O limite de visão (simétrico).
 * Sem dependência de irmãos: só `estado`, `mundo.ts` e dados.
 */
import { ALCANCE_LAMP, CONE_LAMP, TILE, VISAO, eSolido } from "shared/pixelquest/Dados";
import { lerTile } from "./mundo";
import { JogadorS, dist2, mundo } from "./estado";

export const ALCANCE_VISAO = VISAO; // simétrico: o fog é O limite de visão dos dois lados

export function tileSolidoEm(x: number, y: number): boolean {
	const tx = math.floor(x / TILE);
	const ty = math.floor(y / TILE);
	return eSolido(lerTile(tx, ty));
}

/** Linha de visão: paredes bloqueiam (nada enxerga através). */
export function temVisada(ax: number, ay: number, bx: number, by: number): boolean {
	const dx = bx - ax;
	const dy = by - ay;
	const d = math.sqrt(dx * dx + dy * dy);
	if (d > ALCANCE_VISAO || d < 1) {
		return d < 1;
	}
	const passos = math.floor(d / 12);
	for (let i = 1; i <= passos; i++) {
		const t = i / (passos + 1);
		if (tileSolidoEm(ax + dx * t, ay + dy * t)) {
			return false;
		}
	}
	return true;
}

/** Mira AO VIVO do mouse (cai para a última direção ao parar de mirar). */
export function dirLamp(js: JogadorS): [number, number] {
	if (js.ax * js.ax + js.ay * js.ay > 0.001) {
		return [js.ax, js.ay];
	}
	return [js.fx, js.fy];
}

/** Cone da lanterna: só o que está na direção do olhar e no alcance é iluminado. */
export function noConeLamp(js: JogadorS, x: number, y: number): boolean {
	const dx = x - js.x;
	const dy = y - js.y;
	const d2 = dx * dx + dy * dy;
	if (d2 > ALCANCE_LAMP * ALCANCE_LAMP) {
		return false;
	}
	if (d2 < 1) {
		return true;
	}
	const d = math.sqrt(d2);
	const [lx, ly] = dirLamp(js);
	return (dx * lx + dy * ly) / d >= CONE_LAMP;
}

/** Caça em equipe: quem avista chama aliados próximos para procurar junto. */
export function alertarAliados(px: number, py: number, excetoId: number): void {
	for (const a of mundo.inimigos) {
		if (a.id === excetoId || a.estado === "perseguir") {
			continue;
		}
		// Aliado "escuta" se está a até 420px do avistamento
		if (dist2(a.x, a.y, px, py) < 420 * 420) {
			a.dormindo = false; // barulho acorda zumbi dormente
			a.estado = "cacar";
			a.vistoX = px;
			a.vistoY = py;
			a.procT = 7;
		}
	}
}
