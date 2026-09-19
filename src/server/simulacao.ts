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
import { acharChaoPerto, gerarMundo, gradeStrings } from "./mundo";
import { garantirLeaderstats, mundo, nivelConta } from "./estado";
import { atualizarCots, atualizarJogadores, novoJogador } from "./jogadores";
import { atualizarInimigos, spawnPack } from "./inimigos";
import { atualizarBalas } from "./projeteis";
import { enviar, enviarSnapshots } from "./foto";

function novaMasmorra(): void {
	const gen = gerarMundo();
	mundo.portas = gen.portas;
	mundo.nasc = gen.nasc;
	mundo.areasLimpas = [false, false, false, false, false];
	mundo.vivosPorArea = [0, 0, 0, 0, 0];
	mundo.inimigos = [];
	mundo.balas = [];
	mundo.cots = [];
	mundo.bossVivo = false;
	mundo.bossMorto = false;
	mundo.tempo = 0;
	mundo.ativo = true;
	// Seed estilo Minecraft: mesma seed = mesma masmorra (reproduzível p/ debug)
	mundo.seed = math.random(1, 999999);
	math.randomseed(mundo.seed);
	// Só a área 0 nasce com a masmorra; as demais surgem ao liberar a anterior
	spawnPack(0);
	print(`[PixelQuest] Masmorra gerada: ${mundo.inimigos.size()} inimigos, ${mundo.portas.size()} portas.`);
}

function spawnJogadorEm(player: Player, nasc: [number, number]): void {
	garantirLeaderstats(player);
	const [nx, ny] = acharChaoPerto(nasc[0], nasc[1], 12);
	const js = novoJogador(player, [nx, ny]);
	mundo.jogadores.set(player, js);
	enviar(player, { tipo: "mapa", grade: gradeStrings(), seed: mundo.seed });
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
	if (!mundo.ativo || mundo.bossMorto) {
		novaMasmorra();
	}
	// Entra na dungeon atual (sem regen p/ quem já está jogando)
	spawnJogadorEm(player, mundo.nasc);
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
	atualizarJogadores(dt);
	atualizarInimigos(dt);
	atualizarBalas(dt);
	atualizarCots(dt);
	enviarSnapshots(dt);
}
