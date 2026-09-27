"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { topLeftCenteredAt, type Point, type Rect, type Size } from "@/lib/canvas/coords";
import { simplify } from "@/lib/canvas/simplify";
import {
  EMPTY_SELECTION,
  elementsInRect,
  isEmpty,
  isSelected,
  selectAll,
  selectOnly,
  selectedNotes,
  selectedStrokes,
  sharedColor,
  toggle,
  union,
  type ElementKind,
  type Selection,
} from "./selection";
import {
  STROKE_MIN_SIZE,
  flattenPoints,
  pointsFromFlat,
  scaleStrokePoints,
  splitPolylineBySegment,
  strokeBounds,
  strokePoints,
  translateStrokePoints,
} from "./stroke-geometry";
import { parseClipboard, serializeSelection } from "./clipboard";
import { clampNoteSize } from "./schema";
import { createBoardStore, type NewStroke } from "./store";
import { useLocalPersistence } from "./useLocalPersistence";
import {
  NOTE_SIZE,
  STROKE_COLOR_BLACK,
  createEmptyBoard,
  type Board,
  type Note,
  type NoteColor,
  type Stroke,
  type StrokeColor,
} from "./types";

/**
 * Deslocamento de cada colagem, em unidades de canvas (#88).
 *
 * Existe porque colar em cima do original é indistinguível de não ter colado: a pessoa vê o
 * mesmo quadro e só descobre a cópia ao arrastar. O valor é pequeno de propósito — o
 * bastante para as duas caixas se separarem, pouco o bastante para o colado nascer perto de
 * onde se estava olhando.
 */
const PASTE_OFFSET = 20;

/**
 * Um traço novo com a cara de `stroke` e outros pontos — o que colar, duplicar e a borracha
 * criam a partir de um traço existente.
 *
 * Um lugar só para o que o traço carrega além dos pontos: um campo novo no contrato que
 * precisasse ser lembrado em cada chamada seria esquecido em uma delas, e o traço colado
 * mudaria de desenho em silêncio (#110).
 */
function strokeLike(stroke: Stroke, points: number[]): NewStroke {
  return { color: stroke.color, tool: stroke.tool, points };
}

/** Mapa vazio compartilhado: evita recriar uma instância nova a cada passada sem toque. */
const EMPTY_ERASING: ReadonlyMap<string, number[][] | null> = new Map();

/**
 * O elemento em redimensionamento e o tamanho que ele tem agora, durante o gesto.
 *
 * `from` é a caixa de quando o gesto começou, e não só a origem: o post-it guarda o próprio
 * tamanho e poderia ser relido da store, mas o traço não tem tamanho — ele tem pontos, e a
 * escala aplicada a eles precisa saber de que caixa se partiu. Medi-la de novo a cada
 * movimento daria uma caixa já reescalada, e o rabisco cresceria em progressão geométrica.
 */
export interface Resizing {
  kind: ElementKind;
  id: string;
  /** Caixa do elemento no começo do gesto, em coordenadas de canvas. */
  from: Rect;
  /** Tamanho agora, já limitado ao que a espécie aceita. */
  size: Size;
}

export interface BoardApi {
  /** Notes do board, na ordem em que a store as guarda. */
  notes: readonly Note[];
  /** Rabiscos do board, na ordem em que a store os guarda (#68). */
  strokes: readonly Stroke[];
  /**
   * Grava um traço recém-desenhado, em coordenadas de canvas.
   *
   * A simplificação (#67) acontece aqui, e não em quem desenhou: é a fronteira entre o
   * gesto e o board, e todo traço que entra passa por ela. Quem desenha entrega os pontos
   * crus que o ponteiro reportou e não precisa saber que existe compressão.
   */
  addStroke: (points: readonly Point[]) => void;
  /**
   * Cor do próximo traço (#69). Preto até ser trocada; a troca vale para os traços
   * seguintes, e não recolore o que já foi desenhado — para isso, a mesma paleta pinta a
   * seleção, como `colorSelection` já faz para post-it.
   */
  pencilColor: StrokeColor;
  /** Troca a cor do lápis. */
  setPencilColor: (color: StrokeColor) => void;
  /**
   * Descarta o board atual e começa um quadro vazio (#58).
   *
   * A seleção e a edição em andamento vão junto: são estados sobre post-its que não existem
   * mais, e mantê-los deixaria a próxima ação em lote agindo sobre nada.
   */
  resetBoard: () => void;
  /**
   * O board inteiro, lido na hora.
   *
   * É função, e não valor, porque quem usa isto é o compartilhamento (#46): ele precisa do
   * estado do instante do clique, e receber o board por prop faria a ação ser recriada a
   * cada tecla digitada num post-it.
   */
  getBoard: () => Board;
  /** Note em edição de texto, ou `null`. Um de cada vez. */
  editingId: string | null;
  /** Ids marcados. Efêmero: não entra na store nem na URL. */
  selection: Selection;
  /** Cria um post-it centrado no ponto do canvas e já o abre para escrever. */
  createNoteAt: (point: Point) => void;
  startEditing: (id: string) => void;
  /**
   * Marca um elemento do quadro. Com `additive`, acrescenta ou tira em vez de trocar.
   *
   * Uma função para as duas espécies, e não uma por espécie: clicar num post-it e clicar
   * num rabisco são o mesmo gesto sobre a mesma seleção, e separá-los duplicaria a regra do
   * shift no dia em que ela mudasse.
   */
  selectElement: (kind: ElementKind, id: string, additive?: boolean) => void;
  /**
   * Deslocamento em curso da seleção, em coordenadas de canvas, ou `null` fora de um
   * arraste. É otimista: mora fora da store até o gesto terminar.
   */
  dragOffset: Point | null;
  /** Começa a arrastar a partir de um elemento, que já chega selecionado. */
  startDrag: (kind: ElementKind, id: string) => void;
  /** Move a seleção enquanto o gesto acontece, sem tocar na store. */
  dragBy: (offset: Point) => void;
  /** Grava as posições finais numa publicação só, e encerra o arraste. */
  endDrag: () => void;
  /** Desfaz o arraste sem gravar nada. */
  cancelDrag: () => void;
  /**
   * Move o que está marcado por um deslocamento em unidades de canvas (#74).
   *
   * Devolve `false` quando não havia nada marcado — quem chama usa isso para decidir se
   * engole a tecla ou a devolve ao navegador, que sem seleção ainda tem o que fazer com ela.
   *
   * Recebe o deslocamento pronto, e não a direção e o passo: o tamanho do passo é decisão
   * de quem tem a tecla na mão, e o board só sabe mover.
   */
  nudgeSelection: (delta: Point) => boolean;
  /** Elemento sendo redimensionado e o tamanho que ele tem agora, ou `null`. */
  resizing: Resizing | null;
  /** Começa a redimensionar um elemento — post-it ou traço. */
  startResize: (kind: ElementKind, id: string) => void;
  /** Cresce ou encolhe o elemento em curso, em coordenadas de canvas. */
  resizeBy: (delta: Point) => void;
  endResize: () => void;
  cancelResize: () => void;
  /**
   * Marca o começo de um retângulo de seleção.
   *
   * Com `additive`, o retângulo soma ao que já estava marcado; sem, ele substitui — que é o
   * que faz um retângulo desenhado no vazio limpar a seleção.
   */
  beginRectSelection: (additive: boolean) => void;
  /** Marca o que o retângulo toca — notas e traços —, somado à base de `beginRectSelection`. */
  selectInRect: (rect: Rect) => void;
  clearSelection: () => void;
  /** Marca tudo que existe no quadro, notas e traços (#85). */
  selectEverything: () => void;
  /**
   * O recorte marcado, pronto para a área de transferência (#88).
   *
   * Devolve o texto em vez de escrever no clipboard: quem sabe pedir permissão e lidar com
   * a `Promise` do navegador é a camada de cima, e uma função pura de board não deveria
   * precisar de um `navigator` para ser testada.
   *
   * `null` quando não há nada marcado — um `Ctrl+C` sem seleção não pode apagar o que a
   * pessoa tinha copiado de outro programa.
   */
  copySelection: () => string | null;
  /**
   * Cola um recorte no quadro, com ids novos, e o deixa marcado (#88).
   *
   * Devolve `false` quando o texto não é um recorte deste quadro — texto solto, JSON de
   * outra coisa, board de uma versão mais nova. Quem chama usa isso para decidir se engole
   * o evento de colar ou o devolve ao navegador.
   */
  pasteFromClipboard: (text: string) => boolean;
  /** As notes marcadas. É por elas que passa o que só vale para post-it: colorir (#17). */
  selected: readonly Note[];
  /**
   * As caixas de tudo que está marcado, notas e traços, em coordenadas de canvas.
   *
   * É por aqui que a barra de ações se ancora. Separada de `selected` porque a pergunta é
   * outra: "onde a seleção está" inclui os rabiscos, enquanto "o que colorir" não.
   */
  selectedRects: readonly Rect[];
  /** Cor comum à seleção, ou `null` se ela estiver vazia ou tiver mais de uma cor. */
  selectionColor: NoteColor | null;
  /** Pinta toda a seleção de uma cor, numa publicação só. */
  colorSelection: (color: NoteColor) => void;
  /** Apaga o que está marcado — notas e traços — e esvazia a seleção. Sem nada, não faz nada. */
  deleteSelection: () => void;
  /**
   * Duplica o que está marcado — notas e traços, juntos — e marca a cópia (#99). Sem nada,
   * não faz nada.
   */
  duplicateSelection: () => void;
  /**
   * O que a borracha já tocou na passada em curso, ainda não gravado (#98).
   *
   * Por id do traço original: `null` quando a borracha comeu o traço inteiro, ou a lista dos
   * pedaços que sobraram (cada um uma lista achatada, pronta para virar um novo traço) quando
   * só parte dele foi tocada — apaga como uma borracha de verdade, não o rabisco inteiro.
   *
   * `strokes` já sai refletindo isto — é o que faz a tinta sumir no instante em que a
   * borracha a toca —, mas a gravação só chega à store em `endErasing`, para a passada
   * inteira ser um passo só de desfazer.
   */
  erasing: ReadonlyMap<string, number[][] | null>;
  /** Começa uma passada de borracha: zera o que a passada anterior tinha tocado. */
  beginErasing: () => void;
  /** Testa o trecho de `a` a `b` contra todo traço, e apaga só a tinta que ele tocou. */
  eraseSegment: (a: Point, b: Point) => void;
  /** Grava a passada inteira numa publicação só, e a encerra. */
  endErasing: () => void;
  /** Grava o texto e fecha a edição. */
  commitText: (id: string, text: string) => void;
  /** Desfaz a última alteração do quadro (#86). Sem nada a desfazer, não faz nada. */
  undo: () => void;
  /** Refaz o que o último desfazer levou. Sem nada desfeito, não faz nada. */
  redo: () => void;
  /** Há passo guardado para desfazer. É o que desabilita o botão (#87). */
  canUndo: boolean;
  /** Há passo guardado para refazer. */
  canRedo: boolean;
}

export interface UseBoardOptions {
  /**
   * Board com que a sessão começa. Um board vindo de link compartilhado (#21) entra por
   * aqui, e não por `replaceBoard` depois da montagem, para não existir um instante em que
   * a interface mostra um quadro vazio que o usuário nunca pediu.
   */
  initialBoard?: Board;
  /**
   * Liga o autosave local (#22). Desligado ao abrir um board por link: o `IndexedDB` é a
   * cópia local em edição da rota raiz, e sobrescrevê-la com o conteúdo de um link que
   * alguém mandou apagaria o trabalho de quem abriu.
   */
  autosave?: boolean;
}

/**
 * Liga a store do board à interface.
 *
 * A store (#10) é deliberadamente sem React; este hook é a única ponte, e é aqui que mora
 * o que **não** pode entrar nela: qual post-it está em edição é estado efêmero de
 * interface, e a store congela as notes justamente para que estado assim não vá parar
 * dentro da URL.
 *
 * A store é criada uma vez por montagem, e não em escopo de módulo: em escopo de módulo ela
 * sobreviveria entre testes e, no servidor, entre requisições de usuários diferentes.
 */
export function useBoard({ initialBoard, autosave = true }: UseBoardOptions = {}): BoardApi {
  const [store] = useState(() => createBoardStore(initialBoard));
  // Autosave local (#22): restaura o board de trabalho ao montar e grava as alterações
  // seguintes. Mora aqui, e não no componente, porque é a store — e não a interface — que
  // precisa ser persistida.
  useLocalPersistence(store, autosave);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  /** A seleção de antes do retângulo começar, para o gesto poder ser refeito enquanto anda. */
  const selectionBeforeRect = useRef<Selection>(EMPTY_SELECTION);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const [resizing, setResizing] = useState<Resizing | null>(null);
  const [erasing, setErasing] = useState<ReadonlyMap<string, number[][] | null>>(EMPTY_ERASING);
  /**
   * Cor do próximo traço a ser desenhado (#69). Preto ao ligar o lápis pela primeira vez na
   * sessão, e vale para todos os traços seguintes até ser trocada de novo — não é campo do
   * board, então nem persiste no link nem entra no histórico de desfazer: é escolha de
   * interface sobre o que o **próximo** gesto vai fazer, não conteúdo do quadro já feito.
   */
  const [pencilColor, setPencilColor] = useState<StrokeColor>(STROKE_COLOR_BLACK);

  /**
   * Cópias em ref do que os callbacks de gesto precisam ler.
   *
   * Os callbacks são passados a cada post-it: se mudassem de identidade a cada quadro do
   * gesto, todo post-it re-renderizaria a cada movimento do ponteiro, e é justamente isso
   * que o critério de fluidez proíbe. Lendo de ref, eles ficam estáveis para sempre.
   *
   * Todas são escritas **junto com** o estado, pelos `publish*` abaixo, e não durante o
   * render: soltar o ponteiro reporta o último movimento e o fim do gesto no mesmo evento,
   * e uma ref atualizada só no render seguinte faria o fim gravar o valor anterior.
   */
  const selectionRef = useRef<Selection>(EMPTY_SELECTION);
  const dragOffsetRef = useRef<Point | null>(null);
  const resizingRef = useRef<Resizing | null>(null);
  const erasingRef = useRef<ReadonlyMap<string, number[][] | null>>(EMPTY_ERASING);

  /**
   * Publica a seleção na ref e no estado, nessa ordem.
   *
   * Aceita a forma de atualização do `useState`, mas resolve-a **aqui**, contra a ref: quem
   * chama precisa saber na hora o que a seleção virou — `selectNote` decide pela resposta
   * se promove o post-it —, e um updater executado lá adiante, no render, responderia tarde
   * demais.
   */
  const publishSelection = useCallback((next: Selection | ((current: Selection) => Selection)) => {
    const value = typeof next === "function" ? next(selectionRef.current) : next;
    selectionRef.current = value;
    setSelection(value);
  }, []);

  /** Publica o deslocamento do arraste na ref e no estado, nessa ordem. */
  const publishDragOffset = useCallback((offset: Point | null) => {
    dragOffsetRef.current = offset;
    setDragOffset(offset);
  }, []);

  /** Publica o tamanho em curso na ref e no estado, nessa ordem. */
  const publishResizing = useCallback((next: Resizing | null) => {
    resizingRef.current = next;
    setResizing(next);
  }, []);

  /** Publica o que a passada de borracha já tocou na ref e no estado, nessa ordem. */
  const publishErasing = useCallback((next: ReadonlyMap<string, number[][] | null>) => {
    erasingRef.current = next;
    setErasing(next);
  }, []);

  // O mesmo `getBoard` nos dois argumentos: o board inicial no servidor é o mesmo objeto do
  // primeiro render no cliente, então não há divergência de hidratação a conciliar.
  const board: Board = useSyncExternalStore(store.subscribe, store.getBoard, store.getBoard);

  /**
   * O que o histórico permite agora (#86).
   *
   * Pela mesma inscrição do board, e não por uma segunda: as duas coisas mudam juntas, na
   * mesma publicação — desfazer troca o board **e** as pilhas. A store devolve sempre o
   * mesmo objeto enquanto os dois valores não mudam, que é o que este hook exige.
   */
  const history = useSyncExternalStore(store.subscribe, store.getHistory, store.getHistory);

  const createNoteAt = useCallback(
    (point: Point) => {
      // O tamanho é dito uma vez e usado duas: para centrar e para criar. Deixar a store
      // aplicar o padrão dela e centrar por fora daria dois donos da mesma medida, e o
      // post-it nasceria fora do cursor no dia em que uma das duas mudasse.
      const size = { w: NOTE_SIZE.defaultWidth, h: NOTE_SIZE.defaultHeight };
      // Cor padrão e z do topo continuam vindo da store, que é dona deles.
      const note = store.addNote({ ...topLeftCenteredAt(point, size), ...size });
      // Coordenada impossível não cria nada (a store devolve `null`) e não abre edição de
      // um post-it que não existe.
      if (note === null) return;

      setEditingId(note.id);
      // Criar é selecionar: o post-it recém-nascido é sobre o que as próximas ações agem.
      publishSelection(selectOnly("note", note.id));
    },
    [publishSelection, store],
  );

  // `setEditingId` já é estável: embrulhar em useCallback seria só um intermediário.
  const startEditing = setEditingId;

  const selectElement = useCallback(
    (kind: ElementKind, id: string, additive = false) => {
      let promoted = true;

      if (additive) {
        publishSelection((current) => {
          // Shift-clique tira tanto quanto põe, e tirar não é motivo para promover.
          promoted = !isSelected(current, kind, id);
          return toggle(current, kind, id);
        });
      } else {
        publishSelection(selectOnly(kind, id));
      }

      // Selecionar traz para a frente, e isso **é** do board: a ordem de empilhamento vai
      // serializada. Vale para o clique e para o shift-clique, porque nos dois o usuário
      // apontou para aquele post-it, naquela ordem.
      //
      // Só para post-it. O traço não é promovido porque o quadro não tem para onde promovê-lo
      // sem custo: a tinta vive numa camada só, embaixo de todas as notas, e reordenar
      // rabiscos entre si não muda nada que se veja — eles não se cobrem, se somam.
      if (kind === "note" && promoted) store.bringToFront(id);
    },
    [publishSelection, store],
  );

  const beginRectSelection = useCallback((additive: boolean) => {
    // A base sobre a qual o retângulo soma. Vazia quando ele substitui, e é isso que faz
    // arrastar no vazio desmarcar tudo, sem precisar de um caminho próprio para isso.
    selectionBeforeRect.current = additive ? selectionRef.current : EMPTY_SELECTION;
  }, []);

  const selectInRect = useCallback(
    (rect: Rect) => {
      // Soma à base guardada no começo do gesto. Recalcular a partir dela a cada movimento
      // é o que faz encolher o retângulo desmarcar de volta quem ele deixou de tocar.
      const board = store.getBoard();
      const tocados = elementsInRect(board.notes, board.strokes, rect);
      publishSelection(union(selectionBeforeRect.current, tocados));
    },
    [publishSelection, store],
  );

  const clearSelection = useCallback(() => publishSelection(EMPTY_SELECTION), [publishSelection]);

  /**
   * Marca tudo (#85).
   *
   * Lê o board da store na hora, e não da lista renderizada: é a mesma escolha do retângulo
   * de seleção logo acima, e ela mantém a marcação certa mesmo se o atalho chegar entre uma
   * alteração e a pintura que a mostra.
   */
  const selectEverything = useCallback(() => {
    const current = store.getBoard();
    publishSelection(selectAll(current.notes, current.strokes));
  }, [publishSelection, store]);

  const copySelection = useCallback(
    () => serializeSelection(store.getBoard(), selectionRef.current),
    [store],
  );

  /**
   * Quantas vezes o mesmo recorte já foi colado em seguida.
   *
   * É o que faz colar duas vezes dar dois resultados, e não dois elementos empilhados. O
   * deslocamento cresce a cada colagem seguida do **mesmo** conteúdo; copiar outra coisa
   * recomeça a contagem, porque aí o ponto de partida é outro.
   *
   * Em ref, e não em estado: ninguém desenha isto, e um estado faria o quadro re-renderizar
   * ao colar duas vezes por um motivo que não aparece na tela.
   */
  const pasteCascade = useRef<{ text: string; count: number } | null>(null);

  const pasteFromClipboard = useCallback(
    (text: string): boolean => {
      const recorte = parseClipboard(text);
      if (recorte === null) return false;

      const anterior = pasteCascade.current;
      const count = anterior !== null && anterior.text === text ? anterior.count + 1 : 1;
      pasteCascade.current = { text, count };

      const offset = PASTE_OFFSET * count;
      const criados = store.addElements(
        recorte.notes.map((note) => ({
          x: note.x + offset,
          y: note.y + offset,
          w: note.w,
          h: note.h,
          color: note.color,
          text: note.text,
        })),
        recorte.strokes.map((stroke) =>
          strokeLike(stroke, translateStrokePoints(stroke, { x: offset, y: offset })),
        ),
      );

      // O lote inteiro pode ter sido descartado pelo contrato. Sem nada criado não há o que
      // marcar, e trocar a seleção por vazio tiraria da pessoa o que ela tinha marcado.
      if (criados.notes.length === 0 && criados.strokes.length === 0) return false;

      // O colado nasce marcado: é sobre ele que a próxima ação age, e é também o que torna
      // visível que alguma coisa aconteceu quando o recorte cai atrás de onde se olhava.
      publishSelection({
        notes: new Set(criados.notes.map((note) => note.id)),
        strokes: new Set(criados.strokes.map((stroke) => stroke.id)),
      });
      // Uma nota colada não entra em edição: colar dez post-its não pode abrir um editor, e
      // abrir só quando é um seria uma regra a mais para quem lê o código adivinhar.
      setEditingId(null);

      return true;
    },
    [publishSelection, store],
  );

  const startDrag = useCallback(
    (kind: ElementKind, id: string) => {
      publishDragOffset({ x: 0, y: 0 });
      // Pegar um post-it é apontar para ele, como clicar: ele vai para a frente dos demais.
      // Sem isto, arrastar um post-it de dentro de uma seleção o deixaria atrás — a seleção
      // já existia, então nenhum clique chegou a promovê-lo.
      //
      // O traço não é promovido, pela mesma razão de `selectElement`: a tinta vive numa
      // camada só, e reordenar rabiscos entre si não muda nada que se veja.
      if (kind === "note") store.bringToFront(id);
    },
    [publishDragOffset, store],
  );

  const dragBy = publishDragOffset;

  /**
   * Move tudo que está marcado — notas e traços — numa publicação só.
   *
   * Uma função para os dois caminhos que movem a seleção, o arraste e as setas (#74): é a
   * mesma pergunta feita por dois gestos, e duas cópias divergiriam no dia em que a
   * resposta mudasse. Quem chama entrega o deslocamento já em unidades de canvas.
   *
   * Uma publicação só, notas e traços juntos: quem escuta é a persistência, que reescreve a
   * URL a cada aviso — e é ela também que decide o que é **um** passo de desfazer.
   *
   * Os limites de coordenada do board não são checados aqui: a store normaliza tudo que
   * entra, e uma segunda regra sobre onde um elemento pode estar divergiria da primeira.
   */
  const translateSelection = useCallback(
    (delta: Point) => {
      const board = store.getBoard();
      const marcado = selectionRef.current;

      store.updateElements(
        board.notes
          .filter((note) => marcado.notes.has(note.id))
          .map((note) => ({
            id: note.id,
            patch: { x: note.x + delta.x, y: note.y + delta.y },
          })),
        board.strokes
          .filter((stroke) => marcado.strokes.has(stroke.id))
          .map((stroke) => ({
            id: stroke.id,
            patch: { points: translateStrokePoints(stroke, delta) },
          })),
      );
    },
    [store],
  );

  const endDrag = useCallback(() => {
    const offset = dragOffsetRef.current;
    publishDragOffset(null);
    if (offset === null) return;

    // Inteiros, porque cada casa decimal custa caracteres de link — e porque o zoom faz o
    // deslocamento chegar aqui fracionado.
    translateSelection({ x: Math.round(offset.x), y: Math.round(offset.y) });
  }, [publishDragOffset, translateSelection]);

  /**
   * Move a seleção pelas setas do teclado (#74).
   *
   * Uma publicação por tecla, e não uma por espécie: segurar a seta repete o evento dezenas
   * de vezes por segundo, e é o debounce do autosave que junta a rajada numa gravação só —
   * o que não pode acontecer é cada tecla virar dois avisos à persistência.
   *
   * Devolve se a tecla era do quadro. Com a seleção vazia ela não é: as setas continuam
   * rolando a página, que é o que fazem em qualquer lugar onde não há nada marcado.
   */
  const nudgeSelection = useCallback(
    (delta: Point): boolean => {
      // A seleção, e não o que ela alcança: ids que apontam para o que já sumiu não movem
      // nada, mas a tecla ainda era do quadro, e devolvê-la ao navegador faria a página
      // rolar por baixo de quem só errou o alvo.
      if (isEmpty(selectionRef.current)) return false;

      translateSelection(delta);
      return true;
    },
    [translateSelection],
  );

  const cancelDrag = useCallback(() => publishDragOffset(null), [publishDragOffset]);

  /** A caixa de um elemento agora, em coordenadas de canvas, ou `null` se ele sumiu. */
  const rectOf = useCallback(
    (kind: ElementKind, id: string): Rect | null => {
      if (kind === "note") {
        const note = store.getNote(id);
        return note === undefined ? null : { x: note.x, y: note.y, w: note.w, h: note.h };
      }

      const stroke = store.getBoard().strokes.find((candidate) => candidate.id === id);
      return stroke === undefined ? null : strokeBounds(stroke);
    },
    [store],
  );

  const startResize = useCallback(
    (kind: ElementKind, id: string) => {
      const from = rectOf(kind, id);
      if (from === null) return;

      publishResizing({ kind, id, from, size: { w: from.w, h: from.h } });
    },
    [publishResizing, rectOf],
  );

  const resizeBy = useCallback(
    (delta: Point) => {
      const current = resizingRef.current;
      if (current === null) return;

      // Medido a partir da caixa de quando o gesto começou, e não da de agora: o
      // deslocamento já vem acumulado desde a origem, e somá-lo ao tamanho atual faria o
      // elemento crescer o dobro.
      const querido = { w: current.from.w + delta.x, h: current.from.h + delta.y };

      // O limite é aplicado enquanto se arrasta, e não só ao gravar: deixar encolher além
      // do mínimo e devolver o tamanho ao soltar faria o elemento saltar na frente de quem
      // o estava ajustando. Cada espécie tem o próprio mínimo — a nota precisa caber texto,
      // e o rabisco só precisa não achatar até zero.
      const size =
        current.kind === "note"
          ? clampNoteSize(querido)
          : {
              w: Math.max(querido.w, STROKE_MIN_SIZE),
              h: Math.max(querido.h, STROKE_MIN_SIZE),
            };

      publishResizing({ ...current, size });
    },
    [publishResizing],
  );

  const endResize = useCallback(() => {
    const current = resizingRef.current;
    publishResizing(null);
    if (current === null) return;

    if (current.kind === "note") {
      // Inteiros, como na posição: cada casa decimal custa caracteres de link, e o zoom faz
      // o deslocamento chegar aqui fracionado.
      store.updateNote(current.id, {
        w: Math.round(current.size.w),
        h: Math.round(current.size.h),
      });
      return;
    }

    const stroke = store.getBoard().strokes.find((candidate) => candidate.id === current.id);
    if (stroke === undefined) return;

    // Os pontos são arredondados um a um, e não a caixa: é neles que o custo de link mora, e
    // arredondar só o tamanho deixaria o traço inteiro com casas decimais.
    store.updateStrokes([
      {
        id: current.id,
        patch: {
          points: scaleStrokePoints(stroke, current.from, current.size).map((value) =>
            Math.round(value),
          ),
        },
      },
    ]);
  }, [publishResizing, store]);

  const cancelResize = useCallback(() => publishResizing(null), [publishResizing]);

  /**
   * As notes marcadas, derivadas e não guardadas.
   *
   * Guardar a lista em estado daria duas fontes para a mesma verdade — a seleção e a cópia
   * dela —, e elas divergiriam no primeiro post-it apagado com algo ainda marcado.
   */
  const selected = useMemo(() => selectedNotes(board.notes, selection), [board.notes, selection]);

  /**
   * As caixas de tudo que está marcado, para a barra de ações se ancorar.
   *
   * A note já é um retângulo; o traço precisa ser medido. Um traço sem forma — sem pontos —
   * não entra: ele não tem onde ancorar nada, e um retângulo inventado na origem puxaria a
   * barra para o canto do canvas.
   */
  const selectedRects = useMemo((): Rect[] => {
    const strokes = selectedStrokes(board.strokes, selection)
      .map(strokeBounds)
      .filter((rect): rect is Rect => rect !== null);

    return [...selected, ...strokes];
  }, [board.strokes, selected, selection]);

  const selectionColor = useMemo(() => sharedColor(selected), [selected]);

  /**
   * O que a passada de borracha em curso já tocou aparece cortado, não como o traço
   * inteiro (#98).
   *
   * Muda no instante do toque, e não só quando o gesto termina: é o que a promessa de
   * "apaga ao tocar, sem esperar soltar" exige. A gravação de verdade, na store, só acontece
   * em `endErasing` — até lá isto é só a lista que se mostra, não a que existe. Cada pedaço
   * sobrevivente vira um traço de mentira, com o id original sufixado — não precisa ser um
   * id que a store aceitaria, porque nunca chega a ela; some com o próximo toque ou com o
   * fim da passada, o que vier primeiro.
   */
  const visibleStrokes = useMemo(() => {
    if (erasing.size === 0) return board.strokes;

    const result: Stroke[] = [];
    for (const stroke of board.strokes) {
      const runs = erasing.get(stroke.id);
      if (runs === undefined) {
        result.push(stroke);
        continue;
      }
      if (runs === null) continue;

      runs.forEach((points, index) => {
        result.push({ ...stroke, id: `${stroke.id}:${index}`, points });
      });
    }
    return result;
  }, [board.strokes, erasing]);

  const colorSelection = useCallback(
    (color: NoteColor) => {
      // Uma publicação só para a seleção inteira, como no arraste: quem escuta é a
      // persistência, que reescreve a URL a cada aviso.
      // Só as notes: o seletor pinta post-it, e um traço junto na seleção não é alvo dele.
      store.updateNotes([...selectionRef.current.notes].map((id) => ({ id, patch: { color } })));
    },
    [store],
  );

  const deleteSelection = useCallback(() => {
    /**
     * A seleção de agora, guardada numa constante.
     *
     * O updater do `setEditingId` lá embaixo é **diferido** — roda no render seguinte, quando
     * `publishSelection` já trocou o que a ref aponta. Ler a ref lá dentro perguntaria a um
     * conjunto vazio. O que salva é esta referência, e não a ordem das linhas: a seleção é
     * imutável, então o conjunto antigo continua intacto depois de a ref ser reapontada.
     */
    const deleted = selectionRef.current;
    if (isEmpty(deleted)) return;

    // Numa remoção só, como o resto das ações em lote: quem escuta é a persistência, e uma
    // seleção com notas e traços não são duas reescritas da URL.
    store.removeElements([...deleted.notes], [...deleted.strokes]);
    // Quem estava em edição pode ter sido apagado. Não acontece pelo atalho, que se cala
    // durante a digitação, mas quem chamar isto por outro caminho não tem como saber disso.
    setEditingId((current) => (current !== null && deleted.notes.has(current) ? null : current));
    // A seleção some junto: ids de post-its que não existem mais continuariam marcados e
    // fariam a próxima ação em lote agir sobre nada.
    publishSelection(EMPTY_SELECTION);
  }, [publishSelection, store]);

  /**
   * Duplica o que está marcado — notas e traços — numa publicação só (#99).
   *
   * O mesmo gesto de `pasteFromClipboard`, sem a área de transferência do sistema no meio:
   * direto da seleção atual para uma cópia dela, deslocada por `PASTE_OFFSET` para as duas
   * caixas não ficarem coincidentes. Sem contador de cascata próprio — a cópia nasce
   * marcada, então duplicar de novo em seguida parte da posição da cópia, e o deslocamento
   * se acumula sozinho a cada chamada, como colar repetido.
   */
  const duplicateSelection = useCallback(() => {
    const current = selectionRef.current;
    if (isEmpty(current)) return;

    const board = store.getBoard();
    const notes = selectedNotes(board.notes, current);
    const strokes = selectedStrokes(board.strokes, current);

    const criados = store.addElements(
      notes.map((note) => ({
        x: note.x + PASTE_OFFSET,
        y: note.y + PASTE_OFFSET,
        w: note.w,
        h: note.h,
        color: note.color,
        text: note.text,
      })),
      strokes.map((stroke) =>
        strokeLike(stroke, translateStrokePoints(stroke, { x: PASTE_OFFSET, y: PASTE_OFFSET })),
      ),
    );

    // O lote inteiro pode ter sido descartado pelo contrato — mesma guarda de
    // `pasteFromClipboard`. Sem nada criado não há o que marcar.
    if (criados.notes.length === 0 && criados.strokes.length === 0) return;

    // A cópia nasce marcada, como o colado: é sobre ela que a próxima ação age, e é o que
    // torna visível que algo aconteceu quando a cópia cai atrás do original.
    publishSelection({
      notes: new Set(criados.notes.map((note) => note.id)),
      strokes: new Set(criados.strokes.map((stroke) => stroke.id)),
    });
    // Mesma razão de `pasteFromClipboard`: duplicar dez post-its não pode abrir um editor.
    setEditingId(null);
  }, [publishSelection, store]);

  /** Zera o que a passada anterior tinha tocado — o começo de um novo gesto de borracha. */
  const beginErasing = useCallback(() => publishErasing(EMPTY_ERASING), [publishErasing]);

  /**
   * Testa o trecho `a`→`b` contra o que sobra de cada traço nesta passada, e apaga só a
   * tinta que ele tocou — como uma borracha de verdade, e não o rabisco inteiro (#98).
   *
   * "O que sobra" pode já vir de um toque anterior da mesma passada: um traço já dividido
   * continua sendo testado pedaço a pedaço, para o segundo passe da borracha poder cortar de
   * novo um pedaço que o primeiro deixou de pé. Um traço já comido por inteiro (`null`) não é
   * testado de novo — não sobrou tinta nele para tocar.
   */
  const eraseSegment = useCallback(
    (a: Point, b: Point) => {
      const board = store.getBoard();
      const touched = erasingRef.current;
      let next: Map<string, number[][] | null> | null = null;

      for (const stroke of board.strokes) {
        const already = touched.get(stroke.id);
        if (already === null) continue;

        const pieces = already === undefined ? [strokePoints(stroke)] : already.map(pointsFromFlat);

        let changed = false;
        const result: Point[][] = [];
        for (const piece of pieces) {
          const split = splitPolylineBySegment(piece, a, b);
          if (split === null) {
            result.push(piece);
            continue;
          }
          changed = true;
          result.push(...split);
        }

        if (!changed) continue;

        if (next === null) next = new Map(touched);
        next.set(stroke.id, result.length === 0 ? null : result.map(flattenPoints));
      }

      if (next !== null) publishErasing(next);
    },
    [publishErasing, store],
  );

  /**
   * Grava a passada inteira numa publicação só, e a encerra.
   *
   * O traço original é trocado pelos pedaços que sobraram — `spliceStrokes` faz as duas
   * coisas numa publicação só, como o resto das ações em lote (#98), para a passada inteira
   * ser um passo só de desfazer, por vários traços que tenha tocado.
   */
  const endErasing = useCallback(() => {
    const touched = erasingRef.current;
    publishErasing(EMPTY_ERASING);
    if (touched.size === 0) return;

    const board = store.getBoard();
    const byId = new Map(board.strokes.map((stroke) => [stroke.id, stroke]));
    const additions: NewStroke[] = [];

    for (const [id, runs] of touched) {
      const original = byId.get(id);
      if (original === undefined || runs === null) continue;
      for (const points of runs) additions.push(strokeLike(original, points));
    }

    store.spliceStrokes([...touched.keys()], additions);

    // Ids apagados não continuam marcados: um traço que sumiu não pode ficar na seleção,
    // pronto para uma ação em lote seguinte agir sobre nada. Os pedaços que sobraram nascem
    // com ids novos e nunca estiveram na seleção para começar.
    publishSelection((current) => {
      if (current.strokes.size === 0) return current;

      const strokes = new Set(current.strokes);
      let changed = false;
      for (const id of touched.keys()) changed = strokes.delete(id) || changed;

      return changed ? { ...current, strokes } : current;
    });
  }, [publishErasing, publishSelection, store]);

  const addStroke = useCallback(
    (points: readonly Point[]) => {
      const simplified = simplify(points);
      store.addStroke({
        color: pencilColor,
        points: simplified.flatMap((point) => [point.x, point.y]),
      });
    },
    [pencilColor, store],
  );

  const resetBoard = useCallback(() => {
    store.replaceBoard(createEmptyBoard());
    setEditingId(null);
    publishSelection(EMPTY_SELECTION);
  }, [publishSelection, store]);

  /**
   * Desfazer e refazer, com a edição fechada junto.
   *
   * A edição precisa fechar. O editor do post-it é não controlado — quem manda enquanto se
   * digita é o DOM —, e desfazer por baixo dele deixaria um textarea escrevendo num texto
   * que o board já não tem; ao sair, ele gravaria de volta justamente o que se acabou de
   * desfazer.
   *
   * A seleção fica como está, e de propósito. Ids que apontam para o que sumiu já são
   * filtrados em todo lugar que lê a seleção, e limpá-la a cada passo tiraria de quem
   * desfez a marcação que ele ainda vai usar na ação seguinte.
   */
  const undo = useCallback(() => {
    setEditingId(null);
    store.undo();
  }, [store]);

  const redo = useCallback(() => {
    setEditingId(null);
    store.redo();
  }, [store]);

  const commitText = useCallback(
    (id: string, text: string) => {
      store.updateNote(id, { text });
      setEditingId((current) => (current === id ? null : current));
    },
    [store],
  );

  return {
    notes: board.notes,
    strokes: visibleStrokes,
    addStroke,
    pencilColor,
    setPencilColor,
    getBoard: store.getBoard,
    resetBoard,
    editingId,
    selection,
    createNoteAt,
    startEditing,
    commitText,
    dragOffset,
    startDrag,
    dragBy,
    endDrag,
    cancelDrag,
    nudgeSelection,
    resizing,
    startResize,
    resizeBy,
    endResize,
    cancelResize,
    selectElement,
    beginRectSelection,
    selectInRect,
    clearSelection,
    selectEverything,
    copySelection,
    pasteFromClipboard,
    selected,
    selectedRects,
    selectionColor,
    colorSelection,
    deleteSelection,
    duplicateSelection,
    erasing,
    beginErasing,
    eraseSegment,
    endErasing,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  };
}
