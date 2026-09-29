/**
 * Contrato do modelo de dados do board.
 *
 * Este é o formato único compartilhado por canvas, post-its, persistência e exportação.
 * Ele é serializado dentro da URL (issue #11), então cada campo aqui custa caracteres de
 * link: mantenha o modelo enxuto e prefira valores enumerados a strings livres.
 *
 * As decisões de compactação estão documentadas em `docs/board-format.md`.
 */

/**
 * Versão atual do schema. Incrementar só em mudança incompatível — e "incompatível" cobre
 * também o campo cujo silêncio muda o que a tela mostra: um board com traços, aberto por um
 * app que não sabe ler `strokes`, não erraria o dado — erraria o desenho, mostrando o board
 * sem o rabisco que tem. Board sem `strokes` continua sendo lido normalmente (ver
 * `parseBoard`); a versão sobe para que um board **futuro** demais seja recusado, e não
 * mostrado errado em silêncio. A v3 subiu pela mesma regra, com `tool` (#110): a v2 mostraria
 * um traço de marca-texto como uma linha fina e opaca de lápis. A v4 também, com `w` e `o`
 * (#153): a v3 mostraria um traço grosso ou translúcido na espessura e opacidade padrão.
 */
export const SCHEMA_VERSION = 4;

/**
 * Cores de post-it, na ordem em que aparecem no seletor. O board guarda o índice desta
 * lista, nunca o nome nem o valor hexadecimal — trocar a paleta não invalida links antigos.
 * Os valores visuais correspondentes são tokens de tema (issue #8).
 */
export const NOTE_COLORS = ["yellow", "pink", "green", "blue", "purple", "orange"] as const;

export type NoteColorName = (typeof NOTE_COLORS)[number];

/**
 * Índice em {@link NOTE_COLORS}. É isto que vai serializado no board.
 *
 * Derivado da própria paleta, e não escrito à mão, para que acrescentar uma cor não deixe
 * o type guard aceitando índices que o tipo recusa (ou o contrário).
 */
export type NoteColor = TupleIndex<typeof NOTE_COLORS>;

/**
 * Cores do traço: as seis da nota, na mesma ordem, mais o preto — que é o padrão do lápis
 * (issue #64). Preto entra como uma cor a mais na mesma paleta, e não como um caso especial,
 * para que o índice serializado continue sendo a única fonte de verdade sobre a cor.
 */
export const STROKE_COLORS = [...NOTE_COLORS, "black"] as const;

export type StrokeColorName = (typeof STROKE_COLORS)[number];

/** Índice em {@link STROKE_COLORS}. É isto que vai serializado no traço. */
export type StrokeColor = TupleIndex<typeof STROKE_COLORS>;

/**
 * Cor com que o lápis nasce: o preto.
 *
 * Rabisco é anotação sobre o quadro, e não mais um objeto colorido disputando atenção com
 * as notas. Ele é o último índice de propósito — acrescentado **depois** das seis cores de
 * nota, para que os índices delas continuem valendo em todo link já compartilhado.
 */
export const STROKE_COLOR_BLACK = 6 satisfies StrokeColor;

/**
 * Ferramentas de desenho, na ordem do índice que o traço guarda (epic #107).
 *
 * Mesma lógica da cor: o board guarda o índice, nunca o nome. O lápis é o índice `0` porque
 * é o que todo traço de antes deste campo era — e por isso o campo é omitido quando o traço
 * é de lápis: boards antigos não precisam de migração, e um board só com lápis continua
 * gerando o mesmo link.
 */
export const STROKE_TOOLS = ["pencil", "fountain", "highlighter"] as const;

export type StrokeToolName = (typeof STROKE_TOOLS)[number];

/** Índice em {@link STROKE_TOOLS}. É isto que vai serializado no traço. */
export type StrokeTool = TupleIndex<typeof STROKE_TOOLS>;

/** A ferramenta de um traço sem o campo `tool`: o lápis. */
export const STROKE_TOOL_PENCIL = 0 satisfies StrokeTool;

/** A caneta tinteiro (#108). */
export const STROKE_TOOL_FOUNTAIN = 1 satisfies StrokeTool;

/** O marca-texto (#109). */
export const STROKE_TOOL_HIGHLIGHTER = 2 satisfies StrokeTool;

/**
 * Cor com que o marca-texto nasce: o amarelo (#112).
 *
 * Diferente do lápis e da caneta, que nascem em preto: o marca-texto destaca o que já está
 * no quadro, e o amarelo translúcido é o que se reconhece como destaque. É o índice do
 * amarelo em {@link NOTE_COLORS}, que {@link STROKE_COLORS} repete na mesma posição.
 */
export const DEFAULT_HIGHLIGHTER_COLOR = 0 satisfies StrokeColor;

/**
 * Uma cor por ferramenta de desenho, na ordem de {@link STROKE_TOOLS} — indexada pelo
 * próprio {@link StrokeTool}. Derivada da lista, e não escrita à mão, para que uma
 * ferramenta nova sem cor inicial seja erro de tipo.
 */
export type StrokeColors = PerTool<typeof STROKE_TOOLS, StrokeColor>;

/**
 * Um valor por ferramenta de desenho, na ordem de {@link STROKE_TOOLS}.
 *
 * Genérico só para o mapeamento ser homomórfico: sobre um parâmetro de tipo, `keyof` de uma
 * tupla mapeia só as posições e devolve uma tupla; sobre o tipo concreto, mapearia também
 * `map`, `length` e o resto dos membros de array.
 */
type PerTool<Tools extends readonly unknown[], Value> = {
  readonly [Tool in keyof Tools]: Value;
};

/** A cor com que cada ferramenta nasce: lápis e caneta em preto, marca-texto em amarelo. */
export const DEFAULT_STROKE_COLORS: StrokeColors = [
  STROKE_COLOR_BLACK,
  STROKE_COLOR_BLACK,
  DEFAULT_HIGHLIGHTER_COLOR,
];

/**
 * Espessuras do traço (#153): multiplicadores da espessura-base de cada ferramenta, e não
 * espessuras absolutas. O lápis tem 2 unidades e o marca-texto 16; uma escala comum dá às
 * três ferramentas o mesmo slider, e a caneta tinteiro escala o fio e a largura da pena
 * juntos, sem perder a proporção da pena caligráfica.
 *
 * O traço guarda o índice, pela mesma razão da cor. Por isso a lista só cresce no **fim**:
 * inserir um valor no começo ou no meio deslocaria os índices seguintes e mudaria a
 * espessura de todo traço já compartilhado. Valores de partida, ajustáveis em revisão
 * enquanto nenhum link os usa.
 */
export const STROKE_SIZES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6] as const;

/** Índice em {@link STROKE_SIZES}. É isto que vai serializado no traço. */
export type StrokeSize = TupleIndex<typeof STROKE_SIZES>;

/** A espessura-base da ferramenta, sem multiplicar: o `1×`. */
export const STROKE_SIZE_BASE = 2 satisfies StrokeSize;

/** A espessura com que cada ferramenta nasce: todas na base. */
export const DEFAULT_STROKE_SIZES: StrokeSizes = [
  STROKE_SIZE_BASE,
  STROKE_SIZE_BASE,
  STROKE_SIZE_BASE,
];

/** Uma espessura por ferramenta de desenho, na ordem de {@link STROKE_TOOLS}. */
export type StrokeSizes = PerTool<typeof STROKE_TOOLS, StrokeSize>;

/**
 * Opacidades do traço, em porcentagem (#153): de 5% a 100%, de 5 em 5. Zero fica de fora
 * de propósito — um traço invisível não é um traço, é um clique perdido que ninguém consegue
 * achar para apagar.
 *
 * Em porcentagem inteira, e não em fração, para a lista ler como o slider mostra. O traço
 * guarda o índice, e a mesma regra de {@link STROKE_SIZES} vale para mexer na lista.
 */
export const STROKE_OPACITIES = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
] as const;

/** Índice em {@link STROKE_OPACITIES}. É isto que vai serializado no traço. */
export type StrokeOpacity = TupleIndex<typeof STROKE_OPACITIES>;

/** Opacidade cheia: onde o lápis e a caneta tinteiro nascem. */
export const STROKE_OPACITY_FULL = 19 satisfies StrokeOpacity;

/**
 * Opacidade com que o marca-texto nasce: 35%, a que ele sempre teve (#116). Translúcido o
 * bastante para o texto de baixo continuar legível.
 */
export const DEFAULT_HIGHLIGHTER_OPACITY = 6 satisfies StrokeOpacity;

/** Uma opacidade por ferramenta de desenho, na ordem de {@link STROKE_TOOLS}. */
export type StrokeOpacities = PerTool<typeof STROKE_TOOLS, StrokeOpacity>;

/** A opacidade com que cada ferramenta nasce: lápis e caneta cheios, marca-texto a 35%. */
export const DEFAULT_STROKE_OPACITIES: StrokeOpacities = [
  STROKE_OPACITY_FULL,
  STROKE_OPACITY_FULL,
  DEFAULT_HIGHLIGHTER_OPACITY,
];

/**
 * A cor com que um post-it nasce.
 *
 * Existe como constante porque passou a ter dois leitores: a store, que a aplica ao criar,
 * e a pré-visualização de colocação (#73), que precisa pintar a nota que **vai** ser
 * criada. Um `0` escrito à mão nos dois lugares deixaria a prévia mentindo no dia em que a
 * paleta fosse reordenada.
 */
export const DEFAULT_NOTE_COLOR = 0 satisfies NoteColor;

/** Union dos índices válidos de uma tupla: `["a", "b"]` -> `0 | 1`. */
type TupleIndex<T extends readonly unknown[]> =
  Extract<keyof T, `${number}`> extends `${infer Index extends number}` ? Index : never;

/** Dimensões do post-it, em unidades de canvas. */
export const NOTE_SIZE = {
  defaultWidth: 200,
  defaultHeight: 200,
  minWidth: 80,
  minHeight: 80,
  maxWidth: 2000,
  maxHeight: 2000,
} as const;

/** Limite de texto por post-it. Existe para o board caber na URL. */
export const NOTE_MAX_TEXT_LENGTH = 2000;

/**
 * Maior coordenada aceita, em módulo, ao redor da origem.
 *
 * Não é o limite de navegação do viewport (issue #9): é um teto defensivo para dado vindo
 * de fora, que impede uma coordenada absurda de jogar um post-it para fora do universo.
 */
export const CANVAS_MAX_ABS_COORDINATE = 100_000;

/**
 * Maior quantidade de pontos aceita num traço só.
 *
 * O traço inteiro é achatado dentro do board, que viaja na URL: sem um teto, um rabisco
 * longo — ou um evento de ponteiro reportando pontos demais — poderia sozinho estourar o
 * link. `points` é uma lista achatada (`[x0,y0,x1,y1,…]`), então o par de coordenadas é o
 * que se limita; este valor é a contagem de pares, não de números.
 */
export const STROKE_MAX_POINTS = 2000;

/**
 * Maior quantidade de traços aceita num board.
 *
 * Mesmo espírito do limite de pontos: um teto defensivo, não uma meta de uso. A issue #67
 * (simplificação) é quem reduz o custo de cada traço; este número impede que a quantidade
 * de traços, e não o tamanho de cada um, seja o jeito de estourar o link.
 */
export const STROKE_MAX_COUNT = 500;

export interface Note {
  /** Identificador único dentro do board. */
  id: string;
  /** Canto superior esquerdo, em coordenadas de canvas. */
  x: number;
  y: number;
  /** Dimensões, em unidades de canvas. */
  w: number;
  h: number;
  /** Índice em {@link NOTE_COLORS}. */
  color: NoteColor;
  /** Conteúdo em texto puro, sem formatação. */
  text: string;
  /** Ordem de empilhamento: maior fica por cima. */
  z: number;
}

/**
 * Um rabisco à mão livre (epic #64).
 *
 * `points` é achatado (`[x0,y0,x1,y1,…]`), e não uma lista de `{x,y}`: pela mesma razão da
 * cor por índice, é escolha de bytes — o board inteiro viaja na URL, e um array plano de
 * números custa cerca de metade do equivalente em objetos.
 */
export interface Stroke {
  /** Identificador único dentro do board. */
  id: string;
  /** Índice em {@link STROKE_COLORS}. */
  color: StrokeColor;
  /**
   * Índice em {@link STROKE_TOOLS}. Ausente é lápis: o contrato nunca grava o `0`, para que
   * o traço de lápis custe no link o mesmo que custava antes de o campo existir.
   */
  tool?: Exclude<StrokeTool, typeof STROKE_TOOL_PENCIL>;
  /**
   * Índice em {@link STROKE_SIZES}. Ausente é a espessura padrão da ferramenta, e o contrato
   * nunca grava o padrão (#153) — o traço de sempre custa no link o que custava na v3.
   */
  w?: StrokeSize;
  /**
   * Índice em {@link STROKE_OPACITIES}. Ausente é a opacidade padrão da ferramenta
   * ({@link DEFAULT_STROKE_OPACITIES}); como `w`, o padrão nunca é gravado.
   */
  o?: StrokeOpacity;
  /**
   * Coordenadas de canvas, achatadas: `points[0], points[1]` é o primeiro ponto, e assim
   * por diante. Comprimento par, com ao menos dois pontos (quatro números).
   */
  points: number[];
  /** Ordem de empilhamento: maior fica por cima. */
  z: number;
}

export interface Board {
  /**
   * Versão do schema deste board. Um board que passou por `parseBoard` sempre carrega
   * {@link SCHEMA_VERSION}, porque é nessa versão que ele foi normalizado.
   */
  version: number;
  notes: Note[];
  strokes: Stroke[];
}

/** Board vazio, usado quando não há nada na URL nem no armazenamento local. */
export function createEmptyBoard(): Board {
  return { version: SCHEMA_VERSION, notes: [], strokes: [] };
}

/** Guarda de tipo para o índice de cor vindo de dado não confiável. */
export function isNoteColor(value: unknown): value is NoteColor {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value < NOTE_COLORS.length
  );
}

/** Guarda de tipo para o índice de cor de traço vindo de dado não confiável. */
export function isStrokeColor(value: unknown): value is StrokeColor {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < STROKE_COLORS.length
  );
}

/** Guarda de tipo para o índice de ferramenta vindo de dado não confiável. */
export function isStrokeTool(value: unknown): value is StrokeTool {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < STROKE_TOOLS.length
  );
}

/** Guarda de tipo para o índice de espessura vindo de dado não confiável. */
export function isStrokeSize(value: unknown): value is StrokeSize {
  return isIndexOf(value, STROKE_SIZES);
}

/** Guarda de tipo para o índice de opacidade vindo de dado não confiável. */
export function isStrokeOpacity(value: unknown): value is StrokeOpacity {
  return isIndexOf(value, STROKE_OPACITIES);
}

function isIndexOf(value: unknown, list: readonly unknown[]): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < list.length;
}

/**
 * O que decide a cara da tinta: ferramenta, espessura e opacidade. Um `Stroke` serve, e a
 * prévia do traço em curso também (#157) — ela ainda não é traço, e a ferramenta dela pode
 * ser o lápis explícito, que o contrato nunca grava.
 */
export interface StrokeStyle {
  tool?: StrokeTool;
  w?: StrokeSize;
  o?: StrokeOpacity;
}

/** A ferramenta de um traço, com a ausência do campo lida como lápis. */
export function strokeTool(stroke: StrokeStyle): StrokeTool {
  return stroke.tool ?? STROKE_TOOL_PENCIL;
}

/** O índice de espessura de um traço, com a ausência do campo lida como o padrão da ferramenta. */
export function strokeSize(stroke: StrokeStyle): StrokeSize {
  return stroke.w ?? DEFAULT_STROKE_SIZES[strokeTool(stroke)];
}

/** O índice de opacidade de um traço, com a ausência do campo lida como o padrão da ferramenta. */
export function strokeOpacity(stroke: StrokeStyle): StrokeOpacity {
  return stroke.o ?? DEFAULT_STROKE_OPACITIES[strokeTool(stroke)];
}

/** O multiplicador da espessura-base da ferramenta: `1` para o traço padrão. */
export function strokeSizeScale(stroke: StrokeStyle): number {
  return STROKE_SIZES[strokeSize(stroke)];
}

/** A opacidade de um traço, de 0 a 1: pronta para o atributo `opacity` do SVG. */
export function strokeOpacityValue(stroke: StrokeStyle): number {
  return STROKE_OPACITIES[strokeOpacity(stroke)] / 100;
}
