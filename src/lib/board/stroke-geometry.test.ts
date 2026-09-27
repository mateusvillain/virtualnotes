import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@/lib/canvas/coords";
import {
  ERASER_HIT_WIDTH,
  FOUNTAIN_MAX_WIDTH,
  FOUNTAIN_MIN_WIDTH,
  FOUNTAIN_NIB_ANGLE,
  HIGHLIGHTER_WIDTH,
  STROKE_MIN_SIZE,
  STROKE_WIDTH,
  eraserHitWidth,
  fountainOutline,
  fountainWidth,
  inkOverhang,
  polygonPath,
  scaleStrokePoints,
  strokeBounds,
  strokeInkBounds,
  strokeInkWidth,
  strokeIntersectsRect,
  strokeIntersectsSegment,
  strokePoints,
  translateStrokePoints,
  widenByInk,
} from "./stroke-geometry";
import {
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  STROKE_TOOL_PENCIL,
  type Stroke,
} from "./types";

function stroke(points: number[]): Stroke {
  return { id: "trc123", color: 6, points, z: 1 };
}

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

describe("strokePoints", () => {
  it("despacha a lista achatada aos pares", () => {
    expect(strokePoints(stroke([0, 1, 2, 3]))).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
  });

  /**
   * O contrato exige comprimento par, então isto não vem de dentro. Vem de um link antigo
   * ou de um board editado à mão — e meio ponto não é um ponto.
   */
  it("ignora um número solto no fim", () => {
    expect(strokePoints(stroke([0, 1, 2, 3, 9]))).toEqual([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
  });

  it("um traço sem pontos não tem ponto nenhum", () => {
    expect(strokePoints(stroke([]))).toEqual([]);
  });
});

describe("strokeBounds", () => {
  it("envolve todos os pontos", () => {
    expect(strokeBounds(stroke([10, 20, 50, 5, 30, 40]))).toEqual(rect(10, 5, 40, 35));
  });

  it("funciona com o traço desenhado da direita para a esquerda", () => {
    // A caixa não tem lado de partida: quem desenha de trás para a frente tem a mesma caixa.
    expect(strokeBounds(stroke([100, 100, 0, 0]))).toEqual(rect(0, 0, 100, 100));
  });

  /**
   * `null`, e não um retângulo na origem, pela mesma razão de `boundingRect`: quem ancora a
   * barra de ações pela caixa da seleção precisa distinguir "não tem forma" de "tem forma
   * colada no canto do canvas". Um retângulo inventado puxaria a barra para lá.
   */
  it("devolve null para um traço sem pontos", () => {
    expect(strokeBounds(stroke([]))).toBeNull();
  });
});

describe("strokeIntersectsRect", () => {
  it("pega o traço que passa por dentro do retângulo", () => {
    expect(strokeIntersectsRect(stroke([0, 50, 200, 50]), rect(50, 0, 100, 100))).toBe(true);
  });

  it("pega o traço inteirinho contido no retângulo", () => {
    // Nenhuma borda é cruzada aqui: quem responde é o teste de ponta dentro da caixa.
    expect(strokeIntersectsRect(stroke([60, 60, 70, 70]), rect(50, 50, 100, 100))).toBe(true);
  });

  it("pega o traço que atravessa de lado a lado sem ponta dentro", () => {
    // E aqui é o contrário: ponta nenhuma está dentro, e quem responde é o cruzamento com
    // as bordas. Os dois testes existem porque nenhum dos dois vê o caso do outro.
    expect(strokeIntersectsRect(stroke([0, 60, 500, 60]), rect(50, 50, 100, 100))).toBe(true);
  });

  /**
   * A razão de a conta ser segmento a segmento, e não pela caixa envolvente.
   *
   * Um risco na diagonal do canvas tem caixa enorme, e os cantos dela não têm tinta nenhuma.
   * Um retângulo desenhado num desses cantos tocaria a caixa e não tocaria o traço — e pela
   * caixa ele seria selecionado sem que nada visível justificasse.
   */
  it("não pega o canto vazio da caixa de um traço diagonal", () => {
    const diagonal = stroke([0, 0, 400, 400]);

    expect(strokeIntersectsRect(diagonal, rect(300, 10, 50, 50))).toBe(false);
    // O mesmo traço, com o retângulo agora em cima da tinta.
    expect(strokeIntersectsRect(diagonal, rect(180, 180, 50, 50))).toBe(true);
  });

  it("ignora o traço fora do retângulo", () => {
    expect(strokeIntersectsRect(stroke([0, 0, 10, 10]), rect(900, 900, 50, 50))).toBe(false);
  });

  /**
   * É o que um clique sem arrasto produz. Um retângulo sem área não toca nada, que é a
   * mesma resposta que `rectsIntersect` dá para o post-it.
   */
  it("não seleciona nada com retângulo de área nula", () => {
    expect(strokeIntersectsRect(stroke([0, 0, 100, 100]), rect(50, 50, 0, 0))).toBe(false);
  });

  it("um traço de um ponto só não tem segmento para ser tocado", () => {
    expect(strokeIntersectsRect(stroke([50, 50]), rect(0, 0, 100, 100))).toBe(false);
  });

  /** Todo segmento conta, e não só o primeiro: o rabisco pode voltar para dentro. */
  it("basta um segmento no meio do traço tocar", () => {
    const zigue = stroke([0, 0, 10, 10, 500, 500, 510, 510]);

    expect(strokeIntersectsRect(zigue, rect(200, 200, 50, 50))).toBe(true);
  });
});

describe("strokeIntersectsSegment", () => {
  it("pega o traço que o trecho da borracha atravessa", () => {
    expect(
      strokeIntersectsSegment(stroke([0, 50, 200, 50]), { x: 100, y: 0 }, { x: 100, y: 100 }),
    ).toBe(true);
  });

  it("ignora o traço fora do alcance do trecho", () => {
    expect(
      strokeIntersectsSegment(stroke([0, 0, 10, 10]), { x: 900, y: 900 }, { x: 950, y: 950 }),
    ).toBe(false);
  });

  /**
   * O toque sem arrasto — `a` igual a `b` — é o clique simples que o critério de aceite
   * pede. Sem alargar por `ERASER_HIT_WIDTH`, um ponto sozinho não tocaria segmento nenhum
   * mesmo em cima da tinta, porque `strokeIntersectsRect` não intersecta um retângulo sem
   * área (a mesma resposta que dá para o clique parado).
   */
  it("um ponto só, sem arrasto, ainda apaga o que estiver embaixo", () => {
    expect(
      strokeIntersectsSegment(stroke([0, 50, 200, 50]), { x: 100, y: 50 }, { x: 100, y: 50 }),
    ).toBe(true);
  });

  it("o alvo é mais largo que a tinta, para caber o dedo", () => {
    // A 5 unidades da linha: fora da tinta (2 de largura), mas dentro do alvo generoso.
    const perto = 5;
    expect(perto).toBeLessThan(ERASER_HIT_WIDTH / 2);

    expect(
      strokeIntersectsSegment(
        stroke([0, 50, 200, 50]),
        { x: 100, y: 50 + perto },
        { x: 100, y: 50 + perto },
      ),
    ).toBe(true);
  });

  it("um `hitWidth` explícito substitui o padrão", () => {
    expect(
      strokeIntersectsSegment(stroke([0, 50, 200, 50]), { x: 100, y: 60 }, { x: 100, y: 60 }, 4),
    ).toBe(false);
  });
});

describe("translateStrokePoints", () => {
  it("desloca x e y, cada um no próprio eixo", () => {
    expect(translateStrokePoints(stroke([0, 0, 10, 20]), { x: 5, y: -3 })).toEqual([5, -3, 15, 17]);
  });

  it("deslocamento nulo devolve os mesmos números", () => {
    expect(translateStrokePoints(stroke([1, 2, 3, 4]), { x: 0, y: 0 })).toEqual([1, 2, 3, 4]);
  });
});

describe("scaleStrokePoints", () => {
  const de = { x: 0, y: 0, w: 100, h: 100 };

  it("dobra o traço ancorando no canto de partida", () => {
    const dobrado = scaleStrokePoints(stroke([0, 0, 50, 100]), de, { w: 200, h: 200 });

    // O canto de partida fica parado, e o resto se afasta dele na proporção.
    expect(dobrado).toEqual([0, 0, 100, 200]);
  });

  it("ancora no canto de partida mesmo longe da origem", () => {
    const caixa = { x: 100, y: 100, w: 100, h: 100 };
    const dobrado = scaleStrokePoints(stroke([100, 100, 200, 200]), caixa, { w: 200, h: 200 });

    expect(dobrado).toEqual([100, 100, 300, 300]);
  });

  it("encolher também vale", () => {
    expect(scaleStrokePoints(stroke([0, 0, 100, 100]), de, { w: 50, h: 50 })).toEqual([
      0, 0, 50, 50,
    ]);
  });

  it("tamanho igual devolve o traço onde estava", () => {
    expect(scaleStrokePoints(stroke([10, 20, 30, 40]), de, { w: 100, h: 100 })).toEqual([
      10, 20, 30, 40,
    ]);
  });

  /**
   * Um risco perfeitamente horizontal não tem altura. Multiplicar por `size.h / 0` daria
   * `Infinity` ou `NaN` em todo ponto, e o traço sumiria do quadro em vez de crescer.
   */
  it("não divide por zero num eixo sem extensão", () => {
    const horizontal = stroke([0, 50, 100, 50]);
    const chato = { x: 0, y: 50, w: 100, h: 0 };

    const esticado = scaleStrokePoints(horizontal, chato, { w: 200, h: STROKE_MIN_SIZE });

    expect(esticado).toEqual([0, 50, 200, 50]);
    expect(esticado.every((value) => Number.isFinite(value))).toBe(true);
  });
});

/**
 * O marca-texto é largo (#116), e os alvos precisam acertar a tinta que se vê, e não só a
 * linha do meio (#118). O lápis, com sobra zero, não muda em nada.
 */
describe("tinta larga do marca-texto (#118)", () => {
  const sobra = (HIGHLIGHTER_WIDTH - STROKE_WIDTH) / 2;

  function destaque(points: number[]): Stroke {
    return { ...stroke(points), tool: STROKE_TOOL_HIGHLIGHTER };
  }

  it("a sobra do lápis é zero; a do marca-texto é o que passa dele de cada lado", () => {
    expect(inkOverhang(STROKE_TOOL_PENCIL)).toBe(0);
    expect(inkOverhang(STROKE_TOOL_HIGHLIGHTER)).toBe(sobra);
  });

  it("a borracha do lápis continua do mesmo tamanho, e a do marca-texto cresce pela sobra", () => {
    expect(eraserHitWidth(STROKE_TOOL_PENCIL)).toBe(ERASER_HIT_WIDTH);
    expect(eraserHitWidth(STROKE_TOOL_HIGHLIGHTER)).toBe(ERASER_HIT_WIDTH + sobra * 2);
  });

  it("o retângulo que só encosta na borda do destaque o toca", () => {
    // Linha do meio em y = 0; a borda visível vai até y = 8.
    const borda = rect(0, sobra, 10, 2);

    expect(strokeIntersectsRect(destaque([0, 0, 100, 0]), borda)).toBe(true);
    expect(strokeIntersectsRect(stroke([0, 0, 100, 0]), borda)).toBe(false);
  });

  it("o retângulo além da borda não toca", () => {
    expect(strokeIntersectsRect(destaque([0, 0, 100, 0]), rect(0, sobra + 2, 10, 2))).toBe(false);
  });

  it("a caixa da tinta envolve o destaque inteiro, mesmo numa linha reta", () => {
    expect(strokeInkBounds(destaque([0, 0, 100, 0]))).toEqual(
      rect(-sobra, -sobra, 100 + sobra * 2, sobra * 2),
    );
  });

  it("alarga qualquer alvo do lápis pela sobra, e o do lápis fica como está", () => {
    expect(widenByInk(12, STROKE_TOOL_PENCIL)).toBe(12);
    expect(widenByInk(12, STROKE_TOOL_HIGHLIGHTER)).toBe(12 + sobra * 2);
  });

  it("a caixa da tinta do lápis é a mesma caixa dos pontos", () => {
    expect(strokeInkBounds(stroke([0, 0, 100, 50]))).toEqual(strokeBounds(stroke([0, 0, 100, 50])));
  });
});

describe("fountainWidth", () => {
  it("é o fio quando o movimento corre paralelo à pena (↗ e ↙)", () => {
    expect(fountainWidth({ x: 1, y: -1 })).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
    expect(fountainWidth({ x: -1, y: 1 })).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
  });

  it("é a pena inteira quando o movimento corre perpendicular a ela (↘ e ↖)", () => {
    expect(fountainWidth({ x: 1, y: 1 })).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
    expect(fountainWidth({ x: -1, y: -1 })).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
  });

  /** A 45° da pena, horizontal e vertical ficam no mesmo meio-termo. */
  it("dá a mesma espessura intermediária na horizontal e na vertical", () => {
    const meio =
      FOUNTAIN_MIN_WIDTH + (FOUNTAIN_MAX_WIDTH - FOUNTAIN_MIN_WIDTH) * Math.sin(FOUNTAIN_NIB_ANGLE);

    expect(fountainWidth({ x: 10, y: 0 })).toBeCloseTo(meio);
    expect(fountainWidth({ x: 0, y: 10 })).toBeCloseTo(meio);
  });

  it("não depende do comprimento do movimento", () => {
    expect(fountainWidth({ x: 3, y: 3 })).toBeCloseTo(fountainWidth({ x: 300, y: 300 }));
  });

  it("fica no fio para um movimento nulo, sem dividir por zero", () => {
    expect(fountainWidth({ x: 0, y: 0 })).toBe(FOUNTAIN_MIN_WIDTH);
  });
});

describe("fountainOutline", () => {
  /** Distância entre as duas bordas no vértice `index` do traço. */
  function larguraEm(outline: Point[], index: number): number {
    const a = outline[index]!;
    const b = outline[outline.length - 1 - index]!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  it("contorna um traço com as duas bordas: ida por um lado, volta pelo outro", () => {
    const outline = fountainOutline([0, 0, 100, 0, 200, 0]);

    expect(outline).toHaveLength(6);
    // Horizontal: um lado acima da linha, o outro abaixo, nas mesmas abscissas.
    expect(outline.map((point) => Math.round(point.x))).toEqual([0, 100, 200, 200, 100, 0]);
    expect(Math.sign(outline[0]!.y)).toBe(-Math.sign(outline[5]!.y));
  });

  it("tem a espessura do meio-termo num traço horizontal e num vertical", () => {
    const horizontal = fountainOutline([0, 0, 100, 0]);
    const vertical = fountainOutline([0, 0, 0, 100]);

    expect(larguraEm(horizontal, 0)).toBeCloseTo(fountainWidth({ x: 1, y: 0 }));
    expect(larguraEm(vertical, 0)).toBeCloseTo(fountainWidth({ x: 0, y: 1 }));
  });

  it("sai no fio na diagonal paralela à pena", () => {
    const outline = fountainOutline([0, 100, 100, 0]);

    expect(larguraEm(outline, 0)).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
    expect(larguraEm(outline, 1)).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
  });

  it("sai na largura inteira da pena na diagonal perpendicular", () => {
    const outline = fountainOutline([0, 0, 100, 100]);

    expect(larguraEm(outline, 0)).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
    expect(larguraEm(outline, 1)).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
  });

  /**
   * Na junta entre um trecho no fio e um na largura inteira, a espessura é a média dos dois:
   * a largura muda ao longo dos trechos, e não salta no vértice.
   */
  it("faz a transição da espessura na junta, sem salto", () => {
    const outline = fountainOutline([0, 100, 100, 0, 200, 100]);

    expect(larguraEm(outline, 0)).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
    // Medida na bissetriz, a largura da junta de 90° é a média dividida pela mitra: na
    // perpendicular a cada trecho, é a média.
    expect(larguraEm(outline, 1) * Math.SQRT1_2).toBeCloseTo(
      (FOUNTAIN_MIN_WIDTH + FOUNTAIN_MAX_WIDTH) / 2,
    );
    expect(larguraEm(outline, 2)).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
  });

  /** Sem bico: a borda na junta fica perto do vértice, e não disparada para longe dele. */
  it("dobra a esquina sem abrir um bico", () => {
    const outline = fountainOutline([0, 0, 100, 0, 100, 100]);
    const junta = { x: 100, y: 0 };

    for (const borda of [outline[1]!, outline[outline.length - 2]!]) {
      expect(Math.hypot(borda.x - junta.x, borda.y - junta.y)).toBeLessThanOrEqual(
        FOUNTAIN_MAX_WIDTH / 2,
      );
    }
  });

  /**
   * Na junta, a borda sai pela bissetriz; sem compensar a mitra, a tinta afinaria na esquina
   * (a ~0,71 da espessura numa junta de 90°). A distância da borda a cada trecho é a
   * meia-largura dele.
   */
  it("mantém a espessura na junta, sem estrangular a esquina", () => {
    // Horizontal e vertical: mesma espessura dos dois lados da junta. A borda fica a essa
    // meia-largura de cada trecho, a menos que a mitra passe da meia pena — aí o teto vale.
    const outline = fountainOutline([0, 0, 100, 0, 100, 100]);
    const meia = Math.min(
      fountainWidth({ x: 1, y: 0 }) / 2,
      (FOUNTAIN_MAX_WIDTH / 2) * Math.SQRT1_2,
    );
    const semMitra = (fountainWidth({ x: 1, y: 0 }) / 2) * Math.SQRT1_2;
    const borda = outline[outline.length - 2]!;

    // Distância da borda à reta do primeiro trecho (y = 0) e à do segundo (x = 100).
    expect(Math.abs(borda.y)).toBeCloseTo(meia);
    expect(Math.abs(borda.x - 100)).toBeCloseTo(meia);
    expect(meia).toBeGreaterThan(semMitra);
  });

  it("não deixa a borda passar da meia pena numa volta fechada", () => {
    const outline = fountainOutline([0, 0, 100, 0, 0, 5]);

    for (const [index, ponto] of [
      [0, 0],
      [100, 0],
      [0, 5],
    ].entries()) {
      const bordas = [outline[index]!, outline[outline.length - 1 - index]!];
      for (const borda of bordas) {
        expect(Math.hypot(borda.x - ponto[0]!, borda.y - ponto[1]!)).toBeLessThanOrEqual(
          FOUNTAIN_MAX_WIDTH / 2 + 1e-9,
        );
      }
    }
  });

  it("não quebra num traço que volta sobre si mesmo", () => {
    const outline = fountainOutline([0, 0, 100, 0, 0, 0]);

    expect(outline).toHaveLength(6);
    for (const point of outline) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });

  it("não produz polígono degenerado num traço quase reto", () => {
    const outline = fountainOutline([0, 0, 100, 0.001, 200, 0]);

    for (const point of outline) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
    expect(larguraEm(outline, 1)).toBeGreaterThan(FOUNTAIN_MIN_WIDTH);
  });

  it("ignora pontos repetidos em sequência", () => {
    expect(fountainOutline([0, 0, 0, 0, 100, 0, 100, 0])).toEqual(fountainOutline([0, 0, 100, 0]));
  });

  it("desenha a marca da pena parada num traço de dois pontos iguais", () => {
    const outline = fountainOutline([50, 50, 50, 50]);

    expect(outline).toHaveLength(4);
    const [a, b, c] = outline as [Point, Point, Point];
    // A diagonal do retângulo é a pena inteira: cabe no alcance que os alvos consideram.
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(FOUNTAIN_MAX_WIDTH);
    expect(Math.hypot(c.x - b.x, c.y - b.y)).toBeCloseTo(FOUNTAIN_MIN_WIDTH);
    // Centrada no ponto.
    const centro = outline.reduce((soma, p) => ({ x: soma.x + p.x / 4, y: soma.y + p.y / 4 }), {
      x: 0,
      y: 0,
    });
    expect(centro.x).toBeCloseTo(50);
    expect(centro.y).toBeCloseTo(50);
  });

  it("não tem contorno sem pontos", () => {
    expect(fountainOutline([])).toEqual([]);
  });
});

describe("polygonPath", () => {
  it("escreve o polígono como um caminho fechado", () => {
    expect(
      polygonPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toBe("M0 0L10 0L10 5Z");
  });

  it("é vazio para um polígono sem pontos", () => {
    expect(polygonPath([])).toBe("");
  });
});

describe("alvo da caneta tinteiro (#115)", () => {
  const sobra = (FOUNTAIN_MAX_WIDTH - STROKE_WIDTH) / 2;

  function caneta(points: number[]): Stroke {
    return { ...stroke(points), tool: STROKE_TOOL_FOUNTAIN };
  }

  it("a tinta da caneta, para os alvos, é a pena inteira", () => {
    expect(strokeInkWidth(STROKE_TOOL_FOUNTAIN)).toBe(FOUNTAIN_MAX_WIDTH);
    expect(inkOverhang(STROKE_TOOL_FOUNTAIN)).toBe(sobra);
  });

  /** Nenhum ponto do contorno passa da metade da pena, então o alvo cobre toda a tinta. */
  it("o contorno nunca passa da metade da largura que o alvo considera", () => {
    const tracos = [
      [0, 0, 100, 100],
      [0, 100, 100, 0],
      [0, 0, 100, 0, 100, 100, 0, 100],
      [0, 0, 50, 80, 90, 10, 140, 60],
      [10, 10, 10, 10],
    ];

    for (const pontos of tracos) {
      const linha = strokePoints(caneta(pontos));
      for (const vertice of fountainOutline(pontos)) {
        const perto = Math.min(
          ...linha.map((ponto) => Math.hypot(ponto.x - vertice.x, ponto.y - vertice.y)),
        );
        expect(perto).toBeLessThanOrEqual(strokeInkWidth(STROKE_TOOL_FOUNTAIN) / 2 + 1e-9);
      }
    }
  });

  it("o retângulo na borda da tinta toca a caneta, e não um lápis no mesmo lugar", () => {
    // Como no marca-texto, o retângulo conta a partir da borda do lápis: a sobra de 1,5 além
    // da linha do meio. Na horizontal a tinta vai a ~1,9 dela, então 1,4 ainda é tinta.
    const borda = rect(40, 1.4, 10, 0.05);
    expect(fountainWidth({ x: 1, y: 0 }) / 2).toBeGreaterThan(1.4);

    expect(strokeIntersectsRect(caneta([0, 0, 100, 0]), borda)).toBe(true);
    expect(strokeIntersectsRect(stroke([0, 0, 100, 0]), borda)).toBe(false);
  });

  it("a borracha da caneta cresce pela sobra, e a do lápis fica como está", () => {
    expect(eraserHitWidth(STROKE_TOOL_FOUNTAIN)).toBe(ERASER_HIT_WIDTH + sobra * 2);
    expect(eraserHitWidth(STROKE_TOOL_PENCIL)).toBe(ERASER_HIT_WIDTH);
  });

  it("a caixa da tinta envolve a pena numa linha reta", () => {
    expect(strokeInkBounds(caneta([0, 0, 100, 0]))).toEqual(
      rect(-sobra, -sobra, 100 + sobra * 2, sobra * 2),
    );
  });
});
