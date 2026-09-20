/**
 * Pixel Quest 2D — CLIENTE (renderer + input, sem simulação).
 *
 * Anti-cheat: este arquivo NÃO decide nada de jogo. Ele desenha o mundo
 * (tiles, entidades, fog, HUD) a partir dos snapshots do servidor
 * (`Foto` 20Hz) e envia só inputs validados (`Entrada`, dash, pausa,
 * equipar/remover, escolher mapa). Dano, posição, loot e portas vivem no
 * servidor — trapaça de cliente não tem efeito.
 *
 * PC only, tela cheia, câmera dinâmica livre, Fog of War (sem minimapa).
 */
import { GuiService, Players, RunService, StarterGui, UserInputService, Workspace } from "@rbxts/services";
import {
	ALCANCE_CLARAO,
	ALCANCE_LAMP,
	CLASSES,
	CONE_LAMP,
	COR_TILE,
	eSolido,
	ITEM_POR_ID,
	LOBBY_ZONAS,
	MAPAS,
	ZonaLobby,
	MUNDO_TX,
	MUNDO_TY,
	NOME_SLOT,
	QUESTS,
	TILE,
	TITULOS,
	VISAO,
	Foto,
	PlacarDados,
} from "shared/pixelquest/Dados";
import { Remotes } from "shared/pixelquest/Rede";
import {
	borda,
	COR_BALA_INIMIGA,
	COR_DESCONHECIDO,
	COR_DESTAQUE,
	COR_ESCURA,
	COR_FUNDO,
	COR_PAINEL,
	COR_PERIGO,
	COR_TEXTO,
	COR_VIDA,
	COR_XP,
	novoBotao,
	novoQuadro,
	novoTexto,
	TOPO_Y,
} from "./ui";
import { criarBrasas, criarEfeitos } from "./efeitos";
import { criarChat } from "./chat";

// ---------- Tipos internos (render) ----------
interface EntFrame {
	frame: Frame;
	barra: Frame | undefined;
	halo: Frame | undefined; // brilho que pulsa no clarão do disparo
	rx: number;
	ry: number;
}

interface TilePool {
	frame: Frame;
	linhaH: Frame; // rejunte horizontal (ou highlight da parede)
	linhaV: Frame; // rejunte vertical (só chão, alternado = tijolo)
}

// Cor da argamassa entre tijolos (constante: sem custo de update)
const COR_ARGAMASSA = Color3.fromRGB(10, 12, 16);

/** Variação determinística de tom por tile (estável ao rolar a câmera). */
function tomComJitter(cor: Color3, tx: number, ty: number): Color3 {
	const j = ((tx * 73 + ty * 149) % 5) - 2; // -2..2
	const m = 1 + j * 0.035;
	return new Color3(math.clamp(cor.R * m, 0, 1), math.clamp(cor.G * m, 0, 1), math.clamp(cor.B * m, 0, 1));
}

/** Clareia uma cor (relevo do topo da parede). */
function clarear(cor: Color3, f: number): Color3 {
	return new Color3(math.clamp(cor.R * f, 0, 1), math.clamp(cor.G * f, 0, 1), math.clamp(cor.B * f, 0, 1));
}

// ---------- Telas (construídas abaixo com ui.ts) ----------

function dist2(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return dx * dx + dy * dy;
}

// ---------- Jogo ----------
export function iniciarJogo(playerGui: PlayerGui): void {
	const camera = Workspace.CurrentCamera;
	if (camera !== undefined) {
		camera.CameraType = Enum.CameraType.Scriptable;
	}
	StarterGui.SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false);

	const gui = new Instance("ScreenGui");
	gui.Name = "PixelQuestUI";
	gui.ResetOnSpawn = false;
	gui.IgnoreGuiInset = true;
	gui.DisplayOrder = 10;
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	gui.Parent = playerGui;

	// (Menu removido: entra direto no lobby)

	// ----- Seletor de mapas -----
	const telaMapas = novoQuadro(gui, "Mapas", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaMapas.ZIndex = 70;
	telaMapas.Visible = false;
	novoTexto(telaMapas, "Titulo", "SELECIONE O MAPA", 40, COR_TEXTO, new UDim2(1, 0, 0, 70), new UDim2(0, 0, 0, 24));
	novoTexto(
		telaMapas,
		"Sub",
		"Clique para escolher • Nv da conta desbloqueia mapas",
		14,
		Color3.fromRGB(160, 175, 195),
		new UDim2(1, 0, 0, 22),
		new UDim2(0, 0, 0, 96),
	);
	const txtCartaSel = novoTexto(
		telaMapas,
		"CartaSel",
		"",
		18,
		COR_TEXTO,
		new UDim2(1, 0, 0, 24),
		new UDim2(0, 0, 0, 120),
	);
	txtCartaSel.ZIndex = 20;
	const ajudaMapas = novoTexto(
		telaMapas,
		"Ajuda",
		"",
		12,
		Color3.fromRGB(160, 175, 195),
		new UDim2(0, 0, 0, 0),
		new UDim2(0, 0, 0, 0),
	);
	ajudaMapas.Visible = false;
	interface CardMapa {
		btn: TextButton;
		head: TextLabel;
		mid: TextLabel;
		foot: TextLabel;
		lockCorpo: Frame;
		lockArco: Frame;
	}
	const cardsMapa: CardMapa[] = [];
	for (let i = 0; i < MAPAS.size(); i++) {
		const b = novoBotao(
			telaMapas,
			`Slot${i}`,
			"",
			new UDim2(0, 150, 0, 220),
			new UDim2(0.5, -403 + i * 164, 0.5, -110),
			COR_PAINEL,
			15,
		);
		const head = novoTexto(b, `H${i}`, "", 16, COR_TEXTO, new UDim2(1, 0, 0, 0.12), new UDim2(0, 0, 0, 0.05));
		const mid = novoTexto(b, `M${i}`, "", 13, COR_TEXTO, new UDim2(1, 0, 0, 0.3), new UDim2(0, 0, 0, 0.32));
		mid.TextWrapped = true;
		const foot = novoTexto(
			b,
			`F${i}`,
			"",
			12,
			Color3.fromRGB(150, 160, 175),
			new UDim2(1, 0, 0, 0.1),
			new UDim2(0, 0, 0, 0.85),
		);
		const lockCorpo = novoQuadro(
			b,
			`LC${i}`,
			new UDim2(0, 30, 0, 24),
			new UDim2(0.5, -15, 0.5, -2),
			Color3.fromRGB(20, 24, 32),
			0,
		);
		borda(lockCorpo, COR_TEXTO, 2);
		const lockArco = novoQuadro(b, `LA${i}`, new UDim2(0, 20, 0, 16), new UDim2(0.5, -10, 0.5, -14), COR_TEXTO, 1);
		const uic = new Instance("UICorner");
		uic.CornerRadius = new UDim(0.5, 0);
		uic.Parent = lockArco;
		borda(lockArco, COR_TEXTO, 3);
		lockCorpo.Visible = false;
		lockArco.Visible = false;
		cardsMapa.push({ btn: b, head: head, mid: mid, foot: foot, lockCorpo: lockCorpo, lockArco: lockArco });
	}

	function alvoCarta(off: number): { w: number; h: number; x: number; z: number } {
		const a = math.abs(off);
		if (a === 0) {
			return { w: 170, h: 250, x: -85, z: 14 };
		} else if (a === 1) {
			return { w: 140, h: 205, x: off * 108 - 70, z: 12 };
		}
		return { w: 115, h: 175, x: off * 100 - 57.5, z: 10 };
	}

	function posicionarCards(animar: boolean): void {
		tweenSel++;
		const vez = tweenSel;
		for (let i = 0; i < cardsMapa.size(); i++) {
			const c = cardsMapa[i];
			const z = alvoCarta(i - slotSel).z + 1;
			const naFrente = i === slotSel;
			c.btn.ZIndex = z - 1;
			c.head.ZIndex = z;
			c.mid.ZIndex = z;
			c.foot.ZIndex = z;
			c.lockCorpo.ZIndex = z;
			c.lockArco.ZIndex = z;
			c.head.Visible = naFrente;
			c.mid.Visible = naFrente;
			c.foot.Visible = naFrente;
			c.lockCorpo.Visible = naFrente && i !== 0;
			c.lockArco.Visible = naFrente && i !== 0;
		}
		const de: { x: number; w: number; h: number }[] = [];
		for (const c of cardsMapa) {
			de.push({ x: c.btn.Position.X.Offset, w: c.btn.Size.X.Offset, h: c.btn.Size.Y.Offset });
		}
		const aplicar = (t: number) => {
			for (let i = 0; i < cardsMapa.size(); i++) {
				const c = cardsMapa[i];
				const a = alvoCarta(i - slotSel);
				const d = de[i];
				const nx = d.x + (a.x - d.x) * t;
				const nw = d.w + (a.w - d.w) * t;
				const nh = d.h + (a.h - d.h) * t;
				c.btn.Position = new UDim2(0.5, nx, 0.5, -nh / 2);
				c.btn.Size = new UDim2(0, nw, 0, nh);
			}
		};
		if (!animar) {
			aplicar(1);
			return;
		}
		task.spawn(() => {
			for (let s = 1; s <= 11; s++) {
				if (vez !== tweenSel) {
					return;
				}
				aplicar(s / 11);
				task.wait(0.02);
			}
		});
	}
	const btnVoltarMapas = novoBotao(
		telaMapas,
		"Voltar",
		"← VOLTAR",
		new UDim2(0, 220, 0, 54),
		new UDim2(0.5, -110, 0.5, 140),
		COR_PAINEL,
		18,
	);
	btnVoltarMapas.ZIndex = 20;
	const avisoMapas = novoTexto(
		telaMapas,
		"Aviso",
		"",
		16,
		COR_TEXTO,
		new UDim2(0, 520, 0, 26),
		new UDim2(0.5, -260, 0.5, 200),
	);
	avisoMapas.ZIndex = 20;

	// ----- Tela do jogo (tela cheia) -----
	const telaJogo = novoQuadro(gui, "Jogo", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaJogo.ZIndex = 1;
	telaJogo.Visible = false;
	telaJogo.ClipsDescendants = true;
	const arena = novoQuadro(telaJogo, "Arena", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	arena.ClipsDescendants = true;
	// Vinheta escura nas bordas (clima da referência): 2 faixas estáticas, sem custo por frame
	for (let v = 0; v < 2; v++) {
		const larg = 26;
		const transp = v === 0 ? 0.5 : 0.78;
		const off = v * larg;
		const faixas = [
			[new UDim2(1, 0, 0, larg), new UDim2(0, 0, 0, off)],
			[new UDim2(1, 0, 0, larg), new UDim2(0, 0, 1, -larg - off)],
			[new UDim2(0, larg, 1, 0), new UDim2(0, off, 0, 0)],
			[new UDim2(0, larg, 1, 0), new UDim2(1, -larg - off, 0, 0)],
		];
		for (let k = 0; k < 4; k++) {
			const f = novoQuadro(telaJogo, `Vin${v}${k}`, faixas[k][0], faixas[k][1], Color3.fromRGB(0, 0, 0), transp);
			f.ZIndex = 40;
		}
	}

	const hud = novoQuadro(telaJogo, "HUD", new UDim2(1, 0, 0, 40), new UDim2(0, 0, 0, TOPO_Y), COR_PAINEL, 0.1);
	hud.ZIndex = 50;
	const txtMoedas = novoTexto(hud, "Moedas", "$ 0", 18, COR_TEXTO, new UDim2(0, 150, 0, 40), new UDim2(0, 175, 0, 0));
	const txtOnda = novoTexto(hud, "Onda", "ÁREA 1", 18, COR_TEXTO, new UDim2(0, 200, 0, 40), new UDim2(0.5, -100, 0, 0));
	const btnOpcoes = novoBotao(
		hud,
		"Opcoes",
		"≡ OPÇÕES",
		new UDim2(0, 140, 0, 30),
		new UDim2(1, -212, 0, 5),
		COR_PAINEL,
		16,
	);
	const botPausa = novoBotao(hud, "Pausa", "II", new UDim2(0, 52, 0, 30), new UDim2(1, -62, 0, 5), COR_PAINEL, 16);

	const painelQuests = novoQuadro(
		telaJogo,
		"Quests",
		new UDim2(0, 215, 0, 150),
		new UDim2(1, -225, 0, TOPO_Y + 50),
		COR_PAINEL,
		0.15,
	);
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

	const banner = novoTexto(telaJogo, "Banner", "", 34, COR_TEXTO, new UDim2(1, 0, 0, 50), new UDim2(0, 0, 0.35, 0));
	banner.ZIndex = 60;
	banner.Visible = false;
	const rotuloPausa = novoTexto(
		telaJogo,
		"Pausado",
		"PAUSADO",
		22,
		COR_TEXTO,
		new UDim2(0, 200, 0, 30),
		new UDim2(0.5, -100, 0, TOPO_Y + 46),
	);
	rotuloPausa.ZIndex = 60;
	rotuloPausa.Visible = false;
	// Diagnóstico temporário: input enviado | posição do servidor | idade da foto
	const rotuloDebug = novoTexto(
		telaJogo,
		"Debug",
		"",
		13,
		COR_TEXTO,
		new UDim2(0, 420, 0, 20),
		new UDim2(0, 10, 1, -24),
	);
	rotuloDebug.ZIndex = 60;
	rotuloDebug.TextXAlignment = Enum.TextXAlignment.Left;
	// Preenchedor de borda do selo (hold 3s): 4 barras que fecham o retângulo
	const fillBorda: Frame[] = [];
	for (let k = 0; k < 4; k++) {
		const fb = novoQuadro(arena, `Fill${k}`, new UDim2(0, 6, 0, 6), new UDim2(0, -500, 0, -500), COR_TEXTO, 0);
		fb.ZIndex = 5;
		fb.Visible = false;
		fillBorda.push(fb);
	}
	// Decalques no chão (sangue verde + corpos): pool fixo, sem custo de criação
	const decalques: Frame[] = [];
	for (let k = 0; k < 200; k++) {
		const dc = novoQuadro(arena, `Dec${k}`, new UDim2(0, 12, 0, 12), new UDim2(0, -500, 0, -500), COR_FUNDO, 0);
		dc.ZIndex = 2;
		dc.Visible = false;
		decalques.push(dc);
	}
	const txtBossNome = novoTexto(
		telaJogo,
		"BossNome",
		"Rei Zumbi",
		13,
		COR_TEXTO,
		new UDim2(0, 300, 0, 18),
		new UDim2(0, 12, 0, 80),
	);
	txtBossNome.ZIndex = 60;
	txtBossNome.Visible = false;
	txtBossNome.TextXAlignment = Enum.TextXAlignment.Left;
	const barraBossFundo = novoQuadro(
		telaJogo,
		"BossFundo",
		new UDim2(0, 300, 0, 30),
		new UDim2(0, 12, 0, 100),
		Color3.fromRGB(20, 8, 18),
		0,
	);
	barraBossFundo.ZIndex = 60;
	barraBossFundo.Visible = false;
	borda(barraBossFundo, Color3.fromRGB(255, 190, 30), 3);
	const barraBoss = novoQuadro(barraBossFundo, "Boss", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_PERIGO, 0);
	const txtBoss = novoTexto(telaJogo, "BossHp", "", 20, COR_TEXTO, new UDim2(0, 300, 0, 30), new UDim2(0, 12, 0, 100));
	txtBoss.ZIndex = 61;
	txtBoss.Visible = false;

	// ----- Painel de opções (tarefas, mochila, equipamentos) -----
	const painel = novoQuadro(
		telaJogo,
		"Painel",
		new UDim2(0, 560, 0, 400),
		new UDim2(0.5, -280, 0.5, -200),
		COR_PAINEL,
		0,
	);
	painel.ZIndex = 65;
	painel.Visible = false;
	borda(painel, COR_TEXTO, 3);
	const tituloPainel = novoTexto(
		painel,
		"Titulo",
		"OPÇÕES",
		22,
		COR_TEXTO,
		new UDim2(1, -60, 0, 36),
		new UDim2(0, 0, 0, 6),
	);
	const abaMissoes = novoBotao(
		painel,
		"AbaMissoes",
		"TAREFAS",
		new UDim2(0, 118, 0, 34),
		new UDim2(0, 14, 0, 48),
		COR_FUNDO,
		14,
	);
	const abaMochila = novoBotao(
		painel,
		"AbaMochila",
		"MOCHILA",
		new UDim2(0, 118, 0, 34),
		new UDim2(0, 140, 0, 48),
		COR_FUNDO,
		14,
	);
	const abaEquip = novoBotao(
		painel,
		"AbaEquip",
		"EQUIP.",
		new UDim2(0, 118, 0, 34),
		new UDim2(0, 266, 0, 48),
		COR_FUNDO,
		14,
	);
	const abaTitulos = novoBotao(
		painel,
		"AbaTitulos",
		"TÍTULOS",
		new UDim2(0, 118, 0, 34),
		new UDim2(0, 392, 0, 48),
		COR_FUNDO,
		14,
	);
	const btnFecharPainel = novoBotao(
		painel,
		"Fechar",
		"X",
		new UDim2(0, 40, 0, 34),
		new UDim2(1, -50, 0, 8),
		COR_PAINEL,
		16,
	);
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

	// ----- Tela de fim (opaca) -----
	const telaFim = novoQuadro(gui, "Fim", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
	telaFim.ZIndex = 70;
	telaFim.Visible = false;
	const txtFimTitulo = novoTexto(
		telaFim,
		"Titulo",
		"",
		48,
		COR_DESTAQUE,
		new UDim2(1, 0, 0, 70),
		new UDim2(0, 0, 0, 120),
	);
	const txtFimStats = novoTexto(telaFim, "Stats", "", 20, COR_TEXTO, new UDim2(1, 0, 0, 160), new UDim2(0, 0, 0, 210));
	const btnDeNovo = novoBotao(
		telaFim,
		"DeNovo",
		"JOGAR DE NOVO",
		new UDim2(0, 170, 0, 60),
		new UDim2(0.5, -180, 0, 390),
		COR_PAINEL,
		18,
	);
	const btnLobby = novoBotao(
		telaFim,
		"Lobby",
		"LOBBY",
		new UDim2(0, 170, 0, 60),
		new UDim2(0.5, 10, 0, 390),
		COR_PAINEL,
		18,
	);

	// ===== Estado de render (espelho do servidor) =====
	let estado: "mapas" | "jogo" | "fim" = "jogo";
	let mapaIdx = 0;
	let slotSel = 0;
	let tweenSel = 0;
	let grade: string[] = [];
	let explorado: boolean[] = [];
	let camX = 0;
	let camY = 0;
	let camPronta = false; // primeira foto: centraliza na hora (sem deslizar do 0,0)
	let vistaL = 960;
	let vistaA = 600;
	let px = 0;
	let py = 0;
	let ultimaFoto: Foto | undefined = undefined;
	let primeiraFoto = false;
	let bannerT = 0;
	let tempo = 0;
	let ultimoFotoT = -99;
	let semente = 0;
	let nivelPendente = 0;
	let semFog = false; // lobby: tudo visível, sem névoa
	let zonaLobby: "mapas" | "encant" | "rank" | undefined = undefined;
	let zonaDwell = 0;
	let zonaFired = false;
	let placarAberto = false;
	let telaPlacar: Frame | undefined = undefined;
	let colPlacarNv: TextLabel | undefined = undefined;
	let colPlacarKill: TextLabel | undefined = undefined;
	let colPlacarMoeda: TextLabel | undefined = undefined;
	let zonaFrames: { id: string; rect: Frame; rotulo: TextLabel; wx: number; wy: number; ww: number; wh: number }[] = [];
	let hudMoedas = -1;
	let hudOnda = "";
	let hudPausa = false;
	let hudBossV = false;
	let hudBossTxt = "";
	let plVida = -1;
	let plXp = -1;
	let plNv = -1;
	let plRX = 0;
	let plRY = 0;
	let dbgT = 0;
	let proxIdLocal = 1;
	let painelAberto: "tarefas" | "mochila" | "equip" | "titulos" | undefined = undefined;
	let ultimaMochila = "";
	let ultimoNv = 1;
	let ultimasMoedas = 0;
	let ultimosAbates = 0;
	let inimigosVistos: { [id: number]: number } = {};

	const tiles: TilePool[] = [];
	let camadaTiles: Frame | undefined = undefined;
	let tilesCols = 0;
	let tilesRows = 0;
	let camTileX = -1;
	let camTileY = -1;
	let nevoaTileX = -999;
	let nevoaTileY = -999;
	let nevoaFx = 1;
	let nevoaFy = 0;

	let framePlayer: Frame | undefined = undefined;
	let olhoPlayer: Frame | undefined = undefined;
	let haloPlayer1: Frame | undefined = undefined;
	let haloPlayer2: Frame | undefined = undefined;
	let hudFlashV = false;
	let brilhoPlayer: Frame | undefined = undefined;
	let placaVida: Frame | undefined = undefined;
	let placaXp: Frame | undefined = undefined;
	let placaNv: TextLabel | undefined = undefined;
	let placaTitulo: TextLabel | undefined = undefined;
	let plTitulo = "";
	let entInimigos: { [id: number]: EntFrame } = {};
	let chavesInimigos: number[] = [];
	let entOutros: { [nome: string]: EntFrame } = {};
	let chavesOutros: string[] = [];
	let entBalas: { [id: number]: EntFrame | undefined } = {};
	let chavesBalas: number[] = [];
	let entCots: { [id: number]: EntFrame | undefined } = {};
	let chavesCots: number[] = [];
	const fx = criarEfeitos(arena, telaJogo, () => {
		// Título do nível SÓ no flash (último quadradinho chegou)
		if (nivelPendente > 0) {
			mostrarBanner(`NÍVEL ${nivelPendente}!`, 2.5);
			nivelPendente = 0;
		}
	});
	const chat = criarChat(telaJogo);
	criarBrasas(telaMapas, () => telaMapas.Visible);

	// Input PC (só envia; servidor decide)
	let teclaCima = false;
	let teclaBaixo = false;
	let teclaEsq = false;
	let teclaDir = false;
	let fogoMouse = false;
	let autoTiro = false;
	let envDx = 0;
	let envDy = 0;
	let envAx = 0;
	let envAy = 0;
	let envFogo = false;
	let envAuto = false;
	let envT = 0;

	function enviarEntrada(
		dx: number,
		dy: number,
		ax: number,
		ay: number,
		fogo: boolean,
		auto: boolean,
		dash: boolean,
	): void {
		Remotes.Client.Get("Entrada").SendToServer({ dx: dx, dy: dy, ax: ax, ay: ay, fogo: fogo, auto: auto, dash: dash });
	}

	const mapearTecla = (codigo: Enum.KeyCode, apertou: boolean): void => {
		if (codigo === Enum.KeyCode.W || codigo === Enum.KeyCode.Up) {
			teclaCima = apertou;
		} else if (codigo === Enum.KeyCode.S || codigo === Enum.KeyCode.Down) {
			teclaBaixo = apertou;
		} else if (codigo === Enum.KeyCode.A || codigo === Enum.KeyCode.Left) {
			teclaEsq = apertou;
		} else if (codigo === Enum.KeyCode.D || codigo === Enum.KeyCode.Right) {
			teclaDir = apertou;
		} else if (apertou && codigo === Enum.KeyCode.E) {
			if (estado === "jogo" && painelAberto === undefined) {
				autoTiro = !autoTiro;
				mostrarBanner(autoTiro ? "TIRO AUTOMÁTICO: ON" : "TIRO AUTOMÁTICO: OFF", 1);
			}
		} else if (apertou && codigo === Enum.KeyCode.P) {
			if (estado === "jogo") {
				Remotes.Client.Get("Pausa").SendToServer();
			}
		}
	};

	UserInputService.InputBegan.Connect((input, processado) => {
		if (estado !== "jogo") {
			return;
		}
		if (input.UserInputType === Enum.UserInputType.MouseButton1) {
			if (!processado && painelAberto === undefined) {
				fogoMouse = true;
			}
			return;
		}
		if (input.UserInputType === Enum.UserInputType.MouseButton2) {
			if (!processado && painelAberto === undefined) {
				enviarEntrada(envDx, envDy, envAx, envAy, envFogo, envAuto, true);
			}
			return;
		}
		if (processado) {
			return;
		}
		mapearTecla(input.KeyCode, true);
	});
	UserInputService.InputEnded.Connect((input) => {
		if (input.UserInputType === Enum.UserInputType.MouseButton1) {
			fogoMouse = false; // soltar sempre apaga (evita tiro preso)
			return;
		}
		mapearTecla(input.KeyCode, false);
	});
	botPausa.Activated.Connect(() => {
		if (estado === "jogo") {
			Remotes.Client.Get("Pausa").SendToServer();
		}
	});

	// ===== Câmera + tiles + Fog of War =====
	function tX(x: number): number {
		return x - camX;
	}
	function tY(y: number): number {
		return y - camY;
	}

	function posicaoBalao(nome: string): [number, number] | undefined {
		const eu = Players.LocalPlayer;
		if (eu !== undefined && eu.Name === nome && framePlayer !== undefined) {
			const p = framePlayer.Position;
			return [p.X.Offset + 10, p.Y.Offset - 42];
		}
		const ent = entOutros[nome];
		if (ent !== undefined && ent.frame.Visible) {
			const p = ent.frame.Position;
			return [p.X.Offset + 9, p.Y.Offset - 40];
		}
		return undefined;
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
		const camada = novoQuadro(
			arena,
			"Camada",
			new UDim2(0, cols * TILE, 0, rows * TILE),
			new UDim2(0, 0, 0, 0),
			COR_FUNDO,
			1,
		);
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
			f.Visible = false;
			const lh = novoQuadro(camada, `TH${i}`, new UDim2(0, TILE, 0, 4), new UDim2(0, 0, 0, 22), COR_ARGAMASSA, 0.5);
			lh.ZIndex = 1;
			lh.Visible = false;
			const lv = novoQuadro(camada, `TV${i}`, new UDim2(0, 4, 0, 22), new UDim2(0, 10, 0, 1), COR_ARGAMASSA, 0.5);
			lv.ZIndex = 1;
			lv.Visible = false;
			tiles.push({ frame: f, linhaH: lh, linhaV: lv });
		}
		camTileX = -1;
		camTileY = -1;
		nevoaTileX = -999;
		nevoaTileY = -999;
	}

	function charGrade(tx: number, ty: number): string {
		if (grade.size() === 0 || tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY) {
			return "R";
		}
		return grade[ty].sub(tx + 1, tx + 1);
	}

	/** Linha de visão do jogador: parede bloqueia (igual à dos inimigos). */
	function haVisada(x1: number, y1: number, x2: number, y2: number): boolean {
		const dx = x2 - x1;
		const dy = y2 - y1;
		const d = math.sqrt(dx * dx + dy * dy);
		if (d > VISAO || d < 1) {
			return d < 1;
		}
		const passos = math.floor(d / 12);
		for (let i = 1; i <= passos; i++) {
			const t = i / (passos + 1);
			const tx = math.floor((x1 + dx * t) / TILE);
			const ty = math.floor((y1 + dy * t) / TILE);
			if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY) {
				continue; // vazio fora do mapa não bloqueia
			}
			if (eSolido(charGrade(tx, ty))) {
				return false;
			}
		}
		return true;
	}

	let expTX = -999;
	let expTY = -999;
	let expFx = 1;
	let expFy = 0;

	function marcarExplorado(fx: number, fy: number, range: number, wide: boolean): void {
		const pcx = math.floor(px / TILE);
		const pcy = math.floor(py / TILE);
		const mira = fx * expFx + fy * expFy;
		if (pcx === expTX && pcy === expTY && mira > 0.995) {
			return; // parado no mesmo tile e mesma mira: nada novo para explorar
		}
		expTX = pcx;
		expTY = pcy;
		expFx = fx;
		expFy = fy;
		const rr = math.ceil(range / TILE);
		for (let ty = pcy - rr; ty <= pcy + rr; ty++) {
			for (let tx = pcx - rr; tx <= pcx + rr; tx++) {
				if (tx < 0 || ty < 0 || tx >= MUNDO_TX || ty >= MUNDO_TY) {
					continue;
				}
				const dx = (tx + 0.5) * TILE - px;
				const dy = (ty + 0.5) * TILE - py;
				const d2 = dx * dx + dy * dy;
				if (d2 > range * range) {
					continue;
				}
				const d = math.sqrt(d2);
				if (!wide && d >= 1 && (dx * fx + dy * fy) / d < CONE_LAMP) {
					continue; // fora do cone da lanterna: olho real não vê
				}
				if (haVisada(px, py, (tx + 0.5) * TILE, (ty + 0.5) * TILE)) {
					explorado[ty * MUNDO_TX + tx] = true;
				}
			}
		}
	}

	function desenharTiles(fx: number, fy: number, range: number, wide: boolean): void {
		const camada = camadaTiles;
		if (camada === undefined || tilesCols === 0 || grade.size() === 0) {
			return;
		}
		const tx0 = math.floor(camX / TILE);
		const ty0 = math.floor(camY / TILE);
		camada.Position = new UDim2(0, tx0 * TILE - camX, 0, ty0 * TILE - camY);
		const ptx = math.floor(px / TILE);
		const pty = math.floor(py / TILE);
		const mudouOrigem = tx0 !== camTileX || ty0 !== camTileY;
		const mudouNevoa = ptx !== nevoaTileX || pty !== nevoaTileY;
		const mira = fx * nevoaFx + fy * nevoaFy;
		if (!mudouOrigem && !mudouNevoa && mira > 0.995) {
			return; // nada mudou (posição e mira iguais): pula o redesenho
		}
		camTileX = tx0;
		camTileY = ty0;
		nevoaTileX = ptx;
		nevoaTileY = pty;
		nevoaFx = fx;
		nevoaFy = fy;
		for (let i = 0; i < tiles.size(); i++) {
			const tx = tx0 + (i % tilesCols);
			const ty = ty0 + math.floor(i / tilesCols);
			const t = tiles[i];
			const dentro = tx >= 0 && ty >= 0 && tx < MUNDO_TX && ty < MUNDO_TY;
			const ch = dentro ? charGrade(tx, ty) : "R";
			const cx = (tx + 0.5) * TILE - px;
			const cy = (ty + 0.5) * TILE - py;
			const d2 = cx * cx + cy * cy;
			const d = math.sqrt(d2);
			// Lanterna: alcance curto + SÓ no cone da mira (olho real não vê 360°)
			const noCone = wide || d < 1 || ((cx * fx + cy * fy) / d >= CONE_LAMP && d < range);
			const vis = semFog ? dentro : noCone && haVisada(px, py, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
			const exp = dentro && explorado[ty * MUNDO_TX + tx];
			if (!vis && !exp) {
				t.frame.Visible = false; // inexplorado: some (fundo preto)
				t.linhaH.Visible = false;
				t.linhaV.Visible = false;
				continue;
			}
			const parede = ch === "R" || ch === "W";
			const baseCrua = vis ? (COR_TILE[ch] ?? COR_TILE["G"]) : (COR_ESCURA[ch] ?? COR_DESCONHECIDO);
			// Luz real: apaga com a distância (só na dungeon; lobby fica claro)
			const base =
				vis && !semFog
					? clarear(tomComJitter(baseCrua, tx, ty), 1 - (0.4 * d) / range)
					: tomComJitter(baseCrua, tx, ty);
			t.frame.Visible = true;
			t.frame.BackgroundColor3 = tomComJitter(base, tx, ty);
			const slotX = (i % tilesCols) * TILE;
			const slotY = math.floor(i / tilesCols) * TILE;
			if (parede) {
				// Relevo: faixa clara no topo da parede
				t.linhaH.Visible = true;
				t.linhaH.Size = new UDim2(0, TILE, 0, 6);
				t.linhaH.Position = new UDim2(0, slotX, 0, slotY);
				t.linhaH.BackgroundColor3 = clarear(base, 1.7);
				t.linhaH.BackgroundTransparency = 0;
				t.linhaV.Visible = false;
			} else {
				// Tijolo: rejunte escuro alternado por fileira
				t.linhaH.Visible = true;
				t.linhaH.Size = new UDim2(0, TILE, 0, 4);
				t.linhaH.Position = new UDim2(0, slotX, 0, slotY + 22);
				t.linhaH.BackgroundColor3 = COR_ARGAMASSA;
				t.linhaH.BackgroundTransparency = 0.5;
				t.linhaV.Visible = true;
				t.linhaV.Position = new UDim2(0, slotX + ((tx + ty) % 2 === 0 ? 10 : 34), 0, slotY + 1);
			}
		}
	}

	// ===== Fluxo de telas =====
	function mostrarBanner(texto: string, duracao: number): void {
		banner.Text = texto;
		banner.Visible = texto !== "";
		bannerT = duracao;
	}

	function nivelContaLocal(): number {
		const jogador = Players.LocalPlayer;
		if (jogador === undefined) {
			return 1;
		}
		const stats = jogador.FindFirstChild("leaderstats");
		if (stats === undefined || !stats.IsA("Folder")) {
			return 1;
		}
		const n = stats.FindFirstChild("Nivel");
		if (n !== undefined && n.IsA("IntValue") && n.Value >= 1) {
			return n.Value;
		}
		return 1;
	}

	function atualizarSeletor(): void {
		for (let i = 0; i < MAPAS.size(); i++) {
			const m = MAPAS[i];
			const c = cardsMapa[i];
			const livre = i <= 1 && nivelContaLocal() >= m.reqNivel;
			if (i === 0) {
				c.head.Text = `MAPA ${i + 1}`;
				c.head.TextColor3 = COR_TEXTO;
				c.mid.Text = m.nome;
				c.mid.TextColor3 = COR_TEXTO;
				c.foot.Text = "5 ÁREAS • BOSS";
				c.btn.BackgroundColor3 = Color3.fromRGB(45, 52, 66);
				c.lockCorpo.Visible = false;
				c.lockArco.Visible = false;
			} else if (livre) {
				c.head.Text = `MAPA ${i + 1}`;
				c.head.TextColor3 = COR_TEXTO;
				c.mid.Text = m.nome;
				c.mid.TextColor3 = COR_TEXTO;
				c.foot.Text = "SALÃO + 12 SALAS • EXTERMÍNIO";
				c.btn.BackgroundColor3 = Color3.fromRGB(45, 52, 66);
				c.lockCorpo.Visible = false;
				c.lockArco.Visible = false;
			} else {
				c.head.Text = `MAPA ${i + 1}`;
				c.head.TextColor3 = Color3.fromRGB(130, 140, 155);
				c.mid.Text = "???";
				c.mid.TextColor3 = Color3.fromRGB(130, 140, 155);
				c.foot.Text = `Nv ${m.reqNivel}`;
				c.btn.BackgroundColor3 = Color3.fromRGB(18, 22, 30);
				c.lockCorpo.Visible = true;
				c.lockArco.Visible = true;
			}
		}
	}

	function atualizarInfoCarta(): void {
		const m = MAPAS[slotSel];
		if (slotSel === 0) {
			txtCartaSel.Text = `MAPA 1 — ${m.nome}`;
			txtCartaSel.TextColor3 = COR_TEXTO;
		} else if (slotSel === 1 && nivelContaLocal() >= m.reqNivel) {
			txtCartaSel.Text = `MAPA 2 — ${m.nome}`;
			txtCartaSel.TextColor3 = COR_TEXTO;
		} else {
			txtCartaSel.Text = `MAPA ${slotSel + 1} — Nv ${m.reqNivel} • EM BREVE`;
			txtCartaSel.TextColor3 = Color3.fromRGB(150, 160, 175);
		}
	}

	function abrirSeletor(): void {
		atualizarSeletor();
		atualizarInfoCarta();
		telaFim.Visible = false;
		telaMapas.Visible = true;
		estado = "mapas";
		posicionarCards(false);
	}

	function entrarNoMapa(idx: number): void {
		telaMapas.Visible = false;
		telaFim.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
		mapaIdx = idx;
		primeiraFoto = false;
		envDx = 0;
		envDy = 0;
		envAx = 0;
		envAy = 0;
		envFogo = false;
		envAuto = false;
		envT = 0;
		fogoMouse = false;
		autoTiro = false;
		enviarEntrada(0, 0, 0, 0, false, false, false);
		limparEntidades();
		garantirPoolTiles();
		mostrarBanner("CARREGANDO MASMORRA...", 9999);
		Remotes.Client.Get("EscolherMapa").SendToServer(idx);
		zonaLobby = undefined;
		zonaDwell = 0;
		zonaFired = false;
		esconderFill();
		if (placarAberto) {
			fecharPlacar();
		}
		print(`[PixelQuest] Escolheu mapa ${idx}.`);
	}

	function entrarNoLobby(): void {
		telaMapas.Visible = false;
		telaFim.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
		primeiraFoto = false;
		envDx = 0;
		envDy = 0;
		envAx = 0;
		envAy = 0;
		envFogo = false;
		envAuto = false;
		envT = 0;
		fogoMouse = false;
		autoTiro = false;
		enviarEntrada(0, 0, 0, 0, false, false, false);
		limparEntidades();
		garantirPoolTiles();
		mostrarBanner("BEM-VINDO AO LOBBY!", 2.5);
		Remotes.Client.Get("Entrar").SendToServer();
		print("[PixelQuest] Entrou no lobby.");
	}

	function voltarAoJogo(): void {
		// Servidor trocou o mundo (lobby/dungeon) com a party: sai da tela de fim
		telaFim.Visible = false;
		telaMapas.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
		primeiraFoto = false;
		envDx = 0;
		envDy = 0;
		envAx = 0;
		envAy = 0;
		envFogo = false;
		envAuto = false;
		envT = 0;
		fogoMouse = false;
		autoTiro = false;
		enviarEntrada(0, 0, 0, 0, false, false, false);
		limparEntidades();
		garantirPoolTiles();
		mostrarBanner("CARREGANDO...", 2);
	}

	function mostrarFim(
		venceu: boolean,
		area: number,
		nivel: number,
		abates: number,
		moedas: number,
		quests: number,
		valor: number,
	): void {
		estado = "fim";
		enviarEntrada(0, 0, 0, 0, false, false, false);
		txtFimTitulo.Text = venceu ? "VITÓRIA!" : "DERROTADO...";
		txtFimTitulo.TextColor3 = venceu ? COR_DESTAQUE : COR_PERIGO;
		txtFimStats.Text =
			`Área ${area + 1} | Nível ${nivel} | ${abates} abates\n` +
			`Moedas: ${moedas} | Quests: ${quests}/${QUESTS.size()}\n` +
			`+${valor} Valor para a próxima run!`;
		telaJogo.Visible = false;
		telaFim.Visible = true;
	}

	for (let i = 0; i < cardsMapa.size(); i++) {
		const idx = i;
		cardsMapa[idx].btn.Activated.Connect(() => {
			if (idx === slotSel) {
				if (idx <= 1 && nivelContaLocal() >= MAPAS[idx].reqNivel) {
					entrarNoMapa(idx);
				} else {
					avisoMapas.Text = `MAPA ${idx + 1} bloqueado: Nv ${MAPAS[idx].reqNivel} (conta) — em breve!`;
					task.delay(2.5, () => {
						avisoMapas.Text = "";
					});
				}
			} else {
				slotSel = idx;
				posicionarCards(true);
				atualizarInfoCarta();
			}
		});
	}
	btnVoltarMapas.Activated.Connect(() => {
		telaMapas.Visible = false;
		telaJogo.Visible = true;
		estado = "jogo";
	});
	btnDeNovo.Activated.Connect(() => entrarNoMapa(mapaIdx));
	btnLobby.Activated.Connect(() => {
		Remotes.Client.Get("Lobby").SendToServer();
	});

	// ===== Rede: snapshots + eventos =====
	Remotes.Client.Get("Foto").Connect((foto) => {
		const antes = ultimaFoto;
		ultimaFoto = foto;
		px = foto.px;
		py = foto.py;
		ultimoFotoT = tempo;
		if (!primeiraFoto) {
			primeiraFoto = true;
			banner.Visible = false;
			bannerT = 0;
		}
		// Diffs → feedback (dano, moedas, nível, itens)
		if (antes !== undefined) {
			if (foto.hp < antes.hp) {
				fx.floater(tX(px), tY(py) - 24, `-${antes.hp - foto.hp}`, COR_PERIGO);
			}
			if (foto.moedas > antes.moedas) {
				fx.floater(tX(px), tY(py) - 40, `+$${foto.moedas - antes.moedas}`, COR_TEXTO);
			}
			if (foto.nivel > antes.nivel) {
				fx.floater(tX(px), tY(py) - 24, "LEVEL UP!", COR_TEXTO);
				nivelPendente = foto.nivel;
				fx.iniciarNivel(brilhoPlayer, px, py, (tx, ty) => eSolido(charGrade(tx, ty)));
			}
			for (const e of foto.inimigos) {
				const hpAntes = inimigosVistos[e.id];
				if (hpAntes !== undefined && e.hp < hpAntes) {
					fx.floater(tX(e.x), tY(e.y) - 18, `${math.floor(hpAntes - e.hp)}`, COR_TEXTO);
				}
				inimigosVistos[e.id] = e.hp;
			}
			const chaveMochila =
				foto.mochila.join(",") + "|" + foto.eqArma + "|" + foto.eqArmadura + "|" + foto.eqAcess + "|" + foto.tituloEq;
			if (ultimaMochila !== "" && chaveMochila !== ultimaMochila && painelAberto !== undefined) {
				refreshPainel();
			}
			ultimaMochila = chaveMochila;
		} else {
			for (const e of foto.inimigos) {
				inimigosVistos[e.id] = e.hp;
			}
			ultimaMochila = foto.mochila.join(",") + "|" + foto.eqArma + "|" + foto.eqArmadura + "|" + foto.eqAcess;
		}
		ultimoNv = foto.nivel;
		ultimosAbates = foto.abates;
		ultimasMoedas = foto.moedas;
		atualizarQuestsUI(foto);
	});

	Remotes.Client.Get("Evento").Connect((ev) => {
		if (ev.tipo === "mapa") {
			grade = ev.grade;
			semente = ev.seed;
			semFog = ev.lobby;
			explorado = [];
			for (let i = 0; i < MUNDO_TX * MUNDO_TY; i++) {
				explorado.push(false);
			}
			camTileX = -1;
			camTileY = -1;
			nevoaTileX = -999;
			nevoaTileY = -999;
			expTX = -999;
			expTY = -999;
			if (ev.lobby) {
				construirZonas();
			} else {
				limparZonas();
			}
			if (estado === "fim") {
				voltarAoJogo();
			}
		} else if (ev.tipo === "porta") {
			if (ev.ty >= 0 && ev.ty < grade.size()) {
				const linha = grade[ev.ty];
				grade[ev.ty] = linha.sub(1, ev.tx) + "." + linha.sub(ev.tx + 2);
			}
			camTileX = -1;
		} else if (ev.tipo === "placar") {
			preencherPlacar(ev.dados);
		} else if (ev.tipo === "banner") {
			mostrarBanner(ev.texto, ev.duracao);
		} else if (ev.tipo === "fim") {
			mostrarFim(ev.venceu, ev.area, ev.nivel, ev.abates, ev.moedas, ev.quests, ev.valor);
		}
	});

	// ===== Entidades (render a partir da foto, com suavização) =====
	function obterInimigo(id: number, tam: number, cor: Color3, nv: number, brilho?: Color3): EntFrame {
		let ent = entInimigos[id];
		if (ent === undefined) {
			const f = novoQuadro(arena, `E${id}`, new UDim2(0, tam, 0, tam), new UDim2(0, 0, 0, 0), cor, 0);
			f.ZIndex = 8;
			borda(f, Color3.fromRGB(10, 10, 10), 2);
			if (brilho !== undefined) {
				// Halo do boss (vermelho, como na referência)
				const haloB = novoQuadro(
					f,
					"HaloB",
					new UDim2(0, tam + 30, 0, tam + 30),
					new UDim2(0, -15, 0, -15),
					brilho,
					0.82,
				);
				haloB.ZIndex = 7;
			}
			const barra = novoQuadro(f, "HP", new UDim2(1, 0, 0, 4), new UDim2(0, 0, 0, -6), COR_VIDA, 0);
			barra.ZIndex = 9;
			const rot = novoTexto(
				f,
				"NvE",
				`Nv ${nv}`,
				9,
				COR_TEXTO,
				new UDim2(0, tam + 22, 0, 10),
				new UDim2(0, -11, 0, tam + 2),
			);
			rot.ZIndex = 9;
			ent = { frame: f, barra: barra, halo: undefined, rx: 0, ry: 0 };
			entInimigos[id] = ent;
			chavesInimigos.push(id);
		}
		return ent;
	}

	function obterOutro(nome: string): EntFrame {
		let ent = entOutros[nome];
		if (ent === undefined) {
			const f = novoQuadro(
				arena,
				`P_${nome}`,
				new UDim2(0, 18, 0, 18),
				new UDim2(0, 0, 0, 0),
				Color3.fromRGB(90, 220, 120),
				0,
			);
			f.ZIndex = 10;
			borda(f, COR_TEXTO, 2);
			const haloO = novoQuadro(
				f,
				"Halo",
				new UDim2(0, 40, 0, 40),
				new UDim2(0, -11, 0, -11),
				Color3.fromRGB(255, 150, 60),
				0.82,
			);
			haloO.ZIndex = 8;
			const rot = novoTexto(f, "Nome", nome, 10, COR_TEXTO, new UDim2(0, 60, 0, 12), new UDim2(0, -21, 0, -15));
			rot.ZIndex = 11;
			ent = { frame: f, barra: undefined, halo: haloO, rx: 0, ry: 0 };
			entOutros[nome] = ent;
			chavesOutros.push(nome);
		}
		return ent;
	}

	function garantirPlayer(): void {
		if (framePlayer !== undefined) {
			return;
		}
		const c = CLASSES[0];
		const p = novoQuadro(arena, "Player", new UDim2(0, 20, 0, 20), new UDim2(0, 0, 0, 0), c.cor, 0);
		p.ZIndex = 10;
		borda(p, COR_TEXTO, 2);
		// Halo quente atrás do sprite (clima da referência)
		const halo1 = novoQuadro(
			p,
			"Halo1",
			new UDim2(0, 46, 0, 46),
			new UDim2(0, -13, 0, -13),
			Color3.fromRGB(255, 150, 60),
			0.8,
		);
		halo1.ZIndex = 8;
		haloPlayer1 = halo1;
		const halo2 = novoQuadro(
			p,
			"Halo2",
			new UDim2(0, 72, 0, 72),
			new UDim2(0, -26, 0, -26),
			Color3.fromRGB(255, 150, 60),
			0.9,
		);
		halo2.ZIndex = 7;
		haloPlayer2 = halo2;
		const olho = novoQuadro(p, "Olho", new UDim2(0, 6, 0, 6), new UDim2(0, 11, 0, 7), COR_TEXTO, 0);
		olho.ZIndex = 11;
		const brilho = novoQuadro(
			p,
			"Brilho",
			new UDim2(1, 0, 1, 0),
			new UDim2(0, 0, 0, 0),
			Color3.fromRGB(255, 255, 255),
			1,
		);
		brilho.ZIndex = 11;
		const placa = novoQuadro(p, "Placa", new UDim2(0, 44, 0, 40), new UDim2(0, -12, 1, 4), COR_FUNDO, 1);
		placa.ZIndex = 12;
		const pvFundo = novoQuadro(
			placa,
			"VidaFundo",
			new UDim2(1, 0, 0, 6),
			new UDim2(0, 0, 0, 0),
			Color3.fromRGB(60, 20, 20),
			0,
		);
		pvFundo.ZIndex = 13;
		const pv = novoQuadro(pvFundo, "Vida", new UDim2(1, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_VIDA, 0);
		pv.ZIndex = 14;
		const pxFundo = novoQuadro(
			placa,
			"XpFundo",
			new UDim2(1, 0, 0, 3),
			new UDim2(0, 0, 0, 7),
			Color3.fromRGB(20, 30, 60),
			0,
		);
		pxFundo.ZIndex = 13;
		const pxp = novoQuadro(pxFundo, "Xp", new UDim2(0, 0, 1, 0), new UDim2(0, 0, 0, 0), COR_XP, 0);
		pxp.ZIndex = 14;
		const pnv = novoTexto(placa, "Nv", "Nv 1", 10, COR_TEXTO, new UDim2(1, 0, 0, 10), new UDim2(0, 0, 0, 10));
		pnv.ZIndex = 14;
		const donoLocal = Players.LocalPlayer;
		const pnome = novoTexto(
			placa,
			"Nome",
			donoLocal !== undefined ? donoLocal.Name : "Você",
			10,
			COR_TEXTO,
			new UDim2(1, 0, 0, 10),
			new UDim2(0, 0, 0, 20),
		);
		pnome.ZIndex = 14;
		const ptitulo = novoTexto(placa, "Titulo", "", 9, COR_TEXTO, new UDim2(1, 0, 0, 10), new UDim2(0, 0, 0, 30));
		ptitulo.ZIndex = 14;
		ptitulo.Visible = false;
		framePlayer = p;
		olhoPlayer = olho;
		brilhoPlayer = brilho;
		placaVida = pv;
		placaXp = pxp;
		placaNv = pnv;
		placaTitulo = ptitulo;
	}

	function limparEntidades(): void {
		for (const id of chavesInimigos) {
			const ent = entInimigos[id];
			if (ent !== undefined) {
				ent.frame.Destroy();
			}
		}
		entInimigos = {};
		chavesInimigos = [];
		for (const nome of chavesOutros) {
			const ent = entOutros[nome];
			if (ent !== undefined) {
				ent.frame.Destroy();
			}
		}
		entOutros = {};
		chavesOutros = [];
		for (const id of chavesBalas) {
			const ent = entBalas[id];
			if (ent !== undefined) {
				ent.frame.Destroy();
			}
		}
		entBalas = {};
		chavesBalas = [];
		for (const id of chavesCots) {
			const ent = entCots[id];
			if (ent !== undefined) {
				ent.frame.Destroy();
			}
		}
		entCots = {};
		chavesCots = [];
		inimigosVistos = {};
		for (const t of tiles) {
			t.frame.Visible = false; // sem frame velho: preto até a nova grade chegar
			t.linhaH.Visible = false;
			t.linhaV.Visible = false;
		}
		for (const dc of decalques) {
			dc.Visible = false;
		}
		if (framePlayer !== undefined) {
			framePlayer.Destroy();
			framePlayer = undefined;
			olhoPlayer = undefined;
			haloPlayer1 = undefined;
			haloPlayer2 = undefined;
			hudFlashV = false;
			brilhoPlayer = undefined;
			placaVida = undefined;
			placaXp = undefined;
			placaNv = undefined;
			placaTitulo = undefined;
		}
		barraBossFundo.Visible = false;
		txtBoss.Visible = false;
		txtBossNome.Visible = false;
		ultimaFoto = undefined;
		primeiraFoto = false;
		camPronta = false;
		plRX = 0;
		plRY = 0;
		fx.limpar();
		chat.limpar();
		nivelPendente = 0;
		limparZonas();
		zonaLobby = undefined;
		zonaDwell = 0;
		zonaFired = false;
		esconderFill();
		if (placarAberto) {
			fecharPlacar();
		}
	}

	// Balas e coletáveis por ID (interpolados; somem ao sair do fog)
	function obterBala(id: number, tam: number, amiga: boolean): EntFrame {
		let ent = entBalas[id];
		if (ent === undefined) {
			const f = novoQuadro(
				arena,
				`B${id}`,
				new UDim2(0, tam, 0, tam),
				new UDim2(0, -50, 0, -50),
				amiga ? CLASSES[0].cor : COR_BALA_INIMIGA,
				0,
			);
			f.ZIndex = 7;
			ent = { frame: f, barra: undefined, halo: undefined, rx: 0, ry: 0 };
			entBalas[id] = ent;
			chavesBalas.push(id);
		}
		return ent;
	}

	function obterCot(id: number, tipo: string): EntFrame {
		let ent = entCots[id];
		if (ent === undefined) {
			const f = novoQuadro(
				arena,
				`C${id}`,
				new UDim2(0, 12, 0, 12),
				new UDim2(0, -50, 0, -50),
				tipo === "moeda" ? COR_DESTAQUE : COR_PERIGO,
				0,
			);
			f.ZIndex = 5;
			borda(f, Color3.fromRGB(10, 10, 10), 1);
			ent = { frame: f, barra: undefined, halo: undefined, rx: 0, ry: 0 };
			entCots[id] = ent;
			chavesCots.push(id);
		}
		return ent;
	}

	// ===== Quests / painel (espelho do servidor) =====
	function atualizarQuestsUI(foto: Foto): void {
		for (let i = 0; i < QUESTS.size() && i < linhasQuest.size(); i++) {
			const meta = QUESTS[i];
			let prog = 0;
			let completa = false;
			for (const q of foto.quests) {
				if (q.id === meta.id) {
					prog = q.prog;
					completa = q.completa;
					break;
				}
			}
			const marca = completa ? "[X]" : `[${prog}/${meta.meta}]`;
			linhasQuest[i].Text = `${marca} ${meta.nome}\n${meta.descricao}`;
			linhasQuest[i].TextColor3 = completa ? COR_VIDA : COR_TEXTO;
		}
	}

	function nomeItem(id: string): string {
		const it = ITEM_POR_ID[id];
		return it !== undefined ? it.nome : id;
	}

	function bonusItem(id: string): string {
		const it = ITEM_POR_ID[id];
		if (it === undefined) {
			return "";
		}
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

	function adicionarLinha(texto: string, comBotao: boolean, rotulo: string, aoClicar: () => void): void {
		const linha = novoQuadro(rolagem, `L${proxIdLocal}`, new UDim2(1, -8, 0, 54), new UDim2(0, 0, 0, 0), COR_FUNDO, 0);
		proxIdLocal++;
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
		const foto = ultimaFoto;
		if (painelAberto === undefined || foto === undefined) {
			return;
		}
		limparRolagem();
		if (painelAberto === "tarefas") {
			tituloPainel.Text = "TAREFAS / MISSÕES";
			for (let i = 0; i < QUESTS.size(); i++) {
				const meta = QUESTS[i];
				let prog = 0;
				let completa = false;
				for (const q of foto.quests) {
					if (q.id === meta.id) {
						prog = q.prog;
						completa = q.completa;
						break;
					}
				}
				const marca = completa ? "[X]" : `[${prog}/${meta.meta}]`;
				adicionarLinha(`${marca} ${meta.nome}\n${meta.descricao} | +${meta.xp} XP`, false, "", () => {});
			}
		} else if (painelAberto === "mochila") {
			tituloPainel.Text = `MOCHILA (${foto.mochila.size()}) — $ ${foto.moedas}`;
			if (foto.mochila.size() === 0) {
				adicionarLinha("Mochila vazia — derrote inimigos e complete quests!", false, "", () => {});
			}
			for (const id of foto.mochila) {
				const itemId = id;
				adicionarLinha(
					`${nomeItem(id)} (${NOME_SLOT[ITEM_POR_ID[id].slot]})\n${bonusItem(id)}`,
					true,
					"EQUIPAR",
					() => {
						Remotes.Client.Get("Equipar").SendToServer(itemId);
					},
				);
			}
		} else if (painelAberto === "equip") {
			tituloPainel.Text = `EQUIPADO — dano ${foto.dano} | HP máx ${foto.hpMax}`;
			const slots: [string, string][] = [
				["arma", foto.eqArma],
				["armadura", foto.eqArmadura],
				["acess", foto.eqAcess],
			];
			for (const [slot, eq] of slots) {
				if (eq !== "") {
					const s = slot;
					adicionarLinha(`${NOME_SLOT[slot]}: ${nomeItem(eq)}\n${bonusItem(eq)}`, true, "REMOVER", () => {
						Remotes.Client.Get("Remover").SendToServer(s);
					});
				} else {
					adicionarLinha(`${NOME_SLOT[slot]}: — vazio —`, false, "", () => {});
				}
			}
		} else if (painelAberto === "titulos") {
			tituloPainel.Text = "TÍTULOS";
			for (const t of TITULOS) {
				const tid = t.id;
				let tem = false;
				for (const m of foto.titulos) {
					if (m === tid) {
						tem = true;
						break;
					}
				}
				if (foto.tituloEq === tid) {
					adicionarLinha(`${t.nome} (em uso)\n${t.descricao}`, true, "REMOVER", () => {
						Remotes.Client.Get("Remover").SendToServer("titulo");
					});
				} else if (tem) {
					adicionarLinha(`${t.nome}\n${t.descricao}`, true, "EQUIPAR", () => {
						Remotes.Client.Get("Equipar").SendToServer(tid);
					});
				} else {
					adicionarLinha(`${t.nome} (bloqueado)\n${t.descricao}`, false, "", () => {});
				}
			}
		}
	}

	function abrirPainel(aba: "tarefas" | "mochila" | "equip" | "titulos"): void {
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
	abaTitulos.Activated.Connect(() => abrirPainel("titulos"));
	btnFecharPainel.Activated.Connect(() => fecharPainel());
	btnOpcoes.Activated.Connect(() => {
		if (painelAberto === undefined) {
			abrirPainel("tarefas");
		} else {
			fecharPainel();
		}
	});

	// ===== Lobby: selo MAPAS, triggers e leaderboard =====
	function zonaLobbyEm(tx: number, ty: number): "mapas" | "encant" | "rank" | undefined {
		for (const z of LOBBY_ZONAS) {
			if (tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1) {
				return z.id;
			}
		}
		return undefined;
	}

	function padDaZona(z: ZonaLobby): { wx: number; wy: number; ww: number; wh: number } {
		// Selo pequeno (5x3) centrado na sala — não preenche a área
		const cx = (z.x0 + z.x1) / 2;
		const cy = (z.y0 + z.y1) / 2;
		const x0p = math.floor(cx - 2);
		const y0p = math.floor(cy - 1);
		return { wx: x0p * TILE, wy: y0p * TILE, ww: 5 * TILE, wh: 3 * TILE };
	}

	function construirZonas(): void {
		limparZonas();
		for (const z of LOBBY_ZONAS) {
			const pad = padDaZona(z);
			const rect = novoQuadro(arena, `Z_${z.id}`, new UDim2(0, pad.ww, 0, pad.wh), new UDim2(0, 0, 0, 0), z.cor, 0.6);
			rect.ZIndex = 3;
			borda(rect, COR_TEXTO, 2);
			const rotulo = novoTexto(
				arena,
				`ZL_${z.id}`,
				z.nome,
				15,
				COR_TEXTO,
				new UDim2(0, pad.ww, 0, 26),
				new UDim2(0, 0, 0, 0),
			);
			rotulo.ZIndex = 4;
			zonaFrames.push({ id: z.id, rect: rect, rotulo: rotulo, wx: pad.wx, wy: pad.wy, ww: pad.ww, wh: pad.wh });
		}
	}

	function limparZonas(): void {
		for (const z of zonaFrames) {
			z.rect.Destroy();
			z.rotulo.Destroy();
		}
		zonaFrames.clear();
	}

	function desenharFill(idZona: string, p: number): void {
		let pad: { wx: number; wy: number; ww: number; wh: number } | undefined = undefined;
		for (const z of LOBBY_ZONAS) {
			if (z.id === idZona) {
				pad = padDaZona(z);
				break;
			}
		}
		if (pad === undefined) {
			return;
		}
		const m = 4;
		const x0 = pad.wx - m;
		const y0 = pad.wy - m;
		const w = pad.ww + m * 2;
		const h = pad.wh + m * 2;
		let resto = p * 2 * (w + h);
		const segTop = math.min(resto, w);
		resto -= segTop;
		const segDir = math.min(resto, h);
		resto -= segDir;
		const segBot = math.min(resto, w);
		resto -= segBot;
		const segEsq = math.min(resto, h);
		const barras = [
			[segTop, 6, x0, y0],
			[6, segDir, x0 + w - 6, y0],
			[segBot, 6, x0 + w - segBot, y0 + h - 6],
			[6, segEsq, x0, y0 + h - segEsq],
		];
		for (let k = 0; k < 4; k++) {
			const b = fillBorda[k];
			const s = barras[k];
			b.Size = new UDim2(0, s[0], 0, s[1]);
			b.Position = new UDim2(0, tX(s[2]), 0, tY(s[3]));
			b.Visible = s[0] > 0.5 && s[1] > 0.5;
		}
	}

	function esconderFill(): void {
		for (const b of fillBorda) {
			b.Visible = false;
		}
	}

	function abrirPlacar(): void {
		if (telaPlacar === undefined) {
			const tp = novoQuadro(
				telaJogo,
				"Placar",
				new UDim2(0, 520, 0, 440),
				new UDim2(0.5, -260, 0.5, -220),
				COR_PAINEL,
				0,
			);
			tp.ZIndex = 65;
			tp.Visible = false;
			borda(tp, COR_TEXTO, 3);
			novoTexto(tp, "Titulo", "LEADERBOARDS", 20, COR_TEXTO, new UDim2(1, 0, 0, 32), new UDim2(0, 0, 0, 6));
			const bf = novoBotao(tp, "Fechar", "X", new UDim2(0, 40, 0, 30), new UDim2(1, -50, 0, 6), COR_PAINEL, 14);
			bf.Activated.Connect(() => fecharPlacar());
			colPlacarNv = novoTexto(
				tp,
				"CNv",
				"NÍVEL\ncarregando...",
				12,
				COR_TEXTO,
				new UDim2(0, 150, 0, 370),
				new UDim2(0, 14, 0, 44),
			);
			colPlacarKill = novoTexto(
				tp,
				"CKill",
				"MATANÇA\ncarregando...",
				12,
				COR_TEXTO,
				new UDim2(0, 150, 0, 370),
				new UDim2(0, 185, 0, 44),
			);
			colPlacarMoeda = novoTexto(
				tp,
				"CMoed",
				"MOEDAS\ncarregando...",
				12,
				COR_TEXTO,
				new UDim2(0, 150, 0, 370),
				new UDim2(0, 356, 0, 44),
			);
			for (const col of [colPlacarNv, colPlacarKill, colPlacarMoeda]) {
				if (col !== undefined) {
					col.TextXAlignment = Enum.TextXAlignment.Left;
					col.TextYAlignment = Enum.TextYAlignment.Top;
					col.TextWrapped = true;
				}
			}
			telaPlacar = tp;
		}
		placarAberto = true;
		const tp2 = telaPlacar;
		if (tp2 !== undefined) {
			tp2.Visible = true;
		}
	}

	function fecharPlacar(): void {
		placarAberto = false;
		const tp = telaPlacar;
		if (tp !== undefined) {
			tp.Visible = false;
		}
	}

	function preencherPlacar(dados: PlacarDados): void {
		const monta = (linhas: { nome: string; valor: number }[]): string => {
			if (linhas.size() === 0) {
				return "— vazio —";
			}
			const partes: string[] = [];
			for (let i = 0; i < linhas.size() && i < 20; i++) {
				partes.push(`${i + 1}. ${linhas[i].nome} — ${linhas[i].valor}`);
			}
			return partes.join("\n");
		};
		if (colPlacarNv !== undefined) {
			colPlacarNv.Text = `NÍVEL\n${monta(dados.nivel)}`;
		}
		if (colPlacarKill !== undefined) {
			colPlacarKill.Text = `MATANÇA\n${monta(dados.kills)}`;
		}
		if (colPlacarMoeda !== undefined) {
			colPlacarMoeda.Text = `MOEDAS\n${monta(dados.moedas)}`;
		}
	}

	// ===== Loop de render =====
	function suavizar(ent: EntFrame, x: number, y: number, dt: number, forca = 14): void {
		if (ent.rx === 0 && ent.ry === 0) {
			ent.rx = x;
			ent.ry = y;
			return;
		}
		const k = 1 - math.exp(-forca * dt);
		ent.rx += (x - ent.rx) * k;
		ent.ry += (y - ent.ry) * k;
	}

	RunService.Heartbeat.Connect((dt) => {
		tempo += dt;
		if (dt > 0.1) {
			dt = 0.1;
		}
		// Envia input quando muda (servidor simula; cliente não decide nada)
		if (estado === "jogo") {
			let mx = 0;
			let my = 0;
			let ax = 0;
			let ay = 0;
			if (painelAberto === undefined) {
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
				if (mx !== 0 && my !== 0) {
					const m = math.sqrt(mx * mx + my * my);
					mx /= m;
					my /= m;
				}
				// Mira do mouse em coordenadas da arena
				const mouse = UserInputService.GetMouseLocation();
				const [inset] = GuiService.GetGuiInset();
				const ddx = mouse.X - (px - camX);
				const ddy = mouse.Y - inset.Y - (py - camY);
				const dd = math.sqrt(ddx * ddx + ddy * ddy);
				if (dd > 2) {
					ax = math.floor((ddx / dd) * 20 + 0.5) / 20;
					ay = math.floor((ddy / dd) * 20 + 0.5) / 20;
				}
			}
			const fogoEff = painelAberto === undefined && fogoMouse;
			envT += dt;
			if (
				mx !== envDx ||
				my !== envDy ||
				ax !== envAx ||
				ay !== envAy ||
				fogoEff !== envFogo ||
				autoTiro !== envAuto ||
				(fogoEff && envT > 0.2)
			) {
				envDx = mx;
				envDy = my;
				envAx = ax;
				envAy = ay;
				envFogo = fogoEff;
				envAuto = autoTiro;
				envT = 0;
				enviarEntrada(mx, my, ax, ay, fogoEff, autoTiro, false);
			}
		}
		if (estado !== "jogo") {
			return;
		}
		const foto = ultimaFoto;
		garantirPoolTiles();
		if (foto === undefined) {
			return;
		}
		// Câmera com dead zone: o jogador anda livre no centro da tela e a
		// câmera só acompanha (suavizada) ao encostar nas margens — sem travas
		// de borda: no limite do mundo aparece Rocha
		if (!camPronta) {
			camPronta = true;
			camX = foto.px - vistaL / 2;
			camY = foto.py - vistaA / 2;
		} else {
			const margemX = vistaL * 0.3;
			const margemCima = vistaA * 0.3 + 80; // folga do HUD do topo + placa do jogador
			const margemBaixo = vistaA * 0.3 + 24; // folga da linha de debug
			let alvoX = camX;
			let alvoY = camY;
			const sx = foto.px - camX;
			const sy = foto.py - camY;
			if (sx < margemX) {
				alvoX = foto.px - margemX;
			} else if (sx > vistaL - margemX) {
				alvoX = foto.px - (vistaL - margemX);
			}
			if (sy < margemCima) {
				alvoY = foto.py - margemCima;
			} else if (sy > vistaA - margemBaixo) {
				alvoY = foto.py - (vistaA - margemBaixo);
			}
			const k = 1 - math.exp(-8 * dt);
			camX += (alvoX - camX) * k;
			camY += (alvoY - camY) * k;
		}
		// Lanterna: alcance curto + cone na mira do mouse (clarão = 360° breve)
		const lampRange = foto.flash ? ALCANCE_CLARAO : ALCANCE_LAMP;
		const lampWide = foto.flash || semFog;
		const lampFx = semFog ? 1 : foto.fx;
		const lampFy = semFog ? 0 : foto.fy;
		debug.profilebegin("PQ_Explorado");
		marcarExplorado(lampFx, lampFy, semFog ? VISAO : lampRange, lampWide);
		debug.profileend();
		debug.profilebegin("PQ_Tiles");
		desenharTiles(lampFx, lampFy, lampRange, lampWide);
		debug.profileend();
		// Sangue verde e corpos no chão (só o iluminado desce no snapshot)
		for (let k = 0; k < decalques.size(); k++) {
			const dc = decalques[k];
			if (k < foto.manchas.size()) {
				const m = foto.manchas[k];
				dc.Size = new UDim2(0, m.tam, 0, m.tam);
				dc.Position = new UDim2(0, tX(m.x) - m.tam / 2, 0, tY(m.y) - m.tam / 2);
				dc.BackgroundColor3 = new Color3(m.r / 255, m.g / 255, m.b / 255);
				dc.Visible = true;
			} else if (dc.Visible) {
				dc.Visible = false;
			}
		}

		// Zonas do lobby: ficar 3s no selo preenche a borda e abre (sair cancela)
		if (foto.lobby) {
			const zona = zonaLobbyEm(math.floor(foto.px / TILE), math.floor(foto.py / TILE));
			if (zona !== zonaLobby) {
				zonaLobby = zona;
				zonaDwell = 0;
				zonaFired = false;
				esconderFill();
				if (zona === undefined && placarAberto) {
					fecharPlacar();
				}
			}
			if (zonaLobby !== undefined && !zonaFired) {
				zonaDwell += dt;
				const prog = math.min(zonaDwell / 3, 1);
				desenharFill(zonaLobby, prog);
				if (prog >= 1) {
					zonaFired = true;
					esconderFill();
					if (zonaLobby === "mapas") {
						abrirSeletor();
					} else if (zonaLobby === "encant") {
						mostrarBanner("ENCANTAMENTO — EM BREVE! Novos poderes a caminho...", 2.5);
					} else if (zonaLobby === "rank") {
						Remotes.Client.Get("Placar").SendToServer();
						abrirPlacar();
					}
				}
			}
			for (const z of zonaFrames) {
				z.rect.Position = new UDim2(0, tX(z.wx), 0, tY(z.wy));
				z.rotulo.Position = new UDim2(0, tX(z.wx), 0, tY(z.wy) + z.wh / 2 - 14);
			}
		}

		// Jogador local
		garantirPlayer();
		if (framePlayer !== undefined) {
			// Sprite suavizado (interpola entre snapshots de 20Hz); a câmera e
			// o fog continuam na posição real do servidor (sem lag de sim)
			if (plRX === 0 && plRY === 0) {
				plRX = foto.px;
				plRY = foto.py;
			} else {
				const kp = 1 - math.exp(-20 * dt);
				plRX += (foto.px - plRX) * kp;
				plRY += (foto.py - plRY) * kp;
			}
			const sx = tX(plRX) - 10;
			const sy = tY(plRY) - 10;
			framePlayer.Position = new UDim2(0, sx, 0, sy);
			if (placaVida !== undefined) {
				const fVida = foto.hp / foto.hpMax;
				if (fVida !== plVida) {
					plVida = fVida;
					placaVida.Size = new UDim2(fVida < 0 ? 0 : fVida, 0, 1, 0);
				}
			}
			if (placaXp !== undefined) {
				const fXp = foto.xp / foto.xpProx;
				if (fXp !== plXp) {
					plXp = fXp;
					placaXp.Size = new UDim2(fXp > 1 ? 1 : fXp, 0, 1, 0);
				}
			}
			if (placaNv !== undefined && foto.nivel !== plNv) {
				plNv = foto.nivel;
				placaNv.Text = `Nv ${foto.nivel}`;
			}
			// Clarão do disparo: halo pulsa junto com a luz
			if (foto.flash !== hudFlashV) {
				hudFlashV = foto.flash;
				if (haloPlayer1 !== undefined) {
					haloPlayer1.BackgroundTransparency = foto.flash ? 0.45 : 0.8;
				}
				if (haloPlayer2 !== undefined) {
					haloPlayer2.BackgroundTransparency = foto.flash ? 0.6 : 0.9;
				}
			}
			let nomeTitulo = "";
			if (foto.tituloEq !== "") {
				for (const t of TITULOS) {
					if (t.id === foto.tituloEq) {
						nomeTitulo = t.nome;
						break;
					}
				}
			}
			if (placaTitulo !== undefined && nomeTitulo !== plTitulo) {
				plTitulo = nomeTitulo;
				placaTitulo.Text = nomeTitulo;
				placaTitulo.Visible = nomeTitulo !== "";
			}
			if (olhoPlayer !== undefined) {
				// Olho orbita 360°: segue a direção analógica do movimento
				olhoPlayer.Position = new UDim2(0, 7 + foto.fx * 4, 0, 7 + foto.fy * 4);
			}
		}

		debug.profilebegin("PQ_Entidades");
		// Inimigos visíveis (fog aplicado no servidor)
		const vistos: { [id: number]: boolean } = {};
		for (const e of foto.inimigos) {
			vistos[e.id] = true;
			const ent = obterInimigo(
				e.id,
				e.tam,
				new Color3(e.r / 255, e.g / 255, e.b / 255),
				e.nv,
				e.boss ? Color3.fromRGB(255, 60, 60) : undefined,
			);
			ent.frame.BackgroundColor3 = new Color3(e.r / 255, e.g / 255, e.b / 255);
			suavizar(ent, e.x, e.y, dt);
			ent.frame.Position = new UDim2(0, tX(ent.rx) - e.tam / 2, 0, tY(ent.ry) - e.tam / 2);
			ent.frame.Visible = true;
			if (ent.barra !== undefined) {
				const fr = e.hp / e.hpMax;
				ent.barra.Size = new UDim2(fr < 0 ? 0 : fr, 0, 0, 4);
			}
		}
		for (const id of chavesInimigos) {
			if (!vistos[id]) {
				const ent = entInimigos[id];
				if (ent !== undefined) {
					ent.frame.Visible = false;
				}
			}
		}

		// Outros jogadores visíveis
		const nomesVistos: { [nome: string]: boolean } = {};
		for (const j of foto.jogadores) {
			nomesVistos[j.nome] = true;
			const ent = obterOutro(j.nome);
			suavizar(ent, j.x, j.y, dt);
			ent.frame.Position = new UDim2(0, tX(ent.rx) - 9, 0, tY(ent.ry) - 9);
			ent.frame.Visible = true;
			if (ent.halo !== undefined) {
				ent.halo.BackgroundTransparency = j.flash ? 0.45 : 0.82;
			}
		}
		for (const nome of chavesOutros) {
			if (!nomesVistos[nome]) {
				const ent = entOutros[nome];
				if (ent !== undefined) {
					ent.frame.Visible = false;
				}
			}
		}

		// Balas e coletáveis por ID (interpolados como o resto)
		const balasVistas: { [id: number]: boolean } = {};
		for (const b of foto.balas) {
			balasVistas[b.id] = true;
			const ent = obterBala(b.id, b.tam, b.amiga);
			suavizar(ent, b.x, b.y, dt, 30);
			ent.frame.Position = new UDim2(0, tX(ent.rx) - b.tam / 2, 0, tY(ent.ry) - b.tam / 2);
			ent.frame.Visible = true;
		}
		for (let k = chavesBalas.size() - 1; k >= 0; k--) {
			const id = chavesBalas[k];
			if (!balasVistas[id]) {
				const ent = entBalas[id];
				if (ent !== undefined) {
					ent.frame.Destroy();
				}
				delete entBalas[id];
				chavesBalas.remove(k);
			}
		}
		const cotsVistos: { [id: number]: boolean } = {};
		for (const cot of foto.cots) {
			cotsVistos[cot.id] = true;
			const ent = obterCot(cot.id, cot.tipo);
			suavizar(ent, cot.x, cot.y, dt, 18);
			ent.frame.Position = new UDim2(0, tX(ent.rx) - 6, 0, tY(ent.ry) - 6);
			ent.frame.Visible = true;
		}
		for (let k = chavesCots.size() - 1; k >= 0; k--) {
			const id = chavesCots[k];
			if (!cotsVistos[id]) {
				const ent = entCots[id];
				if (ent !== undefined) {
					ent.frame.Destroy();
				}
				delete entCots[id];
				chavesCots.remove(k);
			}
		}

		debug.profileend(); // PQ_Entidades
		fx.atualizar(dt, px, py, tX, tY, tempo, framePlayer);
		chat.atualizar(dt, posicaoBalao);

		if (bannerT > 0) {
			bannerT -= dt;
			if (bannerT <= 0) {
				banner.Visible = false;
			}
		}

		// HUD (só reescreve o que mudou: texto refeito custa rasterização)
		if (foto.moedas !== hudMoedas) {
			hudMoedas = foto.moedas;
			txtMoedas.Text = `$ ${foto.moedas}`;
		}
		const ondaTxt = foto.lobby
			? "LOBBY"
			: foto.mapaIdx === 1
				? "HOSPITAL"
				: foto.bossFracao >= 0
					? "BOSS!"
					: `ÁREA ${foto.area + 1}`;
		if (ondaTxt !== hudOnda) {
			hudOnda = ondaTxt;
			txtOnda.Text = ondaTxt;
		}
		if (foto.pausado !== hudPausa) {
			hudPausa = foto.pausado;
			rotuloPausa.Visible = foto.pausado;
		}
		const temBoss = foto.bossFracao >= 0;
		if (temBoss !== hudBossV) {
			hudBossV = temBoss;
			barraBossFundo.Visible = temBoss;
			txtBoss.Visible = temBoss;
			txtBossNome.Visible = temBoss;
		}
		if (temBoss) {
			barraBoss.Size = new UDim2(foto.bossFracao, 0, 1, 0);
			const txtHp = `${foto.bossHp}/${foto.bossMax}`;
			if (txtHp !== hudBossTxt) {
				hudBossTxt = txtHp;
				txtBoss.Text = txtHp;
			}
		}
		dbgT += dt;
		if (dbgT >= 0.1) {
			dbgT = 0;
			const idadeFoto = tempo - ultimoFotoT;
			rotuloDebug.Text = `IN ${string.format("%.1f", envDx)},${string.format("%.1f", envDy)} | SV ${math.floor(foto.px)},${math.floor(foto.py)} | F ${string.format("%.1f", idadeFoto)}s | SEED ${semente}`;
			rotuloDebug.TextColor3 = idadeFoto > 2 ? COR_PERIGO : COR_TEXTO;
		}
	});

	entrarNoLobby();
	print("[PixelQuest] Cliente renderer pronto (tudo simulado no servidor).");
}
