"use client";

import { useId, type KeyboardEvent } from "react";

/** Largura do slider e da alça, em px (Penpot, `Variant3`). */
export const SLIDER_WIDTH = 140;
const HANDLE_WIDTH = 8;

/**
 * O desenho da trilha.
 *
 * - `fill`: a cunha cinza que engrossa para a direita, pintada de azul até a alça — o slider
 *   de espessura.
 * - `checker`: o xadrez de transparência sob um gradiente do transparente até `color` — o
 *   slider de opacidade, que mostra a cor do traço ficando mais forte.
 */
export type SliderTrack = { kind: "fill" } | { kind: "checker"; color: string };

interface SliderProps {
  /** Índice do passo marcado, de `0` a `steps - 1`. */
  value: number;
  /** Quantos passos o slider tem. Não sabe o que eles significam. */
  steps: number;
  onChange: (value: number) => void;
  /** Rótulo visível, acima da trilha, e nome acessível do controle. */
  label: string;
  /** O valor como o leitor de tela deve anunciá-lo ("2×", "35%"). */
  valueText: (value: number) => string;
  track: SliderTrack;
  /**
   * Deitado, com o rótulo em cima; ou em pé, sem rótulo visível — o nome continua valendo para
   * o leitor de tela. Em pé é o mesmo slider girado -90°: o começo fica embaixo e o fim em
   * cima, e o `<input>` nativo gira junto, então o arrasto segue o eixo que se vê.
   */
  orientation?: "horizontal" | "vertical";
  testId?: string;
}

/** A cunha da trilha de espessura: 2px de altura na ponta fina, 8px na grossa. */
const WEDGE = `0,3 ${SLIDER_WIDTH},0 ${SLIDER_WIDTH},8 0,5`;

function Wedge({ className }: { className: string }) {
  return (
    <svg
      width={SLIDER_WIDTH}
      height={8}
      viewBox={`0 0 ${SLIDER_WIDTH} 8`}
      aria-hidden="true"
      className={`block shrink-0 ${className}`}
    >
      <polygon points={WEDGE} />
    </svg>
  );
}

/**
 * Slider em passos (#156), com o visual do Penpot.
 *
 * Por baixo é um `<input type="range">` de verdade: arrasto por mouse e por toque, e os
 * `aria-value*`, já vêm do navegador. Ele fica invisível por cima
 * do desenho, do mesmo tamanho, e a alça desenhada acompanha o valor. O polegar nativo tem a
 * largura da alça (8px), para o ponto em que o dedo solta cair no passo que a alça mostra.
 *
 * O foco por teclado aparece na alça (`peer-focus-visible`), que é onde o olho está.
 */
export function Slider({
  value,
  steps,
  onChange,
  label,
  valueText,
  track,
  orientation = "horizontal",
  testId,
}: SliderProps) {
  const vertical = orientation === "vertical";
  const id = useId();
  const last = Math.max(steps - 1, 1);
  const handleLeft = (value / last) * (SLIDER_WIDTH - HANDLE_WIDTH);

  /**
   * As teclas tratadas aqui, e não deixadas ao navegador: cada um decide quanto Page Up anda
   * e se a seta para cima sobe, e com passos que são índices a resposta tem de ser a mesma
   * em todos. Um passo por seta, um quarto da trilha por página.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const page = Math.max(1, Math.round(steps / 4));
    const target: Record<string, number | undefined> = {
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      PageUp: value + page,
      PageDown: value - page,
      Home: 0,
      End: steps - 1,
    };

    const next = target[event.key];
    if (next === undefined) return;

    event.preventDefault();
    const clamped = Math.min(Math.max(next, 0), steps - 1);
    if (clamped !== value) onChange(clamped);
  }

  const slider = (
    <div
      className={`relative h-3.5 ${vertical ? "absolute top-1/2 left-1/2 -translate-1/2 -rotate-90" : ""}`}
      style={{ width: SLIDER_WIDTH }}
    >
      <input
        id={id}
        type="range"
        min={0}
        max={steps - 1}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={handleKeyDown}
        aria-valuetext={valueText(value)}
        className="peer absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none opacity-0 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:appearance-none"
      />

      {track.kind === "fill" ? (
        <div className="pointer-events-none absolute top-[3px] left-0">
          <Wedge className="fill-[#d9d9d9]" />
          <div
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: handleLeft + HANDLE_WIDTH }}
          >
            <Wedge className="fill-[#43a7ee]" />
          </div>
        </div>
      ) : (
        // Casas de 4px, `#ebebeb` sobre branco, e por cima o gradiente até a cor do traço.
        <div className="pointer-events-none absolute inset-x-0 top-[3px] h-2 overflow-hidden rounded-full bg-[repeating-conic-gradient(#ebebeb_0_25%,#ffffff_0_50%)] bg-size-[8px_8px]">
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(to right, transparent, ${track.color})` }}
            data-testid={testId === undefined ? undefined : `${testId}-gradient`}
          />
        </div>
      )}

      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 h-3.5 w-2 rounded-2xl border border-[#dddddd] bg-white shadow-[0_1px_1px_rgb(0_0_0/0.08)] peer-focus-visible:ring-2 peer-focus-visible:ring-selection peer-focus-visible:ring-offset-1"
        style={{ left: handleLeft }}
        data-testid={testId === undefined ? undefined : `${testId}-handle`}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <label htmlFor={id} className={vertical ? "sr-only" : "text-xs leading-[14px] text-ink"}>
        {label}
      </label>
      {vertical ? (
        // A caixa em pé que o slider girado ocupa: girar não muda o tamanho no layout.
        <div className="relative w-3.5" style={{ height: SLIDER_WIDTH }}>
          {slider}
        </div>
      ) : (
        slider
      )}
    </div>
  );
}
