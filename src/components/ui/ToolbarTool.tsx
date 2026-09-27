"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useIsMac } from "@/lib/dom/useIsMac";
import { ariaKeyShortcuts, shortcutLabel, type ButtonShortcut } from "@/lib/shortcuts";

interface ToolbarToolProps {
  /** O modo desta ferramenta está ligado agora. */
  active: boolean;
  /** Liga ou desliga o modo — a mesma ação do atalho. */
  onToggle: () => void;
  /** Nome da ferramenta: vira o `aria-label` e o texto do tooltip. */
  label: string;
  /** O atalho da ferramenta, de `SHORTCUTS`. */
  shortcut: ButtonShortcut;
  /**
   * Largura da coluna do botão (`w-11`, `w-24`…). A altura vem de quem monta a toolbar: o
   * botão estica até a borda de baixo dela.
   */
  className?: string;
  /** A ilustração (#131), já no tamanho em que aparece. */
  children: ReactNode;
}

/**
 * Uma ferramenta da toolbar inferior (#132): a ilustração parcialmente escondida pela borda
 * de baixo, que sobe quando apontada e fica em cima enquanto a ferramenta está ligada.
 *
 * O botão ocupa a coluna inteira, e não só a parte visível do desenho: o alvo de clique
 * continua do mesmo tamanho com a ilustração em qualquer altura, e o ponteiro que acabou
 * de fazê-la subir não a perde por ela ter saído de baixo dele.
 *
 * Quem corta a ilustração é a toolbar (`overflow-hidden`), não o botão: o botão não sabe
 * onde fica a borda, só o quanto a ilustração sobe.
 *
 * O deslocamento (8px) é a diferença entre as variantes `default` e `activated` no Figma
 * (node 1-625). O mesmo para hover, foco e ativo: são três jeitos de dizer "esta aqui", e
 * três alturas diferentes pareceriam três estados diferentes.
 *
 * `hover:` do Tailwind já só vale em `(hover: hover)`: no toque, onde o hover gruda depois
 * do toque, a ilustração não fica suspensa numa ferramenta que já foi desligada.
 *
 * `aria-pressed`, e não um segundo rótulo para o estado ligado, como os botões da pilha que
 * este componente substitui: o nome do botão continua sendo a ação.
 */
export function ToolbarTool({
  active,
  onToggle,
  label,
  shortcut,
  className = "",
  children,
}: ToolbarToolProps) {
  const isMac = useIsMac();

  return (
    <Tooltip label={label} shortcut={shortcutLabel(shortcut, isMac)} side="top">
      <button
        type="button"
        className={`group relative flex justify-center rounded-control pt-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-selection ${className}`}
        onClick={onToggle}
        aria-label={label}
        aria-keyshortcuts={ariaKeyShortcuts(shortcut)}
        aria-pressed={active}
      >
        <span
          // Sem transição com `prefers-reduced-motion`: a ilustração vai direto para a
          // posição final, que continua sendo a indicação de hover e de ativo.
          className={`block transition-transform duration-200 ease-out motion-reduce:transition-none ${
            active
              ? "-translate-y-2"
              : "group-hover:-translate-y-2 group-focus-visible:-translate-y-2"
          }`}
          data-testid="toolbar-tool-illustration"
          data-raised={active}
        >
          {children}
        </span>
      </button>
    </Tooltip>
  );
}
