"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { iconButtonClass, panelButtonClass, subtleButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ShareApi } from "@/lib/board/useShareBoard";
import { useUi } from "@/lib/i18n/LocaleProvider";

interface NewBoardButtonProps {
  /**
   * Há alguma coisa no quadro atual — nota ou rabisco —, ou seja, há trabalho que a
   * substituição levaria junto.
   *
   * Os traços contam desde a #70. Antes disso a pergunta era só sobre post-its, e um quadro
   * cheio de rabiscos e sem nenhuma nota era substituído sem aviso nenhum.
   */
  hasContent: boolean;
  /** Descarta o board atual e começa um quadro vazio. */
  onNewBoard: () => void;
  /** A mesma ação de compartilhar do resto da interface (#46), e não um segundo caminho. */
  share: ShareApi["share"];
}

/** Ícone de documento novo: uma folha com um `+`. */
function NewBoardIcon() {
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
      <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M13.5 3 19 8.5V12" />
      <path d="M18 15.5v5M15.5 18h5" />
    </svg>
  );
}

/**
 * Ação de começar um whiteboard novo (issue #58).
 *
 * Com o quadro vazio, cria direto: não há trabalho para proteger, e perguntar seria só
 * atrito. Com post-its na tela, oferece antes salvar o quadro atual — como o autosave local guarda
 * um board só, o link que salvar devolve é a única forma de voltar ao que estava ali.
 *
 * Quem pediu para salvar e não conseguiu continua com o quadro: limpar depois de uma falha
 * deixaria a pessoa sem o board **e** sem o link, que é pior do que não ter oferecido nada.
 */
export function NewBoardButton({ hasContent, onNewBoard, share }: NewBoardButtonProps) {
  const ui = useUi();
  const [asking, setAsking] = useState(false);
  /** Esperando o link que o usuário pediu antes de limpar. */
  const [awaitingLink, setAwaitingLink] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setAsking(false);
    setAwaitingLink(false);
    // Fechar desmonta o que tinha o foco; sem devolvê-lo, quem usa teclado é jogado para o
    // início do documento.
    buttonRef.current?.focus();
  }, []);

  const start = useCallback(() => {
    // Quadro vazio não tem o que perder: segue sem trava.
    if (!hasContent) {
      onNewBoard();
      return;
    }
    setAsking(true);
  }, [hasContent, onNewBoard]);

  const shareThenReset = useCallback(async () => {
    setAwaitingLink(true);
    const outcome = await share();
    setAwaitingLink(false);

    // Só limpa depois de o link existir: sem ele, quem pediu justamente para poder voltar
    // ficaria sem o quadro **e** sem o link. Em caso de falha, o painel de compartilhar já
    // explica o motivo, e ainda dá para seguir sem link.
    //
    // `null` é o envio que foi substituído por outro: o link que saiu não é o desta ação.
    if (outcome === null || outcome.status !== "shared") return;

    onNewBoard();
    close();
  }, [close, onNewBoard, share]);

  const resetNow = useCallback(() => {
    onNewBoard();
    close();
  }, [close, onNewBoard]);

  // `Esc` escutado no documento, e não no painel: este é um popover, e não um diálogo
  // modal, então o foco pode estar em qualquer lugar da página na hora de fechá-lo.
  useEffect(() => {
    if (!asking) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [asking, close]);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="rounded-control border border-border bg-surface p-1 shadow-control">
        <Tooltip label={ui.newBoard.action} align="start">
          <button
            ref={buttonRef}
            type="button"
            className={iconButtonClass}
            onClick={start}
            aria-label={ui.newBoard.action}
            aria-expanded={asking}
            aria-controls={asking ? panelId : undefined}
          >
            <NewBoardIcon />
          </button>
        </Tooltip>
      </div>

      {/*
        Região de anúncio persistente e só com texto, como no painel de compartilhar: uma
        live region que nasce junto do conteúdo costuma não ser lida.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {awaitingLink ? ui.save.saving : ""}
      </p>

      {asking ? (
        <div
          id={panelId}
          className="flex w-72 flex-col gap-3 rounded-control border border-border bg-surface p-3 shadow-control"
        >
          <p className="text-xs text-ink">{ui.newBoard.warning}</p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={panelButtonClass}
              onClick={awaitingLink ? undefined : () => void shareThenReset()}
              // `aria-busy` em vez de `disabled`, pela mesma razão do botão de compartilhar:
              // desabilitar tira o foco de quem acabou de acionar pelo teclado. O clique já
              // está barrado acima.
              aria-busy={awaitingLink}
              // O foco entra no painel assim que ele abre, para quem navega por teclado não
              // ficar preso no botão que o abriu.
              autoFocus
            >
              {awaitingLink ? ui.save.saving : ui.newBoard.saveAndStart}
            </button>
            <button type="button" className={subtleButtonClass} onClick={resetNow}>
              {ui.newBoard.startWithoutSaving}
            </button>
            <button type="button" className={subtleButtonClass} onClick={close}>
              {ui.newBoard.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
