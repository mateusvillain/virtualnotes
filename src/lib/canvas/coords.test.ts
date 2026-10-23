import { describe, expect, it } from "vitest";
import {
  boundingRect,
  rectToScreen,
  canvasToScreen,
  clampScale,
  distance,
  FIT_PADDING,
  fitViewport,
  IDENTITY_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  rectsIntersect,
  segmentIntersectsRect,
  scaleAsPercent,
  screenToCanvas,
  topLeftCenteredAt,
  type Viewport,
  zoomAt,
  zoomByFactor,
} from "./coords";

const viewport: Viewport = { x: 120, y: -40, scale: 2 };

describe("screenToCanvas / canvasToScreen", () => {
  it("no viewport identidade, tela e canvas coincidem", () => {
    expect(screenToCanvas({ x: 30, y: 70 }, IDENTITY_VIEWPORT)).toEqual({ x: 30, y: 70 });
    expect(canvasToScreen({ x: 30, y: 70 }, IDENTITY_VIEWPORT)).toEqual({ x: 30, y: 70 });
  });

  it("desconta o deslocamento e a escala", () => {
    expect(screenToCanvas({ x: 220, y: 60 }, viewport)).toEqual({ x: 50, y: 50 });
  });

  it("uma é a inversa da outra", () => {
    const pontos = [
      { x: 0, y: 0 },
      { x: 13.5, y: -998 },
      { x: -4000, y: 2500 },
    ];

    for (const ponto of pontos) {
      const ida = canvasToScreen(ponto, viewport);
      const volta = screenToCanvas(ida, viewport);

      expect(volta.x).toBeCloseTo(ponto.x, 10);
      expect(volta.y).toBeCloseTo(ponto.y, 10);
    }
  });
});

describe("clampScale", () => {
  it("mantém a escala dentro dos limites", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(1.5)).toBe(1.5);
  });

  it("cai para 100% no NaN e para o extremo no infinito", () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(MIN_SCALE);
  });
});

describe("panBy", () => {
  it("desloca sem mexer na escala", () => {
    expect(panBy(viewport, 10, -5)).toEqual({ x: 130, y: -45, scale: 2 });
  });
});

describe("zoomAt", () => {
  it("mantém sob o cursor o mesmo ponto do canvas", () => {
    const anchor = { x: 300, y: 200 };
    const antes = screenToCanvas(anchor, viewport);
    const depois = screenToCanvas(anchor, zoomAt(viewport, 3.5, anchor));

    expect(depois.x).toBeCloseTo(antes.x, 10);
    expect(depois.y).toBeCloseTo(antes.y, 10);
  });

  it("respeita os limites de escala, sem soltar a âncora", () => {
    const anchor = { x: 80, y: 80 };
    const ampliado = zoomAt(viewport, 100, anchor);

    expect(ampliado.scale).toBe(MAX_SCALE);
    expect(screenToCanvas(anchor, ampliado).x).toBeCloseTo(screenToCanvas(anchor, viewport).x, 10);
  });

  it("ancorar na origem da tela com viewport identidade não move nada", () => {
    expect(zoomAt(IDENTITY_VIEWPORT, 2, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, scale: 2 });
  });
});

describe("zoomByFactor", () => {
  it("multiplica a escala atual", () => {
    expect(zoomByFactor(IDENTITY_VIEWPORT, 1.5, { x: 0, y: 0 }).scale).toBe(1.5);
    expect(zoomByFactor(viewport, 0.5, { x: 0, y: 0 }).scale).toBe(1);
  });
});

describe("scaleAsPercent", () => {
  it("mostra a escala como porcentagem inteira", () => {
    expect(scaleAsPercent(1)).toBe(100);
    expect(scaleAsPercent(0.255)).toBe(26);
  });
});

describe("topLeftCenteredAt", () => {
  it("devolve o canto que põe o centro da caixa no ponto pedido", () => {
    expect(topLeftCenteredAt({ x: 300, y: 240 }, { w: 200, h: 200 })).toEqual({ x: 200, y: 140 });
  });

  it("aceita caixa de lado ímpar sem arredondar por conta própria", () => {
    // Arredondar aqui empurraria o post-it meio pixel para um lado; quem decide inteiros é
    // quem grava na store (#16), não a geometria.
    expect(topLeftCenteredAt({ x: 0, y: 0 }, { w: 75, h: 41 })).toEqual({ x: -37.5, y: -20.5 });
  });

  it("é a inversa de somar meia caixa", () => {
    const centro = { x: -120.5, y: 88 };
    const size = { w: 200, h: 160 };
    const canto = topLeftCenteredAt(centro, size);

    expect({ x: canto.x + size.w / 2, y: canto.y + size.h / 2 }).toEqual(centro);
  });
});

describe("rectsIntersect", () => {
  const base = { x: 0, y: 0, w: 100, h: 100 };

  it("reconhece sobreposição parcial", () => {
    expect(rectsIntersect(base, { x: 50, y: 50, w: 100, h: 100 })).toBe(true);
  });

  it("reconhece um retângulo inteiramente dentro do outro, dos dois lados", () => {
    expect(rectsIntersect(base, { x: -10, y: -10, w: 200, h: 200 })).toBe(true);
    expect(rectsIntersect(base, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
  });

  it("não conta encostar como intersectar", () => {
    expect(rectsIntersect(base, { x: -50, y: 0, w: 50, h: 100 })).toBe(false);
  });

  it("retângulo sem área não toca nada, nem o que está embaixo dele", () => {
    // É o que um clique, ou um arrasto de um eixo só, produz.
    expect(rectsIntersect(base, { x: 50, y: 50, w: 0, h: 0 })).toBe(false);
    expect(rectsIntersect(base, { x: 0, y: 50, w: 100, h: 0 })).toBe(false);
  });

  it("ignora retângulos separados", () => {
    expect(rectsIntersect(base, { x: 500, y: 500, w: 10, h: 10 })).toBe(false);
  });
});

describe("segmentIntersectsRect", () => {
  const caixa = { x: 100, y: 100, w: 100, h: 100 };

  it("pega o segmento inteiro dentro do retângulo", () => {
    expect(segmentIntersectsRect({ x: 120, y: 120 }, { x: 150, y: 150 }, caixa)).toBe(true);
  });

  it("pega o segmento com uma ponta dentro e outra fora", () => {
    expect(segmentIntersectsRect({ x: 150, y: 150 }, { x: 900, y: 900 }, caixa)).toBe(true);
  });

  it("pega o segmento que atravessa sem ponta nenhuma dentro", () => {
    expect(segmentIntersectsRect({ x: 0, y: 150 }, { x: 900, y: 150 }, caixa)).toBe(true);
  });

  /**
   * O caso que derruba um teste de cruzamento estrito: a 45° sobre um retângulo quadrado, a
   * linha entra e sai exatamente pelos cantos. Ela corta o retângulo ao meio, e responder
   * "não tocou" aqui deixaria de fora justamente a travessia mais franca que existe.
   */
  it("pega a diagonal que entra e sai pelos cantos", () => {
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 400, y: 400 }, caixa)).toBe(true);
  });

  it("ignora o segmento que passa longe", () => {
    expect(segmentIntersectsRect({ x: 0, y: 0 }, { x: 50, y: 50 }, caixa)).toBe(false);
  });

  it("ignora o segmento paralelo que corre por fora", () => {
    expect(segmentIntersectsRect({ x: 0, y: 500 }, { x: 900, y: 500 }, caixa)).toBe(false);
  });

  it("pega o segmento paralelo que corre por dentro", () => {
    expect(segmentIntersectsRect({ x: 0, y: 150 }, { x: 900, y: 150 }, caixa)).toBe(true);
  });

  /**
   * Um segmento sem comprimento é um ponto, e a pergunta vira "este ponto está dentro?".
   * Cai no ramo paralelo nas quatro bordas de uma vez, que é o que o algoritmo faz com ele.
   */
  it("um ponto dentro do retângulo conta, e um fora não", () => {
    expect(segmentIntersectsRect({ x: 150, y: 150 }, { x: 150, y: 150 }, caixa)).toBe(true);
    expect(segmentIntersectsRect({ x: 10, y: 10 }, { x: 10, y: 10 }, caixa)).toBe(false);
  });

  it("retângulo sem área não é tocado por nada", () => {
    // Mesma regra de `rectsIntersect`, e pelo mesmo motivo: é o que um clique sem arrasto
    // produz, e ele não pode marcar tudo que passa pelo ponto clicado.
    expect(
      segmentIntersectsRect({ x: 0, y: 0 }, { x: 400, y: 400 }, { x: 150, y: 150, w: 0, h: 0 }),
    ).toBe(false);
  });
});

describe("distance", () => {
  it("mede em linha reta, e não por eixo", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("acumula o gesto lento que um limite por passo deixaria escapar", () => {
    const origem = { x: 0, y: 0 };
    // Três passos de dois pixels: nenhum passa de uma folga de 4, mas o gesto andou 6.
    expect(distance(origem, { x: 6, y: 0 })).toBeGreaterThan(4);
  });
});

describe("boundingRect", () => {
  it("devolve null para lista vazia", () => {
    // "Nada selecionado" e "seleção na origem" precisam ser distinguíveis por quem posiciona
    // um controle pela caixa.
    expect(boundingRect([])).toBeNull();
  });

  it("de um retângulo só, é ele mesmo", () => {
    expect(boundingRect([{ x: 10, y: 20, w: 30, h: 40 }])).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it("envolve retângulos separados", () => {
    expect(
      boundingRect([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 90, y: 40, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it("envolve um retângulo contido em outro", () => {
    expect(
      boundingRect([
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 20, y: 20, w: 10, h: 10 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("lida com coordenadas negativas", () => {
    expect(
      boundingRect([
        { x: -50, y: -30, w: 10, h: 10 },
        { x: 10, y: 10, w: 10, h: 10 },
      ]),
    ).toEqual({ x: -50, y: -30, w: 70, h: 50 });
  });

  it("não depende da ordem da lista", () => {
    const a = { x: 5, y: 5, w: 10, h: 10 };
    const b = { x: -5, y: 40, w: 10, h: 10 };

    expect(boundingRect([a, b])).toEqual(boundingRect([b, a]));
  });
});

describe("rectToScreen", () => {
  it("é identidade no viewport identidade", () => {
    expect(rectToScreen({ x: 10, y: 20, w: 30, h: 40 }, IDENTITY_VIEWPORT)).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40,
    });
  });

  it("escala posição e dimensões juntas", () => {
    expect(rectToScreen({ x: 10, y: 20, w: 30, h: 40 }, { x: 0, y: 0, scale: 2 })).toEqual({
      x: 20,
      y: 40,
      w: 60,
      h: 80,
    });
  });

  it("desloca pelo pan sem esticar as dimensões", () => {
    expect(rectToScreen({ x: 10, y: 20, w: 30, h: 40 }, { x: 100, y: -50, scale: 1 })).toEqual({
      x: 110,
      y: -30,
      w: 30,
      h: 40,
    });
  });

  it("concorda com canvasToScreen no canto", () => {
    const viewport = { x: 17, y: -3, scale: 1.5 };
    const rect = { x: 10, y: 20, w: 30, h: 40 };

    const { x, y } = rectToScreen(rect, viewport);
    expect({ x, y }).toEqual(canvasToScreen(rect, viewport));
  });
});

describe("fitViewport", () => {
  const area = { w: 1000, h: 800 };

  it("sem conteúdo, volta ao viewport inicial", () => {
    expect(fitViewport(null, area)).toEqual(IDENTITY_VIEWPORT);
  });

  it("enquadra o conteúdo centrado, com o respiro da moldura", () => {
    // Útil: 840 × 640. O conteúdo de 420 × 160 cabe em 200% pela largura.
    const fit = fitViewport({ x: 100, y: 50, w: 420, h: 160 }, area);

    expect(fit.scale).toBe(2);
    const centro = screenToCanvas({ x: area.w / 2, y: area.h / 2 }, fit);
    expect(centro).toEqual({ x: 310, y: 130 });
    expect(canvasToScreen({ x: 100, y: 50 }, fit).x).toBe(FIT_PADDING);
  });

  it("o lado mais apertado decide a escala", () => {
    // Pela altura: 640 / 1280 = 50%, mesmo com largura de sobra.
    expect(fitViewport({ x: 0, y: 0, w: 100, h: 1280 }, area).scale).toBe(0.5);
  });

  it("um post-it sozinho não passa do zoom máximo", () => {
    expect(fitViewport({ x: 0, y: 0, w: 10, h: 10 }, area).scale).toBe(MAX_SCALE);
  });

  it("um quadro enorme para no zoom mínimo, ainda centrado", () => {
    const fit = fitViewport({ x: -5000, y: -5000, w: 10000, h: 10000 }, area);

    expect(fit.scale).toBe(MIN_SCALE);
    expect(screenToCanvas({ x: area.w / 2, y: area.h / 2 }, fit)).toEqual({ x: 0, y: 0 });
  });

  it("um traço reto, sem altura, é limitado só pela largura", () => {
    expect(fitViewport({ x: 0, y: 0, w: 420, h: 0 }, area).scale).toBe(2);
  });

  it("numa área menor que o respiro, ainda usa metade dela", () => {
    expect(fitViewport({ x: 0, y: 0, w: 100, h: 100 }, { w: 120, h: 120 }).scale).toBe(0.6);
  });
});
