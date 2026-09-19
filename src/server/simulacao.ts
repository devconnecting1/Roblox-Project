/**
 * Simulação autoritativa (SERVIDOR) — orquestrador do ciclo de jogo.
 *
 * Anti-cheat: posição, vida, dano, inimigos, loot, portas e quests são
 * calculados no servidor. O cliente envia só inputs (validados) e recebe
 * snapshots filtrados pelo Fog of War. Um mundo compartilhado por servidor
 * (estilo MMO): áreas 0–3 liberam portas ao limpar; área 4 tem o boss.
 *
 * Domínios (um arquivo por responsabilidade):
 * `estado` (tipos+mundo) ← `visao`, `foto`, `jogadores`, `inimigos`,
 * `projeteis` ← este orquestrador (`novaMasmorra`, `escolherMapa`, `atualizar`).
 */
import { MAPAS } from "shared/pixelquest/Dados";
import { Porta, acharChaoPerto, definirGrade, gerarLobby, gerarMundo, gradeStrings } from "./mundo";
import { garantirLeaderstats, mundo, nivelConta } from "./estado";
import { atualizarCots, atualizarJogadores, novoJogador } from "./jogadores";
import { titulosSalvos } from "./save";
import { atualizarInimigos, spawnPack } from "./inimigos";
import { atualizarBalas } from "./projeteis";
import { difundir, enviar, enviarSnapshots } from "./foto";

interface DungeonPronta {
	portas: Porta[];
	nasc: [number, number];
	seed: number;
	linhas: string[];
}

// Próxima dungeon pré-gerada na vitória (DeNovo instantâneo, sem travar a party)
let staging: DungeonPronta | undefined = undefined;

function prepararDungeon(): DungeonPronta {
	const gen = gerarMundo();
	const seed = math.random(1, 999999);
	math.randomseed(seed);
	return { portas: gen.portas, nasc: gen.nasc, seed: seed, linhas: gradeStrings() };
}

function aplicarDungeon(d: DungeonPronta): void {
	mundo.portas = d.portas;
	mundo.nasc = d.nasc;
	mundo.modo = "dungeon";
	mundo.seed = d.seed;
	definirGrade(d.linhas);
	mundo.areasLimpas = [false, false, false, false, false];
	mundo.vivosPorArea = [0, 0, 0, 0, 0];
	mundo.inimigos = [];
	mundo.balas = [];
	mundo.cots = [];
	mundo.bossVivo = false;
	mundo.bossMorto = false;
	mundo.tempo = 0;
	mundo.ativo = true;
	// Só a área 0 nasce com a masmorra; as demais surgem ao liberar a anterior
	spawnPack(0);
	print(`[PixelQuest] Masmorra gerada: ${mundo.inimigos.size()} inimigos, ${mundo.portas.size()} portas.`);
}

function novaMasmorra(lobby: boolean): void {
	staging = undefined;
	if (lobby) {
		const gen = gerarLobby();
		mundo.portas = gen.portas;
		mundo.nasc = gen.nasc;
		mundo.modo = "lobby";
		mundo.areasLimpas = [false, false, false, false, false];
		mundo.vivosPorArea = [0, 0, 0, 0, 0];
		mundo.inimigos = [];
		mundo.balas = [];
		mundo.cots = [];
		mundo.bossVivo = false;
		mundo.bossMorto = false;
		mundo.tempo = 0;
		mundo.ativo = true;
		print("[PixelQuest] Lobby gerado.");
	} else {
		aplicarDungeon(prepararDungeon());
	}
}

/** Leva a party inteira ao nascimento do mundo atual (troca lobby⇄dungeon). */
function teleportarTodos(texto: string): void {
	for (const [, js] of mundo.jogadores) {
		const [nx, ny] = acharChaoPerto(mundo.nasc[0], mundo.nasc[1], 12);
		js.x = nx;
		js.y = ny;
		js.dirX = 0;
		js.dirY = 0;
		js.morto = false;
		js.pausado = false;
		js.hp = js.hpMax;
		enviar(js.player, { tipo: "mapa", grade: gradeStrings(), seed: mundo.seed, lobby: mundo.modo === "lobby" });
	}
	difundir({ tipo: "banner", texto: texto, duracao: 2.5 });
}

function spawnJogadorEm(player: Player, nasc: [number, number]): void {
	garantirLeaderstats(player);
	const [nx, ny] = acharChaoPerto(nasc[0], nasc[1], 12);
	const js = novoJogador(player, [nx, ny]);
	const [tit, eq] = titulosSalvos(player);
	js.titulos = [...tit];
	js.tituloEq = eq;
	mundo.jogadores.set(player, js);
	enviar(player, { tipo: "mapa", grade: gradeStrings(), seed: mundo.seed, lobby: mundo.modo === "lobby" });
	enviar(player, { tipo: "banner", texto: "MASMORRA INICIAL — explore as salas!", duracao: 2.5 });
	print(`[PixelQuest] ${player.Name} entrou na run.`);
}

/** Entrada na run (validação de mapa/nível é anti-cheat de verdade). */
export function escolherMapa(player: Player, mapa: number): void {
	if (mapa !== 0) {
		return; // só o Mapa 1 existe por enquanto
	}
	if (mapa >= MAPAS.size() || nivelConta(player) < MAPAS[mapa].reqNivel) {
		return;
	}
	consumirStaging();
	teleportarTodos(`${player.Name} iniciou a run!`);
	print(`[PixelQuest] ${player.Name} escolheu o mapa ${mapa} (party junto).`);
}

function consumirStaging(): void {
	if (staging !== undefined) {
		const d = staging;
		staging = undefined;
		aplicarDungeon(d);
	} else {
		novaMasmorra(false);
	}
}

/** Entrar no mundo atual (lobby na primeira vez; quem chega depois cai onde está). */
export function entrarJogo(player: Player): void {
	if (!mundo.ativo) {
		novaMasmorra(true);
	}
	spawnJogadorEm(player, mundo.nasc);
}

/** Voltar ao lobby (regen + party junto). */
export function voltarLobby(player: Player): void {
	novaMasmorra(true);
	teleportarTodos(`${player.Name} voltou ao lobby!`);
}

export function atualizar(dt: number): void {
	if (!mundo.ativo || mundo.jogadores.size() === 0) {
		return; // sem jogadores, sem simulação (economiza CPU)
	}
	// Sem pausa global: cada jogador pausa só o seu (multiplayer)
	if (dt > 0.1) {
		dt = 0.1;
	}
	mundo.tempo += dt;
	if (mundo.bossMorto && staging === undefined) {
		staging = prepararDungeon(); // vitória: próxima run já nasce pronta
	}
	atualizarJogadores(dt);
	atualizarInimigos(dt);
	atualizarBalas(dt);
	atualizarCots(dt);
	enviarSnapshots(dt);
}
