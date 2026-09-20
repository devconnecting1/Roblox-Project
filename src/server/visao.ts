/**
 * Visão (SERVIDOR) — linha de visão compartilhada por inimigos e fog.
 *
 * Paredes bloqueiam dos dois lados; o fog é O limite de visão (simétrico).
 * Sem dependência de irmãos: só `estado`, `mundo.ts` e dados.
 */
import { TILE, VISAO, eSolido } from "shared/pixelquest/Dados";
import { lerTile } from "./mundo";
import { dist2, mundo } from "./estado";

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
