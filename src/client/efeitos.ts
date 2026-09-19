/**
 * Efeitos (CLIENTE) — textos flutuantes + cinemática de level-up.
 *
 * Visual puro (anel que voa ao centro, brilho, flash, pisca). O nível real
 * vem do servidor; aqui só a celebração, dirigida pelo loop de render.
 */
import { novoQuadro, novoTexto } from "./ui";
import { COR_TILE, TILE } from "shared/pixelquest/Dados";

// Quadradinho do level-up: mesma cor de fundo das paredes de onde saiu
const COR_NIVEL = COR_TILE["R"];

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

interface Brasa {
	f: Frame;
	x: number;
	y: number;
	v: number;
	fase: number;
}

/** Brasas subindo + glow de fogo no fundo (ambiente do seletor). */
export function criarBrasas(pai: Frame, visivel: () => boolean): void {
	const brasas: Brasa[] = [];
	const cores = [Color3.fromRGB(255, 140, 40), Color3.fromRGB(255, 180, 60), Color3.fromRGB(200, 60, 30)];
	for (let i = 0; i < 24; i++) {
		const tam = 3 + math.random() * 4;
		const f = novoQuadro(pai, `Br${i}`, new UDim2(0, tam, 0, tam), new UDim2(0, -50, 0, -50), cores[i % 3], 0.4);
		f.ZIndex = 2;
		f.Visible = false;
		brasas.push({
			f: f,
			x: math.random(),
			y: 1 + math.random() * 0.1,
			v: 0.04 + math.random() * 0.05,
			fase: math.random() * 6.28,
		});
	}
	const glows: Frame[] = [];
	for (let k = 0; k < 3; k++) {
		const g = novoQuadro(
			pai,
			`Glow${k}`,
			new UDim2(1, 0, 0, 120 - k * 40),
			new UDim2(0, 0, 1, -120 + k * 40),
			Color3.fromRGB(255, 110, 25),
			0.93 - k * 0.02,
		);
		g.ZIndex = 1;
		g.Visible = false;
		glows.push(g);
	}
	let tempo = 0;
	task.spawn(() => {
		while (true) {
			if (visivel()) {
				tempo += 0.03;
				for (const b of brasas) {
					b.y -= b.v * 0.03;
					if (b.y < -0.05) {
						b.y = 1.05;
						b.x = math.random();
					}
					b.f.Position = new UDim2(b.x + math.sin(tempo * 1.5 + b.fase) * 0.004, 0, b.y, 0);
					b.f.BackgroundTransparency = 0.35 + 0.3 * math.sin(tempo * 3 + b.fase);
					b.f.Visible = true;
				}
				for (let k = 0; k < glows.size(); k++) {
					const g = glows[k];
					g.BackgroundTransparency = 0.91 + 0.02 * math.sin(tempo * 1.5 + k * 2);
					g.Visible = true;
				}
			} else {
				for (const b of brasas) {
					b.f.Visible = false;
				}
				for (const g of glows) {
					g.Visible = false;
				}
			}
			task.wait(0.03);
		}
	});
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

export function criarEfeitos(arena: Frame, telaJogo: Frame, aoFlash: () => void): FxHandle {
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
		// Quadradinhos ESCUROS saem das PAREDES (ou do vazio fora do mapa) ao
		// redor e voam DEVAGAR ao centro. Nunca nascem em área aberta/explorada:
		// sem parede por perto, o efeito vira só brilho + flash + título.
		const N = 26;
		const pcx = math.floor(px / TILE);
		const pcy = math.floor(py / TILE);
		const muros: [number, number][] = [];
		for (let r = 2; r <= 10; r++) {
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
			if (muros.size() >= N) {
				break;
			}
		}
		if (muros.size() === 0) {
			alvoBrilho = brilho;
			brilhoT = 2.8;
			fxAtivo = true;
			fxFlash = false;
			return;
		}
		for (let k = 0; k < N; k++) {
			const f = novoQuadro(arena, `N${proxIdLocal}`, new UDim2(0, 4, 0, 4), new UDim2(0, -50, 0, -50), COR_NIVEL, 0);
			proxIdLocal++;
			f.ZIndex = 19;
			f.Visible = false;
			const m = muros[(k * 7) % muros.size()];
			partsNivel.push({ frame: f, x0: m[0], y0: m[1], atraso: k * 0.06, t: 0 });
		}
		alvoBrilho = brilho;
		brilhoT = 3.6;
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
					pt.t += dt / 1.8;
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
				aoFlash(); // último quadradinho chegou: título + flash + pisca
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
