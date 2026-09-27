import { describe, expect, it, vi } from "vitest";
import { createBoardStore, type BoardStore, type NewNote } from "./store";
import { NOTE_SIZE, SCHEMA_VERSION, createEmptyBoard, type Board, type Note } from "./types";

/** addNote devolve `null` para entrada impossível; nos testes felizes isso é um defeito. */
function add(store: BoardStore, input: NewNote): Note {
  const note = store.addNote(input);
  if (note === null) throw new Error("addNote recusou uma entrada que deveria ser válida");
  return note;
}

describe("createBoardStore", () => {
  it("começa vazia, na versão atual do schema", () => {
    expect(createBoardStore().getBoard()).toEqual(createEmptyBoard());
  });

  it("aceita um board inicial", () => {
    const board: Board = { version: SCHEMA_VERSION, notes: [], strokes: [] };

    expect(createBoardStore(board).getBoard()).toBe(board);
  });
});

describe("addNote", () => {
  it("preenche tamanho, cor e texto com os padrões do contrato", () => {
    const store = createBoardStore();

    const note = add(store, { x: 10, y: 20 });

    expect(note).toMatchObject({
      x: 10,
      y: 20,
      w: NOTE_SIZE.defaultWidth,
      h: NOTE_SIZE.defaultHeight,
      color: 0,
      text: "",
    });
  });

  it("devolve null, sem lançar, para posição impossível", () => {
    const store = createBoardStore();

    expect(store.addNote({ x: Number.NaN, y: 0 })).toBeNull();
    expect(store.getBoard().notes).toEqual([]);
  });

  it("normaliza pelo contrato, sem inventar regra própria", () => {
    const store = createBoardStore();

    const note = add(store, { x: 0, y: 0, w: 1, text: "x".repeat(5000) });

    expect(note.w).toBe(NOTE_SIZE.minWidth);
    expect(note.text.length).toBeLessThan(5000);
  });

  it("gera ids curtos e distintos", () => {
    const store = createBoardStore();

    const ids = Array.from({ length: 200 }, () => add(store, { x: 0, y: 0 }).id);

    expect(new Set(ids).size).toBe(200);
    expect(ids.every((id) => id.length === 6)).toBe(true);
  });

  it("cada post-it novo nasce na frente do anterior", () => {
    const store = createBoardStore();

    const primeiro = add(store, { x: 0, y: 0 });
    const segundo = add(store, { x: 0, y: 0 });

    expect(segundo.z).toBeGreaterThan(primeiro.z);
  });
});

describe("addStroke", () => {
  it("cria um traço com o contrato normalizado", () => {
    const store = createBoardStore();

    const stroke = store.addStroke({ color: 0, points: [0, 0, 10, 10] });

    expect(stroke).toMatchObject({ color: 0, points: [0, 0, 10, 10] });
  });

  it("grava a ferramenta do traço, e o lápis sem o campo", () => {
    const store = createBoardStore();

    const caneta = store.addStroke({ color: 6, tool: 1, points: [0, 0, 10, 10] });
    const lapis = store.addStroke({ color: 6, tool: 0, points: [0, 0, 10, 10] });

    expect(caneta).toMatchObject({ tool: 1 });
    expect(lapis).not.toHaveProperty("tool");
  });

  it("devolve null, sem lançar, para pontos insuficientes", () => {
    const store = createBoardStore();

    expect(store.addStroke({ color: 0, points: [0, 0] })).toBeNull();
    expect(store.getBoard().strokes).toEqual([]);
  });

  it("gera ids curtos e distintos, num espaço separado do de notes", () => {
    const store = createBoardStore();

    const ids = Array.from(
      { length: 200 },
      () => store.addStroke({ color: 0, points: [0, 0, 1, 1] })?.id,
    );

    expect(new Set(ids).size).toBe(200);
    expect(ids.every((id) => id?.length === 6)).toBe(true);
  });

  it("cada traço novo nasce na frente do anterior", () => {
    const store = createBoardStore();

    const primeiro = store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    const segundo = store.addStroke({ color: 0, points: [0, 0, 1, 1] });

    expect(segundo?.z).toBeGreaterThan(primeiro?.z ?? 0);
  });

  it("não interfere na pilha de z das notes", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });

    const stroke = store.addStroke({ color: 0, points: [0, 0, 1, 1] });

    expect(stroke?.z).toBe(1);
    expect(note.z).toBe(1);
  });
});

/**
 * Todo caminho que cria ou reescreve traço carrega a ferramenta junto (#110): um traço de
 * marca-texto que voltasse lápis depois de colado, movido ou cortado pela borracha
 * mudaria de desenho sem ninguém ter pedido.
 */
describe("ferramenta do traço (#110)", () => {
  it("addElements preserva a ferramenta de cada traço do lote", () => {
    const store = createBoardStore();

    const { strokes } = store.addElements(
      [],
      [
        { color: 0, tool: 2, points: [0, 0, 10, 10] },
        { color: 6, points: [0, 0, 10, 10] },
      ],
    );

    expect(strokes[0]).toMatchObject({ tool: 2 });
    expect(strokes[1]).not.toHaveProperty("tool");
  });

  it("spliceStrokes preserva a ferramenta dos pedaços", () => {
    const store = createBoardStore();
    const original = store.addStroke({ color: 0, tool: 1, points: [0, 0, 100, 0] });

    store.spliceStrokes([original?.id ?? ""], [{ color: 0, tool: 1, points: [0, 0, 40, 0] }]);

    expect(store.getBoard().strokes).toEqual([expect.objectContaining({ tool: 1 })]);
  });

  it("updateStrokes mantém a ferramenta ao mover", () => {
    const store = createBoardStore();
    const stroke = store.addStroke({ color: 0, tool: 2, points: [0, 0, 10, 10] });

    store.updateStrokes([{ id: stroke?.id ?? "", patch: { points: [5, 5, 15, 15] } }]);

    expect(store.getBoard().strokes[0]).toMatchObject({ tool: 2, points: [5, 5, 15, 15] });
  });

  it("trocar só a ferramenta é uma mudança, e desfazer a devolve", () => {
    const store = createBoardStore();
    const stroke = store.addStroke({ color: 0, points: [0, 0, 10, 10] });

    store.updateStrokes([{ id: stroke?.id ?? "", patch: { tool: 1 } }]);
    expect(store.getBoard().strokes[0]).toMatchObject({ tool: 1 });

    store.undo();
    expect(store.getBoard().strokes[0]).not.toHaveProperty("tool");
  });
});

describe("updateNote", () => {
  it("altera só a note apontada", () => {
    const store = createBoardStore();
    const alvo = add(store, { x: 0, y: 0 });
    const outra = add(store, { x: 0, y: 0 });

    store.updateNote(alvo.id, { text: "olá", color: 3 });

    const notes = store.getBoard().notes;
    expect(notes.find((n) => n.id === alvo.id)).toMatchObject({ text: "olá", color: 3 });
    expect(notes.find((n) => n.id === outra.id)).toEqual(outra);
  });

  it("ignora id inexistente sem lançar", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    const antes = store.getBoard();

    expect(() => store.updateNote("nada", { text: "x" })).not.toThrow();
    expect(store.getBoard()).toBe(antes);
  });

  it("recusa alteração inválida e mantém a note como estava", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0, text: "original" });

    store.updateNote(note.id, { color: 42 as never });

    expect(store.getBoard().notes[0]).toEqual(note);
  });
});

describe("remoção", () => {
  it("remove uma note", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });
    add(store, { x: 0, y: 0 });

    store.removeNote(note.id);

    expect(store.getBoard().notes.map((n) => n.id)).not.toContain(note.id);
  });

  it("remove várias de uma vez, ignorando id que não existe", () => {
    const store = createBoardStore();
    const a = add(store, { x: 0, y: 0 });
    const b = add(store, { x: 0, y: 0 });
    const c = add(store, { x: 0, y: 0 });

    store.removeNotes([a.id, c.id, "fantasma"]);

    expect(store.getBoard().notes.map((n) => n.id)).toEqual([b.id]);
  });

  it("não publica nada quando não havia o que remover", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    const antes = store.getBoard();
    const listener = vi.fn();
    store.subscribe(listener);

    store.removeNotes(["fantasma"]);

    expect(store.getBoard()).toBe(antes);
    expect(listener).not.toHaveBeenCalled();
  });

  it("funciona desestruturada, sem depender de this", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });
    const { removeNote, bringToFront } = store;

    expect(() => bringToFront(note.id)).not.toThrow();
    expect(() => removeNote(note.id)).not.toThrow();
    expect(store.getBoard().notes).toEqual([]);
  });
});

describe("remoção de traços", () => {
  it("remove um traço", () => {
    const store = createBoardStore();
    const stroke = store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    store.addStroke({ color: 0, points: [0, 0, 1, 1] });

    store.removeStroke(stroke?.id ?? "");

    expect(store.getBoard().strokes.map((s) => s.id)).not.toContain(stroke?.id);
  });

  it("remove vários de uma vez, ignorando id que não existe", () => {
    const store = createBoardStore();
    const a = store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    const b = store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    const c = store.addStroke({ color: 0, points: [0, 0, 1, 1] });

    store.removeStrokes([a?.id ?? "", c?.id ?? "", "fantasma"]);

    expect(store.getBoard().strokes.map((s) => s.id)).toEqual([b?.id]);
  });

  it("não publica nada quando não havia o que remover", () => {
    const store = createBoardStore();
    store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    const antes = store.getBoard();
    const listener = vi.fn();
    store.subscribe(listener);

    store.removeStrokes(["fantasma"]);

    expect(store.getBoard()).toBe(antes);
    expect(listener).not.toHaveBeenCalled();
  });

  it("remover um traço não toca nas notes, e vice-versa", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });
    const stroke = store.addStroke({ color: 0, points: [0, 0, 1, 1] });

    store.removeStroke(stroke?.id ?? "");

    expect(store.getBoard().notes.map((n) => n.id)).toEqual([note.id]);
  });
});

describe("bringToFront", () => {
  it("põe a note escolhida na frente das demais", () => {
    const store = createBoardStore();
    const primeira = add(store, { x: 0, y: 0 });
    add(store, { x: 0, y: 0 });

    store.bringToFront(primeira.id);

    const notes = store.getBoard().notes;
    const trazida = notes.find((n) => n.id === primeira.id);
    expect(trazida?.z).toBeGreaterThan(
      Math.max(...notes.filter((n) => n !== trazida).map((n) => n.z)),
    );
  });

  it("sobe a note mesmo quando há empate no topo", () => {
    // Empate acontece: um board hidratado pela URL (#21) pode trazer dois z iguais, e aí
    // quem decide o desenho é a ordem da lista. Estar empatado no topo não é estar na
    // frente.
    const store = createBoardStore();
    store.replaceBoard({
      version: SCHEMA_VERSION,
      notes: [
        { id: "aaaaaa", x: 0, y: 0, w: 100, h: 100, color: 0, text: "de baixo", z: 5 },
        { id: "bbbbbb", x: 0, y: 0, w: 100, h: 100, color: 0, text: "de cima", z: 5 },
      ],
      strokes: [],
    });

    store.bringToFront("aaaaaa");

    const notes = store.getBoard().notes;
    const subiu = notes.find((n) => n.id === "aaaaaa");
    const outra = notes.find((n) => n.id === "bbbbbb");
    expect(subiu?.z).toBeGreaterThan(outra?.z ?? 0);
  });

  it("não faz nada se já estiver na frente", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    const topo = add(store, { x: 0, y: 0 });
    const antes = store.getBoard();

    store.bringToFront(topo.id);

    expect(store.getBoard()).toBe(antes);
  });
});

describe("updateNotes", () => {
  it("altera várias notes numa publicação só", () => {
    const store = createBoardStore();
    const a = add(store, { x: 0, y: 0 });
    const b = add(store, { x: 10, y: 10 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.updateNotes([
      { id: a.id, patch: { x: 100 } },
      { id: b.id, patch: { x: 110 } },
    ]);

    expect(store.getBoard().notes.map((n) => n.x)).toEqual([100, 110]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("ignora ids inexistentes no lote", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });

    store.updateNotes([
      { id: "fantasma", patch: { x: 999 } },
      { id: note.id, patch: { y: 42 } },
    ]);

    expect(store.getBoard().notes).toHaveLength(1);
    expect(store.getBoard().notes[0]?.y).toBe(42);
  });
});

describe("publicação sem mudança", () => {
  it("não avisa ninguém quando o patch não muda nada", () => {
    const store = createBoardStore();
    const note = add(store, { x: 10, y: 10, text: "igual" });
    const antes = store.getBoard();
    const listener = vi.fn();
    store.subscribe(listener);

    store.updateNote(note.id, { text: "igual", x: 10 });
    store.updateNote(note.id, {});

    expect(store.getBoard()).toBe(antes);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("imutabilidade do board", () => {
  it("impede que a interface pendure estado efêmero numa note", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    const note = store.getBoard().notes[0] as Note & { selecionada?: boolean };

    // Sem esta barreira, um campo de seleção viajaria dentro da URL.
    expect(() => {
      note.selecionada = true;
    }).toThrow();
    expect(() => {
      note.x = 999;
    }).toThrow();
  });

  it("impede alterar um traço ou os pontos dele depois de gravado", () => {
    const store = createBoardStore();
    const stroke = store.addStroke({ color: 0, points: [0, 0, 1, 1] });
    if (stroke === null) throw new Error("addStroke recusou uma entrada que deveria ser válida");

    expect(() => {
      stroke.color = 1;
    }).toThrow();
    expect(() => {
      stroke.points.push(2);
    }).toThrow();
  });
});

describe("replaceBoard", () => {
  it("troca o board inteiro, como na hidratação por URL", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });

    store.replaceBoard({
      version: SCHEMA_VERSION,
      notes: [{ id: "abc123", x: 5, y: 5, w: 100, h: 100, color: 2, text: "vindo da URL", z: 1 }],
      strokes: [],
    });

    expect(store.getBoard().notes.map((n) => n.id)).toEqual(["abc123"]);
  });

  it("não compartilha a lista nem as notes com quem chamou", () => {
    const store = createBoardStore();
    const nota = { id: "abc123", x: 0, y: 0, w: 100, h: 100, color: 0 as const, text: "", z: 1 };
    const notes = [nota];

    store.replaceBoard({ version: SCHEMA_VERSION, notes, strokes: [] });
    notes.pop();
    nota.x = 999;

    expect(store.getBoard().notes).toHaveLength(1);
    expect(store.getBoard().notes[0]?.x).toBe(0);
  });

  it("não compartilha os traços nem os pontos com quem chamou", () => {
    const store = createBoardStore();
    const traço = { id: "abc123", color: 0 as const, points: [0, 0, 1, 1], z: 1 };
    const strokes = [traço];

    store.replaceBoard({ version: SCHEMA_VERSION, notes: [], strokes });
    strokes.pop();
    traço.points.push(99);

    expect(store.getBoard().strokes).toHaveLength(1);
    expect(store.getBoard().strokes[0]?.points).toEqual([0, 0, 1, 1]);
  });
});

describe("subscribe", () => {
  it("entrega o mesmo estado a todos, mesmo se um ouvinte escrever na store", () => {
    const store = createBoardStore();
    const note = add(store, { x: 0, y: 0 });
    const vistos: number[] = [];

    // Um ouvinte que escreve dispara outra publicação no meio desta.
    const cancelar = store.subscribe(() => {
      cancelar();
      store.updateNote(note.id, { y: 50 });
    });
    store.subscribe(() => vistos.push(store.getBoard().notes.length));

    store.addNote({ x: 1, y: 1 });

    expect(vistos.length).toBeGreaterThan(0);
    expect(store.getBoard().notes).toHaveLength(2);
  });

  it("avisa a cada mudança e para ao cancelar", () => {
    const store = createBoardStore();
    const listener = vi.fn();
    const cancelar = store.subscribe(listener);

    const note = add(store, { x: 0, y: 0 });
    store.updateNote(note.id, { text: "oi" });
    expect(listener).toHaveBeenCalledTimes(2);

    cancelar();
    store.removeNote(note.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("troca a referência do board a cada mudança, para comparação por identidade", () => {
    const store = createBoardStore();
    const antes = store.getBoard();

    add(store, { x: 0, y: 0 });

    expect(store.getBoard()).not.toBe(antes);
  });

  it("cancelar duas vezes não afeta outros inscritos", () => {
    const store = createBoardStore();
    const listener = vi.fn();
    const outro = vi.fn();
    const cancelar = store.subscribe(listener);
    store.subscribe(outro);

    cancelar();
    cancelar();
    add(store, { x: 0, y: 0 });

    expect(listener).not.toHaveBeenCalled();
    expect(outro).toHaveBeenCalledOnce();
  });
});

describe("BoardStore — histórico (#86)", () => {
  it("começa sem nada para desfazer nem refazer", () => {
    const store = createBoardStore();

    expect(store.getHistory()).toEqual({ canUndo: false, canRedo: false });
  });

  it("desfaz a última alteração e refaz de volta", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    expect(store.getBoard().notes).toHaveLength(1);

    store.undo();
    expect(store.getBoard().notes).toEqual([]);
    expect(store.getHistory()).toEqual({ canUndo: false, canRedo: true });

    store.redo();
    expect(store.getBoard().notes).toHaveLength(1);
    expect(store.getHistory()).toEqual({ canUndo: true, canRedo: false });
  });

  it("desfaz vários passos, na ordem inversa", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    add(store, { x: 100, y: 0 });
    add(store, { x: 200, y: 0 });

    store.undo();
    store.undo();

    expect(store.getBoard().notes).toHaveLength(1);
  });

  /**
   * A unidade de passo é o `commit`, que já era o gargalo que decidia o que é **uma**
   * publicação. Um lote apagado de uma vez volta de uma vez, de graça.
   */
  it("um lote apagado de uma vez é um passo só", () => {
    const store = createBoardStore();
    const a = add(store, { x: 0, y: 0 });
    const b = add(store, { x: 100, y: 0 });

    store.removeNotes([a.id, b.id]);
    expect(store.getBoard().notes).toEqual([]);

    store.undo();

    expect(store.getBoard().notes).toHaveLength(2);
  });

  it("uma alteração nova descarta o que havia para refazer", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    store.undo();
    expect(store.getHistory().canRedo).toBe(true);

    add(store, { x: 500, y: 500 });

    expect(store.getHistory().canRedo).toBe(false);
    store.redo();
    expect(store.getBoard().notes).toHaveLength(1);
  });

  it("desfazer sem passo guardado não faz nada", () => {
    const store = createBoardStore();
    const antes = store.getBoard();

    store.undo();
    store.redo();

    expect(store.getBoard()).toBe(antes);
  });

  /**
   * Uma operação sem efeito não publica — e por isso também não gasta um passo. Sem essa
   * regra, um `Delete` com a seleção cheia de ids que já não existem encheria o histórico
   * de passos que não desfazem nada.
   */
  it("operação sem efeito não vira passo", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });

    store.removeNotes(["nao-existe"]);
    store.undo();

    expect(store.getBoard().notes).toEqual([]);
  });

  it("avisa os inscritos ao desfazer, como em qualquer alteração", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.undo();

    expect(listener).toHaveBeenCalledOnce();
  });

  /**
   * `getHistory` devolve o **mesmo** objeto enquanto os dois valores não mudam. É o que o
   * `useSyncExternalStore` exige: uma leitura que devolvesse objeto novo a cada chamada o
   * faria renderizar em laço infinito.
   */
  it("a leitura do histórico é estável por identidade", () => {
    const store = createBoardStore();

    expect(store.getHistory()).toBe(store.getHistory());

    add(store, { x: 0, y: 0 });
    const depois = store.getHistory();

    expect(depois).toBe(store.getHistory());
    expect(depois.canUndo).toBe(true);
  });

  it("o novo quadro é desfazível, como qualquer alteração", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });

    store.replaceBoard(createEmptyBoard());
    expect(store.getBoard().notes).toEqual([]);

    store.undo();

    expect(store.getBoard().notes).toHaveLength(1);
  });

  /**
   * Restaurar não é alterar: é o quadro chegando. Gravado como passo, um `Ctrl+Z` logo
   * depois de abrir a aba devolveria o board vazio do primeiro render e apagaria a sessão
   * que a restauração acabou de trazer.
   */
  it("restaurar não deixa passo, e zera o histórico anterior", () => {
    const store = createBoardStore();
    add(store, { x: 0, y: 0 });
    expect(store.getHistory().canUndo).toBe(true);

    const restaurado: Board = {
      version: SCHEMA_VERSION,
      notes: [{ id: "abc123", x: 5, y: 5, w: 100, h: 100, color: 0, text: "salvo", z: 1 }],
      strokes: [],
    };
    store.restoreBoard(restaurado);

    expect(store.getHistory()).toEqual({ canUndo: false, canRedo: false });
    store.undo();
    expect(store.getBoard().notes[0]?.text).toBe("salvo");
  });

  /** O teto existe para limitar memória, e desfazer sempre anda para trás a partir de agora. */
  it("o passo mais antigo cai fora quando a pilha enche", () => {
    const store = createBoardStore();
    const primeira = add(store, { x: 0, y: 0 });

    // Bem acima do teto de 50: o primeiro passo já saiu da pilha muito antes do fim.
    for (let volta = 0; volta < 80; volta += 1) {
      store.updateNote(primeira.id, { x: volta + 1 });
    }
    for (let volta = 0; volta < 80; volta += 1) {
      store.undo();
    }

    // A criação não volta: desfazer não alcança mais o começo da sessão.
    expect(store.getBoard().notes).toHaveLength(1);
    expect(store.getHistory().canUndo).toBe(false);
  });
});
