"use client";

import { useEffect, type RefObject } from "react";

/**
 * Fecha um painel flutuante quando um clique começa fora dele e do gatilho (#135, #155).
 *
 * O gatilho não conta como fora: quem o alterna é o próprio botão, e fechar aqui faria o
 * clique dele reabrir o painel em seguida.
 *
 * O foco só volta ao gatilho se estava no painel, que vai sumir: sem isso ele cairia no
 * começo do documento. Se estava em outro lugar, fica onde está.
 */
export function useOutsidePointerDown(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target === null) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;

      const focusInside = panelRef.current?.contains(document.activeElement) ?? false;
      onClose();
      if (focusInside) triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose, open, panelRef, triggerRef]);
}
