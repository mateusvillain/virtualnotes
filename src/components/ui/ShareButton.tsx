"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { iconButtonClass } from "@/components/ui/iconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ShareApi } from "@/lib/board/useShareBoard";
import { useIsMac } from "@/lib/dom/useIsMac";
import { useUi } from "@/lib/i18n/LocaleProvider";
import type { UiCopy } from "@/lib/i18n/ui";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

/** Quanto tempo o botão de copiar confirma a cópia antes de voltar ao normal. */
const COPIED_FEEDBACK_MS = 2000;

const panelClass =
  "rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-control";

/**
 * Ícone de salvar: uma nuvem com a seta para cima.
 *
 * Nuvem, e não o disquete: salvar aqui **envia** o quadro e devolve um endereço, e um
 * disquete prometeria uma cópia guardada na máquina de quem clicou. A seta para cima é a
 * parte que diz para onde o quadro vai.
 */
function SaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 11a3.75 3.75 0 0 1-.4 7.5" />
      <path d="M12 20v-8M9 14.5 12 11.5l3 3" />
    </svg>
  );
}

/**
 * O que a região de anúncios diz em cada estado. Vazio quando não há o que dizer.
 *
 * Recebe o dicionário em vez de chamar `useUi()`: é uma função pura sobre o estado, e
 * transformá-la em hook a prenderia a um componente só para ler o mesmo objeto.
 */
function announcement(status: ShareApi["state"]["status"], ui: UiCopy): string {
  switch (status) {
    case "sharing":
      return ui.save.saving;
    case "shared":
      return ui.save.saved;
    case "too-large":
      return ui.save.tooLarge;
    case "error":
      return ui.save.error;
    default:
      return "";
  }
}

/**
 * Ação de salvar o quadro e o link que ela devolve (issue #46).
 *
 * Salvar aqui é **enviar**: o quadro sai da máquina de quem escreveu e ganha um endereço
 * público. O rótulo diz "salvar" porque é o que a pessoa quer fazer — não perder o
 * trabalho —, mas o painel abaixo nunca esconde que o resultado é um link, e é por isso
 * que ele mostra a URL em vez de um "pronto".
 *
 * Só o ícone, como os controles de zoom: o quadro é a interface inteira, e um rótulo
 * escrito custaria largura de tela para dizer o que o desenho já diz. Quem não vê o ícone
 * ouve o `aria-label`.
 *
 * O link aparece num painel logo abaixo, e não substitui o botão: salvar de novo gera
 * outro documento, então o botão continua sendo a ação principal mesmo com um link na
 * tela.
 */
export function ShareButton({ state, share, dismiss }: ShareApi) {
  const ui = useUi();
  const isMac = useIsMac();
  /**
   * Qual link foi copiado, e não "se copiou".
   *
   * Guardar o link deixa a confirmação ser **derivada**: compartilhar de novo troca a URL,
   * e o "Copiado" do link anterior desaparece sozinho, sem um efeito para desfazê-lo.
   */
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const url = state.status === "shared" ? state.url : null;
  const copied = url !== null && copiedUrl === url;
  const sharing = state.status === "sharing";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopiedUrl(null), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      // Sem permissão de área de transferência (ou sem suporte): o link segue visível e
      // selecionável, que é o que importa.
      setCopiedUrl(null);
    }
  }, [url]);

  const close = useCallback(() => {
    dismiss();
    // Fechar o painel desmonta o que tinha o foco. Sem devolvê-lo ao botão, quem navega
    // por teclado é jogado para o início do documento.
    shareRef.current?.focus();
  }, [dismiss]);

  return (
    <div className="flex flex-col items-end gap-2">
      {/*
        Região de anúncio persistente, e só com texto.
        Uma live region que nasce junto do conteúdo costuma não ser lida, e envolver o
        painel do link faria o leitor reler a URL inteira a cada "Copiar" → "Copiado".
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(state.status, ui)}
      </p>

      <div className="rounded-control border border-border bg-surface p-1 shadow-control">
        <Tooltip label={ui.save.action} shortcut={shortcutLabel(SHORTCUTS.save, isMac)} align="end">
          <button
            ref={shareRef}
            type="button"
            className={iconButtonClass}
            onClick={sharing ? undefined : () => void share()}
            // `aria-busy` em vez de `disabled`: desabilitar tira o foco de quem acabou de
            // acionar o botão pelo teclado, e o clique já está barrado acima.
            aria-busy={sharing}
            aria-label={ui.save.action}
            aria-keyshortcuts={ariaKeyShortcuts(SHORTCUTS.save)}
          >
            <SaveIcon />
          </button>
        </Tooltip>
      </div>

      {sharing ? <p className={`${panelClass} text-ink-muted`}>{ui.save.saving}</p> : null}

      {state.status === "too-large" ? (
        <p className={`${panelClass} w-64 text-ink`}>{ui.save.tooLargeHint}</p>
      ) : null}

      {state.status === "error" ? (
        <div className={`${panelClass} flex items-center gap-2`}>
          <span className="text-ink">{ui.save.error}</span>
          <button
            type="button"
            className="text-ink-muted hover:text-ink"
            onClick={() => void share()}
          >
            {ui.save.retry}
          </button>
        </div>
      ) : null}

      {url === null ? null : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 rounded-control border border-border bg-surface p-1 pl-3 shadow-control">
            <input
              readOnly
              value={url}
              aria-label={ui.save.linkField}
              className="w-64 bg-transparent text-xs text-ink outline-none"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="rounded-control px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              onClick={copy}
            >
              {copied ? ui.save.copied : ui.save.copy}
            </button>
            <Tooltip label={ui.save.closeLink} align="end">
              <button
                type="button"
                className={iconButtonClass}
                onClick={close}
                aria-label={ui.save.closeLink}
              >
                ×
              </button>
            </Tooltip>
          </div>
          {/*
            Duas coisas numa frase só, e as duas necessárias: o link **é** o quadro salvo
            (quem fechar a aba sem guardá-lo perde o trabalho), e salvar de novo troca o
            link daqui sem quebrar o anterior — sem isso, quem já mandou o antigo para
            alguém acharia que o derrubou.
          */}
          <p className="px-1 text-[11px] text-ink-muted">{ui.save.keepLink}</p>
        </div>
      )}
    </div>
  );
}
