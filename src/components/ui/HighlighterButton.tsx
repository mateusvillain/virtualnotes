"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface HighlighterButtonProps {
  /** O modo marca-texto está ligado agora. */
  active: boolean;
  /** Liga ou desliga o modo — a mesma ação da tecla `H`. */
  onToggle: () => void;
}

/**
 * Ícone de marca-texto: o corpo inclinado e a ponta chanfrada, no mesmo traço do resto da
 * interface.
 *
 * O mesmo desenho é o cursor do modo, em `.cursor-highlighter` (src/app/globals.css). As
 * duas cópias precisam andar juntas; não dá para ter uma só, porque um `url()` de CSS não
 * alcança um componente React.
 */
function HighlighterIcon() {
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
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}

/**
 * Liga e desliga o modo marca-texto (#117).
 *
 * Mesmo desenho do `PencilButton`: no toque, onde não há tecla `H`, este botão é a única
 * porta para o modo e a única indicação de que ele está ligado. `aria-pressed` pelo mesmo
 * motivo de lá — o nome do botão continua sendo a ação, e o estado vem do atributo.
 */
export function HighlighterButton({ active, onToggle }: HighlighterButtonProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip
        label={ui.highlighter.action}
        shortcut={shortcutLabel(SHORTCUTS.highlighter, isMac)}
        align="start"
      >
        <button
          type="button"
          // O fundo do estado ligado é o mesmo do `hover`, como no lápis: "ligado" é o botão
          // com a aparência de quem está sendo apontado.
          className={`${iconButtonClass} ${active ? "bg-canvas text-ink" : ""}`}
          onClick={onToggle}
          aria-label={ui.highlighter.action}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.highlighter)}
          aria-pressed={active}
        >
          <HighlighterIcon />
        </button>
      </Tooltip>
    </div>
  );
}
