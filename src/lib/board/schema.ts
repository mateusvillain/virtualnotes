/**
 * Validação e normalização de boards vindos de fontes não confiáveis: o autosave em
 * `IndexedDB` ou um board aberto por link compartilhado.
 *
 * Nada aqui lança exceção — quem chama sempre recebe um resultado e decide o que fazer.
 * Um board parcialmente corrompido não deve levar a tela toda embora: notes inválidas são
 * descartadas e reportadas em `warnings`, e só um board irrecuperável vira erro.
 */

import type { Size } from "@/lib/canvas/coords";
import {
  CANVAS_MAX_ABS_COORDINATE,
  NOTE_MAX_TEXT_LENGTH,
  NOTE_SIZE,
  SCHEMA_VERSION,
  STROKE_MAX_COUNT,
  STROKE_MAX_POINTS,
  isNoteColor,
  STROKE_TOOL_PENCIL,
  isStrokeColor,
  isStrokeTool,
  type Board,
  type Note,
  type Stroke,
} from "./types";

export type ParseBoardResult =
  { ok: true; board: Board; warnings: string[] } | { ok: false; error: string };

/** Limita `value` a [min, max]; devolve `fallback` quando não é um número utilizável. */
function clampOr(value: unknown, min: number, max: number, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Limita um tamanho ao que o contrato aceita.
 *
 * Exportada porque redimensionar (#16) precisa **mostrar** o mesmo limite que a store vai
 * gravar: se a interface deixasse arrastar até 40 e a normalização subisse para 80 ao
 * soltar, o post-it saltaria de tamanho na frente de quem o estava ajustando.
 */
export function clampNoteSize(size: { w: unknown; h: unknown }): Size {
  return {
    w: clampOr(size.w, NOTE_SIZE.minWidth, NOTE_SIZE.maxWidth, NOTE_SIZE.defaultWidth),
    h: clampOr(size.h, NOTE_SIZE.minHeight, NOTE_SIZE.maxHeight, NOTE_SIZE.defaultHeight),
  };
}

/**
 * Normaliza uma note. Devolve `null` quando os campos obrigatórios não têm como ser
 * recuperados — id, posição e cor. Tamanho, z e texto têm padrão ou são ajustáveis.
 *
 * Exportada para quem precisa validar uma note isolada (um post-it colado, por exemplo)
 * sem passar um board inteiro.
 */
export function normalizeNote(input: unknown): Note | null {
  if (!isPlainObject(input)) return null;

  const { id, x, y, w, h, color, text, z } = input;

  if (typeof id !== "string" || id.length === 0) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;

  if (!isNoteColor(color)) return null;

  return {
    id,
    x: clampOr(x, -CANVAS_MAX_ABS_COORDINATE, CANVAS_MAX_ABS_COORDINATE, 0),
    y: clampOr(y, -CANVAS_MAX_ABS_COORDINATE, CANVAS_MAX_ABS_COORDINATE, 0),
    ...clampNoteSize({ w, h }),
    color,
    text: typeof text === "string" ? text.slice(0, NOTE_MAX_TEXT_LENGTH) : "",
    z: isFiniteNumber(z) ? Math.trunc(z) : 0,
  };
}

/**
 * Normaliza os pontos de um traço: números finitos, comprimento par, dentro do teto de
 * pontos por traço e da coordenada máxima. `null` quando não sobra o mínimo de dois pontos.
 *
 * Um número não finito não é descartado sozinho — descartar um `x` sem o `y` que vem depois
 * quebraria o pareamento de todo o resto da lista. Em vez disso, o par inteiro que contém um
 * valor inválido é removido.
 *
 * As coordenadas são arredondadas para inteiro aqui, na fronteira de gravação (issue #67):
 * `123.4567891` custa nove caracteres a mais que `123` dentro da URL, por uma fração de
 * unidade de canvas que ninguém vê — e é por onde passa todo traço que entra no board, tanto
 * o recém-desenhado quanto o que veio de um link.
 */
function normalizePoints(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;

  const pairs = Math.min(Math.floor(input.length / 2), STROKE_MAX_POINTS);
  const points: number[] = [];

  for (let pair = 0; pair < pairs; pair += 1) {
    const x = input[pair * 2];
    const y = input[pair * 2 + 1];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;

    points.push(
      Math.round(clampOr(x, -CANVAS_MAX_ABS_COORDINATE, CANVAS_MAX_ABS_COORDINATE, 0)),
      Math.round(clampOr(y, -CANVAS_MAX_ABS_COORDINATE, CANVAS_MAX_ABS_COORDINATE, 0)),
    );
  }

  return points.length >= 4 ? points : null;
}

/**
 * Normaliza um traço. Devolve `null` quando os campos obrigatórios não têm como ser
 * recuperados — id, cor e ao menos dois pontos.
 *
 * A ferramenta não é obrigatória: ausente, ou fora da lista, o traço vira lápis. Um índice
 * desconhecido não descarta o traço — os pontos e a cor estão intactos, e desenhá-lo como
 * lápis perde menos que apagá-lo. O lápis é sempre gravado **sem** o campo (#110), para que
 * o traço custe no link o mesmo que antes de `tool` existir.
 */
export function normalizeStroke(input: unknown): Stroke | null {
  if (!isPlainObject(input)) return null;

  const { id, color, tool, points, z } = input;

  if (typeof id !== "string" || id.length === 0) return null;
  if (!isStrokeColor(color)) return null;

  const normalizedPoints = normalizePoints(points);
  if (normalizedPoints === null) return null;

  return {
    id,
    color,
    // Condicional, e não `tool: undefined`: uma chave com `undefined` some no JSON, mas não
    // em `toEqual` nem em `Object.keys` — e o traço de lápis tem de ser, em tudo, o de antes.
    ...(isStrokeTool(tool) && tool !== STROKE_TOOL_PENCIL ? { tool } : {}),
    points: normalizedPoints,
    z: isFiniteNumber(z) ? Math.trunc(z) : 0,
  };
}

/**
 * Valida e normaliza um board desconhecido.
 *
 * Boards escritos por uma versão futura do schema são recusados: o formato pode ter mudado
 * de significado, e abrir um link novo numa versão antiga do app com dados silenciosamente
 * errados é pior do que avisar.
 */
/** Deriva um id livre a partir de `id`, sufixando até não colidir com `taken`. */
function uniqueId(id: string, taken: ReadonlySet<string>): string {
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${id}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function parseBoard(input: unknown): ParseBoardResult {
  if (!isPlainObject(input)) {
    return { ok: false, error: "Board inválido: esperava um objeto." };
  }

  const { version, notes, strokes } = input;

  if (!isFiniteNumber(version) || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Board inválido: versão de schema ausente ou inválida." };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Board criado por uma versão mais nova do app (schema ${version}).`,
    };
  }
  if (!Array.isArray(notes)) {
    return { ok: false, error: "Board inválido: lista de post-its ausente." };
  }

  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const normalized: Note[] = [];

  for (const [index, candidate] of notes.entries()) {
    const note = normalizeNote(candidate);
    if (note === null) {
      warnings.push(`Post-it na posição ${index} descartado: dados inválidos.`);
      continue;
    }
    if (seenIds.has(note.id)) {
      // Id duplicado é dado recuperável: o conteúdo do post-it está intacto, só o
      // identificador colide. Renomear preserva o que o usuário escreveu; descartar não.
      const id = uniqueId(note.id, seenIds);
      warnings.push(
        `Post-it na posição ${index}: id "${note.id}" duplicado, renomeado para "${id}".`,
      );
      note.id = id;
    }
    seenIds.add(note.id);
    normalized.push(note);
  }

  /*
    `strokes` ausente é o caso normal de um board gravado antes desta issue (v1): lista
    vazia, sem aviso — não é dado corrompido, é dado de antes de o campo existir. Presente
    mas do formato errado, ao contrário de `notes`, não reprova o board inteiro: o resto do
    board (post-its) continua sendo o que a maioria dos links guarda, e perder só os traços
    é preferível a recusar a abertura por um campo que a issue #66 é a primeira a exigir.
  */
  const rawStrokes = Array.isArray(strokes) ? strokes : [];
  const seenStrokeIds = new Set<string>();
  const normalizedStrokes: Stroke[] = [];

  for (const [index, candidate] of rawStrokes.entries()) {
    if (normalizedStrokes.length >= STROKE_MAX_COUNT) {
      warnings.push(`Traço na posição ${index} descartado: limite de traços do board atingido.`);
      continue;
    }

    const stroke = normalizeStroke(candidate);
    if (stroke === null) {
      warnings.push(`Traço na posição ${index} descartado: dados inválidos.`);
      continue;
    }
    if (seenStrokeIds.has(stroke.id)) {
      const id = uniqueId(stroke.id, seenStrokeIds);
      warnings.push(
        `Traço na posição ${index}: id "${stroke.id}" duplicado, renomeado para "${id}".`,
      );
      stroke.id = id;
    }
    seenStrokeIds.add(stroke.id);
    normalizedStrokes.push(stroke);
  }

  return {
    ok: true,
    board: { version: SCHEMA_VERSION, notes: normalized, strokes: normalizedStrokes },
    warnings,
  };
}
