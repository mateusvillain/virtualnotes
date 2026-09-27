import type { NoteColorName } from "@/lib/board/types";
import type { Locale } from "@/lib/seo/site";

/**
 * Todo texto que a interface do quadro mostra, nos dois idiomas.
 *
 * Um arquivo só, e não uma string em cada componente, porque metade destes textos é
 * invisível: `aria-label`, dica de botão, anúncio de leitor de tela. Espalhados, o idioma
 * de um deles fica para trás sem que ninguém veja — foi exatamente o que aconteceu com as
 * dicas dos botões, que continuavam em português numa página que se declara em inglês.
 *
 * O rótulo escrito e o `aria-label` do mesmo botão saem da **mesma** chave de propósito: o
 * `Tooltip` deste projeto repete o `aria-label` do gatilho, e se os dois divergirem a tela
 * e o leitor de tela passam a dizer coisas diferentes sobre o mesmo botão.
 */
export interface UiCopy {
  save: {
    /** Dica e `aria-label` do botão de salvar. */
    action: string;
    saving: string;
    saved: string;
    tooLarge: string;
    tooLargeHint: string;
    error: string;
    retry: string;
    copy: string;
    copied: string;
    linkField: string;
    closeLink: string;
    /** O aviso sob o link: ele é o quadro, e salvar de novo não quebra o anterior. */
    keepLink: string;
  };
  newBoard: {
    action: string;
    warning: string;
    saveAndStart: string;
    startWithoutSaving: string;
    cancel: string;
  };
  zoom: { out: string; reset: string; in: string };
  /** Nome do botão da ferramenta de seleção (#83) — a mesma ação da tecla `V`. */
  select: { action: string };
  /** Nomes dos botões de desfazer e refazer (#87) — as mesmas ações de `Ctrl+Z` e `Ctrl+Shift+Z`. */
  history: { undo: string; redo: string };
  pencil: {
    /** Dica e `aria-label` do botão que liga o modo lápis (#68). */
    action: string;
    /**
     * Nome do grupo de cores do traço, e nome da única cor que não é uma cor de nota (#69).
     *
     * As outras seis saem de `note.colors` — a mesma paleta, o mesmo rótulo —, e não são
     * repetidas aqui: duas traduções da mesma palavra ("Amarelo") divergiriam no dia em que
     * uma fosse ajustada e a outra não.
     */
    color: string;
    black: string;
  };
  /**
   * Nome do grupo de cores de cada ferramenta de desenho nova (#112). O rótulo do preto é o
   * de `pencil.black`, que vale para a paleta inteira: é a mesma cor nas três ferramentas.
   */
  fountain: { color: string };
  highlighter: { color: string };
  /** Dica e `aria-label` do botão que liga o modo borracha (#98). */
  eraser: { action: string };
  /**
   * Dica e `aria-label` dos ícones de remover e duplicar a seleção, no toque (#99).
   *
   * Só aparecem em aparelho de toque — em desktop as duas ações já têm caminho pelo
   * teclado — mas o texto existe nos dois idiomas como o resto da interface.
   */
  selectionActions: { remove: string; duplicate: string };
  note: {
    /**
     * Nome da peça, no botão que arma a colocação (#73) e na lista de teclado da
     * apresentação (#81) — os dois lugares onde a ferramenta é **escolhida**.
     *
     * Os rótulos abaixo continuam dizendo "nota" e não "nota adesiva", de propósito: eles
     * são lidos **depois** da escolha, dentro de uma peça que o leitor de tela já anunciou.
     * "Cor da nota adesiva" a cada campo acrescenta sílabas e nenhuma informação.
     */
    action: string;
    /** `aria-label` de uma nota sem texto, que não teria como ser anunciada. */
    empty: string;
    text: string;
    color: string;
    colors: Record<NoteColorName, string>;
  };
  sharedBoard: { loading: string; error: string; retry: string };
  notFound: { title: string; back: string };
  boardNotFound: { title: string; hint: string; create: string; back: string };
}

export const UI: Record<Locale, UiCopy> = {
  en: {
    save: {
      action: "Save board",
      saving: "Saving the board…",
      saved: "Board saved.",
      tooLarge: "This board is too large to save.",
      tooLargeHint: "This board is too large to save. Delete a few notes and try again.",
      error: "Couldn't save right now.",
      retry: "Try again",
      copy: "Copy",
      copied: "Copied",
      linkField: "Link to the saved board",
      closeLink: "Close the saved board link",
      keepLink: "Keep this link — it's how the board comes back. Earlier ones still work.",
    },
    newBoard: {
      action: "Start a new board",
      warning: "The current board will be replaced. Save it first if you want it back later.",
      saveAndStart: "Save and start",
      startWithoutSaving: "Start without saving",
      cancel: "Cancel",
    },
    zoom: { out: "Zoom out", reset: "Reset zoom to 100%", in: "Zoom in" },
    select: { action: "Select" },
    history: { undo: "Undo", redo: "Redo" },
    pencil: { action: "Pencil", color: "Pencil colour", black: "Black" },
    fountain: { color: "Fountain pen colour" },
    highlighter: { color: "Highlighter colour" },
    eraser: { action: "Eraser" },
    selectionActions: { remove: "Delete selection", duplicate: "Duplicate selection" },
    note: {
      action: "Sticky Note",
      empty: "Empty note",
      text: "Note text",
      color: "Note colour",
      colors: {
        yellow: "Yellow",
        pink: "Pink",
        green: "Green",
        blue: "Blue",
        purple: "Purple",
        orange: "Orange",
      },
    },
    sharedBoard: {
      loading: "Opening the board…",
      error: "Couldn't open this board right now.",
      retry: "Try again",
    },
    notFound: { title: "This page doesn't exist.", back: "Back to the board" },
    boardNotFound: {
      title: "This board doesn't exist, or is no longer available.",
      hint: "Check that the link was copied in full, or go back and start a new one.",
      create: "Start a new board",
      back: "Back to the board",
    },
  },
  pt: {
    save: {
      action: "Salvar quadro",
      saving: "Salvando o quadro…",
      saved: "Quadro salvo.",
      tooLarge: "Este quadro é grande demais para ser salvo.",
      tooLargeHint:
        "Este quadro é grande demais para ser salvo. Apague algumas notas e tente de novo.",
      error: "Não foi possível salvar agora.",
      retry: "Tentar de novo",
      copy: "Copiar",
      copied: "Copiado",
      linkField: "Link do quadro salvo",
      closeLink: "Fechar o link do quadro salvo",
      keepLink: "Guarde o link: é por ele que o quadro volta. Os anteriores continuam valendo.",
    },
    newBoard: {
      action: "Criar um novo quadro",
      warning: "O quadro atual será substituído. Salve antes se quiser poder voltar a ele depois.",
      saveAndStart: "Salvar e começar",
      startWithoutSaving: "Começar sem salvar",
      cancel: "Cancelar",
    },
    zoom: { out: "Diminuir zoom", reset: "Voltar o zoom para 100%", in: "Aumentar zoom" },
    select: { action: "Seleção" },
    history: { undo: "Desfazer", redo: "Refazer" },
    pencil: { action: "Lápis", color: "Cor do lápis", black: "Preto" },
    fountain: { color: "Cor da caneta tinteiro" },
    highlighter: { color: "Cor do marca-texto" },
    eraser: { action: "Borracha" },
    selectionActions: { remove: "Apagar seleção", duplicate: "Duplicar seleção" },
    note: {
      action: "Nota adesiva",
      empty: "Nota vazia",
      text: "Texto da nota",
      color: "Cor da nota",
      colors: {
        yellow: "Amarelo",
        pink: "Rosa",
        green: "Verde",
        blue: "Azul",
        purple: "Roxo",
        orange: "Laranja",
      },
    },
    sharedBoard: {
      loading: "Abrindo o quadro…",
      error: "Não foi possível abrir este quadro agora.",
      retry: "Tentar de novo",
    },
    notFound: { title: "Esta página não existe.", back: "Voltar para o quadro" },
    boardNotFound: {
      title: "Este quadro não existe ou não está mais disponível.",
      hint: "Confira se o link foi copiado por inteiro, ou volte para começar um novo.",
      create: "Criar um novo quadro",
      back: "Voltar para o quadro",
    },
  },
};
