/**
 * Mundo procedural (SERVIDOR) — masmorra 50×50 em 5 áreas verticais.
 *
 * Área `k` ocupa as colunas [k*10, k*10+10). Cada área tem salas próprias;
 * áreas vizinhas ligam-se por 1 corredor com 2 portas ("D", sólidas).
 * A porta da fronteira k→k+1 abre quando TODOS os inimigos da área k morrem.
 * A área 4 é a do boss. Grade refeita a cada run (roguelike).
 */
import { MUNDO_A, MUNDO_L, MUNDO_TX, MUNDO_TY, TILE, eSolido } from "shared/pixelquest/Dados";

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

const LARG_BANDA = 10; // tiles por área

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
		for (let t = 0; t < 40 && bandas[b].size() < 5; t++) {
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
				grade[ty - 1][tx] === "R" || grade[ty + 1][tx] === "R" || grade[ty][tx - 1] === "R" || grade[ty][tx + 1] === "R";
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

/** Tile atual (fora da grade = parede). */
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
