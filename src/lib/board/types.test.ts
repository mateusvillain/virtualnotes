import { describe, expect, it } from "vitest";
import {
  NOTE_COLORS,
  SCHEMA_VERSION,
  STROKE_COLORS,
  STROKE_TOOLS,
  STROKE_TOOL_PENCIL,
  createEmptyBoard,
  isNoteColor,
  isStrokeColor,
  isStrokeTool,
  strokeTool,
} from "./types";

describe("cores do post-it", () => {
  it("expõe exatamente 6 cores", () => {
    expect(NOTE_COLORS).toHaveLength(6);
  });

  it("aceita apenas índices inteiros dentro da paleta", () => {
    expect([0, 5].every(isNoteColor)).toBe(true);
    expect([-1, 6, 1.5, "0", null, undefined].some(isNoteColor)).toBe(false);
  });

  it("aceita todo índice da paleta, sem sobrar nem faltar", () => {
    expect(NOTE_COLORS.every((_, index) => isNoteColor(index))).toBe(true);
    expect(isNoteColor(NOTE_COLORS.length)).toBe(false);
  });
});

describe("cores do traço", () => {
  it("são as seis cores da nota mais o preto", () => {
    expect(STROKE_COLORS).toEqual([...NOTE_COLORS, "black"]);
  });

  it("aceita todo índice da paleta, sem sobrar nem faltar", () => {
    expect(STROKE_COLORS.every((_, index) => isStrokeColor(index))).toBe(true);
    expect(isStrokeColor(STROKE_COLORS.length)).toBe(false);
    expect([-1, 1.5, "0", null, undefined].some(isStrokeColor)).toBe(false);
  });
});

describe("ferramentas do traço", () => {
  it("são lápis, caneta tinteiro e marca-texto, com o lápis no índice 0", () => {
    expect(STROKE_TOOLS).toEqual(["pencil", "fountain", "highlighter"]);
    expect(STROKE_TOOLS[STROKE_TOOL_PENCIL]).toBe("pencil");
  });

  it("aceita todo índice da lista, sem sobrar nem faltar", () => {
    expect(STROKE_TOOLS.every((_, index) => isStrokeTool(index))).toBe(true);
    expect(isStrokeTool(STROKE_TOOLS.length)).toBe(false);
    expect([-1, 1.5, "1", null, undefined].some(isStrokeTool)).toBe(false);
  });

  it("lê a ausência do campo como lápis", () => {
    expect(strokeTool({})).toBe(STROKE_TOOL_PENCIL);
    expect(strokeTool({ tool: 2 })).toBe(2);
  });
});

describe("createEmptyBoard", () => {
  it("cria um board vazio na versão atual", () => {
    expect(createEmptyBoard()).toEqual({ version: SCHEMA_VERSION, notes: [], strokes: [] });
  });
});
