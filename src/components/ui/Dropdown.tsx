"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useOutsidePointerDown } from "@/lib/dom/useOutsidePointerDown";
import { useShiftInsideViewport } from "@/lib/dom/useShiftInsideViewport";
import { ariaKeyShortcuts, shortcutLabel, type ButtonShortcut } from "@/lib/shortcuts";

/** Uma ação do menu. */
export interface DropdownAction {
  kind: "item";
  label: string;
  /** O atalho da mesma ação, mostrado à direita na forma da plataforma (`⌘0`, `Ctrl+0`). */
  shortcut?: ButtonShortcut;
  /** Fora de alcance agora: esmaecido, pulado pelas setas e sem efeito no clique. */
  disabled?: boolean;
  onSelect: () => void;
}

/** A linha entre dois grupos de ações. */
export interface DropdownSeparator {
  kind: "separator";
}

export type DropdownEntry = DropdownAction | DropdownSeparator;

/** O que o gatilho precisa espalhar no próprio botão. */
export interface DropdownTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: () => void;
}

interface DropdownProps {
  entries: readonly DropdownEntry[];
  /**
   * Desenha o gatilho. Uma função, e não um botão pronto, para quem chama manter a própria
   * aparência e o próprio `Tooltip` em volta.
   *
   * O `Tooltip` envolve o botão **dentro** da função, e recebe `suppressed={open}`: a dica
   * abre do mesmo lado do menu, numa camada acima, e cobriria o primeiro item.
   */
  renderTrigger: (props: DropdownTriggerProps, open: boolean) => ReactNode;
  /** Por onde o menu se prende ao gatilho antes do ajuste à janela. */
  align?: "start" | "end";
  testId?: string;
}

/** Como o menu se prende ao gatilho em cada alinhamento. */
const ALIGNMENT = { start: "left-0", end: "right-0" } as const;

/** Onde o foco cai ao abrir: a seta para cima abre no último item, o resto no primeiro. */
type OpenFocus = "first" | "last";

/**
 * Teclas que andam pelo menu, e para qual item cada uma leva: o índice seguinte, a partir do
 * atual (`-1` quando o foco ainda não está num item) e do último. As setas dão a volta.
 */
const NAVIGATION: Record<string, (current: number, last: number) => number> = {
  ArrowDown: (current, last) => (current >= last ? 0 : current + 1),
  ArrowUp: (current, last) => (current <= 0 ? last : current - 1),
  Home: () => 0,
  End: (_, last) => last,
};

/**
 * Menu de ações preso abaixo de um gatilho (#135), no padrão "menu button" da WAI-ARIA.
 *
 * Genérico: nasceu para o botão de porcentagem do zoom (#141), mas não sabe nada de zoom.
 *
 * O foco entra no menu ao abrir — no primeiro item, ou no último quando quem abriu foi a seta
 * para cima — e anda só pelas setas, `Home` e `End`: os itens têm `tabIndex={-1}`, e `Tab`
 * fecha o menu e segue para o controle depois do gatilho. Itens desabilitados ficam de fora
 * da navegação, como no Radix: anunciá-los um a um só atrasaria quem procura o que dá para
 * fazer. Passar o ponteiro sobre um item
 * também o foca, para o realce do mouse e o do teclado serem o mesmo.
 *
 * O teclado é ouvido na janela, em captura, e não no próprio menu: os atalhos do quadro ouvem
 * o documento em captura e chegariam antes. Enquanto o foco está no menu, as teclas nuas são
 * dele — a seta não pode mover a seleção do quadro por baixo, nem o `N` criar um post-it.
 * Com modificador a tecla segue adiante, e `⌘S` continua salvando.
 *
 * Fecha com Esc, com um clique fora ou ao escolher um item. Nos dois primeiros o foco volta
 * ao gatilho — no clique fora, só se estava no menu, como no `Popover`.
 */
export function Dropdown({ entries, renderTrigger, align = "start", testId }: DropdownProps) {
  const menuId = useId();
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMac = useIsMac();
  const [open, setOpen] = useState(false);
  /** Deslocamento horizontal que traz o menu para dentro da janela. */
  const shift = useShiftInsideViewport(menuRef, open);
  const openFocus = useRef<OpenFocus>("first");

  /** Os itens que aceitam foco, na ordem da tela. */
  const enabledItems = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"])',
        ) ?? [],
      ),
    [],
  );

  const show = useCallback((focus: OpenFocus) => {
    openFocus.current = focus;
    setOpen(true);
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const dismiss = useCallback(() => setOpen(false), []);
  useOutsidePointerDown(open, menuRef, triggerRef, dismiss);

  useEffect(() => {
    if (!open) return;
    const items = enabledItems();
    const target = openFocus.current === "first" ? items[0] : items[items.length - 1];
    // Sem item habilitado o foco fica no gatilho, e o Esc continua fechando.
    target?.focus({ preventScroll: true });
  }, [enabledItems, open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as Node | null;

      if (!open) {
        // Fechado, só as setas sobre o gatilho são do menu. Enter e Espaço chegam pelo clique
        // nativo do botão.
        if (target !== triggerRef.current) return;
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        event.stopPropagation();
        show(event.key === "ArrowDown" ? "first" : "last");
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }

      const inside = target !== null && (menuRef.current?.contains(target) ?? false);
      if (!inside) return;

      // `Tab` sai do menu e segue a partir do gatilho. O foco passa por ele antes de o menu
      // desmontar: o navegador só move o foco depois deste ouvinte, e partindo de um item que
      // sumiu ele recomeçaria do topo do documento.
      if (event.key === "Tab") {
        close(true);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.stopPropagation();

      const step = NAVIGATION[event.key];
      if (step === undefined) return;
      event.preventDefault();

      const items = enabledItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      items[step(current, items.length - 1)]?.focus({ preventScroll: true });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, enabledItems, open, show]);

  const triggerProps: DropdownTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => (open ? close(false) : show("first")),
  };

  return (
    <div className="relative inline-flex" data-testid={testId}>
      {renderTrigger(triggerProps, open)}
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          // Branco com sombra suave, como no Figma (1-477): flutua sobre o quadro, ao contrário
          // das pílulas de vidro, que encostam nele. `z-10` como o `Popover`: a camada da
          // moldura (`z-30`, AppShell) já o põe acima do quadro, e aqui só precisa vencer os
          // vizinhos dentro dela.
          className={`absolute top-full z-10 mt-2 flex w-max min-w-48 flex-col rounded-control bg-surface p-1 shadow-control ring-1 ring-border/50 ${ALIGNMENT[align]}`}
          style={{ marginLeft: shift }}
        >
          {entries.map((entry, index) =>
            entry.kind === "separator" ? (
              <div key={index} role="separator" className="mx-1 my-1 h-px bg-border" />
            ) : (
              <button
                key={index}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={entry.disabled ? true : undefined}
                aria-keyshortcuts={entry.shortcut ? ariaKeyShortcuts(entry.shortcut) : undefined}
                className="flex items-center justify-between gap-6 rounded-sm px-2 py-1.5 text-left text-sm text-ink outline-none transition-colors focus:bg-control-active aria-disabled:opacity-40"
                // O clique num item desabilitado não leva o foco para ele: as setas o pulam, e o
                // ponteiro não pode deixar o foco num lugar onde o teclado não chega.
                onMouseDown={entry.disabled ? (event) => event.preventDefault() : undefined}
                onPointerMove={(event) => {
                  if (!entry.disabled) event.currentTarget.focus({ preventScroll: true });
                }}
                onClick={() => {
                  if (entry.disabled) return;
                  close(true);
                  entry.onSelect();
                }}
              >
                <span>{entry.label}</span>
                {entry.shortcut ? (
                  // Fora do nome acessível: o leitor de tela já anuncia o atalho pelo
                  // `aria-keyshortcuts`, e o símbolo `⌘` lido em voz alta não ajudaria.
                  <span aria-hidden="true" className="text-xs text-ink-muted tabular-nums">
                    {shortcutLabel(entry.shortcut, isMac)}
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
