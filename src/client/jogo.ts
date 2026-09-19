/**
 * Pixel Quest 2D — jogo puramente em interfaces 2D (ScreenGui).
 *
 * Inspirado no RPG 2D bullet-hell do Roblox: mundo top-down em que você se
 * move em TODAS as direções (WASD/setas/D-pad), desvia de projéteis,
 * derrota inimigos, coleta loot, sobe de nível, completa quests e enfrenta
 * a Sereia da Praia na onda 5. Lore: após 1x1x1x1 destruir a 3ª dimensão,
 * os sobreviventes fugiram para o mundo 2D.
 *
 * Arquitetura: estado + simulação aqui no cliente (single-player test),
 * progresso persistido via `@rbxts/net` → servidor (leaderstats).
 */
import { Players, RunService, UserInputService } from "@rbxts/services";
import {
	ARENA_A,
	ARENA_L,
	BOSS,
	CLASSES,
	INIMIGOS,
	InimigoInfo,
	MAPA,
	ONDA_BOSS,
	QUESTS,
	TILE,
	calcularValor,
	inimigosDaOnda,
	xpParaNivel,
} from "shared/pixelquest/Dados";
import { Remotes } from "shared/pixelquest/Rede";

// ---------- Tipos internos ----------
interface Bala {
	x: number;
	y: number;
	vx: number;
	vy: number;
	vida: number;
	dano: number;
	amiga: boolean;
	tam: number;
	frame: Frame;
}

interface Inimigo {
	id: number;
	info: InimigoInfo;
	eBoss: boolean;
	x: number;
	y: number;
	hp: number;
	hpMax: number;
	tiroT: number;
	rajadaT: number;
	hitT: number;
	frame: Frame;
	barra: Frame;
}

interface Coletavel {
	x: number;
	y: number;
	vx: number;
	vy: number;
	tipo: "moeda" | "coracao";
	frame: Frame;
	fase: number;
}

interface Flutuante {
	label: TextLabel;
	vida: number;
}

interface QuestProg {
	id: string;
	nome: string;
	descricao: string;
	meta: number;
	progresso: number;
	completa: boolean;
	xp: number;
}

// ---------- Cores ----------
const COR_FUNDO = Color3.fromRGB(13, 17, 23);
const COR_PAINEL = Color3.fromRGB(28, 34, 46);
const COR_TEXTO = Color3.fromRGB(240, 246, 252);
const COR_DESTAQUE = Color3.fromRGB(255, 213, 74);
const COR_PERIGO = Color3.fromRGB(231, 76, 60);
const COR_VIDA = Color3.fromRGB(46, 204, 113);
const COR_XP = Color3.fromRGB(88, 140, 255);
const COR_BALA_INIMIGA = Color3.fromRGB(255, 70, 180);

const TILE_CORES: { [chave: string]: Color3 } = {
	".": Color3.fromRGB(194, 178, 128),
	",": Color3.fromRGB(210, 196, 148),
	"~": Color3.fromRGB(52, 152, 219),
	T: Color3.fromRGB(39, 174, 96),
	"*": Color3.fromRGB(140, 190, 90),
};

// ---------- Helpers de UI ----------
function borda(inst: GuiObject, cor: Color3, grossura: number): void {
	const s = new Instance("UIStroke");
	s.Color = cor;
	s.Thickness = grossura;
	s.Parent = inst;
}

function novoQuadro(pai: Instance, nome: string, tam: UDim2, pos: UDim2, cor: Color3, transp: number): Frame {
	const f = new Instance("Frame");
	f.Name = nome;
	f.Size = tam;
	f.Position = pos;
	f.BackgroundColor3 = cor;
	f.BackgroundTransparency = transp;
	f.BorderSizePixel = 0;
	f.Parent = pai;
	return f;
}

function novoTexto(
	pai: Instance,
	nome: string,
	texto: string,
	tamFonte: number,
	cor: Color3,
	tam: UDim2,
	pos: UDim2,
): TextLabel {
	const l = new Instance("TextLabel");
	l.Name = nome;
	l.Text = texto;
	l.Font = Enum.Font.GothamBold;
	l.TextSize = tamFonte;
	l.TextColor3 = cor;
	l.BackgroundTransparency = 1;
	l.Size = tam;
	l.Position = pos;
	l.TextXAlignment = Enum.TextXAlignment.Center;
	l.Parent = pai;
	return l;
}

function novoBotao(
	pai: Instance,
	nome: string,
	texto: string,
	tam: UDim2,
	pos: UDim2,
	corFundo: Color3,
	tamFonte: number,
): TextButton {
	const b = new Instance("TextButton");
	b.Name = nome;
	b.Text = texto;
	b.Font = Enum.Font.GothamBlack;
	b.TextSize = tamFonte;
	b.TextColor3 = COR_TEXTO;
	b.BackgroundColor3 = corFundo;
	b.BorderSizePixel = 0;
	b.Size = tam;
	b.Position = pos;
	b.AutoButtonColor = true;
	b.Parent = pai;
	borda(b, COR_TEXTO, 2);
	return b;
}

function dist2(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
}

// ---------- Jogo ----------
export function iniciarJogo(playerGui: PlayerGui): void {
	// ===== Telas =====
	const gui = new Instance("ScreenGui");
	gui.Name = "PixelQuestUI";
	gui.ResetOnSpawn = false;
	gui.IgnoreGuiInset = true;
	gui.DisplayOrder = 10;
	gui.Parent = playerGui;

	// ----- Menu -----
	const telaMenu = novoQuadro(gui, "Menu", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	novoTexto(telaMenu, "Titulo", "PIXEL QUEST 2D", 56, COR_DESTAQUE, new UDim2(1, 0, 0, 80), new UDim2(0, 0, 0, 60));
	novoTexto(
		telaMenu,
		"Sub",
		"Após 1x1x1x1 destruir a 3ª dimensão, restou o mundo 2D. Sobreviva!",
		18,
		COR_TEXTO,
		new UDim2(1, 0, 0, 30),
		new UDim2(0, 0, 0, 145),
	);
	novoTexto(telaMenu, "Escolha", "— ESCOLHA SUA CLASSE —", 22, COR_TEXTO, new UDim2(1, 0, 0, 30), new UDim2(0, 0, 0, 195));

	const botoesClasse: TextButton[] = [];
	for (let i = 0; i < CLASSES.size(); i++) {
		const c = CLASSES[i];
		const b = novoBotao(
			telaMenu,
			`Classe${i}`,
			`${c.nome}\nHP ${c.hpMax} | Dano ${c.dano}`,
			new UDim2(0, 220, 0, 90),
			new UDim2(0.5, -360 + i * 250, 0, 245),
			COR_PAINEL,
			18,
		);
		b.TextColor3 = c.cor;
		botoesClasse.push(b);
	}
	const ajuda = novoTexto(
		telaMenu,
		"Ajuda",
		"WASD/setas ou D-pad: mover em todas as direções | Tiro automático no inimigo mais próximo\nSHIFT/L ou DASH: dash com invencibilidade | P: pausar | Desvie das balas rosas!",
		15,
		Color3.fromRGB(160, 175, 195),
		new UDim2(1, -40, 0, 60),
		new UDim2(0, 20, 0, 360),
	);
	ajuda.TextWrapped = true;

	// ----- Tela do jogo -----
	const telaJogo = novoQuadro(gui, "Jogo", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaJogo.Visible = false;

	// HUD superior
	const hud = novoQuadro(telaJogo, "HUD", new UDim2(1, 0, 0, 54), new UDim2(0, 0, 0, 0), COR_PAINEL, 0);
	const txtVida = novoTexto(hud, "Vida", "HP", 16, COR_TEXTO, new UDim2(0, 220, 0, 24), new UDim2(0, 12, 0, 4));
	const barraVidaFundo = novoQuadro(hud, "VidaFundo", new UDim2(0, 220, 0, 12), new UDim2(0, 12, 0, 28), Color3.fromRGB(60, 20, 20), 0);
	const barraVida = novoQuadro(barraVidaFundo, "Vida", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_VIDA, 0);
	const txtXp = novoTexto(hud, "Xp", "Nv 1", 16, COR_TEXTO, new UDim2(0, 220, 0, 24), new UDim2(0, 244, 0, 4));
	const barraXpFundo = novoQuadro(hud, "XpFundo", new UDim2(0, 220, 0, 12), new UDim2(0, 244, 0, 28), Color3.fromRGB(20, 30, 60), 0);
	const barraXp = novoQuadro(barraXpFundo, "Xp", new UDim2(0, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_XP, 0);
	const txtMoedas = novoTexto(hud, "Moedas", "$ 0", 18, COR_DESTAQUE, new UDim2(0, 140, 0, 54), new UDim2(0, 476, 0, 0));
	const txtOnda = novoTexto(hud, "Onda", "ONDA 1", 18, COR_TEXTO, new UDim2(0, 160, 0, 54), new UDim2(0.5, -80, 0, 0));
	const botPausa = novoBotao(hud, "Pausa", "II", new UDim2(0, 54, 0, 40), new UDim2(1, -66, 0, 7), COR_PAINEL, 18);

	// Painel de quests (direita)
	const painelQuests = novoQuadro(telaJogo, "Quests", new UDim2(0, 230, 0, 150), new UDim2(1, -242, 0, 66), COR_PAINEL, 0.15);
	novoTexto(painelQuests, "Titulo", "QUESTS", 16, COR_DESTAQUE, new UDim2(1, 0, 0, 24), new UDim2(0, 0, 0, 4));
	const linhasQuest: TextLabel[] = [];
	for (let i = 0; i < QUESTS.size(); i++) {
		linhasQuest.push(
			novoTexto(painelQuests, `Q${i}`, "", 13, COR_TEXTO, new UDim2(1, -16, 0, 36), new UDim2(0, 8, 0, 30 + i * 38)),
		);
		linhasQuest[i].TextXAlignment = Enum.TextXAlignment.Left;
		linhasQuest[i].TextWrapped = true;
	}

	// Arena central (moldura + área com ClipsDescendants)
	const moldura = novoQuadro(
		telaJogo,
		"Moldura",
		new UDim2(0, ARENA_L + 16, 0, ARENA_A + 16),
		new UDim2(0.5, -(ARENA_L + 16) / 2, 0.5, -(ARENA_A + 16) / 2 + 20),
		Color3.fromRGB(8, 10, 14),
		0,
	);
	borda(moldura, COR_DESTAQUE, 3);
	const arena = novoQuadro(
		moldura,
		"Arena",
		new UDim2(0, ARENA_L, 0, ARENA_A),
		new UDim2(0, 8, 0, 8),
		Color3.fromRGB(194, 178, 128),
		0,
	);
	arena.ClipsDescendants = true;

	// Tiles do bioma (estáticos, criados uma vez)
	for (let ly = 0; ly < MAPA.size(); ly++) {
		const linha = MAPA[ly];
		for (let lx = 0; lx < linha.size(); lx++) {
			const ch = linha.sub(lx + 1, lx + 1);
			const cor = TILE_CORES[ch] ?? TILE_CORES["."];
			const t = novoQuadro(
				arena,
				`Tile_${lx}_${ly}`,
				new UDim2(0, TILE, 0, TILE),
				new UDim2(0, lx * TILE, 0, ly * TILE),
				cor,
				0,
			);
			t.ZIndex = 1;
			if (ch === "T" || ch === "*") {
				const detalhe = novoQuadro(t, "D", new UDim2(0, 14, 0, 14), new UDim2(0, 9, 0, 6), Color3.fromRGB(20, 90, 50), 0);
				detalhe.ZIndex = 2;
			}
		}
	}

	// Banner central + barra do boss
	const banner = novoTexto(telaJogo, "Banner", "", 34, COR_DESTAQUE, new UDim2(1, 0, 0, 50), new UDim2(0, 0, 0.35, 0));
	banner.Visible = false;
	const barraBossFundo = novoQuadro(telaJogo, "BossFundo", new UDim2(0, 400, 0, 14), new UDim2(0.5, -200, 0, 60), Color3.fromRGB(60, 10, 40), 0);
	barraBossFundo.Visible = false;
	const barraBoss = novoQuadro(barraBossFundo, "Boss", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_PERIGO, 0);
	const txtBoss = novoTexto(telaJogo, "BossNome", "", 16, COR_TEXTO, new UDim2(0, 400, 0, 22), new UDim2(0.5, -200, 0, 82));
	txtBoss.Visible = false;

	// D-pad mobile (canto inferior esquerdo) + dash (direito)
	const dpad = novoQuadro(telaJogo, "DPad", new UDim2(0, 190, 0, 190), new UDim2(0, 16, 1, -206), COR_PAINEL, 1);
	dpad.BackgroundTransparency = 1;
	const btnCima = novoBotao(dpad, "Cima", "^", new UDim2(0, 58, 0, 58), new UDim2(0, 66, 0, 0), COR_PAINEL, 24);
	const btnBaixo = novoBotao(dpad, "Baixo", "v", new UDim2(0, 58, 0, 58), new UDim2(0, 66, 0, 124), COR_PAINEL, 24);
	const btnEsq = novoBotao(dpad, "Esq", "<", new UDim2(0, 58, 0, 58), new UDim2(0, 0, 0, 62), COR_PAINEL, 24);
	const btnDir = novoBotao(dpad, "Dir", ">", new UDim2(0, 58, 0, 58), new UDim2(0, 132, 0, 62), COR_PAINEL, 24);
	const btnDash = novoBotao(telaJogo, "Dash", "DASH", new UDim2(0, 110, 0, 58), new UDim2(1, -126, 1, -74), COR_PAINEL, 20);

	// ----- Tela de fim -----
	const telaFim = novoQuadro(gui, "Fim", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0.25);
	telaFim.Visible = false;
	const txtFimTitulo = novoTexto(telaFim, "Titulo", "", 48, COR_DESTAQUE, new UDim2(1, 0, 0, 70), new UDim2(0, 0, 0, 120));
	const txtFimStats = novoTexto(telaFim, "Stats", "", 20, COR_TEXTO, new UDim2(1, 0, 0, 160), new UDim2(0, 0, 0, 210));
	const btnDeNovo = novoBotao(telaFim, "DeNovo", "JOGAR DE NOVO", new UDim2(0, 260, 0, 60), new UDim2(0.5, -270, 0, 390), COR_PAINEL, 20);
	const btnMenu = novoBotao(telaFim, "Menu", "MENU", new UDim2(0, 260, 0, 60), new UDim2(0.5, 10, 0, 390), COR_PAINEL, 20);

	// ===== Estado da run =====
	let estado: "menu" | "jogo" | "fim" = "menu";
	let pausado = false;
	let classeIdx = 0;

	let px = ARENA_L / 2;
	let py = ARENA_A / 2;
	let fx = 1;
	let fy = 0;
	let hp = 10;
	let hpMax = 10;
	let nivel = 1;
	let xp = 0;
	let xpProx = 20;
	let moedas = 0;
	let abates = 0;
	let moedasColetadas = 0;
	let bossMorto = false;
	let questsCompletas = 0;
	let onda = 0;
	let filaRestante = 0;
	let spawnT = 0;
	let descansoT = 0;
	let tempo = 0;
	let tiroT = 0;
	let invencT = 0;
	let dashT = 0;
	let dashCdT = 0;
	let bannerT = 0;
	let proxId = 1;

	let framePlayer: Frame | undefined = undefined;
	let olhoPlayer: Frame | undefined = undefined;
	const balas: Bala[] = [];
	const inimigos: Inimigo[] = [];
	const coletaveis: Coletavel[] = [];
	const flutuantes: Flutuante[] = [];
	let quests: QuestProg[] = [];

	// Input (teclado + D-pad compartilham as flags)
	let teclaCima = false;
	let teclaBaixo = false;
	let teclaEsq = false;
	let teclaDir = false;

	const mapearTecla = (codigo: Enum.KeyCode, apertou: boolean): void => {
		if (codigo === Enum.KeyCode.W || codigo === Enum.KeyCode.Up) {
			teclaCima = apertou;
		} else if (codigo === Enum.KeyCode.S || codigo === Enum.KeyCode.Down) {
			teclaBaixo = apertou;
		} else if (codigo === Enum.KeyCode.A || codigo === Enum.KeyCode.Left) {
			teclaEsq = apertou;
		} else if (codigo === Enum.KeyCode.D || codigo === Enum.KeyCode.Right) {
			teclaDir = apertou;
		} else if (apertou && (codigo === Enum.KeyCode.LeftShift || codigo === Enum.KeyCode.L)) {
			tentarDash();
		} else if (apertou && codigo === Enum.KeyCode.P) {
			alternarPausa();
		}
	};

	UserInputService.InputBegan.Connect((input, processado) => {
		if (processado || estado !== "jogo") {
			return;
		}
		mapearTecla(input.KeyCode, true);
	});
	UserInputService.InputEnded.Connect((input) => {
		mapearTecla(input.KeyCode, false);
	});

	const ligarBotaoDir = (botao: TextButton, ligar: (v: boolean) => void): void => {
		botao.MouseButton1Down.Connect(() => ligar(true));
		botao.MouseButton1Up.Connect(() => ligar(false));
		botao.MouseLeave.Connect(() => ligar(false));
	};
	ligarBotaoDir(btnCima, (v) => (teclaCima = v));
	ligarBotaoDir(btnBaixo, (v) => (teclaBaixo = v));
	ligarBotaoDir(btnEsq, (v) => (teclaEsq = v));
	ligarBotaoDir(btnDir, (v) => (teclaDir = v));
	btnDash.MouseButton1Down.Connect(() => tentarDash());
	botPausa.Activated.Connect(() => alternarPausa());

	function alternarPausa(): void {
		if (estado !== "jogo") {
			return;
		}
		pausado = !pausado;
		mostrarBanner(pausado ? "PAUSADO" : "", 0);
	}

	function tentarDash(): void {
		if (estado !== "jogo" || pausado || dashCdT > 0) {
			return;
		}
		dashT = 0.18;
		dashCdT = 3;
		if (invencT < 0.25) {
			invencT = 0.25;
		}
	}

	// ===== Fluxo de telas =====
	function mostrarBanner(texto: string, duracao: number): void {
		banner.Text = texto;
		banner.Visible = texto !== "";
		bannerT = duracao;
	}

	function atualizarQuestsUI(): void {
		for (let i = 0; i < quests.size(); i++) {
			const q = quests[i];
			const marca = q.completa ? "[X]" : `[${q.progresso}/${q.meta}]`;
			linhasQuest[i].Text = `${marca} ${q.nome}\n${q.descricao}`;
			linhasQuest[i].TextColor3 = q.completa ? COR_VIDA : COR_TEXTO;
		}
	}

	function limparEntidades(): void {
		for (const b of balas) {
			b.frame.Destroy();
		}
		balas.clear();
		for (const e of inimigos) {
			e.frame.Destroy();
		}
		inimigos.clear();
		for (const c of coletaveis) {
			c.frame.Destroy();
		}
		coletaveis.clear();
		for (const f of flutuantes) {
			f.label.Destroy();
		}
		flutuantes.clear();
		if (framePlayer !== undefined) {
			framePlayer.Destroy();
			framePlayer = undefined;
			olhoPlayer = undefined;
		}
		barraBossFundo.Visible = false;
		txtBoss.Visible = false;
	}

	function comecarRun(idx: number): void {
		classeIdx = idx;
		const c = CLASSES[idx];
		limparEntidades();
		px = ARENA_L / 2;
		py = ARENA_A / 2;
		fx = 1;
		fy = 0;
		hpMax = c.hpMax;
		hp = hpMax;
		nivel = 1;
		xp = 0;
		xpProx = xpParaNivel(1);
		moedas = 0;
		abates = 0;
		moedasColetadas = 0;
		bossMorto = false;
		questsCompletas = 0;
		onda = 0;
		filaRestante = 0;
		descansoT = 0;
		tempo = 0;
		tiroT = 0;
		invencT = 0;
		dashT = 0;
		dashCdT = 0;
		pausado = false;
		quests = [];
		for (const q of QUESTS) {
			quests.push({ id: q.id, nome: q.nome, descricao: q.descricao, meta: q.meta, progresso: 0, completa: false, xp: q.xp });
		}
		atualizarQuestsUI();

		// Avatar do jogador (quadrado pixel + olho de direção)
		const p = novoQuadro(arena, "Player", new UDim2(0, 20, 0, 20), new UDim2(0, px - 10, 0, py - 10), c.cor, 0);
		p.ZIndex = 10;
		borda(p, COR_TEXTO, 2);
		const olho = novoQuadro(p, "Olho", new UDim2(0, 6, 0, 6), new UDim2(0, 11, 0, 7), COR_TEXTO, 0);
		olho.ZIndex = 11;
		framePlayer = p;
		olhoPlayer = olho;

		telaMenu.Visible = false;
		telaFim.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
		mostrarBanner("SOBREVIVA ÀS 5 ONDAS!", 2.5);
		iniciarOnda(1);
		print(`[PixelQuest] Run iniciada: ${c.nome}.`);
	}

	function terminarRun(venceu: boolean): void {
		estado = "fim";
		const valor = calcularValor(moedas, questsCompletas, venceu);
		// Persiste via Net (servidor valida e grava nos leaderstats)
		Remotes.Client.Get("SalvarRun").SendToServer({ moedas: moedas, nivel: nivel, valor: valor, vitoria: venceu });
		txtFimTitulo.Text = venceu ? "VITÓRIA!" : "DERROTADO...";
		txtFimTitulo.TextColor3 = venceu ? COR_DESTAQUE : COR_PERIGO;
		txtFimStats.Text =
			`Onda ${onda} | Nível ${nivel} | ${abates} abates\n` +
			`Moedas: ${moedas} | Quests: ${questsCompletas}/${quests.size()}\n` +
			`+${valor} Valor para a próxima run!`;
		telaJogo.Visible = false;
		telaFim.Visible = true;
		print(`[PixelQuest] Fim de run: vitoria=${venceu} valor=${valor}.`);
	}

	for (let i = 0; i < botoesClasse.size(); i++) {
		const idx = i;
		botoesClasse[idx].Activated.Connect(() => comecarRun(idx));
	}
	btnDeNovo.Activated.Connect(() => comecarRun(classeIdx));
	btnMenu.Activated.Connect(() => {
		limparEntidades();
		estado = "menu";
		telaFim.Visible = false;
		telaJogo.Visible = false;
		telaMenu.Visible = true;
	});

	// ===== Ondas & spawns =====
	function posicaoSpawn(): [number, number] {
		const lado = math.random(0, 3);
		const m = 26;
		if (lado === 0) {
			return [m + math.random() * (ARENA_L - m * 2), m];
		} else if (lado === 1) {
			return [m + math.random() * (ARENA_L - m * 2), ARENA_A - m];
		} else if (lado === 2) {
			return [m, m + math.random() * (ARENA_A - m * 2)];
		}
		return [ARENA_L - m, m + math.random() * (ARENA_A - m * 2)];
	}

	function nascerInimigo(info: InimigoInfo, eBoss: boolean, sx: number, sy: number): void {
		const f = novoQuadro(arena, `E${proxId}`, new UDim2(0, info.tamanho, 0, info.tamanho), new UDim2(0, sx, 0, sy), info.cor, 0);
		f.ZIndex = 8;
		borda(f, Color3.fromRGB(10, 10, 10), 2);
		const barra = novoQuadro(f, "HP", new UDim2(1, 0, 0, 4), new UDim2(0, 0, 0, -6), COR_VIDA, 0);
		barra.ZIndex = 9;
		proxId++;
		inimigos.push({ id: proxId, info: info, eBoss: eBoss, x: sx, y: sy, hp: info.hp, hpMax: info.hp, tiroT: 1 + math.random(), rajadaT: 2, hitT: 0, frame: f, barra: barra });
	}

	function iniciarOnda(n: number): void {
		onda = n;
		if (n === ONDA_BOSS) {
			nascerInimigo(BOSS, true, ARENA_L / 2, 70);
			mostrarBanner("SEREIA DA PRAIA!", 3);
			barraBossFundo.Visible = true;
			txtBoss.Visible = true;
			txtBoss.Text = BOSS.nome;
			print("[PixelQuest] Boss!");
		} else {
			filaRestante = inimigosDaOnda(n);
			spawnT = 0.5;
			mostrarBanner(`ONDA ${n}`, 2);
		}
	}

	function tipoDaOnda(): number {
		// Desbloqueia tipos conforme avança (bioma com inimigos variados)
		const r = math.random();
		if (onda < 2) {
			return 0;
		} else if (onda < 3) {
			return r < 0.6 ? 0 : 1;
		}
		return r < 0.45 ? 0 : r < 0.75 ? 1 : 2;
	}

	// ===== Combate & recompensas =====
	function floater(x: number, y: number, texto: string, cor: Color3): void {
		const l = novoTexto(arena, `F${proxId}`, texto, 14, cor, new UDim2(0, 90, 0, 20), new UDim2(0, x - 45, 0, y - 10));
		l.ZIndex = 20;
		proxId++;
		flutuantes.push({ label: l, vida: 0.9 });
	}

	function ganharXp(q: number): void {
		xp += q;
		while (xp >= xpProx) {
			xp -= xpProx;
			nivel++;
			xpProx = xpParaNivel(nivel);
			hpMax += 4;
			hp = hpMax;
			mostrarBanner(`NÍVEL ${nivel}!`, 1.6);
			floater(px, py - 20, "LEVEL UP!", COR_XP);
			print(`[PixelQuest] Nível ${nivel}.`);
		}
	}

	function checarQuest(tipo: "abates" | "moedas" | "boss"): void {
		for (const q of quests) {
			if (q.completa) {
				continue;
			}
			let prog = 0;
			if (tipo === "abates" && q.id === "limpeza") {
				prog = abates;
			} else if (tipo === "moedas" && q.id === "tesouro") {
				prog = moedasColetadas;
			} else if (tipo === "boss" && q.id === "recompensa") {
				prog = bossMorto ? 1 : 0;
			} else {
				continue;
			}
			q.progresso = prog > q.meta ? q.meta : prog;
			if (q.progresso >= q.meta) {
				q.completa = true;
				questsCompletas++;
				ganharXp(q.xp);
				mostrarBanner(`QUEST: ${q.nome}!`, 2);
				print(`[PixelQuest] Quest completa: ${q.nome}.`);
			}
		}
		atualizarQuestsUI();
	}

	function matarInimigo(i: number): void {
		const e = inimigos[i];
		e.frame.Destroy();
		// swap-remove
		inimigos[i] = inimigos[inimigos.size() - 1];
		inimigos.pop();
		abates++;
		ganharXp(e.info.xp);
		const nMoedas = math.random(e.info.moedaMin, e.info.moedaMax);
		for (let k = 0; k < nMoedas; k++) {
			const a = math.random() * math.pi * 2;
			coletaveis.push(criarColetavel(e.x, e.y, math.cos(a) * 90, math.sin(a) * 90, "moeda"));
		}
		if (math.random() < 0.12) {
			coletaveis.push(criarColetavel(e.x, e.y, 0, 0, "coracao"));
		}
		checarQuest("abates");
		if (e.eBoss) {
			bossMorto = true;
			barraBossFundo.Visible = false;
			txtBoss.Visible = false;
			checarQuest("boss");
			terminarRun(true);
		}
	}

	function criarColetavel(x: number, y: number, vx: number, vy: number, tipo: "moeda" | "coracao"): Coletavel {
		const cor = tipo === "moeda" ? COR_DESTAQUE : COR_PERIGO;
		const f = novoQuadro(arena, `C${proxId}`, new UDim2(0, 12, 0, 12), new UDim2(0, x, 0, y), cor, 0);
		f.ZIndex = 5;
		borda(f, Color3.fromRGB(10, 10, 10), 1);
		proxId++;
		return { x: x, y: y, vx: vx, vy: vy, tipo: tipo, frame: f, fase: math.random() * 6 };
	}

	function ferirJogador(dano: number): void {
		if (invencT > 0 || estado !== "jogo") {
			return;
		}
		hp -= dano;
		invencT = 0.9;
		floater(px, py - 22, `-${dano}`, COR_PERIGO);
		if (hp <= 0) {
			hp = 0;
			terminarRun(false);
		}
	}

	function atirarAmiga(dx: number, dy: number): void {
		const c = CLASSES[classeIdx];
		const t = c.tamTiro;
		const f = novoQuadro(arena, `B${proxId}`, new UDim2(0, t, 0, t), new UDim2(0, px, 0, py), c.cor, 0);
		f.ZIndex = 7;
		proxId++;
		balas.push({ x: px, y: py, vx: dx * c.velTiro, vy: dy * c.velTiro, vida: 1.6, dano: c.dano, amiga: true, tam: t, frame: f });
	}

	function atirarInimiga(x: number, y: number, dx: number, dy: number, vel: number, dano: number): void {
		const f = novoQuadro(arena, `EB${proxId}`, new UDim2(0, 9, 0, 9), new UDim2(0, x, 0, y), COR_BALA_INIMIGA, 0);
		f.ZIndex = 6;
		proxId++;
		balas.push({ x: x, y: y, vx: dx * vel, vy: dy * vel, vida: 3, dano: dano, amiga: false, tam: 9, frame: f });
	}

	function mirarJogador(x: number, y: number, vel: number, dano: number): void {
		const dx = px - x;
		const dy = py - y;
		const d = math.sqrt(dx * dx + dy * dy);
		if (d < 1) {
			return;
		}
		atirarInimiga(x, y, dx / d, dy / d, vel, dano);
	}

	// ===== Loop principal =====
	RunService.Heartbeat.Connect((dt) => {
		if (estado !== "jogo" || pausado) {
			return;
		}
		if (dt > 0.1) {
			dt = 0.1;
		}
		tempo += dt;
		const c = CLASSES[classeIdx];

		// -- movimento em todas as direções --
		let mx = 0;
		let my = 0;
		if (teclaCima) {
			my -= 1;
		}
		if (teclaBaixo) {
			my += 1;
		}
		if (teclaEsq) {
			mx -= 1;
		}
		if (teclaDir) {
			mx += 1;
		}
		if (mx !== 0 || my !== 0) {
			const m = math.sqrt(mx * mx + my * my);
			mx /= m;
			my /= m;
			fx = mx;
			fy = my;
		}
		let vel = c.velocidade;
		if (dashT > 0) {
			vel *= 2.6;
			dashT -= dt;
		}
		if (dashCdT > 0) {
			dashCdT -= dt;
		}
		px = math.clamp(px + mx * vel * dt, 14, ARENA_L - 14);
		py = math.clamp(py + my * vel * dt, 14, ARENA_A - 14);
		if (invencT > 0) {
			invencT -= dt;
		}

		// -- tiro automático no inimigo mais próximo (foco em desviar!) --
		if (tiroT > 0) {
			tiroT -= dt;
		}
		if (tiroT <= 0 && inimigos.size() > 0) {
			let melhor: Inimigo | undefined = undefined;
			let melhorD = 420 * 420;
			for (const e of inimigos) {
				const d = dist2(px, py, e.x, e.y);
				if (d < melhorD) {
					melhorD = d;
					melhor = e;
				}
			}
			if (melhor !== undefined) {
				const dx = melhor.x - px;
				const dy = melhor.y - py;
				const d = math.sqrt(dx * dx + dy * dy);
				if (d > 1) {
					atirarAmiga(dx / d, dy / d);
					fx = dx / d;
					fy = dy / d;
				}
			}
			tiroT = c.cadencia;
		}

		// -- spawns da onda --
		if (filaRestante > 0) {
			spawnT -= dt;
			if (spawnT <= 0) {
				const [sx, sy] = posicaoSpawn();
				nascerInimigo(INIMIGOS[tipoDaOnda()], false, sx, sy);
				filaRestante--;
				spawnT = 1.1;
			}
		} else if (inimigos.size() === 0 && descansoT <= 0 && !bossMorto) {
			// Onda limpa: bônus + próxima
			moedas += 2 + onda;
			if (hp + 6 > hpMax) {
				hp = hpMax;
			} else {
				hp += 6;
			}
			if (onda + 1 > ONDA_BOSS) {
				terminarRun(true);
				return;
			}
			descansoT = 2.5;
			floater(px, py - 24, `ONDA ${onda} LIMPA!`, COR_VIDA);
		}
		if (descansoT > 0) {
			descansoT -= dt;
			if (descansoT <= 0) {
				iniciarOnda(onda + 1);
			}
		}

		// -- inimigos: perseguição + tiros --
		for (let i = inimigos.size() - 1; i >= 0; i--) {
			const e = inimigos[i];
			const dx = px - e.x;
			const dy = py - e.y;
			const d = math.sqrt(dx * dx + dy * dy);
			if (d > 1) {
				e.x += (dx / d) * e.info.velocidade * dt;
				e.y += (dy / d) * e.info.velocidade * dt;
			}
			// contato
			if (d < e.info.tamanho / 2 + 10) {
				ferirJogador(e.info.danoContato);
			}
			// tiro mirado
			if (e.tiroT > 0) {
				e.tiroT -= dt;
			}
			if (e.info.atira && e.tiroT <= 0 && d < 330 && d > 1) {
				if (e.eBoss) {
					for (let k = -1; k <= 1; k++) {
						const base = math.atan2(dy, dx) + k * 0.22;
						atirarInimiga(e.x, e.y, math.cos(base), math.sin(base), e.info.velBala, e.info.danoBala);
					}
				} else {
					mirarJogador(e.x, e.y, e.info.velBala, e.info.danoBala);
				}
				e.tiroT = e.info.cadenciaTiro + math.random() * 0.6;
			}
			// rajada radial do boss (bullet-hell!)
			if (e.rajadaT > 0) {
				e.rajadaT -= dt;
			}
			if (e.eBoss && e.rajadaT <= 0) {
				for (let k = 0; k < 12; k++) {
					const a = (k / 12) * math.pi * 2 + tempo;
					atirarInimiga(e.x, e.y, math.cos(a), math.sin(a), 110, e.info.danoBala);
				}
				e.rajadaT = 2.6;
			}
			if (e.hitT > 0) {
				e.hitT -= dt;
				if (e.hitT <= 0) {
					e.frame.BackgroundColor3 = e.info.cor;
				}
			}
			e.frame.Position = new UDim2(0, e.x - e.info.tamanho / 2, 0, e.y - e.info.tamanho / 2);
			const fracao = e.hp / e.hpMax;
			e.barra.Size = new UDim2(fracao < 0 ? 0 : fracao, 0, 0, 4);
			if (e.eBoss) {
				barraBoss.Size = new UDim2(fracao < 0 ? 0 : fracao, 0, 1, 0);
			}
		}

		// -- balas --
		for (let i = balas.size() - 1; i >= 0; i--) {
			const b = balas[i];
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.vida -= dt;
			let morta = b.vida <= 0 || b.x < 0 || b.x > ARENA_L || b.y < 0 || b.y > ARENA_A;
			if (!morta) {
				if (b.amiga) {
					for (let j = inimigos.size() - 1; j >= 0; j--) {
						const e = inimigos[j];
						const rr = b.tam / 2 + e.info.tamanho / 2;
						if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
							e.hp -= b.dano;
							e.hitT = 0.12;
							e.frame.BackgroundColor3 = COR_TEXTO;
							floater(e.x, e.y - 16, `${b.dano}`, COR_DESTAQUE);
							morta = true;
							if (e.hp <= 0) {
								matarInimigo(j);
							}
							break;
						}
					}
				} else {
					const rr = b.tam / 2 + 10;
					if (dist2(b.x, b.y, px, py) < rr * rr) {
						ferirJogador(b.dano);
						morta = true;
					}
				}
			}
			if (morta) {
				b.frame.Destroy();
				balas[i] = balas[balas.size() - 1];
				balas.pop();
			} else {
				b.frame.Position = new UDim2(0, b.x - b.tam / 2, 0, b.y - b.tam / 2);
			}
		}

		// -- coletáveis (espalham, depois imã) --
		for (let i = coletaveis.size() - 1; i >= 0; i--) {
			const col = coletaveis[i];
			col.fase += dt * 6;
			col.vx *= 1 - 3 * dt;
			col.vy *= 1 - 3 * dt;
			const d2 = dist2(col.x, col.y, px, py);
			if (d2 < 70 * 70) {
				const d = math.sqrt(d2);
				if (d > 1) {
					col.vx = ((px - col.x) / d) * 260;
					col.vy = ((py - col.y) / d) * 260;
				}
			}
			col.x += col.vx * dt;
			col.y += col.vy * dt;
			if (d2 < 20 * 20) {
				if (col.tipo === "moeda") {
					moedas++;
					moedasColetadas++;
					floater(col.x, col.y - 10, "+1", COR_DESTAQUE);
					checarQuest("moedas");
				} else {
					if (hp + 12 > hpMax) {
						hp = hpMax;
					} else {
						hp += 12;
					}
					floater(col.x, col.y - 10, "+12", COR_VIDA);
				}
				col.frame.Destroy();
				coletaveis[i] = coletaveis[coletaveis.size() - 1];
				coletaveis.pop();
			} else {
				const salto = math.sin(col.fase) * 2;
				col.frame.Position = new UDim2(0, col.x - 6, 0, col.y - 6 + salto);
			}
		}

		// -- flutuantes --
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

		// -- banner --
		if (bannerT > 0) {
			bannerT -= dt;
			if (bannerT <= 0) {
				banner.Visible = false;
			}
		}

		// -- HUD + avatar --
		const fVida = hp / hpMax;
		barraVida.Size = new UDim2(fVida < 0 ? 0 : fVida, 0, 1, 0);
		txtVida.Text = `HP ${hp}/${hpMax}`;
		const fXp = xp / xpProx;
		barraXp.Size = new UDim2(fXp > 1 ? 1 : fXp, 0, 1, 0);
		txtXp.Text = `Nv ${nivel} (${xp}/${xpProx} XP)`;
		txtMoedas.Text = `$ ${moedas}`;
		txtOnda.Text = onda >= ONDA_BOSS ? "BOSS!" : `ONDA ${onda}`;
		if (framePlayer !== undefined) {
			framePlayer.Position = new UDim2(0, px - 10, 0, py - 10);
			// pisca durante invencibilidade
			framePlayer.BackgroundTransparency = invencT > 0 && math.floor(tempo * 12) % 2 === 0 ? 0.5 : 0;
			if (olhoPlayer !== undefined) {
				olhoPlayer.Position = new UDim2(0, 7 + fx * 5, 0, 7 + fy * 5);
			}
		}
	});

	print("[PixelQuest] UI pronta. Escolha a classe!");
}
