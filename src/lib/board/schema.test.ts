import { describe, expect, it } from "vitest";
import { normalizeStroke, parseBoard } from "./schema";
import {
  CANVAS_MAX_ABS_COORDINATE,
  NOTE_MAX_TEXT_LENGTH,
  NOTE_SIZE,
  SCHEMA_VERSION,
  STROKE_MAX_COUNT,
  STROKE_MAX_POINTS,
} from "./types";

function note(overrides: Record<string, unknown> = {}) {
  return { id: "a", x: 10, y: 20, w: 200, h: 200, color: 0, text: "oi", z: 1, ...overrides };
}

function stroke(overrides: Record<string, unknown> = {}) {
  return { id: "s1", color: 0, points: [0, 0, 10, 10], z: 1, ...overrides };
}

describe("parseBoard", () => {
  it("aceita um board válido", () => {
    const result = parseBoard({ version: SCHEMA_VERSION, notes: [note()], strokes: [stroke()] });

    expect(result).toEqual({
      ok: true,
      board: { version: SCHEMA_VERSION, notes: [note()], strokes: [stroke()] },
      warnings: [],
    });
  });

  it("aceita um board vazio", () => {
    const result = parseBoard({ version: SCHEMA_VERSION, notes: [], strokes: [] });

    expect(result.ok && result.board.notes).toEqual([]);
    expect(result.ok && result.board.strokes).toEqual([]);
  });

  it.each([
    ["null", null],
    ["string", "board"],
    ["array", []],
    ["sem versão", { notes: [] }],
    ["versão não inteira", { version: 1.5, notes: [] }],
    ["versão zero", { version: 0, notes: [] }],
    ["sem lista de notes", { version: SCHEMA_VERSION }],
    ["notes não é lista", { version: SCHEMA_VERSION, notes: {} }],
  ])("rejeita board malformado (%s) sem lançar", (_caso, input) => {
    const result = parseBoard(input);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.length).toBeGreaterThan(0);
  });

  it("rejeita board escrito por versão futura do schema", () => {
    const result = parseBoard({ version: SCHEMA_VERSION + 1, notes: [] });

    expect(result.ok).toBe(false);
  });

  it("descarta notes inválidas e reporta o motivo", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [
        note(),
        null,
        note({ id: "" }),
        note({ id: "b", x: "10" }),
        note({ id: "c", color: 9 }),
      ],
    });

    expect(result.ok && result.board.notes.map((n) => n.id)).toEqual(["a"]);
    expect(result.ok && result.warnings).toHaveLength(4);
  });

  it("renomeia id duplicado em vez de descartar o post-it", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [note({ text: "primeira" }), note({ text: "segunda" }), note({ text: "terceira" })],
    });

    expect(result.ok && result.board.notes.map((n) => [n.id, n.text])).toEqual([
      ["a", "primeira"],
      ["a-2", "segunda"],
      ["a-3", "terceira"],
    ]);
    expect(result.ok && result.warnings).toHaveLength(2);
  });

  it("não colide ao renomear com um id que já existe no board", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [note(), note({ id: "a-2" }), note({ text: "renomeada" })],
    });

    expect(result.ok && result.board.notes.map((n) => n.id)).toEqual(["a", "a-2", "a-3"]);
  });

  it("aplica tamanho padrão quando largura e altura faltam ou não são números", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [note({ w: undefined, h: "grande" })],
    });

    expect(result.ok && result.board.notes[0]?.w).toBe(NOTE_SIZE.defaultWidth);
    expect(result.ok && result.board.notes[0]?.h).toBe(NOTE_SIZE.defaultHeight);
  });

  it("limita tamanho, coordenadas e texto aos extremos aceitos", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [
        note({
          x: -CANVAS_MAX_ABS_COORDINATE * 10,
          y: CANVAS_MAX_ABS_COORDINATE * 10,
          w: 1,
          h: NOTE_SIZE.maxHeight * 10,
          text: "x".repeat(NOTE_MAX_TEXT_LENGTH + 50),
        }),
      ],
    });

    const parsed = result.ok ? result.board.notes[0] : undefined;
    expect(parsed?.x).toBe(-CANVAS_MAX_ABS_COORDINATE);
    expect(parsed?.y).toBe(CANVAS_MAX_ABS_COORDINATE);
    expect(parsed?.w).toBe(NOTE_SIZE.minWidth);
    expect(parsed?.h).toBe(NOTE_SIZE.maxHeight);
    expect(parsed?.text).toHaveLength(NOTE_MAX_TEXT_LENGTH);
  });

  it("normaliza z para inteiro e texto ausente para vazio", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [note({ z: 3.7, text: undefined })],
    });

    expect(result.ok && result.board.notes[0]?.z).toBe(3);
    expect(result.ok && result.board.notes[0]?.text).toBe("");
  });

  it("normaliza a versão do board para a versão atual do schema", () => {
    const result = parseBoard({ version: 1, notes: [] });

    expect(result.ok && result.board.version).toBe(SCHEMA_VERSION);
  });

  it("abre um board da v2 sem aviso, com todo traço como lápis", () => {
    const result = parseBoard({ version: 2, notes: [note()], strokes: [stroke()] });

    expect(result).toEqual({
      ok: true,
      board: { version: SCHEMA_VERSION, notes: [note()], strokes: [stroke()] },
      warnings: [],
    });
  });

  it("abre normalmente um board da v1, sem strokes, com a lista de traços vazia", () => {
    const result = parseBoard({ version: 1, notes: [note()] });

    expect(result.ok).toBe(true);
    expect(result.ok && result.board.strokes).toEqual([]);
    expect(result.ok && result.board.notes.map((n) => n.id)).toEqual(["a"]);
  });

  it("não lança para valores não finitos", () => {
    const result = parseBoard({
      version: SCHEMA_VERSION,
      notes: [note({ x: Number.NaN }), note({ id: "b", w: Number.POSITIVE_INFINITY })],
    });

    expect(result.ok && result.board.notes.map((n) => n.id)).toEqual(["b"]);
    expect(result.ok && result.board.notes[0]?.w).toBe(NOTE_SIZE.defaultWidth);
  });

  describe("strokes", () => {
    it("descarta traços inválidos e reporta o motivo, sem descartar o board", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [
          stroke(),
          null,
          stroke({ id: "" }),
          stroke({ id: "s2", color: 9 }),
          stroke({ id: "s3", points: [1, 2] }),
          stroke({ id: "s4", points: "não é lista" }),
        ],
      });

      expect(result.ok && result.board.strokes.map((s) => s.id)).toEqual(["s1"]);
      expect(result.ok && result.warnings).toHaveLength(5);
    });

    it("renomeia id de traço duplicado em vez de descartar", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [stroke(), stroke()],
      });

      expect(result.ok && result.board.strokes.map((s) => s.id)).toEqual(["s1", "s1-2"]);
      expect(result.ok && result.warnings).toHaveLength(1);
    });

    it("id de traço duplicado não colide com id de note", () => {
      // Traço e note vivem em listas separadas: ids iguais nas duas não são colisão, cada
      // objeto é dono do próprio espaço de identificadores.
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [note({ id: "s1" })],
        strokes: [stroke({ id: "s1" })],
      });

      expect(result.ok && result.board.notes.map((n) => n.id)).toEqual(["s1"]);
      expect(result.ok && result.board.strokes.map((s) => s.id)).toEqual(["s1"]);
      expect(result.ok && result.warnings).toEqual([]);
    });

    it("descarta pontos ímpares e não finitos sem quebrar o pareamento do resto", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [stroke({ points: [0, 0, Number.NaN, 5, 10, 10, 20] })],
      });

      // O par (NaN, 5) é descartado inteiro; o par final (20) sobra sem par e também cai.
      expect(result.ok && result.board.strokes[0]?.points).toEqual([0, 0, 10, 10]);
    });

    it("limita coordenadas de traço ao teto aceito", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [
          stroke({
            points: [-CANVAS_MAX_ABS_COORDINATE * 10, CANVAS_MAX_ABS_COORDINATE * 10, 0, 0],
          }),
        ],
      });

      expect(result.ok && result.board.strokes[0]?.points.slice(0, 2)).toEqual([
        -CANVAS_MAX_ABS_COORDINATE,
        CANVAS_MAX_ABS_COORDINATE,
      ]);
    });

    it("limita a quantidade de pontos por traço", () => {
      const manyPoints = Array.from({ length: (STROKE_MAX_POINTS + 50) * 2 }, (_, i) => i);
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [stroke({ points: manyPoints })],
      });

      expect(result.ok && result.board.strokes[0]?.points).toHaveLength(STROKE_MAX_POINTS * 2);
    });

    it("limita a quantidade de traços por board", () => {
      const manyStrokes = Array.from({ length: STROKE_MAX_COUNT + 10 }, (_, i) =>
        stroke({ id: `s${i}` }),
      );
      const result = parseBoard({ version: SCHEMA_VERSION, notes: [], strokes: manyStrokes });

      expect(result.ok && result.board.strokes).toHaveLength(STROKE_MAX_COUNT);
    });

    it("trata strokes ausente como lista vazia, sem aviso", () => {
      const result = parseBoard({ version: SCHEMA_VERSION, notes: [] });

      expect(result.ok && result.board.strokes).toEqual([]);
      expect(result.ok && result.warnings).toEqual([]);
    });

    it("trata strokes malformado (não é lista) como lista vazia, sem reprovar o board", () => {
      const result = parseBoard({ version: SCHEMA_VERSION, notes: [], strokes: "não é lista" });

      expect(result.ok && result.board.strokes).toEqual([]);
    });

    it("arredonda as coordenadas para inteiro na gravação", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [stroke({ points: [0.4, 10.5, -3.6, 7.49] })],
      });

      expect(result.ok && result.board.strokes[0]?.points).toEqual([0, 11, -4, 7]);
    });

    it("normaliza z para inteiro", () => {
      const result = parseBoard({
        version: SCHEMA_VERSION,
        notes: [],
        strokes: [stroke({ z: 3.7 })],
      });

      expect(result.ok && result.board.strokes[0]?.z).toBe(3);
    });
  });
});

describe("normalizeStroke", () => {
  it("devolve null para entrada que não é objeto", () => {
    expect(normalizeStroke(null)).toBeNull();
    expect(normalizeStroke("traço")).toBeNull();
  });

  it("devolve null sem id, sem cor válida ou sem pontos suficientes", () => {
    expect(normalizeStroke(stroke({ id: "" }))).toBeNull();
    expect(normalizeStroke(stroke({ color: -1 }))).toBeNull();
    expect(normalizeStroke(stroke({ points: [1, 2] }))).toBeNull();
  });

  it("normaliza um traço válido", () => {
    expect(normalizeStroke(stroke())).toEqual(stroke());
  });

  describe("ferramenta (#110)", () => {
    it("preserva a caneta tinteiro e o marca-texto", () => {
      expect(normalizeStroke(stroke({ tool: 1 }))).toEqual(stroke({ tool: 1 }));
      expect(normalizeStroke(stroke({ tool: 2 }))).toEqual(stroke({ tool: 2 }));
    });

    it("grava o lápis sem o campo, mesmo quando ele vem explícito", () => {
      expect(normalizeStroke(stroke({ tool: 0 }))).not.toHaveProperty("tool");
    });

    it("lê ferramenta inválida como lápis, sem descartar o traço", () => {
      for (const tool of [3, -1, 1.5, "1", null]) {
        const result = normalizeStroke(stroke({ tool }));
        expect(result).toEqual(stroke());
        expect(result).not.toHaveProperty("tool");
      }
    });

    /**
     * O critério de tamanho de link do PRD: um board só com lápis sai, depois de `tool`
     * existir, exatamente com o JSON que saía antes — só a versão muda.
     */
    it("serializa um board só com lápis igual ao de antes do campo", () => {
      const antes = { version: 2, notes: [note()], strokes: [stroke(), stroke({ id: "s2" })] };

      const result = parseBoard(antes);

      expect(result.ok).toBe(true);
      expect(result.ok && JSON.stringify(result.board.strokes)).toBe(JSON.stringify(antes.strokes));
    });
  });

  describe("espessura e opacidade (#153)", () => {
    it("preserva espessura e opacidade diferentes do padrão", () => {
      expect(normalizeStroke(stroke({ w: 7, o: 9 }))).toEqual(stroke({ w: 7, o: 9 }));
    });

    it("grava o padrão da ferramenta sem os campos, mesmo quando vêm explícitos", () => {
      const result = normalizeStroke(stroke({ w: 2, o: 19 }));
      expect(result).toEqual(stroke());
      expect(result).not.toHaveProperty("w");
      expect(result).not.toHaveProperty("o");
    });

    it("mede o padrão pela ferramenta do traço", () => {
      // 35% é o padrão do marca-texto: some nele, mas fica no lápis, onde é escolha.
      expect(normalizeStroke(stroke({ tool: 2, o: 6 }))).toEqual(stroke({ tool: 2 }));
      expect(normalizeStroke(stroke({ o: 6 }))).toEqual(stroke({ o: 6 }));
      // Cheio é escolha no marca-texto.
      expect(normalizeStroke(stroke({ tool: 2, o: 19 }))).toEqual(stroke({ tool: 2, o: 19 }));
    });

    it("mede o padrão pela ferramenta já normalizada", () => {
      // Ferramenta inválida vira lápis, e 35% deixa de ser o padrão.
      expect(normalizeStroke(stroke({ tool: 9, o: 6 }))).toEqual(stroke({ o: 6 }));
    });

    it("lê índice inválido como o padrão, sem descartar o traço", () => {
      for (const w of [8, -1, 1.5, "3", null]) {
        expect(normalizeStroke(stroke({ w }))).toEqual(stroke());
      }
      for (const o of [20, -1, 1.5, "3", null]) {
        expect(normalizeStroke(stroke({ o }))).toEqual(stroke());
      }
    });

    /** O critério de tamanho de link do PRD: a v3 sai, na v4, com o mesmo JSON de traços. */
    it("serializa um board da v3 igual ao de antes dos campos", () => {
      const antes = {
        version: 3,
        notes: [note()],
        strokes: [
          stroke(),
          { id: "s2", color: 0, tool: 1, points: [0, 0, 10, 10], z: 1 },
          { id: "s3", color: 0, tool: 2, points: [0, 0, 10, 10], z: 1 },
        ],
      };

      const result = parseBoard(antes);

      expect(result.ok).toBe(true);
      expect(result.ok && JSON.stringify(result.board.strokes)).toBe(JSON.stringify(antes.strokes));
    });
  });
});
