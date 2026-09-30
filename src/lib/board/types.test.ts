import { describe, expect, it } from "vitest";
import {
  DEFAULT_STROKE_COLORS,
  DEFAULT_STROKE_OPACITIES,
  DEFAULT_STROKE_SIZES,
  STROKE_OPACITIES,
  STROKE_SIZES,
  STROKE_SIZE_BASE,
  isStrokeOpacity,
  isStrokeSize,
  strokeOpacity,
  strokeOpacityValue,
  strokeSize,
  strokeSizeScale,
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
  it("são as seis cores da nota mais o preto, o cinza e o branco", () => {
    expect(STROKE_COLORS).toEqual([...NOTE_COLORS, "black", "gray", "white"]);
  });

  it("aceita cor livre só como #rrggbb minúsculo", () => {
    expect(isStrokeColor("#ff8800")).toBe(true);
    expect(["#FF8800", "#f80", "ff8800", "#ff88001", "red", "#gg0000"].some(isStrokeColor)).toBe(
      false,
    );
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

  it("dá uma cor inicial a cada ferramenta, sem sobrar nem faltar", () => {
    expect(DEFAULT_STROKE_COLORS).toHaveLength(STROKE_TOOLS.length);
    expect(DEFAULT_STROKE_COLORS.every(isStrokeColor)).toBe(true);
  });

  it("lê a ausência do campo como lápis", () => {
    expect(strokeTool({})).toBe(STROKE_TOOL_PENCIL);
    expect(strokeTool({ tool: 2 })).toBe(2);
  });
});

describe("espessura e opacidade do traço (#153)", () => {
  it("tem a base 1× no índice padrão", () => {
    expect(STROKE_SIZES[STROKE_SIZE_BASE]).toBe(1);
  });

  it("tem a opacidade de 5% a 100%, de 5 em 5, sem o zero", () => {
    expect(STROKE_OPACITIES).toHaveLength(20);
    expect(STROKE_OPACITIES.every((value, index) => value === (index + 1) * 5)).toBe(true);
  });

  it("aceita todo índice das listas, sem sobrar nem faltar", () => {
    expect(STROKE_SIZES.every((_, index) => isStrokeSize(index))).toBe(true);
    expect(isStrokeSize(STROKE_SIZES.length)).toBe(false);
    expect(STROKE_OPACITIES.every((_, index) => isStrokeOpacity(index))).toBe(true);
    expect(isStrokeOpacity(STROKE_OPACITIES.length)).toBe(false);
    expect([-1, 1.5, "1", null, undefined].some(isStrokeSize)).toBe(false);
    expect([-1, 1.5, "1", null, undefined].some(isStrokeOpacity)).toBe(false);
  });

  it("dá uma espessura e uma opacidade iniciais a cada ferramenta", () => {
    expect(DEFAULT_STROKE_SIZES).toHaveLength(STROKE_TOOLS.length);
    expect(DEFAULT_STROKE_SIZES.every(isStrokeSize)).toBe(true);
    expect(DEFAULT_STROKE_OPACITIES).toHaveLength(STROKE_TOOLS.length);
    expect(DEFAULT_STROKE_OPACITIES.every(isStrokeOpacity)).toBe(true);
  });

  it("lê a ausência dos campos como o padrão da ferramenta", () => {
    expect(strokeSizeScale({})).toBe(1);
    expect(strokeSizeScale({ tool: 2 })).toBe(1);
    expect(strokeOpacityValue({})).toBe(1);
    expect(strokeOpacityValue({ tool: 1 })).toBe(1);
    // O marca-texto nasce a 35%, a opacidade que ele sempre teve (#116).
    expect(strokeOpacityValue({ tool: 2 })).toBeCloseTo(0.35);
  });

  it("lê os campos presentes", () => {
    expect(strokeSize({ w: 7 })).toBe(7);
    expect(strokeSizeScale({ w: 7 })).toBe(6);
    expect(strokeOpacity({ tool: 2, o: 19 })).toBe(19);
    expect(strokeOpacityValue({ o: 0 })).toBeCloseTo(0.05);
  });
});

describe("createEmptyBoard", () => {
  it("cria um board vazio na versão atual", () => {
    expect(createEmptyBoard()).toEqual({ version: SCHEMA_VERSION, notes: [], strokes: [] });
  });
});
