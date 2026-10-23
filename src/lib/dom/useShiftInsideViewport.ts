"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { shiftInsideViewport } from "@/lib/dom/insideViewport";

/**
 * O deslocamento horizontal que traz um painel flutuante para dentro da janela, para usar
 * como `marginLeft` (#135, #155).
 *
 * Medido depois de montar (`useLayoutEffect`), antes de pintar: o painel nunca aparece cortado
 * por um quadro. Remedido a cada abertura, e não a cada render — o gatilho não anda enquanto o
 * painel está aberto.
 */
export function useShiftInsideViewport(ref: RefObject<HTMLElement | null>, open: boolean): number {
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!open) return;
    const element = ref.current;
    if (element === null) return;

    // Mede sem o ajuste anterior, ou a correção se somaria a si mesma a cada abertura. O
    // valor novo vai direto para o DOM também: se for igual ao do estado, o React não
    // reescreveria o estilo que acabou de ser zerado aqui.
    element.style.marginLeft = "0px";
    const { left, right } = element.getBoundingClientRect();
    const next = shiftInsideViewport(left, right, window.innerWidth);
    element.style.marginLeft = `${next}px`;
    setShift(next);
  }, [open, ref]);

  return shift;
}
