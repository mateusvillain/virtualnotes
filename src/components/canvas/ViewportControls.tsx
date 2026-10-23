"use client";

import { useCallback, useMemo } from "react";
import { MAX_SCALE, MIN_SCALE, scaleAsPercent, type Point } from "@/lib/canvas/coords";
import { ZOOM_STEP, type ViewportApi } from "@/lib/canvas/useViewport";
import { Dropdown, type DropdownEntry } from "@/components/ui/Dropdown";
import { iconButtonClass, pillSurfaceClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUi } from "@/lib/i18n/LocaleProvider";

interface ViewportControlsProps extends Pick<ViewportApi, "viewport" | "zoomBy" | "reset"> {
  /**
   * Ponto de ancoragem do zoom por botão — o centro da área visível. É função, e não um
   * ponto pronto, porque depende do tamanho atual do container: medir na hora do clique
   * evita guardar em estado uma medida que o resize invalida.
   */
  anchor: () => Point;
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
 * Controles de zoom e reset, para quem não tem roda de mouse ou prefere clicar.
 *
 * Uma pílula no canto superior direito, ao lado do histórico (#139, Figma 1-2): −, a
 * porcentagem e +. A porcentagem abre o menu de zoom (#135); por ora só com as ações que o
 * viewport já tem — zoom to fit, os níveis fixos e os atalhos chegam com a #136 e a #141. Os sinais são ícones, e não texto, para terem o peso
 * e o tamanho dos outros botões da moldura. Dicas abaixo, porque a pílula encosta no topo.
 */
export function ViewportControls({ viewport, zoomBy, reset, anchor }: ViewportControlsProps) {
  const ui = useUi();
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP, anchor()), [zoomBy, anchor]);
  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP, anchor()), [zoomBy, anchor]);

  const entries = useMemo<DropdownEntry[]>(
    () => [
      { kind: "item", label: ui.zoom.in, disabled: viewport.scale >= MAX_SCALE, onSelect: zoomIn },
      {
        kind: "item",
        label: ui.zoom.out,
        disabled: viewport.scale <= MIN_SCALE,
        onSelect: zoomOut,
      },
      { kind: "separator" },
      { kind: "item", label: ui.zoom.reset, onSelect: reset },
    ],
    [reset, ui, viewport.scale, zoomIn, zoomOut],
  );

  return (
    <div className={`flex items-center gap-1 p-1 ${pillSurfaceClass}`} data-testid="zoom-pill">
      <Tooltip label={ui.zoom.out}>
        <button
          type="button"
          className={iconButtonClass}
          onClick={zoomOut}
          disabled={viewport.scale <= MIN_SCALE}
          aria-label={ui.zoom.out}
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
      <Tooltip label={ui.zoom.in} align="end">
        <button
          type="button"
          className={iconButtonClass}
          onClick={zoomIn}
          disabled={viewport.scale >= MAX_SCALE}
          aria-label={ui.zoom.in}
        >
          <ZoomIcon plus />
        </button>
      </Tooltip>
    </div>
  );
}
