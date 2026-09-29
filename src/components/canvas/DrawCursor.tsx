"use client";

import { strokeInkWidth } from "@/lib/board/stroke-geometry";
import {
  STROKE_OPACITIES,
  strokeOpacity,
  type StrokeColor,
  type StrokeStyle,
} from "@/lib/board/types";
import { topLeftCenteredAt, type Point } from "@/lib/canvas/coords";
import { strokeColor } from "@/lib/theme/note-colors";

/**
 * Menor diâmetro do círculo na tela, em px. O lápis a 0,5× tem 1 unidade de tinta: no
 * tamanho real, o cursor sumiria debaixo do ponteiro que ele existe para mostrar.
 */
export const DRAW_CURSOR_MIN_SIZE = 6;

interface DrawCursorProps {
  /** Centro do círculo, em coordenadas de canvas, ou `null` sem ponteiro no quadro. */
  at: Point | null;
  /** Ferramenta, espessura e opacidade do próximo traço. */
  style: StrokeStyle;
  color: StrokeColor;
  /** Escala do viewport: converte o mínimo e a borda, que são medidas de tela. */
  scale: number;
}

/**
 * O círculo que acompanha o cursor com uma ferramenta de desenho ligada, no lugar do ícone
 * da ferramenta — o mesmo que a borracha já fazia (#98).
 *
 * O diâmetro é a espessura da tinta do próximo traço (`strokeInkWidth`, a mesma conta da
 * pintura): mexer no slider de espessura faz o círculo crescer ou encolher, e o que se vê
 * sob o ponteiro é a largura da linha que vai sair. Na caneta tinteiro é a pena na parte mais
 * larga.
 *
 * Preenchido com a cor e a opacidade do traço, e contornado em tinta: o contorno mantém o
 * círculo visível numa cor clara sobre o quadro claro, e o miolo antecipa a cor escolhida.
 *
 * Vive dentro da camada transformada do viewport, como o círculo da borracha: o zoom desenha
 * o diâmetro do tamanho certo sozinho. Só o mínimo e a borda são medidas de tela, e por isso
 * divididos pela escala.
 */
export function DrawCursor({ at, style, color, scale }: DrawCursorProps) {
  if (at === null) return null;

  const size = Math.max(strokeInkWidth(style), DRAW_CURSOR_MIN_SIZE / scale);
  const { x, y } = topLeftCenteredAt(at, { w: size, h: size });
  const opacity = STROKE_OPACITIES[strokeOpacity(style)] / 100;

  return (
    <div
      aria-hidden="true"
      data-testid="draw-cursor"
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        // A cor por trás com a opacidade do traço, e a borda por cima, sempre sólida.
        background: `color-mix(in srgb, ${strokeColor(color)} ${opacity * 100}%, transparent)`,
        boxShadow: `0 0 0 ${1 / scale}px var(--color-ink)`,
      }}
    />
  );
}
