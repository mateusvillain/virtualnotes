"use client";

import type { ReactNode } from "react";
import { ToolbarTool } from "@/components/ui/ToolbarTool";
import { EraserIllustration } from "@/components/ui/tools/EraserIllustration";
import { FountainPenIllustration } from "@/components/ui/tools/FountainPenIllustration";
import { HighlighterIllustration } from "@/components/ui/tools/HighlighterIllustration";
import { NoteIllustration } from "@/components/ui/tools/NoteIllustration";
import { PencilIllustration } from "@/components/ui/tools/PencilIllustration";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { SHORTCUTS } from "@/lib/shortcuts";

/** As ferramentas que a toolbar liga e desliga — todos os modos do quadro menos a seleção. */
export type ToolbarMode = "placing" | "pencil" | "fountain" | "highlighter" | "erasing";

interface ToolbarProps {
  /** A ferramenta ligada, ou `null` com a seleção valendo. */
  active: ToolbarMode | null;
  /** Liga a ferramenta, ou volta para a seleção se ela já era a ativa. */
  onToggle: (mode: ToolbarMode) => void;
  /**
   * O bloco de cores do traço (#140), acima da pílula. Quem decide se ele aparece é quem
   * sabe qual ferramenta desenha — só Lápis, Caneta tinteiro e Marca-texto têm cor.
   */
  palette?: ReactNode;
}

/** Coluna de cada ferramenta de traço: a ilustração tem 20px e sobram 12px de cada lado. */
const STROKE_COLUMN = "w-11";
/** As ilustrações de traço, na largura do Figma (1-625); a altura segue a proporção. */
const STROKE_ILLUSTRATION = "h-auto w-5";

/**
 * A toolbar inferior (#137): uma pílula no centro da borda de baixo, com as ferramentas
 * desenhadas saindo de dentro dela — Nota, Lápis, Caneta tinteiro, Marca-texto e Borracha,
 * na ordem do Figma (1-2, 1-625).
 *
 * Não tem botão de seleção. A seleção é o que vale quando nenhuma ferramenta está ligada:
 * clicar na ferramenta ativa a desliga, e `V`/`Esc` continuam voltando para ela. Um botão
 * para "nenhuma ferramenta" seria o único da fileira sem desenho, e o que mais apareceria
 * aceso sem ninguém ter clicado.
 *
 * A pílula não corta nada: cada `ToolbarTool` corta a própria ilustração na base, e a base
 * de todos é a borda de baixo da pílula (`items-stretch` numa altura fixa). Assim o tooltip,
 * que sai por cima, não é cortado junto.
 *
 * O bloco de cores (#140) fica fora do `role="toolbar"`: é um `radiogroup` com nome próprio,
 * e dentro da toolbar as setas do grupo e as da toolbar disputariam a mesma tecla.
 *
 * A nota fica numa coluna mais larga, com o mesmo respiro de 24px até o lápis que as
 * ferramentas de traço têm entre si (os 12px da coluna do lápis mais o `gap-3`).
 */
export function Toolbar({ active, onToggle, palette }: ToolbarProps) {
  const ui = useUi();

  return (
    // 9px entre o bloco de cores e a pílula, como no Figma (1-625). Coluna ancorada embaixo:
    // o bloco aparecer não empurra a pílula, só cresce para cima.
    <div className="flex flex-col items-center gap-[9px]">
      {palette === undefined ? null : (
        // Mesmo vidro da pílula: as duas peças são uma toolbar só, em dois andares. `px-2`
        // e altura de 44px fecham as medidas do Figma com a cor marcada em 28px.
        <div
          className="flex h-11 items-center rounded-full border border-border/50 bg-surface/90 px-2 backdrop-blur-xs"
          data-testid="toolbar-palette"
        >
          {palette}
        </div>
      )}
      <div
        role="toolbar"
        aria-label={ui.toolbar.label}
        className="flex h-22 box-content items-stretch gap-3 rounded-full border border-border/50 bg-surface/90 pl-6 pr-7 backdrop-blur-xs"
        data-testid="toolbar"
      >
        <ToolbarTool
          active={active === "placing"}
          onToggle={() => onToggle("placing")}
          label={ui.note.action}
          shortcut={SHORTCUTS.note}
          className="w-[97px]"
        >
          {/* Mais baixa que as de traço: no Figma o topo da nota fica ~7px abaixo das pontas. */}
          <NoteIllustration className="mt-1.5 h-auto w-24" />
        </ToolbarTool>
        <div className="flex items-stretch">
          <ToolbarTool
            active={active === "pencil"}
            onToggle={() => onToggle("pencil")}
            label={ui.pencil.action}
            shortcut={SHORTCUTS.pencil}
            className={STROKE_COLUMN}
          >
            <PencilIllustration className={STROKE_ILLUSTRATION} />
          </ToolbarTool>
          <ToolbarTool
            active={active === "fountain"}
            onToggle={() => onToggle("fountain")}
            label={ui.fountain.action}
            shortcut={SHORTCUTS.fountain}
            className={STROKE_COLUMN}
          >
            <FountainPenIllustration className={STROKE_ILLUSTRATION} />
          </ToolbarTool>
          <ToolbarTool
            active={active === "highlighter"}
            onToggle={() => onToggle("highlighter")}
            label={ui.highlighter.action}
            shortcut={SHORTCUTS.highlighter}
            className={STROKE_COLUMN}
          >
            <HighlighterIllustration className={STROKE_ILLUSTRATION} />
          </ToolbarTool>
          <ToolbarTool
            active={active === "erasing"}
            onToggle={() => onToggle("erasing")}
            label={ui.eraser.action}
            shortcut={SHORTCUTS.eraser}
            className={STROKE_COLUMN}
          >
            <EraserIllustration className={STROKE_ILLUSTRATION} />
          </ToolbarTool>
        </div>
      </div>
    </div>
  );
}
