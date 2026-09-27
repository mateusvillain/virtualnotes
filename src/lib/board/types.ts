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
 * um traço de marca-texto como uma linha fina e opaca de lápis.
 */
export const SCHEMA_VERSION = 3;

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

/** A ferramenta de um traço, com a ausência do campo lida como lápis. */
export function strokeTool(stroke: Pick<Stroke, "tool">): StrokeTool {
  return stroke.tool ?? STROKE_TOOL_PENCIL;
}
