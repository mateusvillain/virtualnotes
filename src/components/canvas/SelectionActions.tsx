"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUi } from "@/lib/i18n/LocaleProvider";

interface SelectionActionsProps {
  onRemove: () => void;
  onDuplicate: () => void;
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7h14" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

/**
 * Remover e duplicar a seleção, para quem marcou algo no toque e não tem teclado (#99).
 *
 * Em desktop as duas ações já têm caminho — `Delete` e copiar/colar —, e é por isso que
 * este par só aparece atrás de `useTouchPrimary`: repeti-las ali seria uma barra maior sem
 * ganho para quem já tem as teclas.
 *
 * Remover é o mesmo `deleteSelection` que o atalho já usa — dois caminhos para a mesma
 * ação, não duas ações —, e duplicar é `duplicateSelection`, o gesto de colar sem passar
 * pela área de transferência do sistema.
 */
export function SelectionActions({ onRemove, onDuplicate }: SelectionActionsProps) {
  const ui = useUi();

  return (
    <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip label={ui.selectionActions.duplicate} side="top">
        <button
          type="button"
          className={iconButtonClass}
          onClick={onDuplicate}
          aria-label={ui.selectionActions.duplicate}
        >
          <DuplicateIcon />
        </button>
      </Tooltip>
      <Tooltip label={ui.selectionActions.remove} side="top">
        <button
          type="button"
          className={iconButtonClass}
          onClick={onRemove}
          aria-label={ui.selectionActions.remove}
        >
          <TrashIcon />
        </button>
      </Tooltip>
    </div>
  );
}
