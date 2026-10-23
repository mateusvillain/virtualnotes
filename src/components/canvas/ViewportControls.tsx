"use client";

import { useMemo } from "react";
import {
  MAX_SCALE,
  MIN_SCALE,
  scaleAsPercent,
  ZOOM_LEVELS,
  type Viewport,
  type ZoomLevel,
} from "@/lib/canvas/coords";
import { Dropdown, type DropdownEntry } from "@/components/ui/Dropdown";
import { iconButtonClass, pillSurfaceClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { useIsMac } from "@/lib/dom/useIsMac";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

/**
 * As ações de zoom já ancoradas no centro da área visível.
 *
 * Prontas, e não `zoomBy` mais uma âncora: o quadro é quem sabe o tamanho da área e o que
 * existe nela — o zoom to fit precisa das duas coisas —, e os atalhos de teclado chamam as
 * mesmas funções que os botões e o menu.
 */
interface ZoomActions {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToLevel: (level: ZoomLevel) => void;
  zoomToFit: () => void;
}

interface ViewportControlsProps extends ZoomActions {
  viewport: Viewport;
}

/** Traço de 20px, no mesmo peso dos outros ícones da moldura. `plus` soma o traço vertical. */
function ZoomIcon({ plus = false }: { plus?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      {plus ? <path d="M12 5v14" /> : null}
    </svg>
  );
}

/**
 * Controles de zoom, para quem não tem roda de mouse ou prefere clicar.
 *
 * Uma pílula no canto superior direito, ao lado do histórico (#139, Figma 1-2): −, a
 * porcentagem e +. Os sinais são ícones, e não texto, para terem o peso e o tamanho dos
 * outros botões da moldura. Dicas abaixo, porque a pílula encosta no topo.
 *
 * A porcentagem abre o menu de zoom (#141, Figma 1-477): ampliar e reduzir, enquadrar tudo
 * e os níveis fixos, cada um com o atalho à direita quando tem.
 */
export function ViewportControls({
  viewport,
  zoomIn,
  zoomOut,
  zoomToLevel,
  zoomToFit,
}: ViewportControlsProps) {
  const ui = useUi();
  const isMac = useIsMac();
  const atMax = viewport.scale >= MAX_SCALE;
  const atMin = viewport.scale <= MIN_SCALE;

  const entries = useMemo<DropdownEntry[]>(
    () => [
      {
        kind: "item",
        label: ui.zoom.in,
        shortcut: SHORTCUTS.zoomIn,
        disabled: atMax,
        onSelect: zoomIn,
      },
      {
        kind: "item",
        label: ui.zoom.out,
        shortcut: SHORTCUTS.zoomOut,
        disabled: atMin,
        onSelect: zoomOut,
      },
      { kind: "item", label: ui.zoom.fit, onSelect: zoomToFit },
      { kind: "separator" },
      ...ZOOM_LEVELS.map((level): DropdownEntry => ({
        kind: "item",
        label: ui.zoom.level[level],
        // Só o 100% tem atalho: é o `⌘0` do navegador.
        shortcut: level === 1 ? SHORTCUTS.zoomReset : undefined,
        onSelect: () => zoomToLevel(level),
      })),
    ],
    [atMax, atMin, ui, zoomIn, zoomOut, zoomToFit, zoomToLevel],
  );

  return (
    <div className={`flex items-center gap-1 p-1 ${pillSurfaceClass}`} data-testid="zoom-pill">
      <Tooltip label={ui.zoom.out} shortcut={shortcutLabel(SHORTCUTS.zoomOut, isMac)}>
        <button
          type="button"
          className={iconButtonClass}
          onClick={zoomOut}
          disabled={atMin}
          aria-label={ui.zoom.out}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.zoomOut)}
        >
          <ZoomIcon />
        </button>
      </Tooltip>
      <Dropdown
        entries={entries}
        // Perto da borda direita: o menu cresce para a esquerda, para dentro da tela.
        align="end"
        renderTrigger={(trigger, open) => (
          // A dica se cala com o menu aberto: cairia sobre o primeiro item.
          <Tooltip label={ui.zoom.menu} suppressed={open}>
            <button
              type="button"
              // Da altura dos botões de ícone (32px), com a mesma tinta de hover deles. Aberto,
              // fica com a tinta, como os gatilhos da toolbar.
              className="h-8 min-w-14 rounded-full px-2 text-sm tabular-nums text-ink transition-colors hover:bg-control-active active:bg-control-active aria-expanded:bg-control-active"
              aria-label={ui.zoom.menu}
              {...trigger}
            >
              {scaleAsPercent(viewport.scale)}%
            </button>
          </Tooltip>
        )}
      />
      {/* Na ponta da tela: a dica se alinha pela direita para não sair cortada. */}
      <Tooltip label={ui.zoom.in} shortcut={shortcutLabel(SHORTCUTS.zoomIn, isMac)} align="end">
        <button
          type="button"
          className={iconButtonClass}
          onClick={zoomIn}
          disabled={atMax}
          aria-label={ui.zoom.in}
          aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.zoomIn)}
        >
          <ZoomIcon plus />
        </button>
      </Tooltip>
    </div>
  );
}
