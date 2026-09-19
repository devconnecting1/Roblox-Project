/**
 * UI (CLIENTE) — construtores de interface + fonte + paleta.
 *
 * Puro e sem estado: telas e render importam daqui. Nada de jogo aqui.
 */
import { COR_TILE } from "shared/pixelquest/Dados";

// ---------- Cores ----------
export const COR_FUNDO = Color3.fromRGB(13, 17, 23);
export const COR_PAINEL = Color3.fromRGB(28, 34, 46);
export const COR_TEXTO = Color3.fromRGB(240, 246, 252);
export const COR_DESTAQUE = Color3.fromRGB(255, 213, 74);
export const COR_PERIGO = Color3.fromRGB(231, 76, 60);
export const COR_VIDA = Color3.fromRGB(46, 204, 113);
export const COR_XP = Color3.fromRGB(88, 140, 255);
export const COR_BALA_INIMIGA = Color3.fromRGB(255, 70, 180);
export const COR_DESCONHECIDO = Color3.fromRGB(8, 10, 14);
export const TOPO_Y = 36; // abaixo da topbar nativa do Roblox

export const COR_ESCURA: { [chave: string]: Color3 } = {};
for (const ch of ["W", "~", ".", ",", "G", "T", "*", "R", "D"]) {
	const cor = COR_TILE[ch];
	COR_ESCURA[ch] = new Color3(cor.R * 0.32, cor.G * 0.32, cor.B * 0.32);
}

// ---------- Fonte ----------
const FONTE_ID = 0;
export function fonteJogo(peso: Enum.FontWeight): Font {
	if (FONTE_ID > 0) {
		return Font.fromId(FONTE_ID, peso);
	}
	// fromEnum usa a fonte embutida (sem baixar families JSON — evita o
	// "Gotham.json failed to load" no Studio)
	if (peso === Enum.FontWeight.ExtraBold) {
		return Font.fromEnum(Enum.Font.GothamBlack);
	}
	return Font.fromEnum(Enum.Font.GothamBold);
}
export function contornoTexto(inst: TextLabel | TextButton): void {
	const s = new Instance("UIStroke");
	s.Color = Color3.fromRGB(10, 12, 16);
	s.Thickness = 2;
	s.Transparency = 0.25;
	s.Parent = inst;
}

// ---------- Helpers de UI ----------
export function borda(inst: GuiObject, cor: Color3, grossura: number): void {
	const s = new Instance("UIStroke");
	s.Color = cor;
	s.Thickness = grossura;
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
	s.Parent = inst;
}

export function novoQuadro(pai: Instance, nome: string, tam: UDim2, pos: UDim2, cor: Color3, transp: number): Frame {
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

export function novoTexto(
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

export function novoBotao(
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
