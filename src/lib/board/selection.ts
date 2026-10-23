/**
 * Seleção de elementos do quadro: post-its e rabiscos.
 *
 * A seleção é estado **efêmero de interface**: dizer o que está marcado não é dizer o que o
 * board é, e por isso ela não mora na store nem viaja dentro da URL. Vive aqui como valor
 * imutável, e as operações são funções puras — apagar (#19, #70) e colorir em lote (#17)
 * consomem a mesma noção de "o que está selecionado", em vez de cada um inventar a sua.
 *
 * **Dois conjuntos, e não um.** Foi a decisão da #70, e ela é sobre os ids: eles são únicos
 * dentro de cada lista do board, não entre elas. Uma note e um traço podem nascer com o
 * mesmo id — são seis caracteres sorteados contra listas diferentes —, e num conjunto só
 * marcar a note marcaria o rabisco junto, sem nada na tela explicando por quê. Guardar o
 * tipo ao lado do id resolve isso na estrutura, e não numa convenção de prefixo que cada
 * chamador teria de lembrar de aplicar.
 */

import { rectsIntersect, type Rect } from "@/lib/canvas/coords";
import { strokeInkBounds, strokeIntersectsRect } from "./stroke-geometry";
import type { Note, NoteColor, Stroke } from "./types";

/** As duas espécies de coisa que o quadro tem, e que uma seleção pode misturar. */
export type ElementKind = "note" | "stroke";

/**
 * O que está marcado.
 *
 * Conjuntos, e não listas: pertencer é a única pergunta que se faz a eles.
 */
export interface Selection {
  notes: ReadonlySet<string>;
  strokes: ReadonlySet<string>;
}

export const EMPTY_SELECTION: Selection = { notes: new Set(), strokes: new Set() };

/** O conjunto daquela espécie. Poupa quem só quer perguntar de espalhar o `if` pelo código. */
function setOf(selection: Selection, kind: ElementKind): ReadonlySet<string> {
  return kind === "note" ? selection.notes : selection.strokes;
}

/** Uma seleção com o conjunto daquela espécie trocado, e o outro intacto. */
function withSet(selection: Selection, kind: ElementKind, ids: ReadonlySet<string>): Selection {
  return kind === "note" ? { ...selection, notes: ids } : { ...selection, strokes: ids };
}

/** Este elemento está marcado. */
export function isSelected(selection: Selection, kind: ElementKind, id: string): boolean {
  return setOf(selection, kind).has(id);
}

/** Quantos elementos estão marcados, das duas espécies juntas. */
export function selectionSize(selection: Selection): number {
  return selection.notes.size + selection.strokes.size;
}

export function isEmpty(selection: Selection): boolean {
  return selectionSize(selection) === 0;
}

/** Deixa só este elemento marcado, e nada mais — nem da outra espécie. */
export function selectOnly(kind: ElementKind, id: string): Selection {
  return withSet(EMPTY_SELECTION, kind, new Set([id]));
}

/** Acrescenta ou tira um elemento da seleção — o gesto do shift-clique. */
export function toggle(selection: Selection, kind: ElementKind, id: string): Selection {
  const next = new Set(setOf(selection, kind));
  if (!next.delete(id)) next.add(id);
  return withSet(selection, kind, next);
}

/** Tudo que está marcado em qualquer uma das duas. */
export function union(a: Selection, b: Selection): Selection {
  return {
    notes: new Set([...a.notes, ...b.notes]),
    strokes: new Set([...a.strokes, ...b.strokes]),
  };
}

/**
 * Sobreposição entre um post-it e um retângulo.
 *
 * Uma note *é* um retângulo em coordenadas de canvas; a conta em si mora na geometria, com
 * os outros usos que ela tem em arrastar (#15) e redimensionar (#16).
 */
export function intersects(note: Note, rect: Rect): boolean {
  return rectsIntersect(note, rect);
}

/**
 * O que o retângulo de seleção toca, das duas espécies.
 *
 * As duas perguntas saem daqui juntas porque são o mesmo gesto: arrastar no fundo pega o
 * que estiver embaixo, e quem desenha o retângulo não deveria precisar saber que o quadro
 * guarda notas e rabiscos em listas separadas.
 */
export function elementsInRect(
  notes: readonly Note[],
  strokes: readonly Stroke[],
  rect: Rect,
): Selection {
  return {
    notes: new Set(notes.filter((note) => intersects(note, rect)).map((note) => note.id)),
    strokes: new Set(
      strokes.filter((stroke) => strokeIntersectsRect(stroke, rect)).map((stroke) => stroke.id),
    ),
  };
}

/**
 * Tudo que existe no quadro, marcado (#85).
 *
 * Uma seleção montada a partir do board, e não uma capacidade nova: a estrutura já sabia
 * misturar as duas espécies desde a #70, e "selecionar tudo" é só entregar a ela as duas
 * listas inteiras.
 *
 * Sem caso especial para o quadro vazio: os dois conjuntos saem vazios sozinhos, que é
 * exatamente a resposta certa — `Ctrl+A` num quadro sem nada não deixa seleção fantasma.
 */
export function selectAll(notes: readonly Note[], strokes: readonly Stroke[]): Selection {
  return {
    notes: new Set(notes.map((note) => note.id)),
    strokes: new Set(strokes.map((stroke) => stroke.id)),
  };
}

/**
 * As caixas de notas e traços, em coordenadas de canvas: onde cada coisa está na tela.
 *
 * A note já é um retângulo; o traço é medido pela tinta, e não pelos pontos (#118) — num
 * marca-texto a tinta passa da linha do meio. Um traço sem pontos não entra: não tem forma,
 * e um retângulo inventado na origem puxaria para o canto do canvas quem se ancora nele.
 *
 * Serve a barra de ações, ancorada na caixa da seleção, e o zoom to fit (#136), que
 * enquadra o quadro inteiro.
 */
export function elementRects(notes: readonly Note[], strokes: readonly Stroke[]): Rect[] {
  const inks = strokes.map(strokeInkBounds).filter((rect): rect is Rect => rect !== null);
  return [...notes, ...inks];
}

/** As notes marcadas, na ordem em que o board as guarda. */
export function selectedNotes(notes: readonly Note[], selection: Selection): Note[] {
  return notes.filter((note) => selection.notes.has(note.id));
}

/** Os traços marcados, na ordem em que o board os guarda. */
export function selectedStrokes(strokes: readonly Stroke[], selection: Selection): Stroke[] {
  return strokes.filter((stroke) => selection.strokes.has(stroke.id));
}

/**
 * A cor que a seleção tem, ou `null` quando não há uma só.
 *
 * `null` cobre dois casos de propósito — nada selecionado, e post-its de cores diferentes.
 * Nos dois a resposta a "qual é a cor atual?" é a mesma: não há uma, e o seletor não tem o
 * que marcar. Inventar uma (a do primeiro, a mais frequente) marcaria no seletor uma cor
 * que parte da seleção não tem.
 *
 * Pergunta só às notes, mesmo numa seleção mista. O seletor pinta post-it; um traço junto
 * na seleção não muda qual é a cor dos post-its que estão nela.
 */
export function sharedColor(notes: readonly Note[]): NoteColor | null {
  const first = notes[0];
  if (first === undefined) return null;

  return notes.every((note) => note.color === first.color) ? first.color : null;
}
