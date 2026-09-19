/**
 * Pixel Quest 2D — jogo puramente em interfaces 2D (ScreenGui, PC only).
 *
 * Mundo aberto explorável em tela cheia: a câmera segue o jogador de forma
 * dinâmica (viewport com culling de tiles). Nada do Workspace 3D é usado —
 * o avatar 3D nem chega a nascer (CharacterAutoLoads=false).
 *
 * Inspirado no RPG 2D bullet-hell do Roblox: top-down, mover em TODAS as
 * direções (WASD/setas), desviar de projéteis, loot, XP, quests e boss.
 */
import { Players, RunService, StarterGui, UserInputService, Workspace } from "@rbxts/services";
import {
	ANEL_VALOR,
	BOSS,
	CLASSES,
	COR_TILE,
	INIMIGOS,
	ITENS_INICIAIS,
	InimigoInfo,
	ItemInfo,
	LOOT_BOSS,
	LOOT_COMUM,
	MUNDO_A,
	MUNDO_L,
	MUNDO_TX,
	MUNDO_TY,
	NOME_SLOT,
	ONDA_BOSS,
	QUESTS,
	SlotItem,
	TILE,
	acharChaoPerto,
	areaSolida,
	calcularValor,
	eSolido,
	inimigosDaOnda,
	tileNoMundo,
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

interface TilePool {
	frame: Frame;
	detalhe: Frame;
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
const TOPO_Y = 36; // abaixo da topbar nativa do Roblox
const MAX_PONTOS_MINIMAPA = 30;

// ---------- Fonte ----------
// Geist (ou similar) NÃO existe no Roblox por padrão: para usá-la, suba o
// TTF em Creator Dashboard → Development Items → Fonts e coloque o asset ID
// em FONTE_ID. Com 0, usa a Gotham embutida (confiável em toda plataforma).
const FONTE_ID = 0;
function fonteJogo(peso: Enum.FontWeight): Font {
	if (FONTE_ID > 0) {
		return Font.fromId(FONTE_ID, peso);
	}
	return Font.fromName("Gotham", peso);
}
/** Contorno em TODO texto: legível sobre qualquer fundo. */
function contornoTexto(inst: TextLabel | TextButton): void {
	const s = new Instance("UIStroke");
	s.Color = Color3.fromRGB(10, 12, 16);
	s.Thickness = 2;
	s.Transparency = 0.25;
	s.Parent = inst;
}

// ---------- Helpers de UI ----------
function borda(inst: GuiObject, cor: Color3, grossura: number): void {
	const s = new Instance("UIStroke");
	s.Color = cor;
	s.Thickness = grossura;
	// Border: contorna SÓ a moldura. No modo Contextual (padrão), o stroke
	// branco cairia em cima do texto dos botões e afogaria as letras.
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
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
	l.FontFace = fonteJogo(Enum.FontWeight.Bold);
	l.TextSize = tamFonte;
	l.TextColor3 = cor;
	l.BackgroundTransparency = 1;
	l.Size = tam;
	l.Position = pos;
	l.TextXAlignment = Enum.TextXAlignment.Center;
	l.Parent = pai;
	contornoTexto(l);
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
	b.FontFace = fonteJogo(Enum.FontWeight.ExtraBold);
	b.TextSize = tamFonte;
	b.TextColor3 = COR_TEXTO;
	b.BackgroundColor3 = corFundo;
	b.BorderSizePixel = 0;
	b.Size = tam;
	b.Position = pos;
	b.AutoButtonColor = true;
	b.Parent = pai;
	borda(b, COR_TEXTO, 2);
	contornoTexto(b);
	return b;
}

function dist2(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
}

// ---------- Jogo ----------
export function iniciarJogo(playerGui: PlayerGui): void {
	// Sem câmera 3D e sem mochila nativa: o jogo é 100% interface 2D (PC).
	const camera = Workspace.CurrentCamera;
	if (camera !== undefined) {
		camera.CameraType = Enum.CameraType.Scriptable;
	}
	StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false);

	// ===== Telas =====
	const gui = new Instance("ScreenGui");
	gui.Name = "PixelQuestUI";
	gui.ResetOnSpawn = false;
	gui.IgnoreGuiInset = true;
	gui.DisplayOrder = 10;
	// Sibling: ZIndex só compete entre irmãos — HUD (irmã da arena, Z alto)
	// fica SEMPRE acima do mapa, sem precisar caçar ZIndex de tile.
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;

	// ----- Menu -----
	const telaMenu = novoQuadro(gui, "Menu", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaMenu.ZIndex = 70;
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
	novoTexto(telaMenu, "Escolha", "— UMA CLASSE, UMA ILHA, 5 ONDAS —", 22, COR_TEXTO, new UDim2(1, 0, 0, 30), new UDim2(0, 0, 0, 195));

	const infoClasse = CLASSES[0];
	novoTexto(
		telaMenu,
		"ClasseInfo",
		`${infoClasse.nome} — ${infoClasse.descricao}\nHP ${infoClasse.hpMax} | Dano ${infoClasse.dano}`,
		18,
		infoClasse.cor,
		new UDim2(1, 0, 0, 60),
		new UDim2(0, 0, 0, 232),
	);
	const btnJogar = novoBotao(telaMenu, "Jogar", "▶  JOGAR", new UDim2(0, 300, 0, 70), new UDim2(0.5, -150, 0, 305), COR_PAINEL, 26);
	const ajuda = novoTexto(
		telaMenu,
		"Ajuda",
		"PC: WASD/setas para mover em todas as direções | Tiro automático no inimigo mais próximo\nSHIFT/L: dash com invencibilidade | P: pausar | ≡ OPÇÕES: tarefas, mochila e equipamentos | Desvie das balas rosas!",
		15,
		Color3.fromRGB(160, 175, 195),
		new UDim2(1, -40, 0, 60),
		new UDim2(0, 20, 0, 395),
	);
	ajuda.TextWrapped = true;

	// ----- Tela do jogo (tela cheia) -----
	const telaJogo = novoQuadro(gui, "Jogo", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaJogo.ZIndex = 1;
	telaJogo.Visible = false;
	telaJogo.ClipsDescendants = true;

	// Arena = tela cheia (mundo renderizado via câmera + pool de tiles)
	const arena = novoQuadro(telaJogo, "Arena", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	arena.ClipsDescendants = true;

	// HUD superior (abaixo da topbar nativa; moedas longe dos botões ☰/chat)
	const hud = novoQuadro(telaJogo, "HUD", new UDim2(1, 0, 0, 40), new UDim2(0, 0, 0, TOPO_Y), COR_PAINEL, 0.1);
	hud.ZIndex = 50;
	const txtMoedas = novoTexto(hud, "Moedas", "$ 0", 18, COR_DESTAQUE, new UDim2(0, 150, 0, 40), new UDim2(0, 175, 0, 0));
	const txtOnda = novoTexto(hud, "Onda", "ONDA 1", 18, COR_TEXTO, new UDim2(0, 200, 0, 40), new UDim2(0.5, -100, 0, 0));
	const btnOpcoes = novoBotao(hud, "Opcoes", "≡ OPÇÕES", new UDim2(0, 140, 0, 30), new UDim2(1, -212, 0, 5), COR_PAINEL, 16);
	const botPausa = novoBotao(hud, "Pausa", "II", new UDim2(0, 52, 0, 30), new UDim2(1, -62, 0, 5), COR_PAINEL, 16);

	// Painel de quests (esquerda)
	const painelQuests = novoQuadro(telaJogo, "Quests", new UDim2(0, 215, 0, 150), new UDim2(0, 10, 0, TOPO_Y + 50), COR_PAINEL, 0.15);
	painelQuests.ZIndex = 50;
	novoTexto(painelQuests, "Titulo", "QUESTS", 15, COR_DESTAQUE, new UDim2(1, 0, 0, 24), new UDim2(0, 0, 0, 4));
	const linhasQuest: TextLabel[] = [];
	for (let i = 0; i < QUESTS.size(); i++) {
		linhasQuest.push(
			novoTexto(painelQuests, `Q${i}`, "", 12, COR_TEXTO, new UDim2(1, -16, 0, 36), new UDim2(0, 8, 0, 30 + i * 38)),
		);
		linhasQuest[i].TextXAlignment = Enum.TextXAlignment.Left;
		linhasQuest[i].TextWrapped = true;
	}

	// Minimapa (direita): navegação no mundo aberto
	const mapaW = 150;
	const mapaH = 96;
	const minimapa = novoQuadro(
		telaJogo,
		"Minimapa",
		new UDim2(0, mapaW, 0, mapaH),
		new UDim2(1, -(mapaW + 10), 0, TOPO_Y + 50),
		Color3.fromRGB(20, 60, 110),
		0,
	);
	minimapa.ZIndex = 50;
	borda(minimapa, COR_TEXTO, 2);
	const pontoPlayer = novoQuadro(minimapa, "Voce", new UDim2(0, 5, 0, 5), new UDim2(0, 0, 0, 0), COR_TEXTO, 0);
	pontoPlayer.ZIndex = 3;
	const pontosInimigos: Frame[] = [];
	for (let i = 0; i < MAX_PONTOS_MINIMAPA; i++) {
		const p = novoQuadro(minimapa, `E${i}`, new UDim2(0, 4, 0, 4), new UDim2(0, 0, 0, 0), COR_PERIGO, 0);
		p.Visible = false;
		p.ZIndex = 2;
		pontosInimigos.push(p);
	}

	// Banner central + barra do boss
	const banner = novoTexto(telaJogo, "Banner", "", 34, COR_DESTAQUE, new UDim2(1, 0, 0, 50), new UDim2(0, 0, 0.35, 0));
	banner.ZIndex = 60;
	banner.Visible = false;
	const barraBossFundo = novoQuadro(telaJogo, "BossFundo", new UDim2(0, 400, 0, 14), new UDim2(0.5, -200, 0, TOPO_Y + 46), Color3.fromRGB(60, 10, 40), 0);
	barraBossFundo.ZIndex = 60;
	barraBossFundo.Visible = false;
	const barraBoss = novoQuadro(barraBossFundo, "Boss", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_PERIGO, 0);
	const txtBoss = novoTexto(telaJogo, "BossNome", "", 16, COR_TEXTO, new UDim2(0, 400, 0, 22), new UDim2(0.5, -200, 0, TOPO_Y + 62));
	txtBoss.ZIndex = 60;
	txtBoss.Visible = false;

	// ----- Painel de opções (diálogo horizontal: tarefas, mochila, equipamentos)
	const painel = novoQuadro(telaJogo, "Painel", new UDim2(0, 560, 0, 400), new UDim2(0.5, -280, 0.5, -200), COR_PAINEL, 0);
	painel.ZIndex = 65;
	painel.Visible = false;
	borda(painel, COR_DESTAQUE, 3);
	const tituloPainel = novoTexto(painel, "Titulo", "OPÇÕES", 22, COR_DESTAQUE, new UDim2(1, -60, 0, 36), new UDim2(0, 0, 0, 6));
	const abaMissoes = novoBotao(painel, "AbaMissoes", "TAREFAS", new UDim2(0, 150, 0, 34), new UDim2(0, 14, 0, 48), COR_FUNDO, 15);
	const abaMochila = novoBotao(painel, "AbaMochila", "MOCHILA", new UDim2(0, 150, 0, 34), new UDim2(0, 172, 0, 48), COR_FUNDO, 15);
	const abaEquip = novoBotao(painel, "AbaEquip", "EQUIP.", new UDim2(0, 150, 0, 34), new UDim2(0, 330, 0, 48), COR_FUNDO, 15);
	const btnFecharPainel = novoBotao(painel, "Fechar", "X", new UDim2(0, 40, 0, 34), new UDim2(1, -50, 0, 8), COR_PERIGO, 16);
	const rolagem = new Instance("ScrollingFrame");
	rolagem.Name = "Lista";
	rolagem.Size = new UDim2(1, -28, 1, -102);
	rolagem.Position = new UDim2(0, 14, 0, 92);
	rolagem.BackgroundTransparency = 1;
	rolagem.BorderSizePixel = 0;
	rolagem.ScrollBarThickness = 6;
	rolagem.AutomaticCanvasSize = Enum.AutomaticSize.Y;
	rolagem.CanvasSize = new UDim2(0, 0, 0, 0);
	rolagem.Parent = painel;
	const layoutLista = new Instance("UIListLayout");
	layoutLista.Padding = new UDim(0, 8);
	layoutLista.SortOrder = Enum.SortOrder.LayoutOrder;
	layoutLista.Parent = rolagem;

	// ----- Tela de fim (opaca: esconde o mundo 3D atrás) -----
	const telaFim = novoQuadro(gui, "Fim", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaFim.ZIndex = 70;
	telaFim.Visible = false;
	const txtFimTitulo = novoTexto(telaFim, "Titulo", "", 48, COR_DESTAQUE, new UDim2(1, 0, 0, 70), new UDim2(0, 0, 0, 120));
	const txtFimStats = novoTexto(telaFim, "Stats", "", 20, COR_TEXTO, new UDim2(1, 0, 0, 160), new UDim2(0, 0, 0, 210));
	const btnDeNovo = novoBotao(telaFim, "DeNovo", "JOGAR DE NOVO", new UDim2(0, 260, 0, 60), new UDim2(0.5, -270, 0, 390), COR_PAINEL, 20);
	const btnMenu = novoBotao(telaFim, "Menu", "MENU", new UDim2(0, 260, 0, 60), new UDim2(0.5, 10, 0, 390), COR_PAINEL, 20);

	// ===== Estado da run =====
	let estado: "menu" | "jogo" | "fim" = "menu";
	let pausado = false;
	let classeIdx = 0;

	// Mundo (coordenadas do mundo; câmera converte para tela)
	let px = MUNDO_L / 2;
	let py = MUNDO_A / 2;
	let camX = 0;
	let camY = 0;
	let vistaL = 960;
	let vistaA = 600;
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
	let painelAberto: "tarefas" | "mochila" | "equip" | undefined = undefined;
	const mochila: ItemInfo[] = [];
	let equipArma: ItemInfo | undefined = undefined;
	let equipArmadura: ItemInfo | undefined = undefined;
	let equipAcess: ItemInfo | undefined = undefined;

	let framePlayer: Frame | undefined = undefined;
	let olhoPlayer: Frame | undefined = undefined;
	let placaVida: Frame | undefined = undefined;
	let placaXp: Frame | undefined = undefined;
	let placaNv: TextLabel | undefined = undefined;
	const balas: Bala[] = [];
	const inimigos: Inimigo[] = [];
	const coletaveis: Coletavel[] = [];
	const flutuantes: Flutuante[] = [];
	const tiles: TilePool[] = [];
	let camadaTiles: Frame | undefined = undefined;
	let tilesCols = 0;
	let tilesRows = 0;
	let camTileX = -1;
	let camTileY = -1;
	let quests: QuestProg[] = [];

	// Input PC (teclado; sem touch — jogo exclusivo de PC por enquanto)
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
	botPausa.Activated.Connect(() => alternarPausa());

	function alternarPausa(): void {
		if (estado !== "jogo") {
			return;
		}
		pausado = !pausado;
		mostrarBanner(pausado ? "PAUSADO" : "", 0);
	}

	function tentarDash(): void {
		if (estado !== "jogo" || pausado || painelAberto !== undefined || dashCdT > 0) {
			return;
		}
		dashT = 0.18;
		dashCdT = 3;
		if (invencT < 0.25) {
			invencT = 0.25;
		}
	}

	// ===== Câmera + tiles (mundo aberto) =====
	function tX(x: number): number {
		return x - camX;
	}
	function tY(y: number): number {
		return y - camY;
	}

	function atualizarCamera(): void {
		camX = math.clamp(px - vistaL / 2, 0, MUNDO_L - vistaL);
		camY = math.clamp(py - vistaA / 2, 0, MUNDO_A - vistaA);
	}

	function garantirPoolTiles(): void {
		const w = arena.AbsoluteSize.X;
		const h = arena.AbsoluteSize.Y;
		if (w < 10 || h < 10) {
			return;
		}
		const cols = math.ceil(w / TILE) + 2;
		const rows = math.ceil(h / TILE) + 2;
		if (cols === tilesCols && rows === tilesRows) {
			return;
		}
		for (const t of tiles) {
			t.frame.Destroy();
		}
		tiles.clear();
		if (camadaTiles !== undefined) {
			camadaTiles.Destroy();
		}
		tilesCols = cols;
		tilesRows = rows;
		vistaL = w;
		vistaA = h;
		// Camada única que desliza TODO frame (pan suave da câmera).
		// Os tiles têm posição LOCAL fixa no grid; só as cores mudam
		// quando a origem cruza tile (mundo fixo, câmera que se move).
		const camada = novoQuadro(arena, "Camada", new UDim2(0, cols * TILE, 0, rows * TILE), new UDim2(0, 0, 0, 0), COR_FUNDO, 1);
		camada.ZIndex = 1;
		camada.ClipsDescendants = false;
		camadaTiles = camada;
		for (let i = 0; i < cols * rows; i++) {
			const f = novoQuadro(
				camada,
				`T${i}`,
				new UDim2(0, TILE, 0, TILE),
				new UDim2(0, (i % cols) * TILE, 0, math.floor(i / cols) * TILE),
				COR_FUNDO,
				0,
			);
			f.ZIndex = 1;
			const d = novoQuadro(f, "D", new UDim2(0, 20, 0, 20), new UDim2(0, 14, 0, 10), COR_FUNDO, 0);
			d.ZIndex = 2;
			d.Visible = false;
			tiles.push({ frame: f, detalhe: d });
		}
		camTileX = -1;
		camTileY = -1;
	}

	function desenharTiles(): void {
		const camada = camadaTiles;
		if (camada === undefined || tilesCols === 0) {
			return;
		}
		const tx0 = math.floor(camX / TILE);
		const ty0 = math.floor(camY / TILE);
		// Pan contínuo: a camada acompanha a câmera todo frame (suave).
		camada.Position = new UDim2(0, tx0 * TILE - camX, 0, ty0 * TILE - camY);
		// Só recolorir ao cruzar fronteira de tile (mundo é fixo).
		if (tx0 === camTileX && ty0 === camTileY) {
			return;
		}
		camTileX = tx0;
		camTileY = ty0;
		for (let i = 0; i < tiles.size(); i++) {
			const tx = tx0 + (i % tilesCols);
			const ty = ty0 + math.floor(i / tilesCols);
			const t = tiles[i];
			let ch = "W";
			if (tx >= 0 && ty >= 0 && tx < MUNDO_TX && ty < MUNDO_TY) {
				ch = tileNoMundo(tx, ty);
			}
			t.frame.BackgroundColor3 = COR_TILE[ch] ?? COR_TILE["G"];
			if (ch === "T" || ch === "*" || ch === "R") {
				t.detalhe.Visible = true;
				t.detalhe.BackgroundColor3 = ch === "R" ? Color3.fromRGB(70, 72, 78) : Color3.fromRGB(20, 90, 50);
			} else {
				t.detalhe.Visible = false;
			}
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
			placaVida = undefined;
			placaXp = undefined;
			placaNv = undefined;
		}
		barraBossFundo.Visible = false;
		txtBoss.Visible = false;
	}

	function comecarRun(idx: number): void {
		classeIdx = idx;
		const c = CLASSES[idx];
		limparEntidades();
		const [sx, sy] = acharChaoPerto(MUNDO_L / 2, MUNDO_A / 2, 12);
		px = sx;
		py = sy;
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
		teclaCima = false;
		teclaBaixo = false;
		teclaEsq = false;
		teclaDir = false;
		quests = [];
		for (const q of QUESTS) {
			quests.push({ id: q.id, nome: q.nome, descricao: q.descricao, meta: q.meta, progresso: 0, completa: false, xp: q.xp });
		}
		atualizarQuestsUI();
		// Inventário inicial + painel fechado
		mochila.clear();
		equipArma = ITENS_INICIAIS[0];
		equipArmadura = ITENS_INICIAIS[1];
		equipAcess = undefined;
		painelAberto = undefined;
		painel.Visible = false;

		// Avatar + plaquinha de HUD sob o personagem (vida/XP/nível, pequena)
		const p = novoQuadro(arena, "Player", new UDim2(0, 20, 0, 20), new UDim2(0, 0, 0, 0), c.cor, 0);
		p.ZIndex = 10;
		borda(p, COR_TEXTO, 2);
		const olho = novoQuadro(p, "Olho", new UDim2(0, 6, 0, 6), new UDim2(0, 11, 0, 7), COR_TEXTO, 0);
		olho.ZIndex = 11;
		const placa = novoQuadro(p, "Placa", new UDim2(0, 34, 0, 20), new UDim2(0, -7, 1, 4), COR_FUNDO, 1);
		placa.ZIndex = 12;
		const pvFundo = novoQuadro(placa, "VidaFundo", new UDim2(1, 0, 0, 6), new UDim2(0, 0, 0, 0), Color3.fromRGB(60, 20, 20), 0);
		pvFundo.ZIndex = 13;
		const pv = novoQuadro(pvFundo, "Vida", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_VIDA, 0);
		pv.ZIndex = 14;
		const pxFundo = novoQuadro(placa, "XpFundo", new UDim2(1, 0, 0, 3), new UDim2(0, 0, 0, 7), Color3.fromRGB(20, 30, 60), 0);
		pxFundo.ZIndex = 13;
		const pxp = novoQuadro(pxFundo, "Xp", new UDim2(0, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_XP, 0);
		pxp.ZIndex = 14;
		const pnv = novoTexto(placa, "Nv", "Nv 1", 10, COR_TEXTO, new UDim2(1, 0, 0, 10), new UDim2(0, 0, 0, 10));
		pnv.ZIndex = 14;
		framePlayer = p;
		olhoPlayer = olho;
		placaVida = pv;
		placaXp = pxp;
		placaNv = pnv;

		telaMenu.Visible = false;
		telaFim.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
		garantirPoolTiles();
		mostrarBanner("EXPLORE A ILHA — SOBREVIVA ÀS 5 ONDAS!", 2.5);
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

	btnJogar.Activated.Connect(() => comecarRun(0));
	btnDeNovo.Activated.Connect(() => comecarRun(classeIdx));
	btnMenu.Activated.Connect(() => {
		limparEntidades();
		estado = "menu";
		telaFim.Visible = false;
		telaJogo.Visible = false;
		telaMenu.Visible = true;
	});

	// ===== Spawns no mundo aberto (fora da visão, em chão válido) =====
	function pontoForaDaVisao(distMin: number, distMax: number): [number, number] {
		for (let k = 0; k < 14; k++) {
			const a = math.random() * math.pi * 2;
			const d = distMin + math.random() * (distMax - distMin);
			const x = math.clamp(px + math.cos(a) * d, 60, MUNDO_L - 60);
			const y = math.clamp(py + math.sin(a) * d, 60, MUNDO_A - 60);
			if (!areaSolida(x, y, 20)) {
				return [x, y];
			}
		}
		return acharChaoPerto(px + 300, py, 20);
	}

	function nascerInimigo(info: InimigoInfo, eBoss: boolean, sx: number, sy: number): void {
		const f = novoQuadro(arena, `E${proxId}`, new UDim2(0, info.tamanho, 0, info.tamanho), new UDim2(0, 0, 0, 0), info.cor, 0);
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
			const [sx, sy] = pontoForaDaVisao(280, 420);
			nascerInimigo(BOSS, true, sx, sy);
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
	function floater(sx: number, sy: number, texto: string, cor: Color3): void {
		const l = novoTexto(arena, `F${proxId}`, texto, 14, cor, new UDim2(0, 90, 0, 20), new UDim2(0, sx - 45, 0, sy - 10));
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
			floater(tX(px), tY(py) - 22, "LEVEL UP!", COR_XP);
			print(`[PixelQuest] Nível ${nivel}.`);
		}
	}

	// ===== Mochila & equipamentos =====
	function danoTotal(): number {
		const c = CLASSES[classeIdx];
		let d = c.dano;
		if (equipArma !== undefined) {
			d += equipArma.dano;
		}
		if (equipAcess !== undefined) {
			d += equipAcess.dano;
		}
		return d;
	}

	function bonusTexto(it: ItemInfo): string {
		const partes: string[] = [];
		if (it.dano > 0) {
			partes.push(`+${it.dano} dano`);
		}
		if (it.hp > 0) {
			partes.push(`+${it.hp} HP`);
		}
		if (partes.size() === 0) {
			return "sem bônus";
		}
		return partes.join(" ");
	}

	function temItem(id: string): boolean {
		for (const it of mochila) {
			if (it.id === id) {
				return true;
			}
		}
		return equipArma?.id === id || equipArmadura?.id === id || equipAcess?.id === id;
	}

	function darItem(info: ItemInfo): void {
		if (temItem(info.id)) {
			// Duplicata vira moedas na hora (sem entulhar a mochila)
			moedas += info.preco;
			floater(tX(px), tY(py) - 14, `+$${info.preco} (dup)`, COR_DESTAQUE);
		} else {
			mochila.push(info);
			floater(tX(px), tY(py) - 14, `Novo: ${info.nome}!`, COR_VIDA);
			mostrarBanner(`ITEM: ${info.nome}!`, 1.6);
		}
		if (painelAberto !== undefined) {
			refreshPainel();
		}
	}

	function ajustarHpBonus(antigo: number, novo: number): void {
		hpMax += novo - antigo;
		hp += novo - antigo;
		if (hp > hpMax) {
			hp = hpMax;
		}
		if (hp < 1) {
			hp = 1;
		}
	}

	function equipar(id: string): void {
		for (let i = 0; i < mochila.size(); i++) {
			if (mochila[i].id !== id) {
				continue;
			}
			const it = mochila[i];
			mochila[i] = mochila[mochila.size() - 1];
			mochila.pop();
			if (it.slot === "arma") {
				if (equipArma !== undefined) {
					mochila.push(equipArma);
				}
				equipArma = it;
			} else if (it.slot === "armadura") {
				if (equipArmadura !== undefined) {
					mochila.push(equipArmadura);
					ajustarHpBonus(equipArmadura.hp, 0);
				}
				equipArmadura = it;
				ajustarHpBonus(0, it.hp);
			} else {
				if (equipAcess !== undefined) {
					mochila.push(equipAcess);
					ajustarHpBonus(equipAcess.hp, 0);
				}
				equipAcess = it;
				ajustarHpBonus(0, it.hp);
			}
			print(`[PixelQuest] Equipado: ${it.nome}.`);
			break;
		}
		refreshPainel();
	}

	function removerSlot(slot: SlotItem): void {
		if (slot === "arma" && equipArma !== undefined) {
			mochila.push(equipArma);
			equipArma = undefined;
		} else if (slot === "armadura" && equipArmadura !== undefined) {
			ajustarHpBonus(equipArmadura.hp, 0);
			mochila.push(equipArmadura);
			equipArmadura = undefined;
		} else if (slot === "acess" && equipAcess !== undefined) {
			ajustarHpBonus(equipAcess.hp, 0);
			mochila.push(equipAcess);
			equipAcess = undefined;
		}
		refreshPainel();
	}

	function adicionarLinha(texto: string, comBotao: boolean, rotulo: string, aoClicar: () => void): void {
		const linha = novoQuadro(rolagem, `L${proxId}`, new UDim2(1, -8, 0, 54), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
		proxId++;
		const t = novoTexto(linha, "T", texto, 14, COR_TEXTO, new UDim2(1, -124, 1, -6), new UDim2(0, 8, 0, 3));
		t.TextXAlignment = Enum.TextXAlignment.Left;
		t.TextWrapped = true;
		if (comBotao) {
			const b = novoBotao(linha, "B", rotulo, new UDim2(0, 100, 0, 38), new UDim2(1, -108, 0, 8), COR_PAINEL, 14);
			b.Activated.Connect(aoClicar);
		}
	}

	function limparRolagem(): void {
		for (const ch of rolagem.GetChildren()) {
			if (ch.IsA("Frame")) {
				ch.Destroy();
			}
		}
	}

	function refreshPainel(): void {
		const aba = painelAberto;
		if (aba === undefined) {
			return;
		}
		limparRolagem();
		if (aba === "tarefas") {
			tituloPainel.Text = "TAREFAS / MISSÕES";
			for (const q of quests) {
				const marca = q.completa ? "[X]" : `[${q.progresso}/${q.meta}]`;
				adicionarLinha(`${marca} ${q.nome}\n${q.descricao} | +${q.xp} XP`, false, "", () => {});
			}
		} else if (aba === "mochila") {
			tituloPainel.Text = `MOCHILA (${mochila.size()}) — $ ${moedas}`;
			if (mochila.size() === 0) {
				adicionarLinha("Mochila vazia — derrote inimigos e complete quests!", false, "", () => {});
			}
			for (const it of mochila) {
				const idItem = it.id;
				adicionarLinha(`${it.nome} (${NOME_SLOT[it.slot]})\n${bonusTexto(it)} — ${it.descricao}`, true, "EQUIPAR", () => equipar(idItem));
			}
		} else {
			tituloPainel.Text = `EQUIPADO — dano ${danoTotal()} | HP máx ${hpMax}`;
			const slots: [SlotItem, ItemInfo | undefined][] = [
				["arma", equipArma],
				["armadura", equipArmadura],
				["acess", equipAcess],
			];
			for (const [slot, eq] of slots) {
				if (eq !== undefined) {
					const s = slot;
					adicionarLinha(`${NOME_SLOT[slot]}: ${eq.nome}\n${bonusTexto(eq)}`, true, "REMOVER", () => removerSlot(s));
				} else {
					adicionarLinha(`${NOME_SLOT[slot]}: — vazio —`, false, "", () => {});
				}
			}
		}
	}

	function abrirPainel(aba: "tarefas" | "mochila" | "equip"): void {
		painelAberto = aba;
		painel.Visible = true;
		refreshPainel();
	}

	function fecharPainel(): void {
		painelAberto = undefined;
		painel.Visible = false;
	}

	abaMissoes.Activated.Connect(() => abrirPainel("tarefas"));
	abaMochila.Activated.Connect(() => abrirPainel("mochila"));
	abaEquip.Activated.Connect(() => abrirPainel("equip"));
	btnFecharPainel.Activated.Connect(() => fecharPainel());
	btnOpcoes.Activated.Connect(() => {
		if (painelAberto === undefined) {
			abrirPainel("tarefas");
		} else {
			fecharPainel();
		}
	});

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
				if (q.id === "limpeza") {
					darItem(ANEL_VALOR);
				}
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
		// Loot de equipamento (comum; boss garante o set rúnico)
		if (e.eBoss) {
			for (const item of LOOT_BOSS) {
				darItem(item);
			}
		} else if (math.random() < 0.06 && LOOT_COMUM.size() > 0) {
			darItem(LOOT_COMUM[math.random(0, LOOT_COMUM.size() - 1)]);
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
		const f = novoQuadro(arena, `C${proxId}`, new UDim2(0, 12, 0, 12), new UDim2(0, 0, 0, 0), cor, 0);
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
		floater(tX(px), tY(py) - 24, `-${dano}`, COR_PERIGO);
		if (hp <= 0) {
			hp = 0;
			terminarRun(false);
		}
	}

	function atirarAmiga(dx: number, dy: number): void {
		const c = CLASSES[classeIdx];
		const t = c.tamTiro;
		const dano = danoTotal();
		const f = novoQuadro(arena, `B${proxId}`, new UDim2(0, t, 0, t), new UDim2(0, 0, 0, 0), c.cor, 0);
		f.ZIndex = 7;
		proxId++;
		balas.push({ x: px, y: py, vx: dx * c.velTiro, vy: dy * c.velTiro, vida: 1.6, dano: dano, amiga: true, tam: t, frame: f });
	}

	function atirarInimiga(x: number, y: number, dx: number, dy: number, vel: number, dano: number): void {
		const f = novoQuadro(arena, `EB${proxId}`, new UDim2(0, 9, 0, 9), new UDim2(0, 0, 0, 0), COR_BALA_INIMIGA, 0);
		f.ZIndex = 6;
		proxId++;
		balas.push({ x: x, y: y, vx: dx * vel, vy: dy * vel, vida: 3.5, dano: dano, amiga: false, tam: 9, frame: f });
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

	function tileSolidoEm(x: number, y: number): boolean {
		const tx = math.floor(x / TILE);
		const ty = math.floor(y / TILE);
		if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY) {
			return true;
		}
		return eSolido(tileNoMundo(tx, ty));
	}

	// ===== Loop principal =====
	RunService.Heartbeat.Connect((dt) => {
		if (estado !== "jogo" || pausado || painelAberto !== undefined) {
			return;
		}
		if (dt > 0.1) {
			dt = 0.1;
		}
		tempo += dt;
		const c = CLASSES[classeIdx];
		garantirPoolTiles();

		// -- movimento em todas as direções (com deslizamento em paredes) --
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
		const r = 10;
		const nx = math.clamp(px + mx * vel * dt, 20, MUNDO_L - 20);
		if (!areaSolida(nx, py, r)) {
			px = nx;
		}
		const ny = math.clamp(py + my * vel * dt, 20, MUNDO_A - 20);
		if (!areaSolida(px, ny, r)) {
			py = ny;
		}
		if (invencT > 0) {
			invencT -= dt;
		}

		// -- câmera segue o jogador + redesenha tiles --
		atualizarCamera();
		desenharTiles();

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

		// -- spawns da onda (fora da visão) --
		if (filaRestante > 0) {
			spawnT -= dt;
			if (spawnT <= 0) {
				const [sx, sy] = pontoForaDaVisao(420, 640);
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
			floater(tX(px), tY(py) - 26, `ONDA ${onda} LIMPA!`, COR_VIDA);
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
				const er = e.info.tamanho / 2;
				const ex = e.x + (dx / d) * e.info.velocidade * dt;
				if (!areaSolida(ex, e.y, er)) {
					e.x = ex;
				}
				const ey = e.y + (dy / d) * e.info.velocidade * dt;
				if (!areaSolida(e.x, ey, er)) {
					e.y = ey;
				}
			}
			// contato
			if (d < e.info.tamanho / 2 + 10) {
				ferirJogador(e.info.danoContato);
			}
			// tiro mirado
			if (e.tiroT > 0) {
				e.tiroT -= dt;
			}
			if (e.info.atira && e.tiroT <= 0 && d < 380 && d > 1) {
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
			e.frame.Position = new UDim2(0, tX(e.x) - e.info.tamanho / 2, 0, tY(e.y) - e.info.tamanho / 2);
			const fracao = e.hp / e.hpMax;
			e.barra.Size = new UDim2(fracao < 0 ? 0 : fracao, 0, 0, 4);
			if (e.eBoss) {
				barraBoss.Size = new UDim2(fracao < 0 ? 0 : fracao, 0, 1, 0);
			}
		}

		// -- separação leve (evita empilhamento) --
		if (inimigos.size() <= 24) {
			for (let i = 0; i < inimigos.size(); i++) {
				for (let j = i + 1; j < inimigos.size(); j++) {
					const a = inimigos[i];
					const b = inimigos[j];
					const rr = a.info.tamanho / 2 + b.info.tamanho / 2;
					const d2 = dist2(a.x, a.y, b.x, b.y);
					if (d2 > 1 && d2 < rr * rr) {
						const d = math.sqrt(d2);
						const emp = ((rr - d) / d) * 0.4;
						const sx = (b.x - a.x) * emp;
						const sy = (b.y - a.y) * emp;
						if (!areaSolida(a.x - sx, a.y - sy, a.info.tamanho / 2)) {
							a.x -= sx;
							a.y -= sy;
						}
						if (!areaSolida(b.x + sx, b.y + sy, b.info.tamanho / 2)) {
							b.x += sx;
							b.y += sy;
						}
					}
				}
			}
		}

		// -- balas (morrem na parede) --
		for (let i = balas.size() - 1; i >= 0; i--) {
			const b = balas[i];
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.vida -= dt;
			let morta = b.vida <= 0 || b.x < 0 || b.x > MUNDO_L || b.y < 0 || b.y > MUNDO_A || tileSolidoEm(b.x, b.y);
			if (!morta) {
				if (b.amiga) {
					for (let j = inimigos.size() - 1; j >= 0; j--) {
						const e = inimigos[j];
						const rr = b.tam / 2 + e.info.tamanho / 2;
						if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
							e.hp -= b.dano;
							e.hitT = 0.12;
							e.frame.BackgroundColor3 = COR_TEXTO;
							floater(tX(e.x), tY(e.y) - 18, `${b.dano}`, COR_DESTAQUE);
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
				b.frame.Position = new UDim2(0, tX(b.x) - b.tam / 2, 0, tY(b.y) - b.tam / 2);
			}
		}

		// -- coletáveis (espalham, depois imã) --
		for (let i = coletaveis.size() - 1; i >= 0; i--) {
			const col = coletaveis[i];
			col.fase += dt * 6;
			col.vx *= 1 - 3 * dt;
			col.vy *= 1 - 3 * dt;
			const d2 = dist2(col.x, col.y, px, py);
			if (d2 < 80 * 80) {
				const d = math.sqrt(d2);
				if (d > 1) {
					col.vx = ((px - col.x) / d) * 280;
					col.vy = ((py - col.y) / d) * 280;
				}
			}
			const cx = col.x + col.vx * dt;
			if (!areaSolida(cx, col.y, 6)) {
				col.x = cx;
			}
			const cy = col.y + col.vy * dt;
			if (!areaSolida(col.x, cy, 6)) {
				col.y = cy;
			}
			if (d2 < 22 * 22) {
				if (col.tipo === "moeda") {
					moedas++;
					moedasColetadas++;
					floater(tX(col.x), tY(col.y) - 12, "+1", COR_DESTAQUE);
					checarQuest("moedas");
				} else {
					if (hp + 12 > hpMax) {
						hp = hpMax;
					} else {
						hp += 12;
					}
					floater(tX(col.x), tY(col.y) - 12, "+12", COR_VIDA);
				}
				col.frame.Destroy();
				coletaveis[i] = coletaveis[coletaveis.size() - 1];
				coletaveis.pop();
			} else {
				const salto = math.sin(col.fase) * 2;
				col.frame.Position = new UDim2(0, tX(col.x) - 6, 0, tY(col.y) - 6 + salto);
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

		// -- HUD de tela + avatar + plaquinha do jogador --
		txtMoedas.Text = `$ ${moedas}`;
		txtOnda.Text = onda >= ONDA_BOSS ? "BOSS!" : `ONDA ${onda}`;
		if (framePlayer !== undefined) {
			framePlayer.Position = new UDim2(0, tX(px) - 10, 0, tY(py) - 10);
			// pisca durante invencibilidade
			framePlayer.BackgroundTransparency = invencT > 0 && math.floor(tempo * 12) % 2 === 0 ? 0.5 : 0;
			if (olhoPlayer !== undefined) {
				olhoPlayer.Position = new UDim2(0, 7 + fx * 5, 0, 7 + fy * 5);
			}
			// plaquinha sob o personagem: vida + XP + nível (pequena)
			if (placaVida !== undefined) {
				const fVida = hp / hpMax;
				placaVida.Size = new UDim2(fVida < 0 ? 0 : fVida, 0, 1, 0);
			}
			if (placaXp !== undefined) {
				const fXp = xp / xpProx;
				placaXp.Size = new UDim2(fXp > 1 ? 1 : fXp, 0, 1, 0);
			}
			if (placaNv !== undefined) {
				placaNv.Text = `Nv ${nivel}`;
			}
		}

		// -- minimapa --
		pontoPlayer.Position = new UDim2(0, (px / MUNDO_L) * mapaW - 2, 0, (py / MUNDO_A) * mapaH - 2);
		for (let i = 0; i < pontosInimigos.size(); i++) {
			const dot = pontosInimigos[i];
			if (i < inimigos.size()) {
				const e = inimigos[i];
				dot.Visible = true;
				dot.BackgroundColor3 = e.eBoss ? COR_BALA_INIMIGA : COR_PERIGO;
				dot.Position = new UDim2(0, (e.x / MUNDO_L) * mapaW - 2, 0, (e.y / MUNDO_A) * mapaH - 2);
			} else {
				dot.Visible = false;
			}
		}
	});

	print("[PixelQuest] UI pronta. Escolha a classe!");
}
