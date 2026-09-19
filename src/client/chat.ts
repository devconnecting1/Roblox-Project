/**
 * Chat (CLIENTE) — balõezinhos 2D sobre os jogadores.
 *
 * O jogo não tem personagens 3D (só UI), então o balão nativo não tem onde
 * grudar: ouvimos `MessageReceived` e desenhamos nossos próprios balões sobre
 * os sprites. Regra de privacidade: balão SÓ no canal geral (`RBXGeneral`,
 * visível para todos); mensagem privada (sussurro/canal fechado) não gera
 * balão. A janela/histórico do chat continua sendo a nativa (TextChatService).
 */
import { Players, TextChatService } from "@rbxts/services";
import { borda, novoTexto, COR_PAINEL, COR_TEXTO } from "./ui";

const DURACAO_BALAO = 5;

interface Balao {
	quadro: Frame;
	texto: TextLabel;
	nome: string;
	meiaLarg: number;
	vida: number;
}

export interface ChatHandle {
	atualizar: (dt: number, posDe: (nome: string) => [number, number] | undefined) => void;
	limpar: () => void;
}

export function criarChat(telaJogo: Frame): ChatHandle {
	const balaos: Balao[] = [];
	const porJogador: { [nome: string]: Balao | undefined } = {};

	TextChatService.MessageReceived.Connect((msg) => {
		if (msg.Status !== Enum.TextChatMessageStatus.Success) {
			return;
		}
		const canal = msg.TextChannel;
		if (canal === undefined || canal.Name !== "RBXGeneral") {
			return; // privado/equipe: sem balão
		}
		const fonte = msg.TextSource;
		if (fonte === undefined) {
			return;
		}
		const jogador = Players.GetPlayerByUserId(fonte.UserId);
		const nome = jogador !== undefined ? jogador.Name : fonte.Name;
		let texto = msg.Text;
		if (texto === "") {
			return;
		}
		if (texto.size() > 140) {
			texto = texto.sub(1, 140) + "…";
		}
		const anterior = porJogador[nome];
		if (anterior !== undefined) {
			anterior.quadro.Destroy();
			const idx = balaos.indexOf(anterior);
			if (idx >= 0) {
				balaos[idx] = balaos[balaos.size() - 1];
				balaos.pop();
			}
		}
		const larg = math.clamp(50 + texto.size() * 6, 60, 240);
		const quadro = new Instance("Frame");
		quadro.Name = `Balao_${nome}`;
		quadro.Size = new UDim2(0, larg, 0, 38);
		quadro.Position = new UDim2(0, -500, 0, -500);
		quadro.BackgroundColor3 = COR_PAINEL;
		quadro.BackgroundTransparency = 0;
		quadro.BorderSizePixel = 0;
		quadro.ZIndex = 56;
		quadro.Visible = false;
		quadro.Parent = telaJogo;
		borda(quadro, COR_TEXTO, 2);
		const rot = novoTexto(
			quadro,
			"Msg",
			`${nome}: ${texto}`,
			13,
			COR_TEXTO,
			new UDim2(1, -12, 1, -8),
			new UDim2(0, 6, 0, 4),
		);
		rot.TextXAlignment = Enum.TextXAlignment.Left;
		rot.TextWrapped = true;
		rot.ZIndex = 57;
		const balao: Balao = { quadro: quadro, texto: rot, nome: nome, meiaLarg: larg / 2, vida: DURACAO_BALAO };
		balaos.push(balao);
		porJogador[nome] = balao;
	});

	function atualizar(dt: number, posDe: (nome: string) => [number, number] | undefined): void {
		for (let i = balaos.size() - 1; i >= 0; i--) {
			const b = balaos[i];
			b.vida -= dt;
			if (b.vida <= 0) {
				b.quadro.Destroy();
				balaos[i] = balaos[balaos.size() - 1];
				balaos.pop();
				if (porJogador[b.nome] === b) {
					porJogador[b.nome] = undefined;
				}
				continue;
			}
			const pos = posDe(b.nome);
			if (pos === undefined) {
				b.quadro.Visible = false;
				continue;
			}
			b.quadro.Visible = true;
			b.quadro.Position = new UDim2(0, pos[0] - b.meiaLarg, 0, pos[1]);
			const transp = b.vida < 1 ? 1 - b.vida : 0;
			b.quadro.BackgroundTransparency = transp;
			b.texto.TextTransparency = transp;
		}
	}

	function limpar(): void {
		for (const b of balaos) {
			b.quadro.Destroy();
			porJogador[b.nome] = undefined;
		}
		balaos.clear();
	}

	return { atualizar: atualizar, limpar: limpar };
}
