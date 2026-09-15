"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface HistoryButtonsProps {
  /** Há passo guardado para desfazer. */
  canUndo: boolean;
  /** Há passo guardado para refazer. */
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Seta curva para a esquerda: voltar ao que era.
 *
 * `scale-x-[-1]` faz a de refazer, em vez de um segundo caminho desenhado à mão. Duas
 * versões do mesmo traço divergiriam no dia em que uma delas fosse ajustada, e a simetria
 * entre desfazer e refazer é justamente o que o par precisa comunicar.
 */
function UndoIcon({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${flipped ? "scale-x-[-1]" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h9a5.5 5.5 0 0 1 0 11h-6" />
      <path d="M8 4 4 8l4 4" />
    </svg>
  );
}

/**
 * Desfazer e refazer, no canto de publicar (issue #87).
 *
 * Os atalhos resolvem para quem tem teclado; os botões são o que torna desfazer alcançável
 * no toque, onde não há `Ctrl+Z`, e o que anuncia que a capacidade existe. É a mesma razão
 * pela qual o lápis (#68) e a colocação de nota (#73) ganharam botão além da tecla.
 *
 * Num invólucro só, e não dois vizinhos: são um par, sempre aparecem juntos e nunca fazem
 * sentido separados. Compartilhar a moldura também é o que mantém o canto legível — três
 * caixas lado a lado disputariam a largura com o botão de salvar, que é o que tem mais peso
 * ali.
 *
 * **Desabilitados quando não há o que fazer**, e é a parte que costuma ser esquecida. Um
 * desfazer sempre clicável mente sobre um quadro que não tem passo nenhum guardado, e é
 * justamente no começo — com a pilha vazia — que alguém curioso vai clicar.
 */
export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: HistoryButtonsProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="flex items-center rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip label={ui.history.undo} shortcut={shortcutLabel(SHORTCUTS.undo, isMac)}>
        <button
          type="button"
          className={iconButtonClass}
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={ui.history.undo}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.undo)}
        >
          <UndoIcon />
        </button>
      </Tooltip>
      <Tooltip label={ui.history.redo} shortcut={shortcutLabel(SHORTCUTS.redo, isMac)}>
        <button
          type="button"
          className={iconButtonClass}
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={ui.history.redo}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.redo)}
        >
          <UndoIcon flipped />
        </button>
      </Tooltip>
    </div>
  );
}
