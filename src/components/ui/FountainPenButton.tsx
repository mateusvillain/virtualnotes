"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface FountainPenButtonProps {
  /** O modo caneta tinteiro está ligado agora. */
  active: boolean;
  /** Liga ou desliga o modo — a mesma ação da tecla `F`. */
  onToggle: () => void;
}

/**
 * Ícone de caneta tinteiro: a pena vista de frente, com a fenda e o respiro, no mesmo traço
 * do resto da interface. Adaptado do `pen-tool` do Lucide (ISC).
 *
 * O mesmo desenho é o cursor do modo, em `.cursor-fountain` (src/app/globals.css). As duas
 * cópias precisam andar juntas; não dá para ter uma só, porque um `url()` de CSS não alcança
 * um componente React.
 */
function FountainPenIcon() {
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
      <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" />
      <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" />
      <path d="m2.3 2.3 7.286 7.286" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

/**
 * Liga e desliga o modo caneta tinteiro (#114).
 *
 * Mesmo desenho do `PencilButton`: no toque, onde não há tecla `F`, este botão é a única
 * porta para o modo e a única indicação de que ele está ligado. `aria-pressed` pelo mesmo
 * motivo de lá — o nome do botão continua sendo a ação, e o estado vem do atributo.
 */
export function FountainPenButton({ active, onToggle }: FountainPenButtonProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip
        label={ui.fountain.action}
        shortcut={shortcutLabel(SHORTCUTS.fountain, isMac)}
        align="start"
      >
        <button
          type="button"
          // O fundo do estado ligado é o mesmo do `hover`, como no lápis: "ligado" é o botão
          // com a aparência de quem está sendo apontado.
          className={`${iconButtonClass} ${active ? "bg-canvas text-ink" : ""}`}
          onClick={onToggle}
          aria-label={ui.fountain.action}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.fountain)}
          aria-pressed={active}
        >
          <FountainPenIcon />
        </button>
      </Tooltip>
    </div>
  );
}
