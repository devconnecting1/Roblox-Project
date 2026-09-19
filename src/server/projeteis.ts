/**
 * Projéteis (SERVIDOR) — balas voam, morrem na parede e colidem.
 */
import { MUNDO_A, MUNDO_L } from "shared/pixelquest/Dados";
import { dist2, mundo } from "./estado";
import { tileSolidoEm } from "./visao";
import { ferirJogador, jogadorMaisProximo } from "./jogadores";
import { matarInimigo } from "./inimigos";

export function atualizarBalas(dt: number): void {
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
					if (js.morto || js.pausado) {
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
}
