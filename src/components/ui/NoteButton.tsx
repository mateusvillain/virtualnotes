"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface NoteButtonProps {
  /** O modo de colocação está armado agora. */
  active: boolean;
  /** Arma e desarma o modo — a mesma ação da tecla `N`. */
  onToggle: () => void;
}

/**
 * Post-it com um `+`, o mesmo desenho que a apresentação do quadro vazio usa na linha da nota.
 *
 * As duas cópias existem porque vivem em contextos diferentes — lá o ícone é ilustração de
 * uma linha de ajuda, aqui é o rosto de um botão — mas o traço é o mesmo do resto da
 * interface, e é ele que faz a pessoa reconhecer no botão o que leu na apresentação.
 */
function NoteIcon() {
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
      <path d="M3.5 5A1.5 1.5 0 0 1 5 3.5h8A1.5 1.5 0 0 1 14.5 5v6L11 14.5H5A1.5 1.5 0 0 1 3.5 13z" />
      <path d="M14.5 11H12a1 1 0 0 0-1 1v2.5" />
      <path d="M18.5 15v6M15.5 18h6" />
    </svg>
  );
}

/**
 * Arma a colocação de uma nota (issue #73).
 *
 * Existe pela mesma razão que o botão do lápis: o modo precisa de uma indicação visível.
 * Com ele armado, arrastar o fundo deixa de desenhar o retângulo de seleção e o clique
 * seguinte vira uma nota — e sem nada na tela dizendo isso, a mudança pareceria defeito.
 *
 * No toque ele importa ainda mais, porque lá não há tecla `N` nem cursor para a prévia
 * seguir: o botão é a única porta para o modo, e o toque na superfície é o que coloca a
 * nota. Fica acima do lápis por ser a ferramenta mais usada das duas — o quadro é de
 * post-its, e o rabisco é o que se faz em volta deles.
 *
 * `aria-pressed`, e não um segundo rótulo para o estado armado: é o atributo que os leitores
 * de tela já anunciam como "pressionado", e o nome do botão continua sendo a ação.
 */
export function NoteButton({ active, onToggle }: NoteButtonProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip
        label={ui.note.action}
        shortcut={shortcutLabel(SHORTCUTS.note, isMac)}
        align="start"
      >
        <button
          type="button"
          // O fundo do estado armado é o mesmo que o `hover` já usa: o botão fica com a
          // aparência de quem está sendo apontado, que é o que "ligado" quer dizer aqui.
          className={`${iconButtonClass} ${active ? "bg-canvas text-ink" : ""}`}
          onClick={onToggle}
          aria-label={ui.note.action}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.note)}
          aria-pressed={active}
        >
          <NoteIcon />
        </button>
      </Tooltip>
    </div>
  );
}
