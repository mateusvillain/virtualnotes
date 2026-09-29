"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  CLICK_SLOP,
  canvasToScreen,
  distance,
  rectFromCorners,
  screenToCanvas,
  type Point,
  type Rect,
} from "@/lib/canvas/coords";
import { pinchChange, pinchSnapshot, type PinchSnapshot } from "@/lib/canvas/pinch";
import { cancelPointerGesture, releaseCapture } from "@/lib/canvas/pointer-capture";
import { useSpaceHeld } from "@/lib/canvas/useSpaceHeld";
import {
  STROKE_COLOR_BLACK,
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  STROKE_TOOL_PENCIL,
  type StrokeColor,
  type StrokeOpacity,
  type StrokeSize,
  type StrokeTool,
} from "@/lib/board/types";
import { EraserCursor } from "./EraserCursor";
import { NotePlacementPreview } from "./NotePlacement";
import { SelectionBox } from "./SelectionBox";
import { HighlighterPreviewContext, StrokePreview, type DrawingPreview } from "./Strokes";
import type { ViewportApi } from "@/lib/canvas/useViewport";

/**
 * Espaçamento da malha de pontos a 100%, em pixels.
 *
 * Mora aqui, e não no CSS, porque precisa ser multiplicado pela escala a cada quadro — o
 * `globals.css` lê este valor pela variável `--canvas-dot-gap` que o componente injeta.
 */
const DOT_GAP = 24;

/**
 * Sensibilidade da roda. O passo é exponencial: cada unidade de rolagem multiplica a
 * escala, o que dá a mesma sensação em trackpad e em mouse de roda travada.
 */
const WHEEL_SENSITIVITY = 0.002;

/** O botão da rodinha do mouse, que navega o quadro como a barra de espaço. */
const MIDDLE_BUTTON = 1;

/** Pixels equivalentes a uma unidade de `deltaY` em cada modo de rolagem do browser. */
const DELTA_MODE_TO_PIXELS = { line: 16, page: 100 } as const;

type ViewportProps = Pick<ViewportApi, "viewport" | "pan" | "zoomBy"> & {
  /** Duplo clique no fundo vazio, já convertido para coordenadas de canvas. */
  onBackgroundDoubleClick?: (point: Point) => void;
  /** Clique simples no fundo vazio, sem arrasto. */
  onBackgroundClick?: () => void;
  /** Começo de um retângulo de seleção. Com `additive`, ele soma ao que já estava marcado. */
  onSelectionStart?: (additive: boolean) => void;
  /** Retângulo de seleção em curso, em coordenadas de canvas. */
  onSelectionRect?: (rect: Rect) => void;
  /**
   * Um modo de desenho ligado: arrastar desenha em vez de selecionar (#68). Lápis, caneta
   * tinteiro (#114) ou marca-texto (#117) — qual deles é `drawingTool`.
   */
  pencil?: boolean;
  /**
   * Cor da ferramenta de desenho ligada (#69, #117), para o traço em curso nascer com ela, e
   * não preto por padrão.
   */
  pencilColor?: StrokeColor;
  /**
   * Ferramenta do traço em curso (#116). Decide a espessura e a opacidade da prévia, e em
   * que altura ela é desenhada: o marca-texto por baixo da tinta, como vai ficar ao soltar.
   */
  drawingTool?: StrokeTool;
  /**
   * Espessura e opacidade da ferramenta ligada (#162), em índices, como o traço as grava.
   * Ausentes, o padrão da ferramenta. Chegam à prévia pelo mesmo caminho da cor, para o
   * traço em curso já ter a cara do traço que vai ficar.
   */
  strokeSize?: StrokeSize;
  strokeOpacity?: StrokeOpacity;
  /** Modo borracha ligado: arrastar ou tocar apaga o traço que encostar (#98). */
  erasing?: boolean;
  /** Modo de colocação ligado: uma nota translúcida segue o cursor e o clique a fixa (#73). */
  placing?: boolean;
  /** Clique com o modo de colocação ligado, já convertido para coordenadas de canvas. */
  onPlaceNote?: (point: Point) => void;
  /**
   * Traço concluído, em coordenadas de canvas, ainda sem simplificação, com a ferramenta que
   * estava ligada quando o gesto **começou** (#117) — trocar de modo no meio do traço não
   * muda o que já está sendo desenhado.
   */
  onStrokeEnd?: (points: Point[], tool: StrokeTool) => void;
  /** Começo de uma passada de borracha: o gesto acabou de tomar a superfície. */
  onEraseStart?: () => void;
  /** Trecho da passada de borracha, de onde o ponteiro estava a onde está agora. */
  onEraseSegment?: (a: Point, b: Point) => void;
  /** Fim da passada de borracha: solta o ponteiro, grava o que foi tocado. */
  onEraseEnd?: () => void;
  children?: ReactNode;
};

/**
 * Converte um delta da roda para pixels.
 *
 * O Firefox reporta rolagem em linhas e alguns dispositivos em páginas; sem normalizar, o
 * mesmo gesto andaria dezenas de vezes menos nesses casos.
 */
function wheelDeltaToPixels(delta: number, deltaMode: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * DELTA_MODE_TO_PIXELS.line;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * DELTA_MODE_TO_PIXELS.page;
  return delta;
}

/**
 * Deslocamento do quadro para um evento de roda, em pixels de tela.
 *
 * Sinal invertido de propósito: rolar para baixo empurra o **conteúdo** para cima, que é
 * como rola qualquer página. O quadro anda no sentido oposto ao dedo.
 *
 * Com Shift, a rolagem vertical vira horizontal. É a convenção de quem tem roda de um eixo
 * só; nos trackpads o browser já entrega `deltaX` e o Shift não é necessário — por isso o
 * desvio só acontece quando não veio deslocamento horizontal nenhum.
 */
function wheelPan(event: WheelEvent): Point {
  const x = wheelDeltaToPixels(event.deltaX, event.deltaMode);
  const y = wheelDeltaToPixels(event.deltaY, event.deltaMode);

  if (event.shiftKey && x === 0) return { x: -y, y: 0 };
  return { x: -x, y: -y };
}

/**
 * Gesto em curso sobre o fundo.
 *
 * Um estado só, e não uma flag por gesto, porque os dois são exclusivos por natureza: um
 * ponteiro faz uma coisa de cada vez. Qual deles nasce é decidido no `pointerdown`, pelo
 * espaço e pelo tipo de ponteiro, e não muda no meio do caminho.
 *
 * Só o `marquee` guarda a origem em tela e o `started`: é ele que precisa separar clique de
 * arrasto. O `pan` não tem essa dúvida — quem segurou espaço já disse o que queria, e
 * navegar nunca é um clique.
 */
type DragState =
  | { kind: "pan"; pointerId: number; last: Point }
  | {
      kind: "draw";
      pointerId: number;
      /** O traço em curso, em coordenadas de canvas, na ordem em que foi desenhado. */
      points: Point[];
      /** Ferramenta e cor do instante em que o gesto começou (#117). */
      tool: StrokeTool;
      color: StrokeColor;
    }
  | {
      kind: "erase";
      pointerId: number;
      /** Último ponto reportado, em coordenadas de canvas — origem do próximo segmento. */
      last: Point;
    }
  | {
      kind: "marquee";
      pointerId: number;
      /** Origem em pixels de tela, para separar clique de arrasto. */
      origin: Point;
      /** Origem em coordenadas de canvas: o canto fixo do retângulo. */
      start: Point;
      /** Shift no começo do gesto: o retângulo soma em vez de substituir. */
      additive: boolean;
      /** Falso até passar da folga. Antes disso o gesto ainda pode ser um clique. */
      started: boolean;
    };

/**
 * Superfície navegável do quadro.
 *
 * Os dois gestos que disputam o botão principal do mouse foram separados por um modificador,
 * que é a convenção das ferramentas de quadro:
 *
 * - **Arrastar o fundo seleciona**, desenhando o retângulo. Com Shift ele soma ao que já
 *   estava marcado; sem, substitui.
 * - **Segurar espaço e arrastar navega**, sobre o fundo e sobre os post-its.
 * - **Roda e dois dedos no trackpad navegam** também, sem tecla nenhuma.
 * - **Ctrl (ou ⌘) com a roda dá zoom**, ancorado no cursor. É a mesma tecla que o pinch do
 *   trackpad emite, então pinçar cai nesse caminho sozinho.
 *
 * O zoom deixou de responder à roda pura porque ela passou a mover: são o mesmo evento, e o
 * único lugar que sobra para o zoom é sob um modificador. Os botões de zoom continuam.
 *
 * O conteúdo do canvas vive dentro de uma única camada transformada, e não de elementos
 * posicionados um a um: com dezenas de post-its, o browser compõe uma transform só em vez
 * de recalcular layout de cada elemento a cada quadro.
 */
export function Viewport({
  viewport,
  pan,
  zoomBy,
  onBackgroundDoubleClick,
  onBackgroundClick,
  onSelectionStart,
  onSelectionRect,
  pencil = false,
  pencilColor = STROKE_COLOR_BLACK,
  drawingTool = STROKE_TOOL_PENCIL,
  strokeSize,
  strokeOpacity,
  erasing = false,
  placing = false,
  onPlaceNote,
  onStrokeEnd,
  onEraseStart,
  onEraseSegment,
  onEraseEnd,
  children,
}: ViewportProps) {
  const spaceHeld = useSpaceHeld();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  /**
   * Dedos encostados na tela agora, na ordem em que chegaram.
   *
   * A pinça precisa de dois pontos ao mesmo tempo, e o estado de gesto acima só guarda um
   * ponteiro — dois dedos são dois gestos concorrentes para ele.
   */
  const touches = useRef(new Map<number, { point: Point; target: Element }>());
  /**
   * Dedos cujo gesto **eu** cancelei ao abrir a pinça.
   *
   * O `pointercancel` que aviso ao post-it borbulha de volta até esta superfície; sem
   * marcá-lo, o meu próprio handler apagaria o dedo da pinça que acabou de começar.
   */
  const cancelledByPinch = useRef(new Set<number>());
  /** O instante anterior da pinça, ou `null` quando não há dois dedos na tela. */
  const pinch = useRef<PinchSnapshot | null>(null);
  /**
   * O viewport atual, para os handlers de ponteiro.
   *
   * Lido de uma ref, e não da closure: durante um pan o viewport muda a cada quadro, e
   * handlers que dependessem dele seriam recriados na mesma frequência.
   */
  const viewportRef = useRef(viewport);
  // Sincronizada por efeito, e não no render: escrever uma ref enquanto se renderiza é
  // inseguro sob render concorrente, e aqui não é preciso — quem lê são os handlers de
  // ponteiro, e o viewport não muda no meio de um gesto de marquee.
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);
  /**
   * O retângulo em desenho.
   *
   * É o único estado do viewport que precisa de re-render — pan e zoom se resolvem por
   * transform, mas um retângulo que não redesenha não é um retângulo.
   */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  /**
   * O traço em curso, espelhado em estado para poder ser desenhado.
   *
   * A lista de verdade é a do gesto, na ref: é dela que sai o traço gravado ao soltar. Esta
   * é a cópia que o React redesenha a cada ponto — sem ela, o rabisco só apareceria depois
   * de solto, e desenhar às cegas não é desenhar.
   */
  const [drawing, setDrawing] = useState<DrawingPreview | null>(null);
  /**
   * Onde o ponteiro está, em pixels de tela relativos ao canto da superfície.
   *
   * Em coordenadas de **tela**, e não de canvas, apesar de a prévia ser desenhada dentro da
   * camada transformada. É o que mantém a nota fantasma sob o cursor quando o quadro anda
   * por baixo dela: guardado em canvas, o fantasma ficaria grudado no ponto do quadro e
   * escaparia do cursor durante um pan. A conversão acontece no render, com o viewport de
   * agora.
   *
   * `null` é a resposta honesta para "não há ponteiro sobre o quadro" — logo depois de `N`
   * com o cursor fora da janela, por exemplo. Sem esse caso a prévia teria de aparecer em
   * algum canto escolhido por falta de resposta.
   */
  const [pointer, setPointer] = useState<Point | null>(null);
  /**
   * A rodinha está apertada, navegando o quadro (#84).
   *
   * Estado, e não classe derivada de outra coisa, porque não há de onde derivar: a barra de
   * espaço se conhece **antes** do arrasto — a tecla desce e o cursor muda na hora, mesmo
   * parado —, e o botão do meio só se conhece no `pointerdown`, que é o mesmo instante em
   * que o pan começa. O cursor de mão aqui não promete o gesto; confirma que ele está
   * acontecendo.
   *
   * Custa dois renders por gesto, no começo e no fim, e nenhum durante o movimento — que é
   * a propriedade que o `cursorClass` declara logo abaixo e que o pan não pode perder.
   */
  const [wheelPanning, setWheelPanning] = useState(false);

  /*
    Sair do modo apaga o ponteiro guardado.

    Sem isto, ligar o modo de novo pintaria a prévia no último ponto conhecido antes de o
    cursor se mexer — que é exatamente o canto arbitrário que o estado `null` existe para
    evitar, só que com um lugar plausível o bastante para ninguém desconfiar.

    Ajuste durante o render, e não num efeito: é o mesmo padrão que o quadro usa para a
    trava da apresentação. O efeito só rodaria depois da pintura, e a prévia velha chegaria
    a aparecer por um quadro; aqui o React reinicia o render com o valor novo antes de
    pintar, e ninguém vê o estado intermediário.

    A borracha entra na mesma guarda que a colocação de nota: o círculo do alvo (#98) segue
    o mesmo ponteiro guardado, pela mesma razão de não aparecer num canto arbitrário ao
    ligar o modo.
  */
  if (!placing && !erasing && pointer !== null) setPointer(null);

  /** Posição do ponteiro relativa ao canto do container — é o que as conversões esperam. */
  const localPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }, []);

  /**
   * Zoom pela roda.
   *
   * Precisa de listener nativo não passivo: o `onWheel` do React é registrado de forma
   * passiva na raiz, onde `preventDefault` não tem efeito. Sem isso, ctrl+roda e o pinch do
   * trackpad — que chegam como wheel com `ctrlKey` — dariam zoom no quadro **e** na página
   * ao mesmo tempo.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Roda e dois dedos no trackpad **movem** o quadro; com Ctrl (ou ⌘) dão zoom. Essa é a
      // mesma tecla que o pinch do trackpad emite, então o gesto de pinçar cai aqui sozinho,
      // sem ramo próprio.
      if (event.ctrlKey || event.metaKey) {
        const delta = wheelDeltaToPixels(event.deltaY, event.deltaMode);
        zoomBy(Math.exp(-delta * WHEEL_SENSITIVITY), localPoint(event));
        return;
      }

      const delta = wheelPan(event);
      pan(delta.x, delta.y);
    };

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, [zoomBy, pan, localPoint]);

  /**
   * Começa (ou recomeça) a pinça a partir dos dois primeiros dedos na tela.
   *
   * Recomeçar importa quando um terceiro dedo entra ou sai: a distância de referência passa
   * a ser a de agora, senão o quadro daria um salto de escala no meio do gesto.
   */
  const restartPinch = useCallback(() => {
    const [first, second] = [...touches.current.values()];
    pinch.current = first && second ? pinchSnapshot(first.point, second.point) : null;
  }, []);

  /**
   * Arma um traço a partir deste ponteiro, tomando o gesto para o lápis.
   *
   * Reivindicar na descida é o ponto: o quadro inteiro é superfície de desenho com o modo
   * ligado, e sem parar o evento aqui um traço que começasse sobre uma nota viraria arraste
   * dela. O mouse e o dedo chegam por caminhos diferentes — um pelo tipo de ponteiro, o
   * outro pela contagem de dedos — mas o que acontece depois é o mesmo, e mora aqui.
   */
  const startDrawing = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = screenToCanvas(localPoint(event), viewportRef.current);
      const style = { tool: drawingTool, color: pencilColor, w: strokeSize, o: strokeOpacity };
      drag.current = { kind: "draw", pointerId: event.pointerId, points: [point], ...style };
      setDrawing({ points: [point], ...style });
    },
    [drawingTool, localPoint, pencilColor, strokeOpacity, strokeSize],
  );

  /**
   * Arma uma passada de borracha a partir deste ponteiro, tomando o gesto para ela.
   *
   * Reivindicar na descida, como o lápis: com o modo ligado o quadro inteiro é alvo da
   * borracha, e sem parar o evento aqui um traço sob o ponteiro capturaria o gesto para a
   * própria seleção antes que a borracha o visse.
   *
   * O ponto da descida já é testado — não só os movimentos seguintes —, porque é ele que
   * cobre o toque sem arrasto: um clique parado que nunca gera `pointermove` ainda precisa
   * apagar o que estiver embaixo (#98).
   */
  const startErasing = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = screenToCanvas(localPoint(event), viewportRef.current);
      drag.current = { kind: "erase", pointerId: event.pointerId, last: point };
      onEraseStart?.();
      onEraseSegment?.(point, point);
    },
    [localPoint, onEraseSegment, onEraseStart],
  );

  /** Verdadeiro só para eventos nascidos no fundo, e não em algo desenhado sobre ele. */
  const isBackground = useCallback(
    (event: { target: EventTarget; currentTarget: EventTarget }): boolean => {
      return event.target === event.currentTarget || event.target === layerRef.current;
    },
    [],
  );

  /**
   * Duplo clique no fundo: o gesto que cria um post-it (#13).
   *
   * A conversão para coordenadas de canvas acontece aqui porque é aqui que o viewport é
   * conhecido; quem recebe o evento não deveria precisar saber o zoom para colocar algo
   * sob o cursor.
   */
  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isBackground(event)) return;
      // Mesma guarda do pan logo abaixo: só o botão primário age sobre o quadro. Os
      // browsers atuais só disparam dblclick nele, mas depender disso deixa a regra
      // implícita num handler cujo vizinho a declara.
      if (event.button !== 0) return;

      // Sem isto, o gesto começa selecionando o texto do fundo antes de o post-it aparecer.
      event.preventDefault();
      onBackgroundDoubleClick?.(screenToCanvas(localPoint(event), viewport));
    },
    [isBackground, localPoint, onBackgroundDoubleClick, viewport],
  );

  /**
   * O que precisa ser decidido na **descida** do evento, antes de um post-it pará-lo.
   *
   * Todos os casos aqui existem pelo mesmo motivo: o post-it interrompe o `pointerdown`
   * antes de ele chegar à superfície, e estes gestos valem sobre o quadro inteiro, notas
   * inclusive. São quatro, nesta ordem de prioridade:
   *
   * 1. A contagem de dedos da pinça (#57), que precisa enxergar o toque mesmo quando ele
   *    começa sobre uma nota — e que abre a pinça quando o segundo dedo encosta.
   * 2. O traço com um dedo, dentro dessa contagem, com o lápis ligado (#71).
   * 3. O traço com o mouse ou a caneta, também com o lápis ligado (#68).
   * 4. O pan com a barra de espaço segurada, que ganha do lápis: navegar é o gesto que
   *    precisa existir em qualquer modo.
   */
  const handlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      /*
        O modo de colocação come o gesto inteiro, antes de tudo (#73).

        Antes da contagem de dedos porque ele termina no primeiro toque: não existe pinça
        durante uma colocação, e não existe segundo dedo — o modo se desliga no `pointerdown`
        que fixa a nota. Antes do lápis porque os dois nunca estão ligados ao mesmo tempo;
        quem garante isso é o quadro, que guarda um modo só.

        Espaço continua ganhando, pela mesma razão de sempre: navegar é o gesto que precisa
        existir em qualquer modo, e alguém que segurou espaço está procurando onde colocar a
        nota, não colocando-a.

        `stopPropagation` é o que faz o clique valer também sobre um post-it: sem ele a nota
        de baixo interceptaria o evento e viraria arraste, e colocar uma nota em cima de
        outra é um pedido perfeitamente comum.
      */
      if (placing && !spaceHeld && event.button === 0) {
        event.stopPropagation();
        event.preventDefault();
        onPlaceNote?.(screenToCanvas(localPoint(event), viewportRef.current));
        return;
      }

      /*
        Dedos são contados na descida, antes de qualquer post-it parar o evento: com a
        contagem só no fundo, pinçar num quadro cheio — onde é mais provável encostar numa
        nota — simplesmente não funcionaria, e no toque não sobra botão de zoom.

        Um terceiro dedo é ignorado: a pinça é definida pelos dois primeiros, e trocar a
        referência no meio do gesto daria um salto de escala.
      */
      if (event.pointerType === "touch" && event.button === 0 && touches.current.size < 2) {
        touches.current.set(event.pointerId, {
          point: { x: event.clientX, y: event.clientY },
          target: event.target as Element,
        });

        if (touches.current.size === 2) {
          event.stopPropagation();
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);

          // O primeiro dedo pode ter armado o arraste de um post-it. Cancelá-lo é o que
          // impede a nota de andar junto enquanto a pessoa acha que só está pinçando.
          const [firstId, first] = [...touches.current.entries()][0] ?? [];
          if (firstId !== undefined && first) {
            cancelledByPinch.current.add(firstId);
            cancelPointerGesture(first.target, firstId);
          }

          // A passada de borracha do primeiro dedo, ao contrário do traço, não morre: o que
          // já tocou já sumiu do board de verdade para quem olha, e um segundo dedo chegando
          // não é motivo para reaparecer tinta que a pessoa acabou de apagar. Grava o que
          // houver e encerra a passada, em vez de descartá-la.
          if (drag.current?.kind === "erase") onEraseEnd?.();

          drag.current = null;
          // O traço que o primeiro dedo tinha começado morre aqui, e não pela metade: quem
          // encostou o segundo dedo está pinçando, não desenhando (#71). Sem limpar a
          // prévia, o meio-rabisco ficaria pintado na tela sem nunca entrar no board.
          setDrawing(null);
          restartPinch();
          return;
        }

        /*
          Com o lápis ligado, o primeiro dedo desenha em vez de navegar (#71). A pinça de
          dois dedos passa a ser a única forma de mover o quadro enquanto o modo está
          ativo — é a troca que o modo faz no toque, e o motivo de o indicador importar
          ainda mais aqui.

          Dentro da contagem, e não ao lado dela: assim isto só vale para o **primeiro**
          dedo. Um terceiro dedo durante a pinça não é contado, e fora daqui ele começaria
          um traço por baixo do gesto que já está acontecendo.

          A borracha segue a mesma regra, pela mesma razão (#98): um dedo só apaga, dois
          pinçam.
        */
        if (pencil) {
          startDrawing(event);
          return;
        }

        if (erasing) {
          startErasing(event);
          return;
        }
      }

      /*
        O lápis reivindica o gesto na descida, pelo mesmo motivo do pan com espaço: com o
        modo ligado o quadro inteiro é superfície de desenho, e um traço que começasse sobre
        uma nota viraria arraste dela — a nota para o `pointerdown` antes de ele chegar aqui.

        Espaço continua ganhando do lápis: navegar é o gesto que precisa existir em qualquer
        modo, e é o único que não tem alternativa com o lápis ligado.

        O toque já foi resolvido na contagem de dedos acima, onde se sabe que dedo é este.
      */
      if (pencil && !spaceHeld && event.button === 0 && event.pointerType !== "touch") {
        startDrawing(event);
        return;
      }

      // A borracha reivindica o gesto pela mesma razão do lápis logo acima, na mesma ordem
      // de prioridade: espaço ganha de tudo, o lápis nunca está ligado ao mesmo tempo (#98).
      if (erasing && !spaceHeld && event.button === 0 && event.pointerType !== "touch") {
        startErasing(event);
        return;
      }

      if (!spaceHeld || event.button !== 0) return;

      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {
        kind: "pan",
        pointerId: event.pointerId,
        last: { x: event.clientX, y: event.clientY },
      };
    },
    [
      erasing,
      localPoint,
      onEraseEnd,
      onPlaceNote,
      pencil,
      placing,
      restartPinch,
      spaceHeld,
      startDrawing,
      startErasing,
    ],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // O gesto nasce no fundo ou na camada do canvas; um post-it (issue #15) para o evento
      // antes de chegar aqui.
      if (!isBackground(event)) return;
      if (event.button !== 0 && event.button !== MIDDLE_BUTTON) return;
      // Cada handler declara a própria condição: com espaço, o gesto é da captura acima.
      if (spaceHeld) return;
      // Colocar uma nota também: a captura já tratou o clique e não deixou gesto nenhum
      // armado, então sem esta linha o mesmo evento ainda começaria um retângulo de seleção
      // por baixo da nota recém-colocada.
      if (placing) return;

      // Defesa contra um `pointerup` perdido, que deixaria um gesto pendurado.
      if (drag.current !== null) return;

      /**
       * A rodinha apertada navega, como segurar espaço.
       *
       * É o gesto que quem vem de editor de imagem ou de mapa já tem no dedo, e o único
       * que navega sem exigir as duas mãos. O `preventDefault` é obrigatório: sem ele o
       * Windows e o Linux entram no modo de rolagem automática, aquele ícone que fica
       * preso no meio da tela rolando a página sozinho.
       */
      if (event.button === MIDDLE_BUTTON) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          kind: "pan",
          pointerId: event.pointerId,
          last: { x: event.clientX, y: event.clientY },
        };
        setWheelPanning(true);
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);

      // No toque não há espaço para segurar: um dedo navega, que é a única forma de mover o
      // quadro por lá. Os dois dedos da pinça já foram contados na fase de captura (#57), e
      // selecionar por retângulo fica para quem tem ponteiro.
      if (event.pointerType === "touch") {
        /*
          Com o lápis ligado, nenhum dedo navega (#71).

          Os dois primeiros nem chegam aqui — a captura reivindica um para o traço e o outro
          para a pinça. Quem chega é o terceiro dedo em diante, que a contagem ignora de
          propósito; sem esta guarda ele armaria um pan por baixo da pinça em curso, e o
          quadro andaria com um dedo justamente no modo em que um dedo não move nada.
        */
        if (pencil || erasing) return;

        drag.current = {
          kind: "pan",
          pointerId: event.pointerId,
          last: { x: event.clientX, y: event.clientY },
        };
        return;
      }

      // Arrastar o fundo **seleciona**. Navegar é o gesto com espaço, ou a roda.
      drag.current = {
        kind: "marquee",
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        start: screenToCanvas(localPoint(event), viewportRef.current),
        additive: event.shiftKey,
        started: false,
      };
    },
    [erasing, isBackground, localPoint, pencil, placing, spaceHeld],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Antes de qualquer gesto, e fora de todos eles: a prévia da colocação e o círculo da
      // borracha seguem o cursor mesmo quando ele passa por cima de um post-it. Só custa um
      // re-render enquanto um dos dois modos está ligado.
      if (placing || erasing) setPointer(localPoint(event));

      const touch = touches.current.get(event.pointerId);
      if (touch) {
        touches.current.set(event.pointerId, {
          point: { x: event.clientX, y: event.clientY },
          target: touch.target,
        });

        const previous = pinch.current;
        const [first, second] = [...touches.current.values()];
        if (previous !== null && first && second) {
          const change = pinchChange(previous, pinchSnapshot(first.point, second.point));
          // Arrastar com dois dedos move o quadro, e afastá-los dá zoom: as duas coisas
          // acontecem no mesmo gesto, e separá-las obrigaria a pessoa a escolher.
          pan(change.pan.x, change.pan.y);
          zoomBy(change.factor, localPoint({ clientX: change.center.x, clientY: change.center.y }));
          pinch.current = pinchSnapshot(first.point, second.point);
          return;
        }
      }

      const state = drag.current;
      if (state === null || state.pointerId !== event.pointerId) return;

      if (state.kind === "pan") {
        // Diferença de clientX/Y, e não movementX/Y: este é o mesmo sistema de coordenadas
        // usado nas conversões, não muda com o zoom da página e não fica indefinido em
        // browsers que não implementam movement em eventos de ponteiro.
        pan(event.clientX - state.last.x, event.clientY - state.last.y);
        state.last = { x: event.clientX, y: event.clientY };
        return;
      }

      if (state.kind === "erase") {
        // O segmento entre o último ponto reportado e este, em coordenadas de canvas: é
        // ele que a passada testa contra cada traço, e não o ponto sozinho — sem isto, um
        // movimento rápido pularia por cima de um rabisco fino sem nunca tocá-lo.
        const point = screenToCanvas(localPoint(event), viewportRef.current);
        onEraseSegment?.(state.last, point);
        state.last = point;
        return;
      }

      if (state.kind === "draw") {
        // Em coordenadas de canvas desde já: o traço é conteúdo do quadro, e guardá-lo em
        // pixels de tela o prenderia ao zoom e ao pan do instante em que foi desenhado.
        state.points.push(screenToCanvas(localPoint(event), viewportRef.current));
        setDrawing({ points: [...state.points], tool: state.tool, color: state.color });
        return;
      }

      const here = { x: event.clientX, y: event.clientY };
      if (!state.started) {
        // Nada de retângulo antes da folga: sem isto um clique no fundo desenharia uma caixa
        // de zero pixel e refaria a seleção a partir dela.
        if (distance(state.origin, here) <= CLICK_SLOP) return;
        state.started = true;
        // O Shift do começo do gesto, e não o de agora: soltá-lo no meio do arrasto não
        // deveria transformar um retângulo que somava num que substitui.
        onSelectionStart?.(state.additive);
      }

      const rect = rectFromCorners(
        state.start,
        screenToCanvas(localPoint(event), viewportRef.current),
      );
      setMarquee(rect);
      onSelectionRect?.(rect);
    },
    [erasing, localPoint, onEraseSegment, onSelectionRect, onSelectionStart, pan, placing, zoomBy],
  );

  /**
   * O cursor saiu do quadro: não há mais ponto para a prévia obedecer.
   *
   * `pointerleave` e não `pointerout`: o segundo dispara também ao passar de um post-it
   * para o fundo, e a prévia piscaria a cada nota que o cursor cruzasse no caminho.
   */
  const handlePointerLeave = useCallback(() => setPointer(null), []);

  /**
   * Fecha o que este ponteiro tinha em aberto e devolve o gesto que ele era, ou `null`.
   *
   * Também mantém a contagem de dedos: tirar um não encerra a pinça enquanto sobrar mais de
   * um, e com um só o gesto volta a ser navegação, a partir de quem ficou.
   */
  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>): DragState | null => {
      if (touches.current.delete(event.pointerId)) {
        restartPinch();
        if (touches.current.size === 1) {
          const [remaining] = [...touches.current.entries()];
          /*
            Sair da pinça com um dedo na tela devolve a navegação a quem ficou — mas não com
            o lápis ligado, onde um dedo não navega (#71).

            E também não vira traço: o dedo que sobra estava pinçando, e transformá-lo em
            lápis deixaria tinta que ninguém pediu no caminho de volta do gesto. Ele fica sem
            função até ser levantado; o traço seguinte começa no toque seguinte.
          */
          // Nem com a borracha ligada, pela mesma razão (#98): o dedo que sobra estava
          // pinçando, e apagar por baixo dele no caminho de volta apagaria tinta que
          // ninguém mirou.
          if (remaining && !pencil && !erasing) {
            drag.current = { kind: "pan", pointerId: remaining[0], last: remaining[1].point };
          }
        }
      }

      const state = drag.current;
      // A captura é solta aqui e não mais abaixo: na pinça os dois dedos são capturados sem
      // haver um `drag` correspondente, e o dedo que sai não pode levar a captura embora.
      releaseCapture(event);

      // Aqui, e não só no `pointerup`: `endDrag` é o caminho comum da subida e do
      // cancelamento, e uma notificação do sistema no meio do gesto não pode deixar a mão
      // fechada na tela para sempre. Chamar com `false` já sendo `false` não re-renderiza —
      // o React descarta o mesmo valor —, então os outros gestos não pagam por isto.
      setWheelPanning(false);

      if (state === null || state.pointerId !== event.pointerId) return null;

      drag.current = null;
      setMarquee(null);
      setDrawing(null);

      return state;
    },
    [erasing, pencil, restartPinch],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = endDrag(event);
      if (state === null) return;

      if (state.kind === "draw") {
        // Dois pontos é o mínimo que o contrato aceita, e é também o mínimo que significa
        // alguma coisa: um clique parado com o lápis ligado não é um traço, é um clique.
        if (state.points.length >= 2) onStrokeEnd?.(state.points, state.tool);
        return;
      }

      if (state.kind === "erase") {
        // Soltar o ponteiro é o fim normal da passada: grava numa remoção só o que ela
        // tocou (#98).
        onEraseEnd?.();
        return;
      }

      if (state.kind !== "marquee") return;

      // Um retângulo que nunca chegou a começar foi um clique, e clique no fundo limpa a
      // seleção. Navegar não passa por aqui: mover o quadro não desmarca nada.
      //
      // Com Shift, não: ali o Shift **acrescenta**, como faz no post-it e no retângulo. Um
      // shift-clique que errou o alvo não pode desfazer a seleção que ele ia ampliar.
      if (!state.started && !state.additive) onBackgroundClick?.();
    },
    [endDrag, onBackgroundClick, onEraseEnd, onStrokeEnd],
  );

  /**
   * Gesto interrompido pelo sistema.
   *
   * Encerra sem interpretar: um cancelamento não é um clique, e tratá-lo como tal limparia
   * a seleção por causa de uma notificação do SO.
   */
  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // O cancelamento que eu mesmo emiti para o post-it, voltando por borbulhamento:
      // tratá-lo aqui desfaria a pinça no instante em que ela começa.
      if (cancelledByPinch.current.delete(event.pointerId)) return;

      const state = endDrag(event);
      // Uma passada de borracha interrompida pelo sistema também não pode ficar pendurada:
      // o que ela já tocou já sumiu da tela, e sem gravar ficaria escondido para sempre sem
      // nunca ter entrado no histórico (#98).
      if (state?.kind === "erase") onEraseEnd?.();
    },
    [endDrag, onEraseEnd],
  );

  const origin = canvasToScreen({ x: 0, y: 0 }, viewport);

  /*
    Onde a nota fantasma cai, em coordenadas de canvas.

    Convertido no render, e não guardado assim: é o que faz a prévia acompanhar o pan e o
    zoom sem depender de o cursor se mexer. Mudou o viewport, muda o ponto — o fantasma
    continua sob o cursor mesmo quando quem andou foi o quadro.
  */
  const placementPoint = placing && pointer !== null ? screenToCanvas(pointer, viewport) : null;

  /** Onde o círculo da borracha cai, em coordenadas de canvas — mesma conta, mesma razão. */
  const eraserPoint = erasing && pointer !== null ? screenToCanvas(pointer, viewport) : null;

  /*
    O cursor conta o que o ponteiro vai fazer: mão com espaço, mão fechada com a rodinha
    apertada, lápis com o modo ligado, cruz para mirar a nota. Na mesma ordem em que os
    gestos se decidem no `pointerdown`, senão o desenho prometeria uma coisa e o gesto faria
    outra — e por isso o espaço ganha de tudo, inclusive de um pan já em curso.

    A rodinha entra logo depois porque é a única entrada que não promete, e sim confirma: ela
    só se conhece quando o pan já começou. Por isso `cursor-grabbing` direto, e não o
    `cursor-grab` com `active:` do espaço — a mão já está fechada, e o `:active` do browser
    não cobre o botão do meio.

    A ferramenta de seleção fica com a seta do sistema, e é a única que não desenha nada
    próprio. É o gesto que a pessoa já conhece de qualquer outra tela: apontar e clicar.
    A cruz que ficava aqui prometia mira, que é o que a colocação de nota faz — e num
    quadro em que a seleção é a ferramenta de partida, era a mira que estava sempre ligada.

    A borracha some o cursor do sistema (#98): o círculo de `EraserCursor`, do tamanho exato
    do alvo, é quem responde por ela agora — um ícone de tamanho fixo ao lado do círculo só
    confundiria sobre qual dos dois é a área de verdade.

    Muda por classe: dos gestos, só o pan pela rodinha chega a re-renderizar, e ainda assim
    duas vezes por gesto e nenhuma durante o movimento.
  */
  const cursorClass = spaceHeld
    ? "cursor-grab active:cursor-grabbing"
    : wheelPanning
      ? "cursor-grabbing"
      : pencil
        ? drawingTool === STROKE_TOOL_HIGHLIGHTER
          ? "cursor-highlighter"
          : drawingTool === STROKE_TOOL_FOUNTAIN
            ? "cursor-fountain"
            : "cursor-pencil"
        : erasing
          ? "cursor-none"
          : placing
            ? "cursor-crosshair"
            : "cursor-default";

  // A altura da prévia segue a ferramenta do gesto, e não a do modo agora: são a mesma coisa,
  // exceto quando o modo muda no meio de um traço (#117).
  const highlighting = drawing?.tool === STROKE_TOOL_HIGHLIGHTER;

  return (
    <div
      ref={surfaceRef}
      /*
        `select-none` na superfície inteira: nenhum gesto sobre o quadro cria seleção de
        texto.

        Sem isto, arrastar o retângulo de seleção deixa uma seleção de texto do navegador
        atravessando o quadro, e ela é **pintada** por cima de tudo que estiver dentro do
        intervalo — inclusive de caixas vazias, como a moldura de um traço marcado. O
        resultado é um fundo azul translúcido que nenhuma classe deste projeto pediu.

        Aqui, e não em cada peça: o post-it já se defendia sozinho, e defender uma por uma
        deixa a próxima a nascer com o mesmo defeito. O editor do post-it não é afetado — um
        campo de texto continua selecionável com o `user-select` herdado, e é assim que ele
        já funcionava dentro do post-it, que carrega esta mesma classe desde sempre.
      */
      className={`whiteboard-surface absolute inset-0 touch-none overflow-hidden select-none ${cursorClass}`}
      style={
        {
          // A malha acompanha o zoom e o pan, senão o fundo fica parado e o quadro parece
          // não se mexer.
          "--canvas-dot-gap": `${DOT_GAP * viewport.scale}px`,
          backgroundPosition: `${origin.x}px ${origin.y}px`,
        } as CSSProperties
      }
      onDoubleClick={handleDoubleClick}
      // O `pointerdown` do botão do meio já foi barrado, mas o `auxclick` é um evento à
      // parte: sem engoli-lo, soltar a rodinha ainda dispara a rolagem automática.
      onAuxClick={(event) => {
        if (event.button === MIDDLE_BUTTON) event.preventDefault();
      }}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      data-space-held={spaceHeld}
      data-wheel-panning={wheelPanning}
      data-pencil={pencil}
      data-erasing={erasing}
      data-placing={placing}
      data-testid="viewport-surface"
    >
      <div
        ref={layerRef}
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
        data-testid="viewport-layer"
      >
        {/*
          A prévia do marca-texto não é desenhada aqui, e sim dentro da camada de tinta,
          entre os marca-textos e o resto dos traços (#116): é a altura em que o traço vai
          ficar, e fora dela ele pularia de camada no instante em que o ponteiro fosse solto.
          O Provider fica sempre montado — trocá-lo de lugar remontaria o board inteiro.
        */}
        <HighlighterPreviewContext.Provider value={highlighting ? drawing : null}>
          {children}
        </HighlighterPreviewContext.Provider>
        {highlighting ? null : (
          <StrokePreview
            points={drawing?.points ?? null}
            color={drawing?.color ?? pencilColor}
            tool={drawing?.tool}
            w={drawing?.w}
            o={drawing?.o}
          />
        )}
        {/*
          Depois dos post-its, e não antes: a nota que está sendo colocada vai nascer na
          frente de todas (a store a cria no topo do z), e uma prévia desenhada por baixo
          prometeria o contrário no instante em que o cursor passa sobre uma nota existente.
        */}
        <NotePlacementPreview at={placementPoint} />
        <EraserCursor at={eraserPoint} />
        <SelectionBox rect={marquee} />
      </div>
    </div>
  );
}
