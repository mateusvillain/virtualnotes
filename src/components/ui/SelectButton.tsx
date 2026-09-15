"use client";

import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

interface SelectButtonProps {
  /** A ferramenta de seleção é a ativa agora. */
  active: boolean;
  /** Escolhe a ferramenta — a mesma ação da tecla `V`. */
  onSelect: () => void;
}

/**
 * Seta de ponteiro, no mesmo traço dos outros ícones da moldura.
 *
 * Preenchida, e não só contornada: é o único ícone da pilha que desenha um ponteiro, e um
 * ponteiro vazado se lê como uma bandeirinha. É também o mesmo desenho que o cursor do
 * sistema tem enquanto esta ferramenta está ativa — o botão mostra o que a mão vira.
 */
function SelectIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 3.5 18 12.2l-5.1.6-2.6 4.6z" />
    </svg>
  );
}

/**
 * Escolhe a ferramenta de seleção (issue #83).
 *
 * O estado sempre existiu — era ele que fazia arrastar o fundo desenhar o retângulo de
 * seleção —, mas não tinha rosto. A consequência era que sair do lápis virava uma ação sem
 * destino: dava para apertar `P` de novo ou `Esc`, e não havia para onde *ir*. Com o botão,
 * "desligar o lápis" vira "escolher a seleção", que é o mesmo gesto com um lugar de chegada.
 *
 * Fica no topo da pilha porque é a ferramenta de partida e a mais usada: é o estado em que o
 * quadro começa, e aquele para onde `Esc` sempre volta.
 *
 * **Nasce aceso**, e é o único da pilha que às vezes está aceso sem ninguém ter clicado —
 * consequência de haver sempre uma ferramenta ativa. Sem isso a barra mentiria: mostraria
 * três botões apagados enquanto uma das três está, de fato, valendo.
 *
 * `onSelect` e não `onToggle`, ao contrário dos vizinhos: a ferramenta de partida não tem
 * para onde ser desligada, e clicar no botão já aceso não faz nada.
 */
export function SelectButton({ active, onSelect }: SelectButtonProps) {
  const ui = useUi();
  const isMac = useIsMac();

  return (
    <div className="rounded-control border border-border bg-surface p-1 shadow-control">
      <Tooltip
        label={ui.select.action}
        shortcut={shortcutLabel(SHORTCUTS.select, isMac)}
        align="start"
      >
        <button
          type="button"
          // O fundo do estado ativo é o mesmo que o `hover` já usa: o botão fica com a
          // aparência de quem está sendo apontado, que é o que "ligado" quer dizer aqui.
          className={`${iconButtonClass} ${active ? "bg-canvas text-ink" : ""}`}
          onClick={onSelect}
          aria-label={ui.select.action}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.select)}
          aria-pressed={active}
        >
          <SelectIcon />
        </button>
      </Tooltip>
    </div>
  );
}
