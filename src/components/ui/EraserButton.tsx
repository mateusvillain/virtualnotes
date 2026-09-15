"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface EraserButtonProps {
  /** O modo borracha está ligado agora. */
  active: boolean;
  /** Liga ou desliga o modo — a mesma ação da tecla `E`. */
  onToggle: () => void;
}

/**
 * Ícone de borracha, no mesmo traço do resto da interface.
 *
 * O cursor do modo não repete este desenho — é um círculo do tamanho do alvo, em
 * `EraserCursor.tsx` (#98) —, porque um ícone de tamanho fixo não diz nada sobre o alcance
 * real do gesto, e é justamente isso que o círculo precisa mostrar.
 */
function EraserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 14.5 12.5 6.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 19.5H7z" />
      <path d="M7 19.5H20" />
    </svg>
  );
}

/**
 * Liga e desliga o modo borracha (issue #98).
 *
 * Mesma razão do botão do lápis: sem indicação visível, ligar a borracha faria a seleção por
 * retângulo parar de funcionar sem nada na tela explicando por quê, e no toque este botão é
 * a única forma de saber que o modo existe e de sair dele.
 */
export function EraserButton({ active, onToggle }: EraserButtonProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip
        label={ui.eraser.action}
        shortcut={shortcutLabel(SHORTCUTS.eraser, isMac)}
        align="start"
      >
        <button
          type="button"
          className={`${iconButtonClass} ${active ? "bg-canvas text-ink" : ""}`}
          onClick={onToggle}
          aria-label={ui.eraser.action}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.eraser)}
          aria-pressed={active}
        >
          <EraserIcon />
        </button>
      </Tooltip>
    </div>
  );
}
