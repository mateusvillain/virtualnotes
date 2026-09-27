import { describe, expect, it } from "vitest";
import { parseClipboard, serializeSelection } from "./clipboard";
import { EMPTY_SELECTION, type Selection } from "./selection";
import { SCHEMA_VERSION, createEmptyBoard, type Board, type Note, type Stroke } from "./types";

function note(overrides: Partial<Note> = {}): Note {
  return { id: "abc123", x: 0, y: 0, w: 100, h: 100, color: 0, text: "", z: 1, ...overrides };
}

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return { id: "trc123", color: 6, points: [0, 0, 10, 10], z: 1, ...overrides };
}

function board(notes: Note[] = [], strokes: Stroke[] = []): Board {
  return { ...createEmptyBoard(), notes, strokes };
}

function selecao(notes: string[] = [], strokes: string[] = []): Selection {
  return { notes: new Set(notes), strokes: new Set(strokes) };
}

describe("serializeSelection", () => {
  it("leva só o que está marcado", () => {
    const quadro = board([note({ id: "a" }), note({ id: "b" })], [stroke({ id: "t" })]);

    const texto = serializeSelection(quadro, selecao(["a"], ["t"]));

    const recorte = parseClipboard(texto ?? "");
    expect(recorte?.notes.map((each) => each.id)).toEqual(["a"]);
    expect(recorte?.strokes.map((each) => each.id)).toEqual(["t"]);
  });

  /**
   * A diferença entre "copiei o vazio" e "não copiei". Um `Ctrl+C` sem seleção não pode
   * apagar o que a pessoa tinha na área de transferência, que pode ter vindo de outro
   * programa.
   */
  it("devolve null sem nada marcado", () => {
    expect(serializeSelection(board([note()]), EMPTY_SELECTION)).toBeNull();
  });

  it("devolve null quando a seleção só tem ids que não existem mais", () => {
    expect(serializeSelection(board([note({ id: "a" })]), selecao(["sumiu"]))).toBeNull();
  });

  it("leva a ferramenta do traço junto (#110)", () => {
    const quadro = board([], [stroke({ id: "t", tool: 2 })]);

    const recorte = parseClipboard(serializeSelection(quadro, selecao([], ["t"])) ?? "");

    expect(recorte?.strokes[0]).toMatchObject({ tool: 2 });
  });

  it("escreve na versão de schema atual", () => {
    const texto = serializeSelection(board([note({ id: "a" })]), selecao(["a"]));

    expect(JSON.parse(texto ?? "")).toMatchObject({ version: SCHEMA_VERSION });
  });
});

describe("parseClipboard", () => {
  it("faz a volta do que `serializeSelection` escreveu", () => {
    const original = note({ id: "a", x: 40, y: 80, text: "oi", color: 3 });
    const texto = serializeSelection(board([original]), selecao(["a"]));

    const recorte = parseClipboard(texto ?? "");

    expect(recorte?.notes[0]).toMatchObject({ x: 40, y: 80, text: "oi", color: 3 });
  });

  /** A entrada mais provável de todas: a área de transferência costuma ter uma frase. */
  it("devolve null para texto que não é JSON", () => {
    expect(parseClipboard("uma frase copiada de algum lugar")).toBeNull();
    expect(parseClipboard("")).toBeNull();
  });

  it("devolve null para JSON que não é um board", () => {
    expect(parseClipboard('{"foo":1}')).toBeNull();
    expect(parseClipboard("[1,2,3]")).toBeNull();
    expect(parseClipboard("42")).toBeNull();
  });

  /** Mesma regra da abertura por link (#21): formato de uma versão futura não é adivinhado. */
  it("recusa um recorte de uma versão mais nova do schema", () => {
    const futuro = JSON.stringify({ version: SCHEMA_VERSION + 1, notes: [note()], strokes: [] });

    expect(parseClipboard(futuro)).toBeNull();
  });

  /**
   * Um recorte sem nada dentro não é um recorte: colá-lo publicaria uma alteração que não
   * muda nada e gastaria um passo de desfazer.
   */
  it("devolve null para um board válido mas vazio", () => {
    expect(parseClipboard(JSON.stringify(createEmptyBoard()))).toBeNull();
  });

  /** O contrato descarta o elemento estragado e mantém o resto, como faz com um link. */
  it("descarta o elemento inválido sem perder o lote", () => {
    const misto = JSON.stringify({
      version: SCHEMA_VERSION,
      notes: [note({ id: "bom" }), { id: "ruim" }],
      strokes: [],
    });

    const recorte = parseClipboard(misto);

    expect(recorte?.notes.map((each) => each.id)).toEqual(["bom"]);
  });
});
