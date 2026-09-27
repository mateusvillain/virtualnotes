/**
 * Store do board em memória — a fonte única de verdade durante a sessão.
 *
 * Toda interação com post-it escreve aqui; persistência (#20-#22) e exportação (#12) leem
 * daqui por subscrição. A store guarda **só** o que é serializável segundo o contrato: o
 * estado efêmero de interface (viewport, seleção, edição em andamento) mora nos
 * componentes, porque é justamente o que não deve acabar dentro da URL.
 *
 * É deliberadamente sem React: uma store observável comum, que a interface consome por
 * `useSyncExternalStore` sem obrigar o resto do sistema a existir dentro de um componente.
 *
 * Como o contrato (`schema.ts`), nada aqui lança: entrada impossível vira `null` ou
 * operação sem efeito.
 */

import { normalizeNote, normalizeStroke } from "./schema";
import {
  DEFAULT_NOTE_COLOR,
  NOTE_SIZE,
  SCHEMA_VERSION,
  createEmptyBoard,
  type Board,
  type Note,
  type NoteColor,
  type Stroke,
  type StrokeColor,
  type StrokeTool,
} from "./types";

/** Comprimento do id de um post-it. Curto porque vai serializado dentro da URL. */
const ID_LENGTH = 6;

/**
 * Passos de desfazer guardados (#86).
 *
 * Um teto, e não memória livre: um quadro editado por horas não pode acumular histórico sem
 * fim. Cinquenta cobre com folga o arrependimento real — quem desfaz, desfaz os últimos
 * gestos — sem virar um segundo lugar onde o board mora.
 *
 * O custo de cada passo é menor do que parece. Os boards são imutáveis e compartilham as
 * notes e os traços que não mudaram: um passo guarda as duas listas, não cópias do conteúdo
 * delas. Mover um post-it num quadro de quinhentos traços custa a lista, e não os traços.
 */
const HISTORY_LIMIT = 50;

/** O que o histórico permite agora. Valor, para a interface poder assinar as mudanças. */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

/** Campos que uma atualização pode tocar: tudo menos o id, que é a identidade da note. */
export type NotePatch = Partial<Omit<Note, "id">>;

/** Uma alteração dentro de um lote. */
export interface NoteUpdate {
  id: string;
  patch: NotePatch;
}

/** Campos que uma alteração de traço pode tocar. O id é a identidade, e não muda. */
export type StrokePatch = Partial<Omit<Stroke, "id">>;

/** Uma alteração de traço dentro de um lote. */
export interface StrokeUpdate {
  id: string;
  patch: StrokePatch;
}

/** Dados mínimos para criar um post-it; o resto vem dos padrões do contrato. */
export interface NewNote {
  x: number;
  y: number;
  color?: NoteColor;
  text?: string;
  w?: number;
  h?: number;
}

/** Dados mínimos para criar um traço; o resto vem dos padrões do contrato. */
export interface NewStroke {
  color: StrokeColor;
  /** Ferramenta que desenhou o traço. Ausente é lápis — ver {@link Stroke.tool}. */
  tool?: StrokeTool;
  /** Coordenadas de canvas, achatadas — ver {@link Stroke.points}. */
  points: number[];
}

export interface BoardStore {
  /** Board atual. A referência muda a cada alteração, para comparação por identidade. */
  getBoard: () => Board;
  /** A note de um id, ou `undefined`. Poupa quem só quer uma de varrer a lista inteira. */
  getNote: (id: string) => Note | undefined;
  /** Registra um ouvinte de mudanças; devolve a função que cancela a inscrição. */
  subscribe: (listener: () => void) => () => void;
  /** Cria um post-it na frente dos demais. Devolve `null` se a posição for impossível. */
  addNote: (note: NewNote) => Note | null;
  /** Altera campos de uma note. Id inexistente ou alteração sem efeito não mexem no board. */
  updateNote: (id: string, patch: NotePatch) => void;
  /**
   * Altera várias notes numa publicação só.
   *
   * Arrastar uma seleção de dez post-its precisa dar uma notificação, não dez: quem escuta
   * é a persistência, que reescreve a URL a cada aviso.
   */
  updateNotes: (updates: readonly NoteUpdate[]) => void;
  removeNote: (id: string) => void;
  removeNotes: (ids: readonly string[]) => void;
  /** Traz a note para a frente das demais. */
  bringToFront: (id: string) => void;
  /**
   * Cria notes e traços numa publicação só, com ids novos, e devolve o que entrou (#88).
   *
   * Existe para colar: um recorte com dez elementos criado um a um seriam dez publicações —
   * dez avisos à persistência e dez passos de desfazer para um gesto só. E os ids são
   * sorteados contra o que já existe **e** contra o que está sendo criado agora, senão dois
   * elementos do mesmo lote poderiam nascer com a mesma identidade.
   *
   * O que não passa pelo contrato é descartado em silêncio, como em `addNote`: o lote inteiro
   * não pode cair por causa de um elemento estragado vindo de fora.
   */
  addElements: (
    notes: readonly NewNote[],
    strokes: readonly NewStroke[],
  ) => { notes: Note[]; strokes: Stroke[] };
  /** Cria um traço na frente dos demais. Devolve `null` se os dados forem impossíveis. */
  addStroke: (stroke: NewStroke) => Stroke | null;
  /**
   * Altera vários traços numa publicação só (#70).
   *
   * Mesmo espírito de `updateNotes`: arrastar uma seleção de rabiscos precisa dar uma
   * notificação, não uma por traço.
   */
  updateStrokes: (updates: readonly StrokeUpdate[]) => void;
  /**
   * Altera notes e traços numa publicação só (#70).
   *
   * Existe porque uma seleção pode misturar os dois, e arrastá-la chamando `updateNotes`
   * seguido de `updateStrokes` avisaria duas vezes por um gesto só.
   */
  updateElements: (notes: readonly NoteUpdate[], strokes: readonly StrokeUpdate[]) => void;
  removeStroke: (id: string) => void;
  removeStrokes: (ids: readonly string[]) => void;
  /**
   * Substitui traços por outros, numa publicação só (#98).
   *
   * A ferramenta de borracha usa isto para trocar o traço original pelos pedaços que
   * sobraram do gesto: os ids de `ids` deixam de existir, e `additions` entra com ids novos,
   * como em `addElements`.
   */
  spliceStrokes: (ids: readonly string[], additions: readonly NewStroke[]) => void;
  /**
   * Apaga notes e traços numa publicação só (#70).
   *
   * Existe porque uma seleção pode misturar os dois, e chamar `removeNotes` seguido de
   * `removeStrokes` avisaria duas vezes por um gesto só — quem escuta é a persistência, que
   * reescreve a URL a cada aviso.
   */
  removeElements: (noteIds: readonly string[], strokeIds: readonly string[]) => void;
  /** Substitui o board inteiro. Conta como um passo de desfazer, como qualquer alteração. */
  replaceBoard: (board: Board) => void;
  /**
   * Instala um board vindo de fora, sem histórico — a restauração do autosave local (#22).
   *
   * Separado de `replaceBoard` porque **não** é uma alteração: é o quadro chegando. Gravado
   * como passo, um `Ctrl+Z` logo depois de abrir a aba devolveria o board vazio do primeiro
   * render e apagaria a sessão que a restauração acabou de trazer.
   *
   * O histórico é zerado junto: o que veio do armazenamento é o novo ponto de partida, e os
   * passos anteriores apontam para boards de antes da restauração.
   */
  restoreBoard: (board: Board) => void;
  /** O que o histórico permite agora. Muda junto com o board, e pela mesma notificação. */
  getHistory: () => HistoryState;
  /** Volta ao estado anterior à última alteração. Sem passo guardado, não faz nada. */
  undo: () => void;
  /** Refaz o que o último `undo` desfez. Sem nada desfeito, não faz nada. */
  redo: () => void;
}

/** Gera um id curto e livre dentro do board. */
function createId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = Math.random()
      .toString(36)
      .slice(2, 2 + ID_LENGTH);
    if (id.length === ID_LENGTH && !taken.has(id)) return id;
  }
}

/** Maior z de uma lista de notes ou traços, ou 0 se estiver vazia. */
function topZ(items: readonly { z: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.z), 0);
}

/** Duas notes são iguais quando todo campo do contrato bate. */
function sameNote(a: Note, b: Note): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    a.color === b.color &&
    a.text === b.text &&
    a.z === b.z
  );
}

/**
 * Dois traços com o mesmo conteúdo.
 *
 * Compara os pontos um a um, e não por identidade do array: quem escreve um traço monta uma
 * lista nova a cada alteração, e comparar referências diria "mudou" a todo arraste que
 * voltou ao ponto de partida.
 */
function sameStroke(a: Stroke, b: Stroke): boolean {
  return (
    a.color === b.color &&
    a.tool === b.tool &&
    a.z === b.z &&
    a.points.length === b.points.length &&
    a.points.every((value, index) => value === b.points[index])
  );
}

/**
 * Congela o board fora de produção.
 *
 * A regra "estado efêmero de interface não se mistura ao serializável" só vale se alguém
 * a fizer valer: sem isso, bastaria um componente pendurar um campo de seleção numa note
 * para ele viajar dentro da URL. Em desenvolvimento e nos testes, essa tentativa estoura na
 * hora; em produção não se paga o custo.
 */
function guard(board: Board): Board {
  if (process.env.NODE_ENV === "production") return board;

  board.notes.forEach(Object.freeze);
  Object.freeze(board.notes);
  board.strokes.forEach((stroke) => {
    Object.freeze(stroke.points);
    Object.freeze(stroke);
  });
  Object.freeze(board.strokes);
  return Object.freeze(board);
}

export function createBoardStore(initial: Board = createEmptyBoard()): BoardStore {
  let board = guard(initial);
  const listeners = new Set<() => void>();

  /**
   * Os boards de antes e de depois, para desfazer e refazer (#86).
   *
   * Boards inteiros, e não diferenças. O board deste projeto já é um valor imutável que cabe
   * numa URL — a store publica uma referência nova a cada alteração —, então a pilha é uma
   * lista de referências e não uma máquina de aplicar e reverter patches. É a solução que
   * aproveita a decisão de design que já estava tomada.
   */
  const past: Board[] = [];
  const future: Board[] = [];

  /**
   * O que o histórico permite, como valor estável.
   *
   * Só troca de identidade quando um dos dois muda de verdade. Quem lê é o
   * `useSyncExternalStore`, que compara por identidade e entraria em laço infinito se cada
   * leitura devolvesse um objeto novo.
   */
  let history: HistoryState = { canUndo: false, canRedo: false };

  function refreshHistory(): void {
    const canUndo = past.length > 0;
    const canRedo = future.length > 0;
    if (canUndo !== history.canUndo || canRedo !== history.canRedo) {
      history = { canUndo, canRedo };
    }
  }

  /**
   * Instala um board e avisa os inscritos, sem tocar no histórico.
   *
   * A lista de ouvintes é copiada antes da iteração: um ouvinte que escreve na store
   * dispara outra publicação no meio desta, e sem a cópia os avisos restantes sairiam
   * misturando dois estados.
   */
  function publish(next: Board): void {
    board = next;
    for (const listener of [...listeners]) listener();
  }

  /**
   * Publica uma alteração e guarda o estado anterior como um passo de desfazer.
   *
   * O histórico mora aqui, e não em quem chama, porque `commit` já é o gargalo por onde toda
   * alteração passa — e já é também a fronteira que decide o que é **uma** publicação. Um
   * gesto que hoje avisa a persistência uma vez vira um passo de desfazer pela mesma regra,
   * sem ninguém precisar lembrar de registrá-lo: foi para isso que `updateNotes`,
   * `updateElements` e `removeElements` existem.
   */
  function commit(next: { notes?: Note[]; strokes?: Stroke[] }): void {
    const previous = board;

    // A versão é sempre a atual: o board na memória é, por definição, o que este código
    // entende. Board de outra versão entra pelo parseBoard antes de chegar aqui.
    const built = guard({
      version: SCHEMA_VERSION,
      notes: next.notes ?? board.notes,
      strokes: next.strokes ?? board.strokes,
    });

    past.push(previous);
    // O passo mais antigo cai fora, e não o mais novo: o teto existe para limitar memória,
    // e desfazer sempre anda para trás a partir de agora.
    if (past.length > HISTORY_LIMIT) past.shift();
    // Fazer algo novo apaga o que havia para refazer. O futuro guardado era o de outra
    // linha do tempo, e mantê-lo deixaria `redo` colar um estado que nunca veio daqui.
    future.length = 0;
    refreshHistory();

    publish(built);
  }

  function undo(): void {
    const previous = past.pop();
    if (previous === undefined) return;

    future.push(board);
    refreshHistory();
    publish(previous);
  }

  function redo(): void {
    const next = future.pop();
    if (next === undefined) return;

    past.push(board);
    refreshHistory();
    publish(next);
  }

  function getHistory(): HistoryState {
    return history;
  }

  function getBoard(): Board {
    return board;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function addNote(input: NewNote): Note | null {
    const note = normalizeNote({
      id: createId(new Set(board.notes.map((existing) => existing.id))),
      x: input.x,
      y: input.y,
      w: input.w ?? NOTE_SIZE.defaultWidth,
      h: input.h ?? NOTE_SIZE.defaultHeight,
      color: input.color ?? DEFAULT_NOTE_COLOR,
      text: input.text ?? "",
      // Post-it novo nasce na frente: foi o usuário que acabou de colocá-lo ali.
      z: topZ(board.notes) + 1,
    });

    // Normalizar pelo contrato evita um segundo conjunto de regras sobre o que é um
    // post-it válido. Coordenada impossível — um NaN escapado de uma conversão de
    // coordenadas, por exemplo — não cria nada e não derruba o handler de evento.
    if (note === null) return null;

    commit({ notes: [...board.notes, note] });
    return note;
  }

  /** Aplica alterações e devolve a lista nova, ou `null` se nada mudou de fato. */
  function applyUpdates(updates: readonly NoteUpdate[]): Note[] | null {
    const byId = new Map(updates.map((update) => [update.id, update.patch]));
    let changed = false;

    const notes = board.notes.map((note) => {
      const patch = byId.get(note.id);
      if (patch === undefined) return note;

      const candidate = normalizeNote({ ...note, ...patch, id: note.id });
      if (candidate === null || sameNote(note, candidate)) return note;

      changed = true;
      return candidate;
    });

    return changed ? notes : null;
  }

  function updateNotes(updates: readonly NoteUpdate[]): void {
    const notes = applyUpdates(updates);
    if (notes !== null) commit({ notes });
  }

  function updateNote(id: string, patch: NotePatch): void {
    updateNotes([{ id, patch }]);
  }

  function removeNotes(ids: readonly string[]): void {
    const targets = new Set(ids);
    const notes = board.notes.filter((note) => !targets.has(note.id));

    if (notes.length !== board.notes.length) commit({ notes });
  }

  function removeNote(id: string): void {
    removeNotes([id]);
  }

  function addStroke(input: NewStroke): Stroke | null {
    const stroke = normalizeStroke({
      id: createId(new Set(board.strokes.map((existing) => existing.id))),
      color: input.color,
      tool: input.tool,
      points: input.points,
      // Traço novo nasce na frente, como a note: foi o usuário que acabou de desenhá-lo.
      z: topZ(board.strokes) + 1,
    });

    // Mesma razão da note: normalizar pelo contrato evita um segundo conjunto de regras
    // sobre o que é um traço válido, e dado impossível não derruba o handler de evento.
    if (stroke === null) return null;

    commit({ strokes: [...board.strokes, stroke] });
    return stroke;
  }

  function removeStrokes(ids: readonly string[]): void {
    const targets = new Set(ids);
    const strokes = board.strokes.filter((stroke) => !targets.has(stroke.id));

    if (strokes.length !== board.strokes.length) commit({ strokes });
  }

  function applyStrokeUpdates(updates: readonly StrokeUpdate[]): Stroke[] | null {
    const byId = new Map(updates.map((update) => [update.id, update.patch]));
    let changed = false;

    const strokes = board.strokes.map((stroke) => {
      const patch = byId.get(stroke.id);
      if (patch === undefined) return stroke;

      // Normalizar pelo contrato, como na note: uma coordenada impossível — um NaN escapado
      // de uma divisão por zero num redimensionamento — não entra no board e não derruba o
      // handler de evento. O traço fica como estava.
      const candidate = normalizeStroke({ ...stroke, ...patch, id: stroke.id });
      if (candidate === null || sameStroke(stroke, candidate)) return stroke;

      changed = true;
      return candidate;
    });

    return changed ? strokes : null;
  }

  function updateStrokes(updates: readonly StrokeUpdate[]): void {
    const strokes = applyStrokeUpdates(updates);
    if (strokes !== null) commit({ strokes });
  }

  function updateElements(
    noteUpdates: readonly NoteUpdate[],
    strokeUpdates: readonly StrokeUpdate[],
  ): void {
    const notes = applyUpdates(noteUpdates);
    const strokes = applyStrokeUpdates(strokeUpdates);

    // Nada mudou de verdade, nada publicado: um arraste que voltou ao ponto de partida não
    // deveria fazer a persistência reescrever a URL com o mesmo board.
    if (notes === null && strokes === null) return;

    commit({ notes: notes ?? board.notes, strokes: strokes ?? board.strokes });
  }

  function addElements(
    input: readonly NewNote[],
    inputStrokes: readonly NewStroke[],
  ): { notes: Note[]; strokes: Stroke[] } {
    // Os ids já tomados incluem os deste lote, e vão sendo acrescentados: sem isso, dois
    // elementos criados na mesma chamada poderiam sortear a mesma identidade.
    const takenNotes = new Set(board.notes.map((note) => note.id));
    const takenStrokes = new Set(board.strokes.map((stroke) => stroke.id));

    // O z de partida é lido uma vez, e o lote sobe a partir dele: assim o recorte colado
    // chega inteiro na frente, e preserva a ordem que tinha entre os próprios elementos.
    let noteZ = topZ(board.notes);
    let strokeZ = topZ(board.strokes);

    const notes: Note[] = [];
    for (const candidate of input) {
      const id = createId(takenNotes);
      noteZ += 1;
      const note = normalizeNote({
        id,
        x: candidate.x,
        y: candidate.y,
        w: candidate.w ?? NOTE_SIZE.defaultWidth,
        h: candidate.h ?? NOTE_SIZE.defaultHeight,
        color: candidate.color ?? DEFAULT_NOTE_COLOR,
        text: candidate.text ?? "",
        z: noteZ,
      });
      if (note === null) continue;

      takenNotes.add(id);
      notes.push(note);
    }

    const strokes: Stroke[] = [];
    for (const candidate of inputStrokes) {
      const id = createId(takenStrokes);
      strokeZ += 1;
      const stroke = normalizeStroke({
        id,
        color: candidate.color,
        tool: candidate.tool,
        points: candidate.points,
        z: strokeZ,
      });
      if (stroke === null) continue;

      takenStrokes.add(id);
      strokes.push(stroke);
    }

    // Nada entrou, nada publicado: um lote inteiramente inválido não gasta um passo de
    // desfazer nem faz a persistência reescrever a URL com o mesmo board.
    if (notes.length === 0 && strokes.length === 0) return { notes: [], strokes: [] };

    commit({ notes: [...board.notes, ...notes], strokes: [...board.strokes, ...strokes] });

    return { notes, strokes };
  }

  function removeStroke(id: string): void {
    removeStrokes([id]);
  }

  /**
   * Tira os traços de `ids` e põe `additions` no lugar, numa publicação só — o que sobra de
   * uma passada de borracha (#98): o traço original é substituído pelos pedaços que a
   * borracha não tocou, e não simplesmente apagado.
   *
   * Uma publicação só, e não uma remoção seguida de criação, pela mesma razão de
   * `removeElements`: a passada inteira, por vários traços que sejam, é um passo de desfazer
   * só.
   */
  function spliceStrokes(ids: readonly string[], additions: readonly NewStroke[]): void {
    const targets = new Set(ids);
    const kept = board.strokes.filter((stroke) => !targets.has(stroke.id));

    const takenIds = new Set(kept.map((stroke) => stroke.id));
    let z = topZ(kept);

    const created: Stroke[] = [];
    for (const candidate of additions) {
      const id = createId(takenIds);
      z += 1;
      // Normalizar pelo contrato, como em `addStroke`: um pedaço com coordenada impossível
      // não entra no board, mas não derruba a passada inteira.
      const stroke = normalizeStroke({
        id,
        color: candidate.color,
        tool: candidate.tool,
        points: candidate.points,
        z,
      });
      if (stroke === null) continue;

      takenIds.add(id);
      created.push(stroke);
    }

    // Nada removido e nada criado, nada publicado: a mesma regra de `removeElements`.
    if (kept.length === board.strokes.length && created.length === 0) return;

    commit({ strokes: [...kept, ...created] });
  }

  function removeElements(noteIds: readonly string[], strokeIds: readonly string[]): void {
    const notesToRemove = new Set(noteIds);
    const strokesToRemove = new Set(strokeIds);
    const notes = board.notes.filter((note) => !notesToRemove.has(note.id));
    const strokes = board.strokes.filter((stroke) => !strokesToRemove.has(stroke.id));

    // Nada removido, nada publicado: um `Delete` com a seleção cheia de ids que já não
    // existem não deveria fazer a persistência reescrever a URL com o mesmo board.
    if (notes.length === board.notes.length && strokes.length === board.strokes.length) return;

    commit({ notes, strokes });
  }

  function getNote(id: string): Note | undefined {
    return board.notes.find((candidate) => candidate.id === id);
  }

  function bringToFront(id: string): void {
    const note = getNote(id);
    if (note === undefined) return;

    const top = topZ(board.notes);
    // Estar empatado no topo não é estar na frente: com dois post-its no mesmo z, quem
    // decide o desenho é a ordem da lista, e o de baixo precisa subir de verdade.
    const aloneOnTop =
      note.z === top && board.notes.filter((other) => other.z === top).length === 1;
    if (aloneOnTop) return;

    updateNote(id, { z: top + 1 });
  }

  /**
   * Cópia das notes e dos traços, e não das listas só: quem chamou não pode continuar
   * segurando as mesmas referências que a store passou a tratar como imutáveis.
   */
  function copyOf(next: Board): { notes: Note[]; strokes: Stroke[] } {
    return {
      notes: next.notes.map((note) => ({ ...note })),
      strokes: next.strokes.map((stroke) => ({ ...stroke, points: [...stroke.points] })),
    };
  }

  function replaceBoard(next: Board): void {
    commit(copyOf(next));
  }

  function restoreBoard(next: Board): void {
    past.length = 0;
    future.length = 0;
    refreshHistory();

    publish(guard({ version: SCHEMA_VERSION, ...copyOf(next) }));
  }

  // Funções soltas, e não métodos: a interface vai desestruturar a store, e método com
  // `this` quebraria calado nesse uso.
  return {
    getBoard,
    getNote,
    subscribe,
    addNote,
    updateNote,
    updateNotes,
    removeNote,
    removeNotes,
    bringToFront,
    addStroke,
    addElements,
    updateStrokes,
    updateElements,
    removeStroke,
    removeStrokes,
    spliceStrokes,
    removeElements,
    replaceBoard,
    restoreBoard,
    getHistory,
    undo,
    redo,
  };
}
