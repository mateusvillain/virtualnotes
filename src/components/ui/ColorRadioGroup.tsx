"use client";

import { useRef, useState, type KeyboardEvent } from "react";

interface ColorRadioGroupProps {
  /** Quantas opções a paleta tem. Os índices vão de `0` a `count - 1`. */
  count: number;
  /** Índice marcado, ou `null` quando não há um só — seleção mista, por exemplo. */
  value: number | null;
  onChange: (color: number) => void;
  /** Valor CSS de fundo de cada quadradinho. */
  swatchColor: (color: number) => string;
  /** Rótulo de cada opção, para `aria-label` e leitor de tela. */
  colorLabel: (color: number) => string;
  /** Rótulo do grupo inteiro. */
  ariaLabel: string;
  /** `data-testid` do grupo; cada quadradinho usa `${testId}-swatch-${índice}`. */
  testId: string;
  /**
   * Quadradinhos com borda (post-it) ou círculos sem borda (paleta do traço na toolbar, #140).
   *
   * No círculo a cor marcada cresce de 24 para 28px, como no Figma (1-625), e ganha um anel
   * cinza afastado 2px. Só o tamanho não bastava: 4px a mais num pastel claro sobre fundo
   * branco é pouco sinal (WCAG 1.4.11 pede 3:1 para o indicador), e o anel em
   * `--color-ink-muted` passa disso sobre o branco em qualquer uma das sete cores. Cinza, e
   * não a cor de seleção, para o foco por teclado (`ring-selection`) continuar distinguível
   * de "marcada".
   */
  shape?: "square" | "circle";
}

/** Aparência de cada opção, por formato e estado. */
const SWATCH = {
  square: {
    base: "h-6 w-6 rounded-control border transition-shadow",
    selected: "border-selection ring-2 ring-selection",
    idle: "border-border hover:border-ink-muted",
  },
  circle: {
    base: "rounded-full transition-[width,height] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-selection focus-visible:ring-offset-2 motion-reduce:transition-none",
    selected: "h-7 w-7 ring-2 ring-ink-muted ring-offset-2",
    idle: "h-6 w-6",
  },
} as const;

/** Índice do próximo item, dando a volta nas pontas. */
function wrap(index: number, length: number): number {
  return (index + length) % length;
}

/**
 * A grade de quadradinhos de cor por trás de `ColorPicker` (post-it) e `StrokeColorPicker`
 * (traço, #69) — as duas paletas que o quadro tem, uma delas com um item a mais.
 *
 * É um `radiogroup`, e não uma fila de botões soltos: a pergunta é "qual destas N", e um
 * leitor de tela anuncia "1 de N" e o estado marcado sem que seja preciso inventar rótulo
 * para isso.
 *
 * Por ser um radiogroup, a navegação é a que o papel exige: **um só** ponto de parada de Tab
 * para o grupo inteiro, e as setas andando entre as cores. Uma fila de N itens tabuláveis
 * obrigaria a passar por todas as cores para sair do seletor.
 *
 * Cada quadradinho é um `button` de verdade, com `role="radio"` por cima. Um `div` com o
 * papel teria exigido reimplementar à mão o que o botão já dá: ativar por Enter, ativar por
 * espaço, e o anel de foco que o navegador desenha sozinho.
 *
 * Não sabe nada sobre post-it, traço, nem sobre o que os índices significam: recebe quantas
 * opções existem e como desenhar e nomear cada uma. É o que o deixa reutilizável entre as
 * duas paletas sem repetir a navegação por teclado numa terceira vez.
 */
export function ColorRadioGroup({
  count,
  value,
  onChange,
  swatchColor,
  colorLabel,
  ariaLabel,
  testId,
  shape = "square",
}: ColorRadioGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  /**
   * Onde o foco esteve por último dentro do grupo.
   *
   * O ponto de parada de Tab segue o foco, e não a cor marcada, porque o papel pede isso e
   * porque as duas coisas se separam: marcar dois post-its de cores diferentes deixa a
   * seleção sem cor comum, e um ponto de parada preso ao valor saltaria para o primeiro
   * quadradinho enquanto o foco continua onde estava.
   */
  const [focused, setFocused] = useState<number | null>(null);

  /**
   * Sem foco nem cor marcada o ponto de parada é o primeiro item, ou o grupo inteiro ficaria
   * fora da ordem de tabulação e inalcançável pelo teclado.
   */
  const tabStop = focused ?? value ?? 0;

  /** Move o foco e já escolhe a cor: num radiogroup, andar com a seta é escolher. */
  function selectColor(color: number): void {
    const radios = groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    radios?.[color]?.focus();
    onChange(color);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, color: number): void {
    const next = wrap(color + 1, count);
    const previous = wrap(color - 1, count);

    // As quatro setas, e não só as horizontais: os quadradinhos ficam numa linha só, mas
    // quem navega por teclado não vê a disposição, e o papel aceita os dois eixos.
    const target: Record<string, number | undefined> = {
      ArrowRight: next,
      ArrowDown: next,
      ArrowLeft: previous,
      ArrowUp: previous,
      Home: 0,
      End: count - 1,
    };

    const destination = target[event.key];
    if (destination === undefined) return;

    // Sem isto a seta rola o quadro por baixo do seletor, e Home salta para o topo da página.
    event.preventDefault();
    selectColor(destination);
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex items-center ${shape === "circle" ? "gap-2" : "gap-1"}`}
      data-testid={testId}
    >
      {Array.from({ length: count }, (_, color) => {
        const selected = value === color;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={colorLabel(color)}
            tabIndex={color === tabStop ? 0 : -1}
            onClick={() => onChange(color)}
            onKeyDown={(event) => handleKeyDown(event, color)}
            onFocus={() => setFocused(color)}
            className={`${SWATCH[shape].base} ${
              selected ? SWATCH[shape].selected : SWATCH[shape].idle
            }`}
            style={{ backgroundColor: swatchColor(color) }}
            data-testid={`${testId}-swatch-${color}`}
            data-selected={selected}
          />
        );
      })}
    </div>
  );
}
