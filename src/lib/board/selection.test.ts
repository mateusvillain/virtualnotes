import { describe, expect, it } from "vitest";
import type { Rect } from "@/lib/canvas/coords";
import {
  EMPTY_SELECTION,
  elementsInRect,
  intersects,
  isSelected,
  selectAll,
  selectOnly,
  selectedNotes,
  selectedStrokes,
  selectionSize,
  sharedColor,
  toggle,
  union,
} from "./selection";
import type { Note, Stroke } from "./types";

function note(overrides: Partial<Note> = {}): Note {
  return { id: "abc123", x: 0, y: 0, w: 100, h: 100, color: 0, text: "", z: 1, ...overrides };
}

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return { id: "trc123", color: 6, points: [0, 0, 100, 100], z: 1, ...overrides };
}

/** Os ids marcados de cada espécie, para o teste ler a seleção sem depender de conjuntos. */
function marcados(selection: { notes: ReadonlySet<string>; strokes: ReadonlySet<string> }): {
  notes: string[];
  strokes: string[];
} {
  return { notes: [...selection.notes], strokes: [...selection.strokes] };
}

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

describe("selectOnly", () => {
  it("deixa só o post-it pedido", () => {
    expect(marcados(selectOnly("note", "aaa111"))).toEqual({ notes: ["aaa111"], strokes: [] });
  });

  it("deixa só o traço pedido", () => {
    expect(marcados(selectOnly("stroke", "trc111"))).toEqual({ notes: [], strokes: ["trc111"] });
  });

  /**
   * "Só" quer dizer só: clicar num traço larga as notas que estavam marcadas, como clicar
   * numa nota sempre largou as outras. Uma seleção que só limpasse a própria espécie
   * deixaria post-its marcados invisivelmente atrás do rabisco recém-clicado.
   */
  it("limpa também a outra espécie", () => {
    const misto = union(selectOnly("note", "aaa111"), selectOnly("stroke", "trc111"));

    expect(marcados(selectOnly("stroke", "trc222"))).toEqual({ notes: [], strokes: ["trc222"] });
    expect(selectionSize(misto)).toBe(2);
  });
});

describe("toggle", () => {
  it("acrescenta quem está de fora", () => {
    const depois = toggle(selectOnly("note", "aaa111"), "note", "bbb222");

    expect(marcados(depois)).toEqual({ notes: ["aaa111", "bbb222"], strokes: [] });
  });

  it("tira quem já está dentro", () => {
    expect(marcados(toggle(selectOnly("note", "aaa111"), "note", "aaa111"))).toEqual({
      notes: [],
      strokes: [],
    });
  });

  /**
   * A razão de a seleção ter dois conjuntos, num teste: os ids são únicos dentro de cada
   * lista do board, não entre elas. Um conjunto só marcaria os dois de uma vez.
   */
  it("um traço com o mesmo id de uma nota é outro elemento", () => {
    const comNota = selectOnly("note", "igual");
    const comOsDois = toggle(comNota, "stroke", "igual");

    expect(marcados(comOsDois)).toEqual({ notes: ["igual"], strokes: ["igual"] });
    expect(isSelected(comOsDois, "note", "igual")).toBe(true);
    expect(isSelected(comOsDois, "stroke", "igual")).toBe(true);

    // E tirar um não tira o outro.
    expect(isSelected(toggle(comOsDois, "stroke", "igual"), "note", "igual")).toBe(true);
  });

  it("não altera a seleção recebida", () => {
    const antes = selectOnly("note", "aaa111");

    toggle(antes, "note", "bbb222");

    // A seleção é valor, não caixa: quem a segura não pode vê-la mudar por baixo.
    expect(marcados(antes)).toEqual({ notes: ["aaa111"], strokes: [] });
  });
});

describe("union", () => {
  it("junta as duas espécies das duas seleções", () => {
    const a = union(selectOnly("note", "n1"), selectOnly("stroke", "t1"));
    const b = union(selectOnly("note", "n2"), selectOnly("stroke", "t2"));

    expect(marcados(union(a, b))).toEqual({ notes: ["n1", "n2"], strokes: ["t1", "t2"] });
  });

  it("não repete quem já estava nas duas", () => {
    const a = selectOnly("note", "n1");

    expect(selectionSize(union(a, a))).toBe(1);
  });
});

describe("intersects", () => {
  it("reconhece sobreposição parcial", () => {
    expect(intersects(note(), rect(50, 50, 100, 100))).toBe(true);
  });

  it("reconhece o post-it inteiramente dentro do retângulo", () => {
    expect(intersects(note(), rect(-10, -10, 200, 200))).toBe(true);
  });

  it("reconhece o retângulo inteiramente dentro do post-it", () => {
    // Tocar é tocar, venha de que lado vier: um retângulo pequeno sobre um post-it grande
    // seleciona esse post-it.
    expect(intersects(note(), rect(10, 10, 5, 5))).toBe(true);
  });

  it("não conta encostar como intersectar", () => {
    // Retângulo terminando exatamente na borda esquerda do post-it.
    expect(intersects(note(), rect(-50, 0, 50, 100))).toBe(false);
  });

  it("não seleciona nada com retângulo de área nula", () => {
    // É o que um clique sem arrasto produz. Sem a comparação estrita, ele marcaria todo
    // post-it cuja borda passasse pelo ponto clicado.
    expect(intersects(note(), rect(50, 50, 0, 0))).toBe(false);
  });

  it("ignora post-it fora do retângulo", () => {
    expect(intersects(note({ x: 500, y: 500 }), rect(0, 0, 100, 100))).toBe(false);
  });
});

describe("elementsInRect", () => {
  it("devolve só os ids tocados pelo retângulo", () => {
    const notes = [
      note({ id: "dentro", x: 0, y: 0 }),
      note({ id: "borda", x: 90, y: 90 }),
      note({ id: "fora", x: 900, y: 900 }),
    ];

    expect(marcados(elementsInRect(notes, [], rect(0, 0, 100, 100)))).toEqual({
      notes: ["dentro", "borda"],
      strokes: [],
    });
  });

  /**
   * O critério da #70: um retângulo arrastado no fundo pega os dois tipos de uma vez. Quem
   * desenha o retângulo não deveria precisar saber que o quadro guarda notas e rabiscos em
   * listas separadas.
   */
  it("pega notas e traços no mesmo retângulo", () => {
    const notes = [note({ id: "n", x: 0, y: 0 })];
    const strokes = [stroke({ id: "t", points: [20, 20, 40, 40] })];

    expect(marcados(elementsInRect(notes, strokes, rect(0, 0, 100, 100)))).toEqual({
      notes: ["n"],
      strokes: ["t"],
    });
  });

  it("devolve seleção vazia quando o retângulo não toca nada", () => {
    const vazia = elementsInRect([note()], [stroke()], rect(900, 900, 10, 10));

    expect(marcados(vazia)).toEqual(marcados(EMPTY_SELECTION));
  });

  /**
   * A #158: o retângulo pega o traço pela borda que se vê. Um lápis a 6× (`w: 7`) tem 12
   * unidades de tinta — 5 além do lápis padrão de cada lado da linha do meio.
   */
  it("pega um traço grosso encostando só na borda da tinta", () => {
    const strokes = [
      stroke({ id: "grosso", w: 7, points: [0, 0, 100, 0] }),
      stroke({ id: "fino", points: [0, 50, 100, 50] }),
    ];

    // 5 unidades abaixo de cada linha: dentro da tinta do grosso, fora do alcance do fino.
    expect(marcados(elementsInRect([], strokes, rect(40, 5, 20, 2))).strokes).toEqual(["grosso"]);
    expect(marcados(elementsInRect([], strokes, rect(40, 55, 20, 2))).strokes).toEqual([]);
  });
});

describe("selectedNotes", () => {
  const notes = [note({ id: "a" }), note({ id: "b" }), note({ id: "c" })];

  /** Uma seleção com estes ids de nota marcados, e traço nenhum. */
  function comNotas(...ids: string[]) {
    return { notes: new Set(ids), strokes: new Set<string>() };
  }

  it("devolve só as marcadas", () => {
    expect(selectedNotes(notes, comNotas("a", "c")).map((each) => each.id)).toEqual(["a", "c"]);
  });

  it("mantém a ordem do board, e não a da seleção", () => {
    // A seleção é um conjunto: ela não tem ordem para oferecer. Quem tem é o board.
    expect(selectedNotes(notes, comNotas("c", "a")).map((each) => each.id)).toEqual(["a", "c"]);
  });

  it("ignora id marcado que não existe mais no board", () => {
    expect(selectedNotes(notes, comNotas("a", "sumiu")).map((each) => each.id)).toEqual(["a"]);
  });

  it("devolve vazio sem seleção", () => {
    expect(selectedNotes(notes, EMPTY_SELECTION)).toEqual([]);
  });

  /**
   * O que faz uma seleção mista não quebrar as ações que só valem para post-it: o traço
   * marcado simplesmente não aparece aqui, e o seletor de cor age sobre as notas.
   */
  it("não devolve nota por causa de um traço marcado com o mesmo id", () => {
    const misto = { notes: new Set<string>(), strokes: new Set(["a"]) };

    expect(selectedNotes(notes, misto)).toEqual([]);
  });
});

describe("selectedStrokes", () => {
  const strokes = [stroke({ id: "a" }), stroke({ id: "b" }), stroke({ id: "c" })];

  it("devolve só os marcados, na ordem do board", () => {
    const misto = { notes: new Set(["b"]), strokes: new Set(["c", "a"]) };

    expect(selectedStrokes(strokes, misto).map((each) => each.id)).toEqual(["a", "c"]);
  });

  it("devolve vazio sem seleção", () => {
    expect(selectedStrokes(strokes, EMPTY_SELECTION)).toEqual([]);
  });
});

describe("selectionSize", () => {
  it("conta as duas espécies juntas", () => {
    const misto = { notes: new Set(["a", "b"]), strokes: new Set(["t"]) };

    expect(selectionSize(misto)).toBe(3);
  });

  it("uma seleção vazia não tem tamanho", () => {
    expect(selectionSize(EMPTY_SELECTION)).toBe(0);
  });
});

describe("sharedColor", () => {
  it("devolve a cor quando todas têm a mesma", () => {
    expect(sharedColor([note({ color: 3 }), note({ color: 3 })])).toBe(3);
  });

  it("devolve null quando as cores divergem", () => {
    // Não há uma "cor atual" a marcar no seletor, e escolher a do primeiro mentiria sobre
    // as demais.
    expect(sharedColor([note({ color: 3 }), note({ color: 1 })])).toBeNull();
  });

  it("devolve null para lista vazia", () => {
    expect(sharedColor([])).toBeNull();
  });

  it("uma note só é a própria cor comum", () => {
    expect(sharedColor([note({ color: 5 })])).toBe(5);
  });

  it("distingue a cor 0 da ausência de cor comum", () => {
    // Amarelo é o índice 0, e um `?? null` descuidado o transformaria em "sem cor comum".
    expect(sharedColor([note({ color: 0 }), note({ color: 0 })])).toBe(0);
  });
});

describe("selectAll", () => {
  it("marca todas as notas e todos os traços", () => {
    const notes = [note({ id: "n1" }), note({ id: "n2" })];
    const strokes = [stroke({ id: "t1" })];

    expect(marcados(selectAll(notes, strokes))).toEqual({
      notes: ["n1", "n2"],
      strokes: ["t1"],
    });
  });

  /**
   * Sem caso especial para o quadro vazio: os dois conjuntos saem vazios sozinhos, que é a
   * resposta certa — `Ctrl+A` num quadro sem nada não pode deixar seleção fantasma.
   */
  it("num quadro vazio não marca nada", () => {
    expect(marcados(selectAll([], []))).toEqual(marcados(EMPTY_SELECTION));
    expect(selectionSize(selectAll([], []))).toBe(0);
  });

  it("marca só as notas quando não há traço", () => {
    expect(marcados(selectAll([note({ id: "n1" })], []))).toEqual({
      notes: ["n1"],
      strokes: [],
    });
  });

  /** Ids iguais em espécies diferentes continuam sendo dois elementos (a decisão da #70). */
  it("uma nota e um traço de mesmo id entram como dois", () => {
    const tudo = selectAll([note({ id: "igual" })], [stroke({ id: "igual" })]);

    expect(selectionSize(tudo)).toBe(2);
    expect(isSelected(tudo, "note", "igual")).toBe(true);
    expect(isSelected(tudo, "stroke", "igual")).toBe(true);
  });
});
