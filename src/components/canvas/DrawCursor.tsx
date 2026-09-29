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

interface DrawCursorProps {
  /** Centro do círculo, em coordenadas de canvas, ou `null` sem ponteiro no quadro. */
  at: Point | null;
  /** Ferramenta, espessura e opacidade do próximo traço. */
  style: StrokeStyle;
  color: StrokeColor;
  /** Escala do viewport: converte a borda, que é medida de tela. */
  scale: number;
}

/**
 * O círculo que acompanha o cursor com uma ferramenta de desenho ligada, no lugar do ícone
 * da ferramenta — o mesmo que a borracha já fazia (#98).
 *
 * O diâmetro é a espessura da tinta do próximo traço (`strokeInkWidth`, a mesma conta da
 * pintura), sem mínimo: mexer no slider de espessura faz o círculo crescer ou encolher, e o
 * que se vê sob o ponteiro é exatamente a largura da linha que vai sair — no lápis a 0,5×,
 * um ponto de 1 unidade. Na caneta tinteiro é a pena na parte mais larga.
 *
 * Preenchido com a cor e a opacidade do traço, e contornado em tinta **por dentro**: o
 * contorno mantém o círculo visível numa cor clara sobre o quadro claro sem somar nada ao
 * diâmetro. Num círculo de 2px ou menos o contorno cobre o miolo, e ele vira um ponto de
 * tinta do tamanho do traço.
 *
 * Vive dentro da camada transformada do viewport, como o círculo da borracha: o zoom desenha
 * o diâmetro do tamanho certo sozinho. Só a borda é medida de tela, e por isso dividida pela
 * escala.
 */
export function DrawCursor({ at, style, color, scale }: DrawCursorProps) {
  if (at === null) return null;

  const size = strokeInkWidth(style);
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
        // A cor por trás com a opacidade do traço, e a borda por dentro, sempre sólida.
        background: `color-mix(in srgb, ${strokeColor(color)} ${opacity * 100}%, transparent)`,
        boxShadow: `inset 0 0 0 ${1 / scale}px var(--color-ink)`,
      }}
    />
  );
}
