"use client";

import { useId, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { ToolbarTool } from "@/components/ui/ToolbarTool";
import { EraserIllustration } from "@/components/ui/tools/EraserIllustration";
import { FountainPenIllustration } from "@/components/ui/tools/FountainPenIllustration";
import { HighlighterIllustration } from "@/components/ui/tools/HighlighterIllustration";
import { NoteIllustration } from "@/components/ui/tools/NoteIllustration";
import { PencilIllustration } from "@/components/ui/tools/PencilIllustration";
import { StrokeIcon } from "@/components/ui/tools/StrokeIcon";
import type { ToolMode } from "@/lib/board/modes";
import { useUi } from "@/lib/i18n/LocaleProvider";
import { useIsMac } from "@/lib/dom/useIsMac";
import { SHORTCUTS, ariaKeyShortcuts, shortcutLabel, type ButtonShortcut } from "@/lib/shortcuts";

interface ToolbarProps {
  /** A ferramenta ligada, ou `null` com a seleção valendo. */
  active: ToolMode | null;
  /** Liga a ferramenta, ou volta para a seleção se ela já era a ativa. */
  onToggle: (mode: ToolMode) => void;
  /** A seção Color Controls (#154), à direita das ferramentas. */
  stroke: StrokeControls;
}

/**
 * O que a seção Color Controls mostra e abre. Quem decide é quem sabe qual ferramenta desenha
 * — só Lápis, Caneta tinteiro e Marca-texto têm cor, espessura e opacidade.
 */
export interface StrokeControls {
  /**
   * Há uma ferramenta de traço ligada. Sem ela os dois botões continuam no lugar, mas
   * desabilitados: a pílula não muda de largura a cada troca de ferramenta.
   */
  enabled: boolean;
  /** Cor do traço da ferramenta, em CSS, para o círculo. */
  color: string;
  /** O bloco de cores (#160), aberto pelo círculo. */
  colorPicker: ReactNode;
  /** O painel de espessura e opacidade (#161), aberto pelo rabisco. */
  settings: ReactNode;
}

/** Qual dos dois painéis da seção está aberto. Um por vez (#162). */
type StrokePanel = "color" | "settings";

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
 * Quanto os painéis da seção sobem acima do topo do botão: os 26px do botão até a borda de
 * cima da pílula (36px centrados em 88) mais os 8px entre a pílula e o painel (Penpot).
 */
const PANEL_OFFSET = 34;

/**
 * Divisor entre as seções da pílula (Penpot, `Line 2` e `Line 4`): 1px por 24, `#dddddd`
 * sumindo nas duas pontas.
 */
function Divider({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`h-6 w-px shrink-0 self-center bg-linear-to-b from-transparent via-[#dddddd] to-transparent ${className}`}
      data-testid="toolbar-divider"
    />
  );
}

/**
 * Os botões da seção Color Controls (Penpot, `Selector`): 36px, raio 12 e ícone de 20. O
 * hover escurece 8%, e o aberto 12% — o mesmo "esta aqui" dos outros botões da moldura, um
 * tom acima para o aberto não se confundir com o ponteiro só passando.
 */
const selectorClass =
  "flex h-9 w-9 items-center justify-center rounded-xl text-ink outline-none transition-colors hover:bg-control-active aria-expanded:bg-black/12 focus-visible:ring-2 focus-visible:ring-selection disabled:pointer-events-none disabled:opacity-40";

interface SelectorProps {
  label: string;
  /** Os atalhos do botão, se houver: aparecem na dica e em `aria-keyshortcuts`. */
  shortcuts?: readonly ButtonShortcut[];
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  panelLabel: string;
  onClose: () => void;
  rounded: "full" | "panel";
  panelClassName: string;
  testId: string;
  icon: ReactNode;
  children: ReactNode;
}

/** Um botão da seção Color Controls com o painel que ele abre. */
function Selector({
  label,
  shortcuts,
  disabled,
  open,
  onToggle,
  panelLabel,
  onClose,
  rounded,
  panelClassName,
  testId,
  icon,
  children,
}: SelectorProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const isMac = useIsMac();

  return (
    <div className="relative flex">
      <Tooltip
        label={label}
        // Os dois atalhos num badge só (`[ ]`): são as duas pontas da mesma ação.
        shortcut={shortcuts?.map((shortcut) => shortcutLabel(shortcut, isMac)).join(" ")}
        side="top"
        suppressed={open}
      >
        <button
          ref={triggerRef}
          type="button"
          className={selectorClass}
          onClick={onToggle}
          disabled={disabled}
          aria-label={label}
          // Alternativas separadas por espaço, como o atributo pede.
          aria-keyshortcuts={shortcuts?.map(ariaKeyShortcuts).join(" ")}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          data-testid={`${testId}-button`}
        >
          {icon}
        </button>
      </Tooltip>
      <Popover
        id={panelId}
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        triggerRef={triggerRef}
        label={panelLabel}
        offset={PANEL_OFFSET}
        rounded={rounded}
        className={panelClassName}
        testId={`${testId}-panel`}
      >
        {children}
      </Popover>
    </div>
  );
}

/**
 * A toolbar inferior (#137): uma pílula no centro da borda de baixo, com as ferramentas
 * desenhadas saindo de dentro dela, e à direita a seção Color Controls (#154).
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
 * que sai por cima, não é cortado junto — nem os painéis da seção de cor. 88px de altura,
 * como no Penpot.
 *
 * Três seções separadas por divisores: Nota | Lápis, Caneta, Marca-texto, Borracha | Color
 * Controls. São 24px entre cada seção e o divisor; do lado das pontas, 12px bastam, porque
 * a coluna de 44px de cada ponta já tem 12px de cada lado da ilustração.
 *
 * O grupo "Ferramentas" é só a fileira das cinco: o círculo e o rabisco não ligam modo, e o
 * leitor de tela anuncia as duas coisas separadas — escolher a ferramenta e ajustar o traço
 * dela.
 *
 * Os painéis abrem um por vez. Com Nota, Borracha ou nenhuma ferramenta, o que estiver
 * aberto fecha.
 */
export function Toolbar({ active, onToggle, stroke }: ToolbarProps) {
  const ui = useUi();
  const [note, ...strokes] = TOOLBAR_TOOLS;
  const [panel, setPanel] = useState<StrokePanel | null>(null);

  // Ajustado durante o render, e não num efeito: o painel não chega a aparecer um quadro
  // aberto sobre uma ferramenta que não tem traço.
  if (!stroke.enabled && panel !== null) setPanel(null);

  function toggle(wanted: StrokePanel) {
    setPanel((current) => (current === wanted ? null : wanted));
  }

  function close(which: StrokePanel) {
    setPanel((current) => (current === which ? null : current));
  }

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
    // Branco descendo para `#f5f5f5`, 32px de raio em cima e 16 embaixo, e a sombra curta de
    // quem encosta no quadro (Penpot, variante `default`).
    <div
      className="flex h-22 items-stretch rounded-t-[32px] rounded-b-2xl bg-linear-to-b from-white to-[#f5f5f5] px-6 shadow-[0_1px_4px_rgb(0_0_0/0.08)]"
      data-testid="toolbar"
    >
      <div role="group" aria-label={ui.toolbar.label} className="flex items-stretch">
        {tool(note!)}
        <Divider className="mr-3 ml-6" />
        <div className="flex items-stretch">{strokes.map(tool)}</div>
      </div>
      <Divider className="mr-6 ml-3" />
      <div className="flex items-center gap-2" data-testid="color-controls">
        <Selector
          label={ui.toolbar.color}
          disabled={!stroke.enabled}
          open={panel === "color"}
          onToggle={() => toggle("color")}
          onClose={() => close("color")}
          panelLabel={ui.toolbar.color}
          rounded="full"
          // 236×44 no Penpot: as sete cores e 8px de cada lado.
          panelClassName="flex h-11 items-center px-2"
          testId="stroke-color"
          icon={
            <span
              className="h-5 w-5 rounded-full"
              style={{ backgroundColor: stroke.color }}
              data-testid="stroke-color-swatch"
            />
          }
        >
          {stroke.colorPicker}
        </Selector>
        <Selector
          label={ui.toolbar.stroke}
          shortcuts={[SHORTCUTS.strokeThinner, SHORTCUTS.strokeThicker]}
          disabled={!stroke.enabled}
          open={panel === "settings"}
          onToggle={() => toggle("settings")}
          onClose={() => close("settings")}
          panelLabel={ui.toolbar.stroke}
          rounded="panel"
          // 304×52 no Penpot: os dois sliders de 140 e 8px em volta e entre eles.
          panelClassName="p-2"
          testId="stroke-settings"
          icon={<StrokeIcon />}
        >
          {stroke.settings}
        </Selector>
      </div>
    </div>
  );
}
