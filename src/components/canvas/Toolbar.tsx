"use client";

import type { ComponentType, SVGProps } from "react";
import { ToolbarTool } from "@/components/ui/ToolbarTool";
import { EraserIllustration } from "@/components/ui/tools/EraserIllustration";
import { FountainPenIllustration } from "@/components/ui/tools/FountainPenIllustration";
import { HighlighterIllustration } from "@/components/ui/tools/HighlighterIllustration";
import { NoteIllustration } from "@/components/ui/tools/NoteIllustration";
import { PencilIllustration } from "@/components/ui/tools/PencilIllustration";
import type { ToolMode } from "@/lib/board/modes";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { SHORTCUTS } from "@/lib/shortcuts";

interface ToolbarProps {
  /** A ferramenta ligada, ou `null` com a seleção valendo. */
  active: ToolMode | null;
  /** Liga a ferramenta, ou volta para a seleção se ela já era a ativa. */
  onToggle: (mode: ToolMode) => void;
}

/**
 * O vidro das peças da base da tela: a pílula das ferramentas e, acima dela, o bloco de
 * cores (#140). Branco a 90% com desfoque de 4px e borda a meio tom, como no Figma (1-625) —
 * sem a sombra dos controles do canto, porque aqui a peça encosta no quadro e as ilustrações
 * já fazem o volume.
 */
export const toolbarSurfaceClass =
  "rounded-full border border-border/50 bg-surface/90 backdrop-blur-xs";

interface ToolbarEntry {
  mode: ToolMode;
  /** Chave de `ui` e de `SHORTCUTS`: as duas usam o mesmo nome para a ferramenta. */
  name: "note" | "pencil" | "fountain" | "highlighter" | "eraser";
  Illustration: ComponentType<SVGProps<SVGSVGElement>>;
  /** Largura da coluna do botão. */
  column: string;
  /** Tamanho da ilustração dentro da coluna; a altura segue a proporção. */
  illustration: string;
}

/**
 * As colunas de traço têm 44px: a ilustração de 20px e 12px de cada lado, o que dá os 24px
 * entre ilustrações do Figma. A nota tem coluna própria, de 97px, e fica ~7px mais baixa que
 * as pontas (`mt-1.5`).
 */
const STROKE = { column: "w-11", illustration: "h-auto w-5" } as const;

/** As ferramentas, na ordem do Figma (1-2, 1-625). */
export const TOOLBAR_TOOLS: readonly ToolbarEntry[] = [
  {
    mode: "placing",
    name: "note",
    Illustration: NoteIllustration,
    column: "w-[97px]",
    illustration: "mt-1.5 h-auto w-24",
  },
  { mode: "pencil", name: "pencil", Illustration: PencilIllustration, ...STROKE },
  { mode: "fountain", name: "fountain", Illustration: FountainPenIllustration, ...STROKE },
  { mode: "highlighter", name: "highlighter", Illustration: HighlighterIllustration, ...STROKE },
  { mode: "erasing", name: "eraser", Illustration: EraserIllustration, ...STROKE },
];

/**
 * A toolbar inferior (#137): uma pílula no centro da borda de baixo, com as ferramentas
 * desenhadas saindo de dentro dela.
 *
 * Não tem botão de seleção. A seleção é o que vale quando nenhuma ferramenta está ligada:
 * clicar na ferramenta ativa a desliga, e `V`/`Esc` continuam voltando para ela. Um botão
 * para "nenhuma ferramenta" seria o único da fileira sem desenho, e o que mais apareceria
 * aceso sem ninguém ter clicado.
 *
 * `role="group"`, e não `toolbar`: o papel de toolbar promete navegação por setas com um só
 * ponto de Tab, e aqui cada ferramenta é um botão tabulável como os do resto da moldura.
 *
 * A pílula não corta nada: cada `ToolbarTool` corta a própria ilustração na base, e a base
 * de todos é a borda de baixo da pílula (`items-stretch` numa altura fixa). Assim o tooltip,
 * que sai por cima, não é cortado junto. 88px de altura contando a borda, como no Figma.
 *
 * A nota fica a 24px do lápis, como as de traço entre si: os 12px da coluna do lápis mais o
 * `gap-3`.
 */
export function Toolbar({ active, onToggle }: ToolbarProps) {
  const ui = useUi();
  const [note, ...strokes] = TOOLBAR_TOOLS;

  function tool({ mode, name, Illustration, column, illustration }: ToolbarEntry) {
    return (
      <ToolbarTool
        key={mode}
        active={active === mode}
        onToggle={() => onToggle(mode)}
        label={ui[name].action}
        shortcut={SHORTCUTS[name]}
        className={column}
      >
        <Illustration className={illustration} />
      </ToolbarTool>
    );
  }

  return (
    <div
      role="group"
      aria-label={ui.toolbar.label}
      className={`flex h-22 items-stretch gap-3 pl-6 pr-7 ${toolbarSurfaceClass}`}
      data-testid="toolbar"
    >
      {tool(note!)}
      <div className="flex items-stretch">{strokes.map(tool)}</div>
    </div>
  );
}
