/**
 * Efeitos (CLIENTE) — textos flutuantes + cinemática de level-up.
 *
 * Visual puro (anel que voa ao centro, brilho, flash, pisca). O nível real
 * vem do servidor; aqui só a celebração, dirigida pelo loop de render.
 */
import { borda, novoQuadro, novoTexto, COR_TEXTO, COR_XP } from "./ui";

interface Flutuante {
	label: TextLabel;
	vida: number;
}

interface ParticulaNivel {
	frame: Frame;
	ang: number;
	atraso: number;
	t: number;
}

export interface FxHandle {
	floater: (sx: number, sy: number, texto: string, cor: Color3) => void;
	iniciarNivel: (brilho: Frame | undefined) => void;
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

	function iniciarNivel(brilho: Frame | undefined): void {
		// Anel de quadradinhos que voa ao centro + brilho + flash + pisca + título
		const N = 26;
		for (let k = 0; k < N; k++) {
			const f = novoQuadro(arena, `N${proxIdLocal}`, new UDim2(0, 8, 0, 8), new UDim2(0, -50, 0, -50), COR_XP, 0);
			proxIdLocal++;
			f.ZIndex = 19;
			borda(f, COR_TEXTO, 1);
			f.Visible = false;
			partsNivel.push({ frame: f, ang: (k / N) * math.pi * 2, atraso: k * 0.018, t: 0 });
		}
		alvoBrilho = brilho;
		brilhoT = 1.4;
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
			const cx0 = tX(px) - 4;
			const cy0 = tY(py) - 4;
			for (let i = partsNivel.size() - 1; i >= 0; i--) {
				const pt = partsNivel[i];
				if (pt.atraso > 0) {
					pt.atraso -= dt;
				} else {
					pt.t += dt / 0.55;
					if (pt.t >= 1) {
						pt.frame.Destroy();
						partsNivel[i] = partsNivel[partsNivel.size() - 1];
						partsNivel.pop();
					} else {
						const e = 1 - (1 - pt.t) * (1 - pt.t); // ease-out: acelera no centro
						const r = 78 * (1 - e);
						pt.frame.Position = new UDim2(0, cx0 + math.cos(pt.ang) * r, 0, cy0 + math.sin(pt.ang) * r);
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
