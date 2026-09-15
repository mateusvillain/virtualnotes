"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { useBoard, type UseBoardOptions } from "@/lib/board/useBoard";
import { useKeyboardShortcuts } from "@/lib/board/useKeyboardShortcuts";
import type { Point } from "@/lib/canvas/coords";
import { useViewport } from "@/lib/canvas/useViewport";
import { useTouchPrimary } from "@/lib/dom/useTouchPrimary";
import { useCopy, usePaste } from "@/lib/dom/useClipboard";
import { ColorPicker } from "@/components/postit/ColorPicker";
import { SelectButton } from "@/components/ui/SelectButton";
import { HistoryButtons } from "@/components/ui/HistoryButtons";
import { NewBoardButton } from "@/components/ui/NewBoardButton";
import { NoteButton } from "@/components/ui/NoteButton";
import { PencilButton } from "@/components/ui/PencilButton";
import { PencilColorPicker } from "@/components/ui/PencilColorPicker";
import { EraserButton } from "@/components/ui/EraserButton";
import { ShareButton } from "@/components/ui/ShareButton";
import { useShareBoard } from "@/lib/board/useShareBoard";
import { Onboarding } from "./Onboarding";
import { Board } from "./Board";
import { Viewport } from "./Viewport";
import { SelectionActions } from "./SelectionActions";
import { SelectionToolbar } from "./SelectionToolbar";
import { ViewportControls } from "./ViewportControls";

type WhiteboardProps = Pick<UseBoardOptions, "initialBoard" | "autosave">;

/**
 * A ferramenta ativa no quadro.
 *
 * As ferramentas são exclusivas entre si por natureza — um gesto de ponteiro faz uma coisa
 * de cada vez —, e este tipo é onde isso fica dito. É a mesma escolha que o `DragState` do
 * `Viewport` faz para os gestos.
 *
 * `"select"` no lugar do antigo `"none"` (#83). O estado sempre existiu: era ele que fazia
 * arrastar o fundo desenhar o retângulo de seleção. O que faltava era nome e rosto — sem
 * eles, sair do lápis era uma ação sem destino, e a ferramenta mais usada do quadro era a
 * única sem representação na tela. Não há mais "nenhuma": há sempre uma ferramenta, e a
 * de partida é a de selecionar.
 *
 * `"erasing"` chegou com a borracha (#98), como uma quarta ferramenta exclusiva das demais
 * — a mesma regra que já valia entre o lápis e a colocação de nota, agora com mais um nome.
 */
type BoardMode = "select" | "pencil" | "erasing" | "placing";

/**
 * O quadro: junta o estado de viewport à superfície navegável, aos controles e aos post-its.
 *
 * A composição é a fiação, e só ela: o viewport sabe navegar, o `useBoard` sabe o que é o
 * board, e o `Board` sabe desenhar. Nenhum dos três precisa do outro para ser testado.
 */
export function Whiteboard({ initialBoard, autosave }: WhiteboardProps) {
  const controls = useViewport();
  const board = useBoard({ initialBoard, autosave });
  // Compartilhar lê o board no instante do clique (#46): nunca reage a mudanças da store,
  // porque enviar ao backend é sempre uma decisão explícita de quem escreveu.
  const share = useShareBoard(board.getBoard);
  const touchPrimary = useTouchPrimary();
  const dragOffsetBy = board.dragBy;
  const resizeOffsetBy = board.resizeBy;
  /**
   * A escala atual, lida por ref dentro do conversor de arraste.
   *
   * O conversor é passado a cada post-it. Se mudasse de identidade quando o zoom muda, a
   * memoização dos post-its cairia junto — e é ela que impede o quadro inteiro de
   * re-renderizar a cada movimento do ponteiro.
   */
  const scaleRef = useRef(controls.viewport.scale);
  // Sincronizada por efeito, e não no render: escrever uma ref enquanto se renderiza é
  // inseguro sob render concorrente. Quem lê são os conversores, chamados dentro de um
  // gesto de ponteiro — e o zoom não muda enquanto um post-it está sendo arrastado.
  useEffect(() => {
    scaleRef.current = controls.viewport.scale;
  }, [controls.viewport.scale]);
  const areaRef = useRef<HTMLDivElement>(null);

  /**
   * Converte o deslocamento do ponteiro para unidades de canvas.
   *
   * É o delta de tela dividido pela escala, e não o delta bruto: a 200%, dois pixels de
   * mouse são um pixel de canvas, e sem a divisão o post-it andaria o dobro do cursor.
   *
   * Arrastar e redimensionar fazem a mesma conta porque é a mesma pergunta: quantas
   * unidades de canvas o cursor andou.
   */
  const toCanvasDelta = useCallback((delta: Point): Point => {
    const scale = scaleRef.current;
    return { x: delta.x / scale, y: delta.y / scale };
  }, []);

  const dragBy = useCallback(
    (delta: Point) => dragOffsetBy(toCanvasDelta(delta)),
    [dragOffsetBy, toCanvasDelta],
  );

  const resizeBy = useCallback(
    (delta: Point) => resizeOffsetBy(toCanvasDelta(delta)),
    [resizeOffsetBy, toCanvasDelta],
  );

  /**
   * A apresentação do quadro vazio já cumpriu o papel dela nesta sessão.
   *
   * Trava uma vez e não destrava: sem isso, apagar o último post-it traria as instruções de
   * volta para quem acabou de provar que não precisa mais delas — e a peça reapareceria no
   * meio de uma limpeza de quadro, que é justamente quando ela mais atrapalha.
   */
  /**
   * O quadro já tem alguma coisa dentro — nota ou rabisco.
   *
   * As duas contam. A apresentação existe para o quadro **vazio**, e quem desenhou um traço
   * está tão longe do quadro vazio quanto quem criou uma nota; deixar o texto no meio da
   * tela por cima do próprio desenho é justamente onde ele mais atrapalha.
   */
  const hasContent = board.notes.length > 0 || board.strokes.length > 0;
  const [taught, setTaught] = useState(hasContent);

  /** Um gesto de ponteiro em curso sobre um post-it: arrastar ou redimensionar. */
  const inGesture = board.dragOffset !== null || board.resizing !== null;

  /** Centro da área visível, usado como âncora do zoom por botão. */
  const center = useCallback((): Point => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, y: 0 };
    return { x: rect.width / 2, y: rect.height / 2 };
  }, []);

  const save = useCallback(() => void share.share(), [share]);

  // Copiar e colar são eventos de área de transferência, e não atalhos de teclado: o
  // conteúdo só existe dentro deles. Ver `useClipboard`.
  useCopy(board.copySelection);
  usePaste(board.pasteFromClipboard);

  /**
   * O modo em curso: um estado só, e não uma flag por ferramenta.
   *
   * "O lápis e a colocação de nota não podem estar ligados ao mesmo tempo" (#73) é uma
   * regra que este tipo torna impossível de violar. Com dois booleanos ela viraria um
   * efeito lembrando de desligar um ao ligar o outro — e o dia em que a terceira ferramenta
   * chegasse, três efeitos.
   *
   * Estado do quadro, e não da superfície: quem liga é o teclado ou um botão da moldura, e
   * quem obedece é o `Viewport`. Guardá-lo lá dentro obrigaria a moldura a perguntar à
   * superfície o que ela está fazendo para saber o que desenhar.
   */
  const [mode, setMode] = useState<BoardMode>("select");
  const selecting = mode === "select";
  const pencil = mode === "pencil";
  const erasing = mode === "erasing";
  const placing = mode === "placing";

  /**
   * Liga a ferramenta pedida, ou volta ao cursor se ela já era a ativa.
   *
   * `P` no lápis ligado desliga o lápis — e desligar, agora, quer dizer voltar para a
   * seleção. É a mesma tecla fazendo as duas coisas, como sempre fez; o que mudou é que o
   * destino tem nome.
   */
  const toggleMode = useCallback((wanted: Exclude<BoardMode, "select">) => {
    setMode((current) => (current === wanted ? "select" : wanted));
  }, []);

  const togglePencil = useCallback(() => toggleMode("pencil"), [toggleMode]);
  const toggleEraser = useCallback(() => toggleMode("erasing"), [toggleMode]);
  const togglePlacing = useCallback(() => toggleMode("placing"), [toggleMode]);
  /**
   * Escolher a seleção, e não alternar para ela.
   *
   * `V` sobre a seleção já ativa não faz nada, e é isso mesmo: a ferramenta de partida não
   * tem para onde ser desligada. Alternar aqui exigiria um estado "nenhuma ferramenta" de
   * volta, que é exatamente o que esta issue veio tirar.
   *
   * `Esc` chega pelo mesmo caminho: sair de alguma coisa é voltar para a seleção.
   */
  const selectTool = useCallback(() => setMode("select"), []);

  /**
   * O clique que fixa a nota: é aqui, e só aqui, que a store é tocada (#73).
   *
   * Um `N` cancelado não deixa rastro nenhum no autosave porque nada foi gravado até este
   * ponto — a prévia é estado de gesto, e vive dentro do `Viewport`.
   *
   * Sair do modo faz parte de colocar: quem quer duas notas aperta `N` de novo. Um modo que
   * ficasse armado transformaria o clique seguinte, dado para selecionar a nota que acabou
   * de nascer, numa segunda nota por cima dela.
   */
  const placeNote = useCallback(
    (point: Point) => {
      board.createNoteAt(point);
      setMode("select");
    },
    [board],
  );

  /*
    Ligar qualquer uma das duas ferramentas já dispensa a apresentação, antes mesmo de
    existir nota ou traço.

    Quem apertou `N` ou `P` — ou achou o botão — acabou de provar que aprendeu o que a peça
    tinha para ensinar, e é justamente aí que ela mais atrapalha: o texto fica no meio do
    quadro, exatamente onde a nota fantasma segue o cursor e onde o rabisco vai passar.

    Ajuste durante o render, e não num efeito: o efeito só rodaria depois da pintura, e a
    trava chegaria um quadro atrasada. React reinicia o render com o valor novo antes de
    pintar, então ninguém vê o estado intermediário.
  */
  if ((hasContent || placing || pencil || erasing) && !taught) setTaught(true);

  /**
   * A apresentação some no mesmo quadro em que o primeiro post-it aparece.
   *
   * A condição olha `hasContent` direto, e não só a trava acima: ela é um estado, e esperar
   * pelo render seguinte deixaria as instruções um quadro a mais na tela, por cima da nota
   * recém-criada.
   */
  const showOnboarding = !hasContent && !taught;

  /**
   * Começar um quadro novo destrava a apresentação de novo.
   *
   * `taught` sozinho travava para sempre dentro da sessão: uma vez ensinada, a apresentação
   * não voltava nem trocando de quadro inteiro. Mas um board novo é, para quem olha, tão
   * vazio quanto o primeiro — e é aí que as instruções voltam a fazer sentido, mesmo que o
   * quadro anterior já as tivesse dispensado.
   *
   * `setMode("select")` junto, e não só o reset do board: `mode` é estado deste componente,
   * não da store, e uma ferramenta deixada ligada (o lápis, por exemplo) destravaria
   * `taught` nesse mesmo render — a condição logo abaixo olha `pencil`/`erasing`/`placing` —
   * e a apresentação nunca chegaria a aparecer.
   */
  const startNewBoard = useCallback(() => {
    board.resetBoard();
    setMode("select");
    setTaught(false);
  }, [board]);

  useKeyboardShortcuts({
    onDelete: board.deleteSelection,
    onPlaceNote: togglePlacing,
    onSave: save,
    onSelectAll: board.selectEverything,
    onUndo: board.undo,
    onRedo: board.redo,
    onTogglePencil: togglePencil,
    onToggleEraser: toggleEraser,
    onCancel: selectTool,
    onSelectTool: selectTool,
    onNudge: board.nudgeSelection,
  });

  return (
    <AppShell
      leadingActions={
        <div className="flex flex-col items-start gap-2">
          <NewBoardButton hasContent={hasContent} onNewBoard={startNewBoard} share={share.share} />
          {/*
            A pilha de ferramentas, da mais usada para a menos: selecionar, criar nota,
            rabiscar. A seleção no topo porque é a ferramenta de partida — o estado em que o
            quadro começa e para onde `Esc` sempre volta —, e o rabisco por último porque é
            o que se faz em volta das notas.
          */}
          <SelectButton active={selecting} onSelect={selectTool} />
          <NoteButton active={placing} onToggle={togglePlacing} />
          <PencilButton active={pencil} onToggle={togglePencil} />
          {/*
            Só com o lápis ligado (#69): a paleta escolhe a cor do **próximo** traço, e fora
            do modo não há gesto nenhum para ela influenciar. Mesma caixa dos botões de
            ferramenta — borda, fundo e sombra — para a pilha continuar parecendo um grupo
            só, com um item a mais quando o lápis está ativo.
          */}
          {pencil ? (
            <div className="rounded-control border border-border bg-surface p-1 shadow-control">
              <PencilColorPicker value={board.pencilColor} onChange={board.setPencilColor} />
            </div>
          ) : null}
          <EraserButton active={erasing} onToggle={toggleEraser} />
        </div>
      }
      trailingActions={
        // Desfazer à esquerda de salvar: o canto deixa de ser uma ação só e vira um grupo,
        // com o histórico antes porque é o que se usa durante o trabalho e o salvar depois,
        // porque é o que o encerra. `gap-2` é o mesmo respiro da pilha do canto oposto.
        <div className="flex items-start gap-2">
          <HistoryButtons
            canUndo={board.canUndo}
            canRedo={board.canRedo}
            onUndo={board.undo}
            onRedo={board.redo}
          />
          <ShareButton state={share.state} share={share.share} dismiss={share.dismiss} />
        </div>
      }
      controls={
        // No toque a pinça faz o mesmo trabalho, e o painel só disputaria o canto onde o
        // polegar descansa — justamente em quem tem menos tela sobrando (#57).
        touchPrimary ? undefined : (
          <ViewportControls
            viewport={controls.viewport}
            zoomBy={controls.zoomBy}
            reset={controls.reset}
            anchor={center}
          />
        )
      }
    >
      <div ref={areaRef} className="absolute inset-0">
        <Viewport
          viewport={controls.viewport}
          pan={controls.pan}
          zoomBy={controls.zoomBy}
          onBackgroundDoubleClick={board.createNoteAt}
          onBackgroundClick={board.clearSelection}
          onSelectionStart={board.beginRectSelection}
          onSelectionRect={board.selectInRect}
          pencil={pencil}
          pencilColor={board.pencilColor}
          erasing={erasing}
          placing={placing}
          onPlaceNote={placeNote}
          onStrokeEnd={board.addStroke}
          onEraseStart={board.beginErasing}
          onEraseSegment={board.eraseSegment}
          onEraseEnd={board.endErasing}
        >
          <Board
            notes={board.notes}
            strokes={board.strokes}
            editingId={board.editingId}
            selection={board.selection}
            onEditStart={board.startEditing}
            onEditCommit={board.commitText}
            onSelect={(id, additive) => board.selectElement("note", id, additive)}
            onSelectStroke={(id, additive) => board.selectElement("stroke", id, additive)}
            dragOffset={board.dragOffset}
            onDragStart={(id) => board.startDrag("note", id)}
            onStrokeDragStart={(id) => board.startDrag("stroke", id)}
            onDragMove={dragBy}
            onDragEnd={board.endDrag}
            onDragCancel={board.cancelDrag}
            resizing={board.resizing}
            onResizeStart={(id) => board.startResize("note", id)}
            onStrokeResizeStart={(id) => board.startResize("stroke", id)}
            onResizeMove={resizeBy}
            onResizeEnd={board.endResize}
            onResizeCancel={board.cancelResize}
          />
        </Viewport>

        {/*
          Fora do `Viewport` pelo mesmo motivo da barra de seleção abaixo: dentro da camada
          transformada, o texto cresceria com o zoom e sairia da tela junto com o pan.
        */}
        {showOnboarding ? <Onboarding /> : null}

        {/*
          Fora do `Viewport`, e de propósito duas vezes. Fora da camada transformada, para a
          barra não escalar com o zoom; e fora da superfície, para clicar numa cor não
          chegar ao fundo do quadro, que leria o clique como "limpar a seleção".

          Some durante o gesto: a caixa da seleção é calculada com as posições já gravadas,
          então uma barra visível durante um arraste ficaria parada enquanto os post-its
          andam por baixo dela.

          E some também quando só há traços marcados (#70). A única ação que ela carrega
          hoje é o seletor de cor, que pinta post-it; sobre uma seleção de rabiscos ela seria
          uma barra de seis cores que não fazem nada. Numa seleção mista ela volta, ancorada
          na caixa de **tudo** que está marcado — a barra pertence à seleção inteira, mesmo
          que a ação dentro dela só alcance parte.
        */}
        {inGesture || board.selected.length === 0 ? null : (
          <div className="pointer-events-none absolute inset-0">
            <SelectionToolbar rects={board.selectedRects} viewport={controls.viewport}>
              <ColorPicker value={board.selectionColor} onChange={board.colorSelection} />
            </SelectionToolbar>
          </div>
        )}

        {/*
          Remover e duplicar no toque (#99): fixos na base da tela, e não ancorados na
          seleção como a barra de cor acima — o alvo inclui traço sozinho, que aquela barra
          esconde de propósito, e duplicar essa regra aqui só multiplicaria onde a barra
          pode aparecer sem multiplicar o que ela mostra.

          Mesma guarda de gesto da barra de cor, pelo mesmo motivo, e a mais: só em aparelho
          de toque, porque em desktop as duas ações já têm caminho pelo teclado (#85, #88).
        */}
        {!touchPrimary || inGesture || board.selectedRects.length === 0 ? null : (
          // Mesmo respiro dos controles de zoom, que ficam no outro canto da mesma borda
          // (`AppShell`): a faixa inteira encostada em `bottom-0`, com `p-4` empurrando a
          // caixa para dentro — e não um `bottom-4` na caixa sozinha, que por si só já dava
          // a mesma distância, mas divergia do padrão que o resto da moldura usa.
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4">
            <div className="pointer-events-auto">
              <SelectionActions
                onRemove={board.deleteSelection}
                onDuplicate={board.duplicateSelection}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
