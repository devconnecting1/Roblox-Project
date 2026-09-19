/**
 * Casa de teste 3D — construída 100% via código (roblox-ts).
 *
 * Como usar no Studio via Rojo:
 * 1. `npm run watch` (rbxtsc -w)
 * 2. `rojo serve` e conectar o plugin no Studio
 * 3. O script `src/server/main.server.ts` chama `construirCasa()`
 *    e a casa aparece na Workspace como Model "CasaTeste".
 */

function criarParte(props: {
	nome: string;
	tamanho: Vector3;
	posicao: Vector3;
	cor: BrickColor;
	material: Enum.Material;
	forma?: Enum.PartType;
	transparencia?: number;
	orientacao?: Vector3;
	ancorado?: boolean;
	pai: Instance;
}): Part {
	const parte = new Instance("Part");
	parte.Name = props.nome;
	parte.Size = props.tamanho;
	parte.Position = props.posicao;
	parte.BrickColor = props.cor;
	parte.Material = props.material;
	parte.Anchored = props.ancorado ?? true;
	parte.CanCollide = true;
	if (props.forma !== undefined) {
		parte.Shape = props.forma;
	}
	if (props.transparencia !== undefined) {
		parte.Transparency = props.transparencia;
	}
	if (props.orientacao !== undefined) {
		parte.Orientation = props.orientacao;
	}
	parte.Parent = props.pai;
	return parte;
}

function criarCunha(props: {
	nome: string;
	tamanho: Vector3;
	posicao: Vector3;
	cor: BrickColor;
	material: Enum.Material;
	orientacao?: Vector3;
	pai: Instance;
}): WedgePart {
	const cunha = new Instance("WedgePart");
	cunha.Name = props.nome;
	cunha.Size = props.tamanho;
	cunha.Position = props.posicao;
	cunha.BrickColor = props.cor;
	cunha.Material = props.material;
	cunha.Anchored = true;
	cunha.CanCollide = true;
	if (props.orientacao !== undefined) {
		cunha.Orientation = props.orientacao;
	}
	cunha.Parent = props.pai;
	return cunha;
}

export interface CasaConfig {
	/** Posição central da casa no mundo. */
	centro?: Vector3;
	/** Largura (X), Altura paredes (Y), Profundidade (Z). */
	largura?: number;
	alturaParede?: number;
	profundidade?: number;
}

/**
 * Constrói a casa de teste dentro da `Workspace`.
 * Se já existir um Model "CasaTeste", ele é removido antes (idempotente).
 */
export function construirCasa(config: CasaConfig = {}): Model {
	const centro = config.centro ?? new Vector3(0, 0, 0);
	const L = config.largura ?? 24;
	const H = config.alturaParede ?? 8;
	const P = config.profundidade ?? 16;
	const T = 1; // espessura das paredes

	const workspace = game.GetService("Workspace");

	// Remove versão antiga (re-build limpo a cada Play / sync do Rojo)
	const antiga = workspace.FindFirstChild("CasaTeste");
	if (antiga !== undefined) {
		antiga.Destroy();
	}

	const casa = new Instance("Model");
	casa.Name = "CasaTeste";

	const bx = centro.X;
	const bz = centro.Z;

	// ---------- Base / fundação ----------
	criarParte({
		nome: "Fundacao",
		tamanho: new Vector3(L + 6, 1, P + 6),
		posicao: new Vector3(bx, 0.5, bz),
		cor: new BrickColor("Medium stone grey"),
		material: Enum.Material.Concrete,
		pai: casa,
	});

	// ---------- Piso ----------
	criarParte({
		nome: "Piso",
		tamanho: new Vector3(L, 0.5, P),
		posicao: new Vector3(bx, 1.25, bz),
		cor: new BrickColor("Reddish brown"),
		material: Enum.Material.WoodPlanks,
		pai: casa,
	});

	const yParede = 1.5 + H / 2; // piso termina em y=1.5

	// ---------- Paredes (4x) ----------
	criarParte({
		nome: "Parede_Frente",
		tamanho: new Vector3(L, H, T),
		posicao: new Vector3(bx, yParede, bz + P / 2),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		pai: casa,
	});
	criarParte({
		nome: "Parede_Tras",
		tamanho: new Vector3(L, H, T),
		posicao: new Vector3(bx, yParede, bz - P / 2),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		pai: casa,
	});
	criarParte({
		nome: "Parede_Esquerda",
		tamanho: new Vector3(T, H, P),
		posicao: new Vector3(bx - L / 2, yParede, bz),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		pai: casa,
	});
	criarParte({
		nome: "Parede_Direita",
		tamanho: new Vector3(T, H, P),
		posicao: new Vector3(bx + L / 2, yParede, bz),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		pai: casa,
	});

	// ---------- Telhado (2 águas) ----------
	// Cumeeira ao longo do eixo Z, painéis inclinados no eixo X.
	const yTelhado = 1.5 + H + 2;
	criarParte({
		nome: "Telhado_Esquerdo",
		tamanho: new Vector3(L / 2 + 3, 0.5, P + 4),
		posicao: new Vector3(bx - L / 4, yTelhado, bz),
		cor: new BrickColor("Really red"),
		material: Enum.Material.Slate,
		orientacao: new Vector3(0, 0, 28),
		pai: casa,
	});
	criarParte({
		nome: "Telhado_Direito",
		tamanho: new Vector3(L / 2 + 3, 0.5, P + 4),
		posicao: new Vector3(bx + L / 4, yTelhado, bz),
		cor: new BrickColor("Really red"),
		material: Enum.Material.Slate,
		orientacao: new Vector3(0, 0, -28),
		pai: casa,
	});
	// Cumeeira
	criarParte({
		nome: "Cumeeira",
		tamanho: new Vector3(1.5, 1, P + 4),
		posicao: new Vector3(bx, yTelhado + 2.6, bz),
		cor: new BrickColor("Dark stone grey"),
		material: Enum.Material.Slate,
		pai: casa,
	});
	// Frontões triangulares (demonstra WedgePart / elemento 3D)
	criarCunha({
		nome: "Frontao_Frente",
		tamanho: new Vector3(L, 4, T),
		posicao: new Vector3(bx, 1.5 + H + 2, bz + P / 2),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		pai: casa,
	});
	criarCunha({
		nome: "Frontao_Tras",
		tamanho: new Vector3(L, 4, T),
		posicao: new Vector3(bx, 1.5 + H + 2, bz - P / 2),
		cor: new BrickColor("Brick yellow"),
		material: Enum.Material.Brick,
		orientacao: new Vector3(0, 180, 0),
		pai: casa,
	});

	// ---------- Porta ----------
	criarParte({
		nome: "Porta",
		tamanho: new Vector3(4, 7, 0.5),
		posicao: new Vector3(bx, 1.5 + 3.5, bz + P / 2 + 0.5),
		cor: new BrickColor("Brown"),
		material: Enum.Material.Wood,
		pai: casa,
	});

	// ---------- Janelas (vidro) ----------
	const corVidro = new BrickColor("Light blue");
	const zFrente = bz + P / 2 + 0.5;
	const zTras = bz - P / 2 - 0.5;
	criarParte({
		nome: "Janela_Frente_Esq",
		tamanho: new Vector3(3, 3, 0.5),
		posicao: new Vector3(bx - 7, yParede + 0.5, zFrente),
		cor: corVidro,
		material: Enum.Material.Glass,
		transparencia: 0.3,
		pai: casa,
	});
	criarParte({
		nome: "Janela_Frente_Dir",
		tamanho: new Vector3(3, 3, 0.5),
		posicao: new Vector3(bx + 7, yParede + 0.5, zFrente),
		cor: corVidro,
		material: Enum.Material.Glass,
		transparencia: 0.3,
		pai: casa,
	});
	criarParte({
		nome: "Janela_Tras",
		tamanho: new Vector3(4, 3, 0.5),
		posicao: new Vector3(bx, yParede + 0.5, zTras),
		cor: corVidro,
		material: Enum.Material.Glass,
		transparencia: 0.3,
		pai: casa,
	});
	criarParte({
		nome: "Janela_Lateral_Esq",
		tamanho: new Vector3(0.5, 3, 4),
		posicao: new Vector3(bx - L / 2 - 0.5, yParede + 0.5, bz),
		cor: corVidro,
		material: Enum.Material.Glass,
		transparencia: 0.3,
		pai: casa,
	});
	criarParte({
		nome: "Janela_Lateral_Dir",
		tamanho: new Vector3(0.5, 3, 4),
		posicao: new Vector3(bx + L / 2 + 0.5, yParede + 0.5, bz),
		cor: corVidro,
		material: Enum.Material.Glass,
		transparencia: 0.3,
		pai: casa,
	});

	// ---------- Chaminé ----------
	criarParte({
		nome: "Chamine",
		tamanho: new Vector3(2, 7, 2),
		posicao: new Vector3(bx + 8, yTelhado + 2, bz - 4),
		cor: new BrickColor("Medium stone grey"),
		material: Enum.Material.Concrete,
		pai: casa,
	});

	// ---------- Colunas da varanda (cilindros) + esfera decorativa ----------
	criarParte({
		nome: "Coluna_Esq",
		tamanho: new Vector3(1, H, 1),
		posicao: new Vector3(bx - 5, 1.5 + H / 2, bz + P / 2 + 3),
		cor: new BrickColor("White"),
		material: Enum.Material.SmoothPlastic,
		forma: Enum.PartType.Cylinder,
		pai: casa,
	});
	criarParte({
		nome: "Coluna_Dir",
		tamanho: new Vector3(1, H, 1),
		posicao: new Vector3(bx + 5, 1.5 + H / 2, bz + P / 2 + 3),
		cor: new BrickColor("White"),
		material: Enum.Material.SmoothPlastic,
		forma: Enum.PartType.Cylinder,
		pai: casa,
	});
	criarParte({
		nome: "Lampada_Varanda",
		tamanho: new Vector3(1.5, 1.5, 1.5),
		posicao: new Vector3(bx, 1.5 + H - 1, bz + P / 2 + 3),
		cor: new BrickColor("New Yeller"),
		material: Enum.Material.Neon,
		forma: Enum.PartType.Ball,
		pai: casa,
	});

	// ---------- Escada (3 degraus) ----------
	for (let i = 0; i < 3; i++) {
		criarParte({
			nome: `Degrau_${i + 1}`,
			tamanho: new Vector3(6, 0.5, 1.5),
			posicao: new Vector3(bx, 0.75 + i * 0.5, bz + P / 2 + 3.5 + i * 1.2),
			cor: new BrickColor("Medium stone grey"),
			material: Enum.Material.Concrete,
			pai: casa,
		});
	}

	// ---------- Luz interna ----------
	const luz = new Instance("PointLight");
	luz.Brightness = 2;
	luz.Range = 30;
	luz.Color = new Color3(1, 0.95, 0.8);
	const suporteLuz = casa.FindFirstChild("Cumeeira");
	if (suporteLuz !== undefined && suporteLuz.IsA("BasePart")) {
		luz.Parent = suporteLuz;
	} else {
		// fallback: anexa na primeira parede
		const parede = casa.FindFirstChild("Parede_Frente");
		if (parede !== undefined) {
			luz.Parent = parede;
		}
	}

	casa.Parent = workspace;
	print(`[CasaTeste] construída com ${casa.GetChildren().size()} instâncias em ${centro}.`);
	return casa;
}
