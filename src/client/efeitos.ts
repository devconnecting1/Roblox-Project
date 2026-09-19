/**
 * Efeitos (CLIENTE) — textos flutuantes + cinemática de level-up.
 *
 * Visual puro (anel que voa ao centro, brilho, flash, pisca). O nível real
 * vem do servidor; aqui só a celebração, dirigida pelo loop de render.
 */
import { borda, novoQuadro, novoTexto, COR_TEXTO } from "./ui";
import { TILE } from "shared/pixelquest/Dados";

// Quadradinho do level-up: escuro como a parede de onde saiu
const COR_NIVEL = Color3.fromRGB(38, 42, 54);

interface Flutuante {
	label: TextLabel;
	vida: number;
}

interface ParticulaNivel {
	frame: Frame;
	x0: number; // mundo: parede de onde saiu
	y0: number;
	atraso: number;
	t: number;
}

export interface FxHandle {
	floater: (sx: number, sy: number, texto: string, cor: Color3) => void;
	iniciarNivel: (
		brilho: Frame | undefined,
		px: number,
		py: number,
		ehParede: (tx: number, ty: number) => boolean,
	) => void;
	atualizar: (
		dt: number,
		px: number,
		py: number,
		tX: (x: number) => number,
		tY: (y: number) => number,
		tempo: number,
		framePlayer: Frame | undefined,
	) => void;
	limpar: () => void;
}

export function criarEfeitos(arena: Frame, telaJogo: Frame): FxHandle {
	const flutuantes: Flutuante[] = [];
	// Level-up: anel que voa ao centro + brilho + flash + pisca
	const partsNivel: ParticulaNivel[] = [];
	let proxIdLocal = 1;
	let brilhoT = 0;
	let flashT = 0;
	let piscaT = 0;
	let fxAtivo = false;
	let fxFlash = false;
	let flashBg: Frame | undefined = undefined;
	let alvoBrilho: Frame | undefined = undefined;

	function floater(sx: number, sy: number, texto: string, cor: Color3): void {
		const l = novoTexto(
			arena,
			`F${proxIdLocal}`,
			texto,
			14,
			cor,
			new UDim2(0, 90, 0, 20),
			new UDim2(0, sx - 45, 0, sy - 10),
		);
		l.ZIndex = 20;
		proxIdLocal++;
		flutuantes.push({ label: l, vida: 0.9 });
	}

	function iniciarNivel(
		brilho: Frame | undefined,
		px: number,
		py: number,
		ehParede: (tx: number, ty: number) => boolean,
	): void {
		// Quadradinhos ESCUROS saem das paredes ao redor e voam DEVAGAR ao centro
		const N = 26;
		const pcx = math.floor(px / TILE);
		const pcy = math.floor(py / TILE);
		const muros: [number, number][] = [];
		for (let r = 2; r <= 6; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (math.max(math.abs(dx), math.abs(dy)) !== r) {
						continue;
					}
					if (ehParede(pcx + dx, pcy + dy)) {
						muros.push([(pcx + dx + 0.5) * TILE, (pcy + dy + 0.5) * TILE]);
					}
				}
			}
		}
		for (let k = 0; k < N; k++) {
			const f = novoQuadro(arena, `N${proxIdLocal}`, new UDim2(0, 4, 0, 4), new UDim2(0, -50, 0, -50), COR_NIVEL, 0);
			proxIdLocal++;
			f.ZIndex = 19;
			borda(f, COR_TEXTO, 1);
			f.Visible = false;
			let sx = px;
			let sy = py;
			if (muros.size() > 0) {
				const m = muros[(k * 7) % muros.size()];
				sx = m[0];
				sy = m[1];
			} else {
				// Sem parede por perto: anel simples (fallback)
				const a = (k / N) * math.pi * 2;
				sx = px + math.cos(a) * 78;
				sy = py + math.sin(a) * 78;
			}
			partsNivel.push({ frame: f, x0: sx, y0: sy, atraso: k * 0.045, t: 0 });
		}
		alvoBrilho = brilho;
		brilhoT = 2.8;
		fxAtivo = true;
		fxFlash = false;
	}

	function atualizar(
		dt: number,
		px: number,
		py: number,
		tX: (x: number) => number,
		tY: (y: number) => number,
		tempo: number,
		framePlayer: Frame | undefined,
	): void {
		// Flutuantes sobem e somem
		for (let i = flutuantes.size() - 1; i >= 0; i--) {
			const f = flutuantes[i];
			f.vida -= dt;
			if (f.vida <= 0) {
				f.label.Destroy();
				flutuantes[i] = flutuantes[flutuantes.size() - 1];
				flutuantes.pop();
			} else {
				const p = f.label.Position;
				f.label.Position = new UDim2(p.X.Scale, p.X.Offset, p.Y.Scale, p.Y.Offset - 40 * dt);
				f.label.TextTransparency = 1 - f.vida / 0.9;
			}
		}
		// Level-up: anel voa ao centro, jogador brilha, flash + pisca
		if (fxAtivo) {
			for (let i = partsNivel.size() - 1; i >= 0; i--) {
				const pt = partsNivel[i];
				if (pt.atraso > 0) {
					pt.atraso -= dt;
				} else {
					pt.t += dt / 1.3;
					if (pt.t >= 1) {
						pt.frame.Destroy();
						partsNivel[i] = partsNivel[partsNivel.size() - 1];
						partsNivel.pop();
					} else {
						const e = pt.t * pt.t * (3 - 2 * pt.t); // smoothstep: sai devagar, pousa suave
						const tam = 4 + 4 * e;
						pt.frame.Size = new UDim2(0, tam, 0, tam);
						pt.frame.Position = new UDim2(
							0,
							tX(pt.x0 + (px - pt.x0) * e) - tam / 2,
							0,
							tY(pt.y0 + (py - pt.y0) * e) - tam / 2,
						);
						pt.frame.Visible = true;
					}
				}
			}
			if (partsNivel.size() === 0 && !fxFlash) {
				fxFlash = true;
				flashT = 0.28;
				piscaT = 0.36;
				if (flashBg === undefined) {
					const fb = novoQuadro(
						telaJogo,
						"Flash",
						new UDim2(1, 0, 1, 0),
						new UDim2(0, 0, 0, 0),
						Color3.fromRGB(255, 255, 255),
						0,
					);
					fb.ZIndex = 68;
					fb.Visible = false;
					flashBg = fb;
				}
				flashBg.Visible = true;
			}
		}
		if (brilhoT > 0) {
			brilhoT -= dt;
			if (alvoBrilho !== undefined) {
				alvoBrilho.BackgroundTransparency = brilhoT > 0 ? 0.35 + 0.3 * math.sin(tempo * 18) : 1;
			}
		}
		if (flashT > 0 && flashBg !== undefined) {
			flashT -= dt;
			flashBg.BackgroundTransparency = flashT > 0 ? 1 - (flashT / 0.28) * 0.85 : 1;
			if (flashT <= 0) {
				flashBg.Visible = false;
				fxAtivo = false;
			}
		}
		if (piscaT > 0 && framePlayer !== undefined) {
			piscaT -= dt;
			framePlayer.Visible = piscaT > 0 ? math.floor(piscaT / 0.06) % 2 === 0 : true;
		}
	}

	function limpar(): void {
		for (const f of flutuantes) {
			f.label.Destroy();
		}
		flutuantes.clear();
		for (const pt of partsNivel) {
			pt.frame.Destroy();
		}
		partsNivel.clear();
		brilhoT = 0;
		flashT = 0;
		piscaT = 0;
		fxAtivo = false;
		fxFlash = false;
		alvoBrilho = undefined;
		if (flashBg !== undefined) {
			flashBg.Visible = false;
		}
	}

	return { floater: floater, iniciarNivel: iniciarNivel, atualizar: atualizar, limpar: limpar };
}
