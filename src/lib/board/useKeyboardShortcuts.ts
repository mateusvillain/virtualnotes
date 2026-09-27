"use client";

import { useEffect, useRef } from "react";
import { isEditableTarget } from "@/lib/dom/target";
import type { Point } from "@/lib/canvas/coords";

interface KeyboardShortcutsOptions {
  /** Apagar o que está marcado. Não recebe nada: quem sabe o que está marcado é quem trata. */
  onDelete: () => void;
  /**
   * `N`: entrar e sair do modo de colocação de nota (#73).
   *
   * Deixou de criar o post-it na hora. `N` agora arma a colocação, e é o clique seguinte
   * que diz onde a nota fica — a mesma precisão que o duplo clique sempre teve, agora
   * disponível para quem está no teclado. Como o lápis, a mesma tecla liga e desliga.
   */
  onPlaceNote: () => void;
  /** Salvar o quadro — a mesma ação do botão, num atalho que todo mundo já tem no dedo. */
  onSave: () => void;
  /**
   * `Ctrl+A`: marcar tudo que existe no quadro (#85).
   *
   * Com a guarda de campo de texto, como o desfazer: dentro de um post-it a tecla seleciona
   * o texto, e roubá-la tiraria de quem escreve a única forma de marcar o que escreveu.
   */
  onSelectAll: () => void;
  /** `Ctrl+Z`: desfazer a última alteração do quadro (#86). */
  onUndo: () => void;
  /** `Ctrl+Shift+Z` (e `Ctrl+Y`): refazer o que o desfazer levou. */
  onRedo: () => void;
  /** Ligar e desligar o modo lápis (#68). A mesma tecla faz as duas coisas. */
  onTogglePencil: () => void;
  /** Ligar e desligar o modo marca-texto (#117). A mesma tecla faz as duas coisas. */
  onToggleHighlighter: () => void;
  /** Ligar e desligar o modo borracha (#98). A mesma tecla faz as duas coisas. */
  onToggleEraser: () => void;
  /**
   * `V`: escolher a ferramenta de seleção (#83).
   *
   * Escolher, e não alternar. A seleção é a ferramenta de partida do quadro, e ela não tem
   * para onde ser desligada — `V` sobre ela já ativa não faz nada.
   */
  onSelectTool: () => void;
  /**
   * Setas: mover o que está marcado (#74).
   *
   * Recebe o deslocamento já pronto, em unidades de canvas, e devolve se a tecla era do
   * quadro — sem seleção ela não é, e engoli-la tiraria de quem não marcou nada a rolagem
   * que a página sempre teve.
   */
  onNudge: (delta: Point) => boolean;
  /**
   * `Esc`: largar a ferramenta em curso.
   *
   * Genérico de propósito. `Esc` significa "sai disso", e quem sabe do que se está saindo é
   * o quadro — o lápis e a colocação de nota, hoje —, e o que vier depois entra no mesmo
   * lugar em vez de pendurar um segundo ouvinte de teclado na mesma tecla.
   */
  onCancel: () => void;
}

/**
 * Teclas que apagam a seleção.
 *
 * Duas, e não só `Delete`: no teclado do Mac a tecla escrita "delete" emite `Backspace`, e
 * um atalho que só ouvisse `Delete` seria inalcançável na maior parte dos laptops.
 */
const DELETE_KEYS = new Set(["Delete", "Backspace"]);

/**
 * Passo das setas, em unidades de canvas (#74).
 *
 * Uma unidade porque é para isso que as setas existem aqui: o mouse já move em grosso, e o
 * que falta é o ajuste fino que arrastar não dá — em zoom alto, um pixel de tela nem chega
 * a ser um pixel de canvas.
 *
 * Em unidades de canvas, e não de tela: o deslocamento é o mesmo em qualquer zoom, como o
 * resto do que o board guarda. Converter pela escala faria a mesma tecla mover mais longe
 * quanto mais perto se estivesse olhando.
 */
const NUDGE_STEP = 1;

/**
 * Passo com `Shift` segurado.
 *
 * Dez, e não um número redondo qualquer: é a convenção que todo editor gráfico usa, e quem
 * já tem o gesto no dedo não deveria ter de descobrir o daqui. Grande o bastante para
 * atravessar o quadro sem cansar, pequeno o bastante para ainda ser posicionamento.
 */
const NUDGE_STEP_WITH_SHIFT = 10;

/** A direção de cada seta, em passos. Quem não está aqui não move nada. */
const ARROW_DIRECTIONS: Readonly<Record<string, Point>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * O deslocamento das setas seguradas agora, em passos.
 *
 * A soma, e não a última tecla: `↑` e `→` juntas dão `{ x: 1, y: -1 }`, que é a diagonal.
 * Duas setas opostas se cancelam e dão zero, que é o que a física da coisa manda.
 */
function arrowDelta(held: ReadonlySet<string>): Point {
  let x = 0;
  let y = 0;

  for (const key of held) {
    const direction = ARROW_DIRECTIONS[key];
    if (direction === undefined) continue;

    x += direction.x;
    y += direction.y;
  }

  return { x, y };
}

/** A tecla veio sozinha, sem nenhum modificador segurado junto. */
function isBareKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Atalhos de teclado do quadro.
 *
 * O ouvinte mora no `document`, e não num nó do quadro: apagar é uma ação sobre a seleção, e
 * a seleção continua existindo com o foco em qualquer lugar da página — inclusive no
 * `body`, que é onde ele fica depois de um clique no fundo.
 *
 * Em **captura**, e não em bolha. O editor do post-it já para o evento na bolha, o que
 * bastaria para ele; mas depender disso deixaria a guarda espalhada, com cada campo de texto
 * futuro tendo de lembrar de parar o evento para não ser apagado enquanto se digita nele. Na
 * captura o atalho vê todo evento e decide sozinho, olhando o alvo.
 */
export function useKeyboardShortcuts({
  onDelete,
  onPlaceNote,
  onSave,
  onSelectAll,
  onUndo,
  onRedo,
  onTogglePencil,
  onToggleHighlighter,
  onToggleEraser,
  onSelectTool,
  onCancel,
  onNudge,
}: KeyboardShortcutsOptions): void {
  /**
   * Os tratadores atuais, lidos por ref dentro do ouvinte.
   *
   * Sem isto, um `onDelete` recriado a cada render faria o efeito remover e registrar o
   * ouvinte no documento a cada quadro do arraste.
   */
  const handlers = useRef({
    onDelete,
    onPlaceNote,
    onSave,
    onSelectAll,
    onUndo,
    onRedo,
    onTogglePencil,
    onToggleHighlighter,
    onToggleEraser,
    onSelectTool,
    onCancel,
    onNudge,
  });
  useEffect(() => {
    handlers.current = {
      onDelete,
      onPlaceNote,
      onSave,
      onSelectAll,
      onUndo,
      onRedo,
      onTogglePencil,
      onToggleHighlighter,
      onToggleEraser,
      onSelectTool,
      onCancel,
      onNudge,
    };
  }, [
    onDelete,
    onPlaceNote,
    onSave,
    onSelectAll,
    onUndo,
    onRedo,
    onTogglePencil,
    onToggleHighlighter,
    onToggleEraser,
    onSelectTool,
    onCancel,
    onNudge,
  ]);

  useEffect(() => {
    /**
     * As setas seguradas neste instante, para o movimento na diagonal (#74).
     *
     * Existe porque o sistema **não** repete duas teclas: com `↑` e `→` seguradas juntas,
     * quem volta a disparar é só a última apertada, e mover pela tecla do evento faria a
     * diagonal virar uma linha reta assim que a repetição começasse. Somando o que está
     * segurado, todo evento de seta — o primeiro e cada repetição — move pela diagonal
     * inteira.
     *
     * Local ao efeito, e não em ref: nasce e morre com o ouvinte, e uma sessão nova não
     * herda tecla segurada de outra montagem.
     */
    const held = new Set<string>();

    function handleKeyDown(event: KeyboardEvent): void {
      /**
       * Salvar é o único atalho que também vale com o cursor dentro de um post-it.
       *
       * Quem aperta `Ctrl+S` no meio de uma frase está salvando o quadro, não pedindo a
       * caixa de "salvar página" do navegador — e é justamente escrevendo que se tem mais a
       * perder. O `preventDefault` é o ponto do atalho: sem ele o navegador abre a caixa
       * dele por cima, e o quadro seria salvo com um diálogo de download na frente.
       */
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && !event.altKey) {
        event.preventDefault();
        handlers.current.onSave();
        return;
      }

      /**
       * Desfazer e refazer (#86).
       *
       * Antes da guarda de tecla nua, porque são atalhos **com** modificador — e com a
       * guarda do campo de texto por dentro, ao contrário do `Ctrl+S` logo acima. A
       * diferença é de quem a tecla pertence: salvar o quadro vale mesmo escrevendo, mas
       * `Ctrl+Z` dentro de um post-it é o desfazer do próprio texto, e roubá-lo tiraria de
       * quem está digitando a única forma de voltar atrás no que escreveu.
       *
       * `Ctrl+Y` refaz também: é a convenção do Windows, e quem a tem no dedo não deveria
       * ter de aprender a outra.
       */
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();

        if (key === "z" || key === "y") {
          if (isEditableTarget(event.target)) return;

          event.preventDefault();
          if (key === "y" || event.shiftKey) handlers.current.onRedo();
          else handlers.current.onUndo();
          return;
        }

        /**
         * Selecionar tudo (#85).
         *
         * Mesma guarda do desfazer, e pelo mesmo motivo: dentro de um post-it `Ctrl+A`
         * seleciona o texto, e é a única forma que quem escreve tem de marcar o que
         * escreveu. Fora dali não há texto disputando a tecla — o quadro não é um documento
         * —, e `preventDefault` impede o navegador de selecionar a página inteira por baixo
         * da seleção do board.
         */
        if (key === "a" && !event.shiftKey) {
          if (isEditableTarget(event.target)) return;

          event.preventDefault();
          handlers.current.onSelectAll();
          return;
        }
      }

      // Daqui para baixo, tudo é atalho de tecla nua. Com um modificador segurado a tecla
      // pertence ao navegador ou ao sistema — `Ctrl+N` abre uma janela, e roubá-la seria
      // pior do que não ter atalho.
      if (!isBareKey(event)) return;
      if (isEditableTarget(event.target)) return;

      if (DELETE_KEYS.has(event.key)) {
        // Sempre, e não só quando algo foi apagado: fora de um campo de texto, Backspace é
        // "voltar" no histórico em navegadores antigos, e sair do quadro sem querer é pior do
        // que engolir uma tecla que não fez nada. Dentro de um campo o `return` acima já
        // devolveu a tecla a quem estava digitando.
        event.preventDefault();
        handlers.current.onDelete();
        return;
      }

      // `toLowerCase` porque com Shift a tecla chega como `N`, e quem segurou Shift sem
      // querer não deveria ficar sem o atalho.
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        handlers.current.onPlaceNote();
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        handlers.current.onTogglePencil();
        return;
      }

      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        handlers.current.onToggleHighlighter();
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        handlers.current.onToggleEraser();
        return;
      }

      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        handlers.current.onSelectTool();
        return;
      }

      /**
       * As setas movem o que está marcado (#74).
       *
       * Depois da guarda de tecla nua e da de campo de texto, e é por elas que a seta dentro
       * de um post-it continua andando pelo texto: com o cursor no meio de uma frase, a
       * tecla é de quem escreve, não do quadro. Com `Ctrl`/`⌘` ela também não é nossa — no
       * Mac essas combinações andam por palavra e por linha, e no navegador voltam página.
       *
       * `Shift` passa: é o modificador do passo grande, e não um dono a mais da tecla.
       *
       * O `preventDefault` só sai se algo se moveu. É a diferença entre um atalho e um
       * sequestro: com a seleção vazia a seta continua rolando a página, que é o que ela
       * faz em qualquer lugar onde não há nada marcado.
       */
      if (ARROW_DIRECTIONS[event.key] !== undefined) {
        held.add(event.key);

        // A soma do que está segurado, e não a direção desta tecla: é isso que faz `↑` com
        // `→` andar na diagonal, e continuar na diagonal enquanto as duas estiverem
        // apertadas.
        const direction = arrowDelta(held);
        const step = event.shiftKey ? NUDGE_STEP_WITH_SHIFT : NUDGE_STEP;
        const moved = handlers.current.onNudge({
          x: direction.x * step,
          y: direction.y * step,
        });

        if (moved) event.preventDefault();
        return;
      }

      // Sem `preventDefault`: `Esc` é a tecla de "sai disso" do navegador inteiro, e engoli-la
      // aqui tiraria de quem não tem modo nenhum ligado o que ela já fazia — fechar um
      // diálogo, interromper um carregamento.
      if (event.key === "Escape") handlers.current.onCancel();
    }

    /**
     * Solta a seta. Sem guarda nenhuma, ao contrário do `keydown`.
     *
     * Quem soltou a tecla soltou, e o que decide se ela chega a mover é o `keydown`. Repetir
     * as guardas aqui é que seria o erro: bastaria clicar dentro de um post-it com a seta
     * apertada para o `keyup` ser recusado e a tecla ficar segurada para sempre.
     */
    function handleKeyUp(event: KeyboardEvent): void {
      held.delete(event.key);
    }

    /**
     * A janela perdeu o foco: nada mais está segurado.
     *
     * O `keyup` de uma tecla solta fora da janela nunca chega, e sem isto ela ficaria
     * segurada para sempre — a próxima seta sairia na diagonal, sozinha, por causa de um
     * `Alt+Tab` de minutos atrás.
     */
    function handleBlur(): void {
      held.clear();
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);
}
