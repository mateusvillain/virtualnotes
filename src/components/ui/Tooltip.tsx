"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { lastInputWasKeyboard, trackInputModality } from "@/lib/dom/inputModality";

/**
 * Espera antes de abrir.
 *
 * Curta o bastante para responder a quem parou o cursor sobre o botão, longa o bastante
 * para não piscar uma caixa a cada vez que o ponteiro atravessa a fileira de controles a
 * caminho do quadro.
 */
export const TOOLTIP_DELAY_MS = 300;

/** Como a caixa se prende ao gatilho em cada alinhamento. */
const ALIGNMENT = {
  center: "left-1/2 -translate-x-1/2",
  start: "left-0",
  end: "right-0",
} as const;

interface TooltipProps {
  /**
   * O texto mostrado.
   *
   * É repetido do `aria-label` do gatilho de propósito: derivá-lo exigiria clonar o
   * elemento para ler as props dele, e o invólucro atual é o que mantém os handlers do
   * botão intactos. As duas frases precisam continuar iguais — se divergirem, a tela e o
   * leitor de tela passam a dizer coisas diferentes sobre o mesmo botão.
   */
  label: string;
  /**
   * O atalho de teclado, já na forma escrita (`⌘S`, `Ctrl+Shift+Z`, `V`).
   *
   * Resolvida por quem chama, e não calculada aqui: só o gatilho sabe se a ação tem atalho,
   * e é ele que já lê `useIsMac` para decidir entre `⌘` e `Ctrl`. Ausente nos botões sem um
   * (novo quadro, zoom, fechar o link), que continuam mostrando só o nome.
   *
   * Some da mesma caixa `aria-hidden` do nome: o leitor de tela já anuncia o atalho pelo
   * `aria-keyshortcuts` do próprio botão, e repeti-lo aqui só duplicaria o anúncio.
   */
  shortcut?: string;
  /** De que lado do gatilho a caixa aparece. */
  side?: "top" | "bottom";
  /**
   * Por onde a caixa se alinha ao gatilho.
   *
   * Centrada, uma dica larga sobre um botão de 32px estoura ~60px para cada lado — e os
   * controles moram a 20px das bordas, dentro de um `main` com `overflow-hidden`, então o
   * texto sairia cortado. Alinhar pelo lado que está para dentro da tela resolve sem
   * medir nada em tempo de execução.
   */
  align?: "center" | "start" | "end";
  /** O botão que dispara o tooltip. */
  children: ReactNode;
}

/**
 * Tooltip dos controles que só têm ícone (issue #56).
 *
 * A interface não tem rótulos escritos: os controles são quadrados de 32px com um desenho
 * dentro. Quem já usou reconhece; quem abriu agora só descobre clicando — e um dos botões
 * manda o board para fora da máquina, o que é caro de descobrir assim.
 *
 * Não usa o `title` nativo porque ele demora cerca de um segundo, não é estilizável e é
 * ignorado no toque. Aqui a caixa também aparece no foco por teclado, que o `title` nunca
 * mostra.
 *
 * O texto **não** é anunciado por leitor de tela: ele repete o `aria-label` do botão, e
 * descrevê-lo de novo faria a mesma frase ser lida duas vezes. É ajuda visual, e a versão
 * sonora dela já existe.
 */
export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  align = "center",
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  /**
   * O gatilho está desabilitado agora — `disabled` ou `aria-disabled`.
   *
   * Lido do DOM, e não recebido por prop: o gatilho já diz isso de si mesmo, e uma prop
   * repetida seria mais um par de valores que podem divergir, como o `label` e o
   * `aria-label` (ver acima).
   */
  const triggerDisabled = useCallback(
    () =>
      wrapperRef.current?.firstElementChild?.matches(":disabled, [aria-disabled='true']") ?? false,
    [],
  );

  useEffect(() => trackInputModality(), []);

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  const scheduleOpen = useCallback(
    (event: PointerEvent) => {
      // Só ponteiros que de fato pairam. No toque não existe "passar o cursor": o
      // `pointerenter` chega junto com o toque, e a caixa apareceria por cima do que a pessoa
      // acabou de tocar. Lista do que vale, e não do que não vale, para um tipo de ponteiro
      // novo não abrir a caixa por descuido.
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      // Ação desabilitada não tem dica: o nome de algo que não dá para fazer agora só convida
      // a um clique que não vai acontecer, e o esmaecido do botão já diz o que há para dizer.
      if (triggerDisabled()) return;

      clearTimeout(timer.current);
      // Pode ter desabilitado durante a espera: a dica sai só se o gatilho ainda vale.
      timer.current = setTimeout(() => {
        if (!triggerDisabled()) setOpen(true);
      }, TOOLTIP_DELAY_MS);
    },
    [triggerDisabled],
  );

  const openIfKeyboard = useCallback(() => {
    // Tocar e clicar também dão foco ao botão. Sem olhar de onde o gesto veio, o toque
    // abriria a caixa sobre o que acabou de ser tocado, e o clique a deixaria aberta depois
    // de o botão já ter agido.
    if (!lastInputWasKeyboard()) return;
    if (triggerDisabled()) return;

    clearTimeout(timer.current);
    setOpen(true);
  }, [triggerDisabled]);

  /*
    Aberta sobre um gatilho que desabilita — o último desfazer da pilha, clicado pelo
    teclado —, a dica fecha junto. Observando o atributo, e não o próximo render: quem
    desabilita o botão é o pai, e o `Tooltip` não tem como saber quando isso acontece.
  */
  useEffect(() => {
    const trigger = wrapperRef.current?.firstElementChild;
    if (!open || trigger === null || trigger === undefined) return;

    const observer = new MutationObserver(() => {
      if (triggerDisabled()) cancel();
    });
    observer.observe(trigger, { attributes: true, attributeFilter: ["disabled", "aria-disabled"] });
    return () => observer.disconnect();
  }, [cancel, open, triggerDisabled]);

  // O timer pendente morre com o componente: sem isto, um botão desmontado logo depois do
  // hover abriria uma caixa sobre uma árvore que não existe mais.
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") cancel();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cancel, open]);

  return (
    /*
      Os ouvintes moram no invólucro, e não no próprio gatilho: assim o tooltip nunca
      substitui um handler que o botão já tinha. `pointerenter`/`pointerleave` valem para a
      área inteira, e `onFocus`/`onBlur` do React chegam aqui porque ele os implementa sobre
      `focusin`/`focusout`, que sobem na árvore.
    */
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onPointerEnter={scheduleOpen}
      onPointerLeave={cancel}
      onFocus={openIfKeyboard}
      onBlur={cancel}
    >
      {children}
      {open ? (
        <span
          // Escondida da árvore de acessibilidade porque o texto repete o `aria-label` do
          // botão: exposta, a mesma frase apareceria duas vezes na navegação por leitor de
          // tela. (`role="presentation"` não serviria: `span` não tem role implícito, e
          // `presentation` não remove o conteúdo de texto.)
          aria-hidden="true"
          // Escura sobre o quadro claro, como no Figma (1-139, #134): a dica é a única peça da
          // moldura que some sozinha, e o contraste invertido diz que ela não é um controle.
          className={`pointer-events-none absolute z-40 flex items-center gap-2 whitespace-nowrap rounded-control bg-ink p-2 text-xs text-surface ${
            side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          } ${ALIGNMENT[align]}`}
        >
          <span>{label}</span>
          {shortcut ? (
            // O atalho num badge de tecla, e não em texto esmaecido: é algo que se aperta, e
            // o desenho de tecla diz isso antes de a pessoa ler. Uma tecla só por atalho —
            // `⌘S` e `Ctrl+Shift+Z` são a forma escrita que `shortcutLabel` já decidiu.
            <kbd
              className="min-w-4 rounded-sm bg-surface/15 px-1 text-center font-mono text-xs text-surface"
              data-testid="tooltip-shortcut"
            >
              {shortcut}
            </kbd>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
