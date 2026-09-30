"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import {
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  STROKE_TOOL_PENCIL,
  isStrokeSize,
  type StrokeTool,
} from "@/lib/board/types";
import type { BoardMode, ToolMode } from "@/lib/board/modes";
import { useBoard, type UseBoardOptions } from "@/lib/board/useBoard";
import { useKeyboardShortcuts } from "@/lib/board/useKeyboardShortcuts";
import type { Point } from "@/lib/canvas/coords";
import { useViewport } from "@/lib/canvas/useViewport";
import { useTouchPrimary } from "@/lib/dom/useTouchPrimary";
import { useCopy, usePaste } from "@/lib/dom/useClipboard";
import { ColorPicker } from "@/components/postit/ColorPicker";
import { HistoryButtons } from "@/components/ui/HistoryButtons";
import { pillSurfaceClass } from "@/components/ui/iconButton";
import { NewBoardButton } from "@/components/ui/NewBoardButton";
import { StrokeColorPicker } from "@/components/ui/StrokeColorPicker";
import { StrokeSettings } from "@/components/ui/StrokeSettings";
import { strokeColor } from "@/lib/theme/note-colors";
import { ShareButton } from "@/components/ui/ShareButton";
import { useShareBoard } from "@/lib/board/useShareBoard";
import { Onboarding } from "./Onboarding";
import { Board } from "./Board";
import { Viewport } from "./Viewport";
import { SelectionActions } from "./SelectionActions";
import { SelectionToolbar } from "./SelectionToolbar";
import { Toolbar } from "./Toolbar";
import { ViewportControls } from "./ViewportControls";

type WhiteboardProps = Pick<UseBoardOptions, "initialBoard" | "autosave">;

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
  const pencil = mode === "pencil";
  const fountain = mode === "fountain";
  const highlighter = mode === "highlighter";
  const erasing = mode === "erasing";
  /**
   * A ferramenta do traço, com um dos modos de desenho ligado (#117) — ou `null` fora deles.
   * É o que decide a cor da paleta, a prévia do gesto e o `tool` gravado no traço.
   */
  const drawingTool: StrokeTool | null = pencil
    ? STROKE_TOOL_PENCIL
    : fountain
      ? STROKE_TOOL_FOUNTAIN
      : highlighter
        ? STROKE_TOOL_HIGHLIGHTER
        : null;
  /** A ferramenta cujos valores de traço a moldura mostra: a ligada, ou o lápis fora de um modo de desenho. */
  const strokeTool = drawingTool ?? STROKE_TOOL_PENCIL;
  /** A cor do traço da ferramenta, em CSS: o círculo da toolbar e o gradiente de opacidade. */
  const strokeInk = strokeColor(board.strokeColors[strokeTool]);
  const placing = mode === "placing";

  /**
   * Liga a ferramenta pedida, ou volta ao cursor se ela já era a ativa.
   *
   * `P` no lápis ligado desliga o lápis — e desligar, agora, quer dizer voltar para a
   * seleção. É a mesma tecla fazendo as duas coisas, como sempre fez; o que mudou é que o
   * destino tem nome.
   */
  const toggleMode = useCallback((wanted: ToolMode) => {
    setMode((current) => (current === wanted ? "select" : wanted));
  }, []);

  const togglePencil = useCallback(() => toggleMode("pencil"), [toggleMode]);
  const toggleFountain = useCallback(() => toggleMode("fountain"), [toggleMode]);
  const toggleHighlighter = useCallback(() => toggleMode("highlighter"), [toggleMode]);
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
    Ligar qualquer ferramenta — nota, desenho ou borracha — já dispensa a apresentação,
    antes mesmo de existir nota ou traço.

    Quem apertou `N`, `P`, `F`, `H` ou `E` — ou achou o botão — acabou de provar que aprendeu o que a peça
    tinha para ensinar, e é justamente aí que ela mais atrapalha: o texto fica no meio do
    quadro, exatamente onde a nota fantasma segue o cursor e onde o rabisco vai passar.

    Ajuste durante o render, e não num efeito: o efeito só rodaria depois da pintura, e a
    trava chegaria um quadro atrasada. React reinicia o render com o valor novo antes de
    pintar, então ninguém vê o estado intermediário.
  */
  if ((hasContent || placing || drawingTool !== null || erasing) && !taught) setTaught(true);

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

  /**
   * `[` e `]`: um passo de espessura na ferramenta ligada, parando nas pontas da lista. Fora
   * de um modo de desenho a tecla não é do quadro.
   */
  const changeStrokeSize = useCallback(
    (step: -1 | 1): boolean => {
      if (drawingTool === null) return false;

      const next = board.strokeSizes[drawingTool] + step;
      if (isStrokeSize(next)) board.setStrokeSize(drawingTool, next);
      return true;
    },
    [board, drawingTool],
  );

  useKeyboardShortcuts({
    onDelete: board.deleteSelection,
    onPlaceNote: togglePlacing,
    onSave: save,
    onSelectAll: board.selectEverything,
    onUndo: board.undo,
    onRedo: board.redo,
    onTogglePencil: togglePencil,
    onToggleFountain: toggleFountain,
    onToggleHighlighter: toggleHighlighter,
    onToggleEraser: toggleEraser,
    onCancel: selectTool,
    onSelectTool: selectTool,
    onNudge: board.nudgeSelection,
    onStrokeSize: changeStrokeSize,
  });

  return (
    <AppShell
      leadingActions={
        /*
          Novo quadro e compartilhar numa pílula só (#138, Figma 1-2): as duas ações que tiram o
          quadro da tela — uma o descarta, a outra o publica. Ficam longe do histórico e do
          zoom, que são o que se usa durante o trabalho.

          Grade, e não uma linha: os painéis dos dois botões descem abaixo da pílula, um por
          linha (`col-span-full`), e os dois podem estar abertos ao mesmo tempo — "salvar e
          começar" abre o do compartilhar com o do novo quadro ainda na tela. Os botões ficam
          fixos na linha 1, cada um na sua coluna, sobre o fundo da pílula; a terceira coluna
          (`1fr`) é o que deixa um painel mais largo que a pílula sem esticá-la.

          `m-1` em cada botão: 4px até a borda da pílula e 8px entre eles, como no Figma.
        */
        <div
          className="grid grid-cols-[auto_auto_1fr] items-start gap-y-2"
          data-testid="leading-pill"
        >
          <div
            aria-hidden="true"
            className={`col-start-1 col-end-3 row-start-1 self-stretch ${pillSurfaceClass}`}
          />
          <NewBoardButton
            hasContent={hasContent}
            onNewBoard={startNewBoard}
            share={share.share}
            triggerClassName="col-start-1 row-start-1 m-1"
          />
          <ShareButton
            state={share.state}
            share={share.share}
            dismiss={share.dismiss}
            triggerClassName="col-start-2 row-start-1 m-1"
          />
        </div>
      }
      toolbar={
        <>
          {/*
            Remover e duplicar no toque (#99), logo acima da toolbar: fixos na base da tela, e
            não ancorados na seleção como a barra de cor — o alvo inclui traço sozinho, que
            aquela barra esconde de propósito. Na coluna da toolbar, e não numa faixa própria,
            para nunca cair por cima dela (#137).

            Mesma guarda de gesto da barra de cor, pelo mesmo motivo, e a mais: só em aparelho
            de toque, porque em desktop as duas ações já têm caminho pelo teclado (#85, #88).
          */}
          {!touchPrimary || inGesture || board.selectedRects.length === 0 ? null : (
            <SelectionActions
              onRemove={board.deleteSelection}
              onDuplicate={board.duplicateSelection}
            />
          )}
          <Toolbar
            active={mode === "select" ? null : mode}
            onToggle={toggleMode}
            // Os controles de traço só valem com uma ferramenta de desenho ligada (#154): a
            // cor, a espessura e a opacidade são do **próximo** traço, e fora do modo não há
            // gesto nenhum para elas influenciarem. Cada ferramenta mostra os próprios
            // valores — o marca-texto abre no amarelo a 35%, o lápis no preto cheio. Fora de
            // um modo de desenho, os botões desabilitados mostram os do lápis.
            stroke={{
              enabled: drawingTool !== null,
              color: strokeInk,
              colorPicker: (
                <StrokeColorPicker
                  tool={strokeTool}
                  value={board.strokeColors[strokeTool]}
                  onChange={(color) => board.setStrokeColor(strokeTool, color)}
                />
              ),
              settings: (
                <StrokeSettings
                  tool={strokeTool}
                  size={board.strokeSizes[strokeTool]}
                  opacity={board.strokeOpacities[strokeTool]}
                  color={strokeInk}
                  onSizeChange={(size) => board.setStrokeSize(strokeTool, size)}
                  onOpacityChange={(opacity) => board.setStrokeOpacity(strokeTool, opacity)}
                />
              ),
            }}
          />
        </>
      }
      trailingActions={
        // Histórico e zoom lado a lado (#139, Figma 1-2): o que se usa durante o trabalho,
        // longe do canto que descarta e publica o quadro. No toque a pinça faz o trabalho do
        // zoom, e a pílula só disputaria espaço em quem tem menos tela sobrando (#57).
        <div className="flex items-start gap-2">
          <HistoryButtons
            canUndo={board.canUndo}
            canRedo={board.canRedo}
            onUndo={board.undo}
            onRedo={board.redo}
          />
          {touchPrimary ? null : (
            <ViewportControls
              viewport={controls.viewport}
              zoomBy={controls.zoomBy}
              reset={controls.reset}
              anchor={center}
            />
          )}
        </div>
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
          pencil={drawingTool !== null}
          // Fora de um modo de desenho não há gesto de desenho: o lápis aqui é só o valor que
          // as props exigem, e nunca chega a ser usado.
          pencilColor={board.strokeColors[strokeTool]}
          drawingTool={strokeTool}
          strokeSize={board.strokeSizes[strokeTool]}
          strokeOpacity={board.strokeOpacities[strokeTool]}
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
      </div>
    </AppShell>
  );
}
