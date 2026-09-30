"use client";

import { useId, type CSSProperties } from "react";
import {
  NOTE_COLORS,
  STROKE_COLOR_BLACK,
  STROKE_COLOR_GRAY,
  STROKE_COLOR_WHITE,
  STROKE_TOOLS,
  isCustomStrokeColor,
  type CustomStrokeColor,
  type StrokeColor,
  type StrokeColorIndex,
  type StrokeTool,
} from "@/lib/board/types";
import { strokeColor } from "@/lib/theme/note-colors";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ColorRadioGroup } from "@/components/ui/ColorRadioGroup";

interface StrokeColorPickerProps {
  /**
   * A ferramenta cuja cor a paleta mostra (#112). Dá à paleta o nome acessível e o
   * `data-testid` — as cores são as mesmas para todas.
   */
  tool: StrokeTool;
  /**
   * Cor do próximo traço: uma da paleta, ou uma livre. Nunca `null`, ao contrário do
   * post-it: a ferramenta não tem seleção mista, só a cor que o próximo gesto vai usar.
   */
  value: StrokeColor;
  onChange: (color: StrokeColor) => void;
}

/**
 * As cores do arco, da ponta esquerda para o topo e de lá para a direita, na ordem do Penpot:
 * os neutros sobem pela esquerda e os pastéis descem pela direita.
 *
 * É a ordem de **exibição**, e não a do board: cada posição guarda o índice em
 * `STROKE_COLORS`, que é o que vai serializado. O roxo fica de fora porque o arco do Penpot
 * não o tem — um traço roxo antigo continua desenhado, só não há como escolher a cor.
 */
const ARC_COLORS: readonly StrokeColorIndex[] = [
  STROKE_COLOR_BLACK,
  STROKE_COLOR_GRAY,
  STROKE_COLOR_WHITE,
  NOTE_COLORS.indexOf("pink") as StrokeColorIndex,
  NOTE_COLORS.indexOf("orange") as StrokeColorIndex,
  NOTE_COLORS.indexOf("yellow") as StrokeColorIndex,
  NOTE_COLORS.indexOf("green") as StrokeColorIndex,
  NOTE_COLORS.indexOf("blue") as StrokeColorIndex,
];

/**
 * Duração do giro de fechar, em ms — o `Popover` segura o arco montado por esse tempo. Tem de
 * bater com `color-arc-roll-out` em globals.css.
 */
export const ARC_EXIT_MS = 200;

/** Largura e altura do arco, em px (Penpot). */
const ARC_WIDTH = 234;
const ARC_HEIGHT = 118;

/**
 * Centro de cada posição do arco, em px a partir do canto superior esquerdo: as oito cores e,
 * na última, o seletor livre.
 *
 * Medidos no contorno do Penpot ({@link ARC_PATH}), e não calculados num círculo: o fundo não
 * é um anel perfeito. O meio da faixa fica entre 99,3 e 99,8px do centro, e as pontas são
 * cortadas na horizontal e fechadas por uma tampa redonda cujo centro fica mais para fora do
 * que um raio fixo daria. Um círculo só deixava o preto e o seletor ~1,3px para dentro.
 *
 * As pontas são o centro dessas tampas; as do meio, o ponto médio entre as bordas de dentro
 * e de fora da faixa, em ângulos iguais entre as duas pontas (~20° um do outro).
 */
const SLOT_CENTERS: readonly { x: number; y: number }[] = [
  { x: 18.2, y: 100.1 },
  { x: 30.2, y: 67.4 },
  { x: 52.7, y: 40.9 },
  { x: 82.8, y: 23.6 },
  { x: 116.9, y: 17.7 },
  { x: 151, y: 23.6 },
  { x: 181, y: 40.9 },
  { x: 203.5, y: 67.4 },
  { x: 215.6, y: 100.1 },
];
const SLOT_COUNT = SLOT_CENTERS.length;

/** Centro da posição `slot` do arco. */
function slotCenter(slot: number): { x: number; y: number } {
  return SLOT_CENTERS[slot]!;
}

/**
 * A forma do fundo, copiada do Penpot: um anel de 35px de espessura com as pontas
 * arredondadas.
 */
const ARC_PATH =
  "M116.86 0C176.03 0 225.04 43.56 233.55 100.36C235 110.03 226.94 118 217.16 118C207.38 118 199.66 109.98 197.59 100.43C189.53 63.25 156.45 35.4 116.86 35.4C77.27 35.4 44.19 63.25 36.13 100.43C34.06 109.98 26.34 118 16.56 118C6.78 118 -1.28 110.03 0.17 100.36C8.68 43.56 57.68 0 116.86 0Z";

/**
 * Anel das cores do matiz para o botão de cor livre: diz "qualquer cor" sem precisar de
 * rótulo, como o ícone do Penpot.
 */
const RAINBOW =
  "conic-gradient(from 90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)";

/** Um hex que o `<input type="color">` aceite: ele só lê `#rrggbb`. */
function pickerValue(value: StrokeColor): CustomStrokeColor {
  return isCustomStrokeColor(value) ? value : "#000000";
}

/**
 * As cores do traço num arco acima da toolbar, para qualquer ferramenta de desenho (#112):
 * preto, cinza e branco subindo pela esquerda, os pastéis descendo pela direita, e na ponta
 * o seletor do sistema para uma cor livre.
 *
 * As oito cores continuam sendo um `radiogroup` (`ColorRadioGroup`): uma parada de Tab, as
 * setas andando pelo arco na mesma ordem em que ele é lido. O seletor livre fica **fora** do
 * grupo — não é "uma das oito", é uma ação que abre outra janela —, e por isso é a parada de
 * Tab seguinte. É um `<input type="color">` de verdade por baixo do círculo, e não um
 * seletor próprio: o do sistema já sabe conta-gotas, hex e as cores recentes.
 *
 * Com uma cor livre em uso nenhuma das oito fica marcada, e quem ganha o anel é o seletor.
 */
export function StrokeColorPicker({ tool, value, onChange }: StrokeColorPickerProps) {
  const ui = useUi();
  const name = STROKE_TOOLS[tool];
  const custom = isCustomStrokeColor(value);
  const selectedSlot = custom ? -1 : ARC_COLORS.indexOf(value);
  const pickerCenter = slotCenter(SLOT_COUNT - 1);
  // Um id por instância: dois arcos na página não podem disputar o mesmo gradiente.
  const gradientId = useId();

  function colorLabel(slot: number): string {
    const color = ARC_COLORS[slot]!;
    if (color === STROKE_COLOR_BLACK) return ui.pencil.black;
    if (color === STROKE_COLOR_GRAY) return ui.pencil.gray;
    if (color === STROKE_COLOR_WHITE) return ui.pencil.white;
    return ui.note.colors[NOTE_COLORS[color]!]!;
  }

  return (
    // O recorte esconde o que o giro de abrir e fechar leva para baixo da base (globals.css).
    <div
      className="color-arc relative"
      style={
        {
          width: ARC_WIDTH,
          height: ARC_HEIGHT,
          // O centro do círculo de que o arco é pedaço: o eixo do giro de abrir e fechar.
          "--color-arc-pivot": `${ARC_WIDTH / 2}px ${ARC_HEIGHT - 1}px`,
        } as CSSProperties
      }
      data-testid={`${name}-color-arc`}
    >
      <div className="color-arc-roll absolute inset-0">
        {/*
        Mesmo fundo da toolbar: branco descendo para `#f5f5f5`, com a sombra curta de quem
        encosta no quadro (Penpot). Um SVG, e não um `div`, porque a forma é um anel e a
        sombra tem de seguir o contorno dele.
      */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible drop-shadow-toolbar"
          width={ARC_WIDTH}
          height={ARC_HEIGHT}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#f5f5f5" />
            </linearGradient>
          </defs>
          <path d={ARC_PATH} fill={`url(#${gradientId})`} />
        </svg>

        <ColorRadioGroup
          count={ARC_COLORS.length}
          value={selectedSlot === -1 ? null : selectedSlot}
          onChange={(slot) => onChange(ARC_COLORS[slot]!)}
          swatchColor={(slot) => strokeColor(ARC_COLORS[slot]!)}
          colorLabel={colorLabel}
          ariaLabel={ui[name].color}
          testId={`${name}-color-picker`}
          shape="circle"
          className="absolute inset-0"
          swatchPosition={slotCenter}
          swatchClassName={(slot) =>
            ARC_COLORS[slot] === STROKE_COLOR_WHITE ? "border border-border" : undefined
          }
        />

        <label
          className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full transition-[width,height] duration-150 ease-out has-focus-visible:ring-2 has-focus-visible:ring-selection has-focus-visible:ring-offset-2 motion-reduce:transition-none ${
            custom ? "h-7 w-7 ring-2 ring-ink-muted ring-offset-2" : "h-6 w-6"
          }`}
          style={{ left: pickerCenter.x, top: pickerCenter.y, backgroundImage: RAINBOW }}
          data-testid={`${name}-color-custom`}
          data-selected={custom}
        >
          <input
            type="color"
            aria-label={ui.pencil.custom}
            className="sr-only"
            value={pickerValue(value)}
            onChange={(event) => onChange(event.target.value.toLowerCase() as CustomStrokeColor)}
          />
        </label>
      </div>
    </div>
  );
}
