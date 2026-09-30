"use client";

import { strokeInkWidth } from "@/lib/board/stroke-geometry";
import { strokeOpacityValue, type StrokeColor, type StrokeStyle } from "@/lib/board/types";
import { topLeftCenteredAt, type Point } from "@/lib/canvas/coords";
import { strokeColor } from "@/lib/theme/note-colors";

/**
 * Abaixo deste diâmetro na tela, em px, o círculo ganha a mira em volta. O lápis fino (2px a
 * 1×, 1px a 0,5×) some debaixo do olho; o marca-texto e a caneta grossa não precisam dela.
 */
export const DRAW_CURSOR_AIM_BELOW = 6;

/** A mira, em px de tela: 16 de lado, traços de 4 e um vão de 8 no meio para o ponto. */
const AIM_SIZE = 16;
const AIM_TICK = 4;

interface DrawCursorProps {
  /** Centro do círculo, em coordenadas de canvas, ou `null` sem ponteiro no quadro. */
  at: Point | null;
  /** Ferramenta, espessura e opacidade do próximo traço. */
  style: StrokeStyle;
  color: StrokeColor;
  /** Escala do viewport: converte a borda e a mira, que são medidas de tela. */
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
 * Quando o círculo fica pequeno demais na tela para achar ({@link DRAW_CURSOR_AIM_BELOW}),
 * ganha em volta uma mira de quatro traços curtos, com um vão no meio. O ponto continua do
 * tamanho exato do traço: a mira só diz onde ele está, e por não ser um círculo não se
 * confunde com uma espessura maior.
 *
 * Vive dentro da camada transformada do viewport, como o círculo da borracha: o zoom desenha
 * o diâmetro do tamanho certo sozinho. Só a borda e a mira são medidas de tela, e por isso
 * divididas pela escala.
 */
export function DrawCursor({ at, style, color, scale }: DrawCursorProps) {
  if (at === null) return null;

  const size = strokeInkWidth(style);
  const { x, y } = topLeftCenteredAt(at, { w: size, h: size });

  const aim = size * scale < DRAW_CURSOR_AIM_BELOW;
  const aimSize = AIM_SIZE / scale;
  const aimAt = topLeftCenteredAt(at, { w: aimSize, h: aimSize });
  const far = AIM_SIZE - AIM_TICK;
  const middle = AIM_SIZE / 2;

  return (
    <>
      {aim ? (
        <svg
          aria-hidden="true"
          data-testid="draw-cursor-aim"
          className="pointer-events-none absolute overflow-visible text-ink"
          style={{ left: aimAt.x, top: aimAt.y, width: aimSize, height: aimSize }}
          viewBox={`0 0 ${AIM_SIZE} ${AIM_SIZE}`}
        >
          <path
            d={`M0 ${middle}H${AIM_TICK}M${far} ${middle}H${AIM_SIZE}M${middle} 0V${AIM_TICK}M${middle} ${far}V${AIM_SIZE}`}
            stroke="currentColor"
            strokeWidth={1}
            strokeLinecap="round"
          />
        </svg>
      ) : null}
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
          background: `color-mix(in srgb, ${strokeColor(color)} ${strokeOpacityValue(style) * 100}%, transparent)`,
          boxShadow: `inset 0 0 0 ${1 / scale}px var(--color-ink)`,
        }}
      />
    </>
  );
}
