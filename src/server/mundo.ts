/**
 * Mundo procedural (SERVIDOR) — masmorra 60×60 em 5 áreas verticais.
 *
 * Área `k` ocupa as colunas [k*12, k*12+12). Cada área tem salas próprias;
 * áreas vizinhas ligam-se por 1 corredor com 2 portas ("D", sólidas).
 * A porta da fronteira k→k+1 abre quando TODOS os inimigos da área k morrem
 * (e a próxima área só então é povoada). A área 4 é a do boss.
 * Grade refeita a cada run (roguelike).
 */
import { LOBBY_SALAS, MUNDO_A, MUNDO_L, MUNDO_TX, MUNDO_TY, TILE, eSolido } from "shared/pixelquest/Dados";

export interface Sala {
	x: number;
	y: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
}

export interface Porta {
	tx: number;
	ty: number;
	area: number; // área que precisa ser limpa para abrir
}

let grade: string[][] = [];
let portas: Porta[] = [];
let nasc: [number, number] = [MUNDO_L / 2, MUNDO_A / 2];

const LARG_BANDA = 12; // tiles por área (5 bandas em 60 colunas)

function porChao(tx: number, ty: number): void {
	if (tx < 1 || ty < 1 || tx >= MUNDO_TX - 1 || ty >= MUNDO_TY - 1) {
		return;
	}
	if (grade[ty][tx] === "R") {
		grade[ty][tx] = (tx + ty) % 9 === 0 ? "," : ".";
	}
}

function escavarH(y: number, x1: number, x2: number, portaEm?: number, areaPorta?: number): void {
	const a = x1 < x2 ? x1 : x2;
	const b = x1 < x2 ? x2 : x1;
	for (let x = a; x <= b; x++) {
		porChao(x, y);
		porChao(x, y + 1);
		if (portaEm !== undefined && areaPorta !== undefined && x === portaEm) {
			for (const yy of [y, y + 1]) {
				if (yy >= 1 && yy < MUNDO_TY - 1) {
					grade[yy][x] = "D";
					portas.push({ tx: x, ty: yy, area: areaPorta });
				}
			}
		}
	}
}

function escavarV(x: number, y1: number, y2: number): void {
	const a = y1 < y2 ? y1 : y2;
	const b = y1 < y2 ? y2 : y1;
	for (let y = a; y <= b; y++) {
		porChao(x, y);
		porChao(x + 1, y);
	}
}

/** Gera a masmorra e retorna portas + nascimento. */
export function gerarMundo(): { portas: Porta[]; nasc: [number, number] } {
	grade = [];
	for (let ty = 0; ty < MUNDO_TY; ty++) {
		const linha: string[] = [];
		for (let tx = 0; tx < MUNDO_TX; tx++) {
			linha.push("R");
		}
		grade.push(linha);
	}
	portas = [];
	const bandas: Sala[][] = [[], [], [], [], []];
	for (let b = 0; b < 5; b++) {
		const x0 = b * LARG_BANDA;
		for (let t = 0; t < 40 && bandas[b].size() < 4; t++) {
			const w = 4 + math.floor(math.random() * 4);
			const h = 4 + math.floor(math.random() * 3);
			const x = x0 + 1 + math.floor(math.random() * (LARG_BANDA - w - 1));
			const y = 2 + math.floor(math.random() * (MUNDO_TY - h - 4));
			let ok = true;
			for (const s of bandas[b]) {
				if (x < s.x + s.w + 1 && x + w + 1 > s.x && y < s.y + s.h + 1 && y + h + 1 > s.y) {
					ok = false;
					break;
				}
			}
			if (!ok) {
				continue;
			}
			const cx = x + math.floor(w / 2);
			const cy = y + math.floor(h / 2);
			bandas[b].push({ x: x, y: y, w: w, h: h, cx: cx, cy: cy });
			for (let yy = y; yy < y + h; yy++) {
				for (let xx = x; xx < x + w; xx++) {
					porChao(xx, yy);
				}
			}
		}
		if (bandas[b].size() === 0) {
			// Fallback: sala garantida no centro da banda
			const x = x0 + 2;
			const y = 20;
			bandas[b].push({ x: x, y: y, w: 6, h: 6, cx: x + 3, cy: y + 3 });
			for (let yy = y; yy < y + 6; yy++) {
				for (let xx = x; xx < x + 6; xx++) {
					porChao(xx, yy);
				}
			}
		}
		// Liga salas da banda em cadeia
		for (let i = 1; i < bandas[b].size(); i++) {
			const a = bandas[b][i - 1];
			const c = bandas[b][i];
			escavarH(a.cy, a.cx, c.cx, undefined, undefined);
			escavarV(c.cx, a.cy, c.cy);
		}
	}
	// Liga bandas vizinhas com porta na fronteira
	for (let b = 0; b < 4; b++) {
		const a = bandas[b][bandas[b].size() - 1];
		const c = bandas[b + 1][0];
		const fronteira = (b + 1) * LARG_BANDA;
		escavarH(a.cy, a.cx, c.cx, fronteira, b);
		escavarV(c.cx, a.cy, c.cy);
	}
	// Decoração: tochas junto à parede, musgo no chão
	for (let ty = 2; ty < MUNDO_TY - 2; ty++) {
		for (let tx = 2; tx < MUNDO_TX - 2; tx++) {
			const ch = grade[ty][tx];
			if (ch !== "." && ch !== ",") {
				continue;
			}
			const r = math.random();
			const pertoParede =
				grade[ty - 1][tx] === "R" ||
				grade[ty + 1][tx] === "R" ||
				grade[ty][tx - 1] === "R" ||
				grade[ty][tx + 1] === "R";
			if (r < 0.04 && pertoParede) {
				grade[ty][tx] = "T";
			} else if (r < 0.12) {
				grade[ty][tx] = "*";
			}
		}
	}
	const s0 = bandas[0][0];
	nasc = [(s0.cx + 0.5) * TILE, (s0.cy + 0.5) * TILE];
	return { portas: portas, nasc: nasc };
}

/** Gera o lobby (layout fixo: centro + MAPAS em cima, ENCANT esq, RANK dir). */
export function gerarLobby(): { portas: Porta[]; nasc: [number, number] } {
	grade = [];
	for (let ty = 0; ty < MUNDO_TY; ty++) {
		const linha: string[] = [];
		for (let tx = 0; tx < MUNDO_TX; tx++) {
			linha.push("R");
		}
		grade.push(linha);
	}
	portas = [];
	const cavarSala = (x: number, y: number, w: number, h: number): void => {
		for (let yy = y; yy < y + h; yy++) {
			for (let xx = x; xx < x + w; xx++) {
				porChao(xx, yy);
			}
		}
	};
	const c = LOBBY_SALAS["centro"];
	const m = LOBBY_SALAS["mapas"];
	const e = LOBBY_SALAS["encant"];
	const r = LOBBY_SALAS["rank"];
	cavarSala(c.x, c.y, c.w, c.h);
	cavarSala(m.x, m.y, m.w, m.h);
	cavarSala(e.x, e.y, e.w, e.h);
	cavarSala(r.x, r.y, r.w, r.h);
	// Corredores: centro↔cima, centro↔esq, centro↔dir (2 de largura, sem portas)
	escavarH(29, 29, 30, undefined, undefined);
	escavarV(29, m.y + m.h, c.y + 1);
	escavarV(30, m.y + m.h, c.y + 1);
	escavarH(29, e.x + e.w, c.x + 1, undefined, undefined);
	escavarH(30, e.x + e.w, c.x + 1, undefined, undefined);
	escavarH(29, c.x + c.w - 1, r.x, undefined, undefined);
	escavarH(30, c.x + c.w - 1, r.x, undefined, undefined);
	nasc = [(c.x + c.w / 2) * TILE, (c.y + c.h / 2) * TILE];
	return { portas: portas, nasc: nasc };
}

/** Gera o hospital (mapa 2: salão central + 12 enfermarias interligadas). */
export function gerarHospital(): { portas: Porta[]; nasc: [number, number] } {
	grade = [];
	for (let ty = 0; ty < MUNDO_TY; ty++) {
		const linha: string[] = [];
		for (let tx = 0; tx < MUNDO_TX; tx++) {
			linha.push("R");
		}
		grade.push(linha);
	}
	portas = [];
	const cavarSala = (x: number, y: number, w: number, h: number): void => {
		for (let yy = y; yy < y + h; yy++) {
			for (let xx = x; xx < x + w; xx++) {
				porChao(xx, yy);
			}
		}
	};
	cavarSala(22, 22, 16, 16); // salão central
	cavarSala(6, 8, 8, 8); // N1
	cavarSala(18, 8, 8, 8); // N2
	cavarSala(34, 8, 8, 8); // N3
	cavarSala(46, 8, 8, 8); // N4
	cavarSala(6, 22, 8, 8); // W1
	cavarSala(6, 34, 8, 8); // W2
	cavarSala(46, 22, 8, 8); // E1
	cavarSala(46, 34, 8, 8); // E2
	cavarSala(6, 44, 8, 8); // S1
	cavarSala(18, 44, 8, 8); // S2
	cavarSala(34, 44, 8, 8); // S3
	cavarSala(46, 44, 8, 8); // S4
	// Corredores abertos (2 de largura, sem portas): salas vizinhas ligam entre si
	escavarH(11, 13, 18, undefined, undefined); // N1↔N2
	escavarV(21, 15, 22); // N2↔salão
	escavarV(37, 15, 22); // N3↔salão
	escavarV(49, 15, 22); // N4↔E1
	escavarH(25, 13, 22, undefined, undefined); // W1↔salão
	escavarH(25, 37, 46, undefined, undefined); // salão↔E1
	escavarV(9, 29, 34); // W1↔W2
	escavarV(49, 29, 34); // E1↔E2
	escavarH(47, 13, 18, undefined, undefined); // S1↔S2
	escavarH(47, 41, 46, undefined, undefined); // S3↔S4
	escavarV(21, 37, 44); // salão↔S2
	escavarV(37, 37, 44); // salão↔S3
	escavarV(9, 41, 44); // W2↔S1
	escavarV(49, 41, 44); // E2↔S4
	// Decoração: musgo no chão
	for (let ty = 2; ty < MUNDO_TY - 2; ty++) {
		for (let tx = 2; tx < MUNDO_TX - 2; tx++) {
			if (grade[ty][tx] === "." && math.random() < 0.1) {
				grade[ty][tx] = "*";
			}
		}
	}
	nasc = [29.5 * TILE, 29.5 * TILE];
	return { portas: portas, nasc: nasc };
}

/** Ponto caminhável aleatório dentro de um retângulo de tiles (spawn do hospital). */
export function chaoEmRet(
	x0t: number,
	y0t: number,
	x1t: number,
	y1t: number,
	raio: number,
): [number, number] | undefined {
	for (let t = 0; t < 40; t++) {
		const x = (x0t + math.random() * (x1t - x0t)) * TILE;
		const y = (y0t + math.random() * (y1t - y0t)) * TILE;
		if (!areaSolida(x, y, raio)) {
			return [x, y];
		}
	}
	return undefined;
}
export function lerTile(tx: number, ty: number): string {
	if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY || grade.size() === 0) {
		return "R";
	}
	return grade[ty][tx];
}

/** Abre porta (vira chão) — chamado ao limpar a área. */
export function abrirPorta(tx: number, ty: number): void {
	if (tx >= 0 && ty >= 0 && tx < MUNDO_TX && ty < MUNDO_TY && grade[ty][tx] === "D") {
		grade[ty][tx] = ".";
	}
}

/** Grade como strings (1 por linha) p/ enviar ao cliente uma vez por run. */
export function gradeStrings(): string[] {
	const linhas: string[] = [];
	for (const linha of grade) {
		linhas.push(linha.join(""));
	}
	return linhas;
}

/** Restaura a grade a partir das linhas (dungeon pré-gerada). */
export function definirGrade(linhas: string[]): void {
	grade = [];
	for (const linha of linhas) {
		const vetor: string[] = [];
		for (let i = 1; i <= linha.size(); i++) {
			vetor.push(linha.sub(i, i));
		}
		grade.push(vetor);
	}
}

/** Área (0–4) da posição em px. */
export function areaDe(x: number): number {
	const a = math.floor(x / TILE / LARG_BANDA);
	if (a < 0) {
		return 0;
	}
	if (a > 4) {
		return 4;
	}
	return a;
}

/** Círculo (x, y, raio) encosta em tile sólido? */
export function areaSolida(x: number, y: number, raio: number): boolean {
	const tx1 = math.floor((x - raio) / TILE);
	const tx2 = math.floor((x + raio) / TILE);
	const ty1 = math.floor((y - raio) / TILE);
	const ty2 = math.floor((y + raio) / TILE);
	for (let tx = tx1; tx <= tx2; tx++) {
		for (let ty = ty1; ty <= ty2; ty++) {
			if (eSolido(lerTile(tx, ty))) {
				return true;
			}
		}
	}
	return false;
}

/** Ponto caminhável perto de (x, y). */
export function acharChaoPerto(x: number, y: number, raio: number): [number, number] {
	if (!areaSolida(x, y, raio)) {
		return [x, y];
	}
	let passo = TILE;
	while (passo < 600) {
		for (let k = 0; k < 8; k++) {
			const a = (k / 8) * math.pi * 2;
			const cx = x + math.cos(a) * passo;
			const cy = y + math.sin(a) * passo;
			if (cx > 60 && cy > 60 && cx < MUNDO_L - 60 && cy < MUNDO_A - 60 && !areaSolida(cx, cy, raio)) {
				return [cx, cy];
			}
		}
		passo += TILE;
	}
	return [MUNDO_L / 2, MUNDO_A / 2];
}

/** Ponto caminhável aleatório dentro da área (spawn de inimigos nos caminhos). */
export function chaoNaArea(area: number, raio: number): [number, number] | undefined {
	const x0 = area * LARG_BANDA * TILE;
	const x1 = x0 + LARG_BANDA * TILE;
	for (let t = 0; t < 40; t++) {
		const x = x0 + TILE + math.random() * (x1 - x0 - TILE * 2);
		const y = TILE * 2 + math.random() * (MUNDO_A - TILE * 4);
		if (!areaSolida(x, y, raio)) {
			return [x, y];
		}
	}
	return undefined;
}
