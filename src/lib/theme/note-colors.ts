/**
 * Ponte entre o índice de cor guardado no board e o token de tema correspondente.
 *
 * O contrato (src/lib/board/types.ts) é dono da paleta e da ordem; o tema é dono do valor
 * visual de cada cor. O nome do token é derivado do nome da cor, e não escrito à mão, para
 * não existir uma segunda lista capaz de divergir da primeira.
 */

import {
  NOTE_COLORS,
  STROKE_COLOR_BLACK,
  STROKE_COLOR_GRAY,
  STROKE_COLOR_WHITE,
  isCustomStrokeColor,
  type NoteColor,
  type NoteColorName,
  type StrokeColor,
} from "@/lib/board/types";

/** Cor do texto escrito em cima de qualquer post-it. */
export const NOTE_INK_VAR = "--color-note-ink";

/** Variável CSS do fundo de uma cor de post-it. Um typo aqui é erro de compilação. */
export type NoteBackgroundVar = `--color-note-${NoteColorName}`;

/** Variável CSS de fundo a partir do índice guardado no board. */
export function noteBackgroundVar(color: NoteColor): NoteBackgroundVar {
  return `--color-note-${NOTE_COLORS[color]}`;
}

/**
 * Valor de cor pronto para um estilo inline.
 *
 * Existe para a sintaxe do `var()` não vazar para dentro de cada componente que pinta um
 * post-it: quem é dono do token é este módulo.
 */
export function noteBackgroundColor(color: NoteColor): string {
  return `var(${noteBackgroundVar(color)})`;
}

/**
 * Cor da tinta de um traço, a partir do índice guardado no board (#68).
 *
 * As seis primeiras são as mesmas do post-it, e saem por {@link noteBackgroundColor}: o
 * quadro tem uma paleta só, e derivar o token de novo aqui seria a segunda lista que este
 * módulo existe para não ter. O preto é o único índice que não vem dali — ele foi
 * acrescentado depois da paleta de nota, e reusa `--color-ink`, o token de "cor de escrever"
 * desta interface: o mesmo tom do texto de uma nota, agora sobre o quadro.
 */
export function strokeColor(color: StrokeColor): string {
  // Comparação com o índice, e não com o nome: é o índice que o board guarda, e é ele que
  // o resto do sistema trata como a identidade da cor.
  if (color === STROKE_COLOR_BLACK) return "var(--color-ink)";
  if (color === STROKE_COLOR_GRAY) return "var(--color-stroke-gray)";
  if (color === STROKE_COLOR_WHITE) return "var(--color-stroke-white)";
  // A cor livre já é o valor: não tem token porque não é de paleta nenhuma.
  if (isCustomStrokeColor(color)) return color;

  return noteBackgroundColor(color);
}
