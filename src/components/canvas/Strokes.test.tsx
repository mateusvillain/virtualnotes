import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HIGHLIGHTER_OPACITY,
  HighlighterPreviewContext,
  STROKE_HIT_WIDTH,
  StrokePreview,
  Strokes,
  polylinePoints,
} from "./Strokes";
import {
  HIGHLIGHTER_WIDTH,
  STROKE_WIDTH,
  fountainOutline,
  polygonPath,
  scaleStrokePoints,
} from "@/lib/board/stroke-geometry";
import { simplify } from "@/lib/canvas/simplify";
import {
  STROKE_COLORS,
  STROKE_OPACITIES,
  STROKE_SIZES,
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  type Stroke,
} from "@/lib/board/types";

function stroke(overrides: Partial<Stroke> = {}): Stroke {
  return { id: "s1", color: 6, points: [0, 0, 10, 10], z: 1, ...overrides };
}

function desenhados(): (string | null)[] {
  return screen.queryAllByTestId("stroke").map((element) => element.getAttribute("points"));
}

describe("polylinePoints", () => {
  it("converte a lista achatada do contrato no formato do SVG", () => {
    expect(polylinePoints([0, 0, 10, 20, -3, 4])).toBe("0,0 10,20 -3,4");
  });

  it("ignora uma coordenada solta no fim, que não forma ponto", () => {
    expect(polylinePoints([0, 0, 10, 20, 7])).toBe("0,0 10,20");
  });

  it("devolve vazio para lista vazia", () => {
    expect(polylinePoints([])).toBe("");
  });
});

describe("Strokes", () => {
  it("desenha um polyline por traço", () => {
    render(<Strokes strokes={[stroke(), stroke({ id: "s2", points: [5, 5, 6, 6] })]} />);

    expect(desenhados()).toEqual(["0,0 10,10", "5,5 6,6"]);
  });

  it("desenha do menor z para o maior, que é quem fica por cima", () => {
    render(
      <Strokes
        strokes={[
          stroke({ id: "cima", z: 9, points: [1, 1, 2, 2] }),
          stroke({ id: "baixo", z: 2, points: [3, 3, 4, 4] }),
        ]}
      />,
    );

    // O último do documento é o último a ser pintado: o de maior z.
    expect(desenhados()).toEqual(["3,3 4,4", "1,1 2,2"]);
  });

  it("não reordena a lista que recebeu", () => {
    const strokes = [stroke({ id: "a", z: 9 }), stroke({ id: "b", z: 1 })];

    render(<Strokes strokes={strokes} />);

    expect(strokes.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("pinta cada traço com a cor do índice que ele guarda", () => {
    render(<Strokes strokes={[stroke({ color: 0 }), stroke({ id: "s2", color: 6 })]} />);

    const cores = screen
      .queryAllByTestId("stroke")
      .map((element) => element.getAttribute("stroke"));
    expect(cores).toEqual(["var(--color-note-yellow)", "var(--color-ink)"]);
  });

  it("cobre a paleta inteira sem cor indefinida", () => {
    const todas = STROKE_COLORS.map((_, index) =>
      stroke({ id: `s${index}`, color: index as Stroke["color"] }),
    );

    render(<Strokes strokes={todas} />);

    const cores = screen
      .queryAllByTestId("stroke")
      .map((element) => element.getAttribute("stroke"));
    expect(cores).toHaveLength(STROKE_COLORS.length);
    expect(cores.some((cor) => cor?.includes("undefined"))).toBe(false);
  });

  it("não captura ponteiro: tinta não é alvo de clique", () => {
    render(<Strokes strokes={[stroke()]} />);

    expect(screen.getByTestId("strokes").getAttribute("class")).toContain("pointer-events-none");
  });

  it("desenha o quadro vazio sem traço nenhum", () => {
    render(<Strokes strokes={[]} />);

    expect(desenhados()).toEqual([]);
  });
});

describe("Strokes — marca-texto (#116)", () => {
  function tintas(): Element[] {
    return screen.queryAllByTestId("stroke");
  }

  it("pinta o marca-texto largo e translúcido", () => {
    render(<Strokes strokes={[stroke({ tool: STROKE_TOOL_HIGHLIGHTER })]} />);

    expect(tintas()[0]?.getAttribute("stroke-width")).toBe(String(HIGHLIGHTER_WIDTH));
    expect(tintas()[0]?.getAttribute("opacity")).toBe(String(HIGHLIGHTER_OPACITY));
  });

  it("não muda o lápis: fino e opaco", () => {
    render(<Strokes strokes={[stroke()]} />);

    expect(tintas()[0]?.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH));
    expect(tintas()[0]?.hasAttribute("opacity")).toBe(false);
  });

  /**
   * A opacidade vai no elemento, e não na cor: composto como uma camada só, o marca-texto
   * que cruza a si mesmo não escurece no cruzamento.
   */
  it("aplica a opacidade à linha inteira, e não à cor", () => {
    render(<Strokes strokes={[stroke({ tool: STROKE_TOOL_HIGHLIGHTER, color: 0 })]} />);

    expect(tintas()[0]?.getAttribute("stroke")).toBe("var(--color-note-yellow)");
    expect(tintas()[0]?.getAttribute("stroke-opacity")).toBeNull();
  });

  it("fica atrás dos outros traços, qualquer que seja o z", () => {
    render(
      <Strokes
        strokes={[
          stroke({ id: "lapis", z: 1, points: [1, 1, 2, 2] }),
          stroke({ id: "destaque", z: 9, tool: STROKE_TOOL_HIGHLIGHTER, points: [3, 3, 4, 4] }),
          stroke({ id: "caneta", z: 5, tool: STROKE_TOOL_FOUNTAIN, points: [5, 5, 6, 6] }),
        ]}
      />,
    );

    expect(
      screen.getAllByTestId("stroke-group").map((group) => group.getAttribute("data-stroke-id")),
    ).toEqual(["destaque", "lapis", "caneta"]);
  });

  it("desenha a prévia do marca-texto entre os destaques e o resto da tinta", () => {
    render(
      <HighlighterPreviewContext.Provider
        value={{
          points: [
            { x: 7, y: 7 },
            { x: 8, y: 8 },
          ],
          color: 0,
          tool: STROKE_TOOL_HIGHLIGHTER,
        }}
      >
        <Strokes
          strokes={[
            stroke({ id: "lapis", z: 1, points: [1, 1, 2, 2] }),
            stroke({ id: "destaque", z: 9, tool: STROKE_TOOL_HIGHLIGHTER, points: [3, 3, 4, 4] }),
          ]}
        />
      </HighlighterPreviewContext.Provider>,
    );

    const linhas = [...screen.getByTestId("strokes").querySelectorAll("polyline")]
      .filter((linha) => linha.getAttribute("stroke") !== "transparent")
      .map((linha) => linha.getAttribute("points"));
    expect(linhas).toEqual(["3,3 4,4", "7,7 8,8", "1,1 2,2"]);
    const previa = screen.getByTestId("stroke-preview").querySelector("polyline");
    expect(previa?.getAttribute("stroke-width")).toBe(String(HIGHLIGHTER_WIDTH));
    expect(previa?.getAttribute("opacity")).toBe(String(HIGHLIGHTER_OPACITY));
  });

  it("sem gesto em curso, não há prévia na camada de tinta", () => {
    render(<Strokes strokes={[stroke()]} />);

    expect(screen.queryByTestId("stroke-preview")).toBeNull();
  });

  it("entre marca-textos, o z continua valendo", () => {
    render(
      <Strokes
        strokes={[
          stroke({ id: "cima", z: 9, tool: STROKE_TOOL_HIGHLIGHTER, points: [1, 1, 2, 2] }),
          stroke({ id: "baixo", z: 2, tool: STROKE_TOOL_HIGHLIGHTER, points: [3, 3, 4, 4] }),
        ]}
      />,
    );

    expect(desenhados()).toEqual(["3,3 4,4", "1,1 2,2"]);
  });
});

describe("StrokePreview", () => {
  it("pinta a prévia do marca-texto como o traço gravado (#116)", () => {
    render(
      <StrokePreview
        points={[
          { x: 0, y: 0 },
          { x: 10, y: 5 },
        ]}
        color={0}
        tool={STROKE_TOOL_HIGHLIGHTER}
      />,
    );

    const linha = screen.getByTestId("stroke-preview").querySelector("polyline");
    expect(linha?.getAttribute("stroke-width")).toBe(String(HIGHLIGHTER_WIDTH));
    expect(linha?.getAttribute("opacity")).toBe(String(HIGHLIGHTER_OPACITY));
  });

  it("desenha o traço em curso a partir dos pontos do gesto", () => {
    render(
      <StrokePreview
        points={[
          { x: 0, y: 0 },
          { x: 10, y: 5 },
        ]}
        color={6}
      />,
    );

    expect(
      screen.getByTestId("stroke-preview").querySelector("polyline")?.getAttribute("points"),
    ).toBe("0,0 10,5");
  });

  it("não desenha nada fora de um gesto", () => {
    render(<StrokePreview points={null} color={6} />);

    expect(screen.queryByTestId("stroke-preview")).toBeNull();
  });

  it("não desenha um ponto só, que ainda não é linha", () => {
    render(<StrokePreview points={[{ x: 3, y: 3 }]} color={6} />);

    expect(screen.queryByTestId("stroke-preview")).toBeNull();
  });

  /**
   * A regressão real que motivou a prop (#69): a prévia ignorava a cor do lápis e nascia
   * sempre preta, e só a gravação — no `pointerup` — usava a cor escolhida. O traço parecia
   * preto enquanto se desenhava e "trocava" de cor de repente ao soltar o ponteiro.
   */
  it("desenha na cor do lápis, não sempre preto", () => {
    render(
      <StrokePreview
        points={[
          { x: 0, y: 0 },
          { x: 10, y: 5 },
        ]}
        color={3}
      />,
    );

    expect(
      screen.getByTestId("stroke-preview").querySelector("polyline")?.getAttribute("stroke"),
    ).toBe("var(--color-note-blue)");
  });
});

describe("Strokes — caneta tinteiro (#113)", () => {
  const caneta = stroke({ tool: STROKE_TOOL_FOUNTAIN, points: [0, 0, 40, 40, 80, 0] });

  it("pinta a caneta tinteiro como forma preenchida, no contorno da pena", () => {
    render(<Strokes strokes={[caneta]} />);

    const tinta = screen.getByTestId("stroke");
    expect(tinta.tagName).toBe("path");
    expect(tinta.getAttribute("d")).toBe(polygonPath(fountainOutline(caneta.points)));
    expect(tinta.getAttribute("fill")).toBe("var(--color-ink)");
    expect(tinta.hasAttribute("stroke-width")).toBe(false);
  });

  it("pinta na cor do traço", () => {
    render(<Strokes strokes={[{ ...caneta, color: 3 }]} />);

    expect(screen.getByTestId("stroke").getAttribute("fill")).toBe("var(--color-note-blue)");
  });

  it("não muda o lápis, que continua linha", () => {
    render(<Strokes strokes={[stroke(), caneta]} />);

    const [lapis] = screen.getAllByTestId("stroke");
    expect(lapis?.tagName).toBe("polyline");
    expect(lapis?.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH));
  });

  it("mantém o alvo de clique como linha pelos pontos", () => {
    render(<Strokes strokes={[caneta]} />);

    expect(screen.getByTestId("stroke-hit").getAttribute("points")).toBe(
      polylinePoints(caneta.points),
    );
  });

  /**
   * A escala do SVG esticaria a tinta junto: a pena sairia grossa num eixo e fina no outro
   * enquanto se redimensiona, e voltaria ao normal ao soltar.
   */
  it("redimensiona pelos pontos, sem esticar a pena", () => {
    const from = { x: 0, y: 0, w: 80, h: 40 };
    // Fator fracionário: os pontos em curso saem inteiros, como `endResize` vai gravar.
    const size = { w: 123, h: 40 };
    render(<Strokes strokes={[caneta]} resizing={{ id: caneta.id, from, size }} />);

    const escalados = scaleStrokePoints(caneta, from, size).map(Math.round);
    expect(screen.getByTestId("stroke").getAttribute("d")).toBe(
      polygonPath(fountainOutline(escalados)),
    );
    expect(screen.getByTestId("stroke-hit").getAttribute("points")).toBe(polylinePoints(escalados));
    expect(screen.getByTestId("stroke-group").getAttribute("transform") ?? "").not.toContain(
      "scale",
    );
  });

  it("move pela translação, como os outros traços", () => {
    render(<Strokes strokes={[caneta]} selection={new Set([caneta.id])} offset={{ x: 5, y: 7 }} />);

    expect(screen.getByTestId("stroke-group").getAttribute("transform")).toBe("translate(5 7)");
  });

  it("o lápis continua redimensionando pela escala", () => {
    const lapis = stroke({ points: [0, 0, 80, 40] });
    render(
      <Strokes
        strokes={[lapis]}
        resizing={{ id: lapis.id, from: { x: 0, y: 0, w: 80, h: 40 }, size: { w: 160, h: 40 } }}
      />,
    );

    expect(screen.getByTestId("stroke-group").getAttribute("transform")).toContain("scale(2 1)");
    expect(screen.getByTestId("stroke").getAttribute("points")).toBe("0,0 80,40");
  });
});

describe("StrokePreview — caneta tinteiro (#113)", () => {
  /** Um risco com o tremor do ponteiro: pontos crus, a menos de uma unidade da reta. */
  const gesto = [
    { x: 0, y: 0 },
    { x: 10, y: 0.4 },
    { x: 20, y: -0.3 },
    { x: 30, y: 0.2 },
    { x: 40, y: 0 },
  ];

  it("pinta a prévia com o mesmo contorno que o traço vai ter ao ser gravado", () => {
    render(<StrokePreview points={gesto} color={6} tool={STROKE_TOOL_FOUNTAIN} />);

    const gravado = simplify(gesto).flatMap((point) => [Math.round(point.x), Math.round(point.y)]);
    const previa = screen.getByTestId("stroke-preview").querySelector("path");
    expect(previa?.getAttribute("d")).toBe(polygonPath(fountainOutline(gravado)));
    expect(previa?.getAttribute("fill")).toBe("var(--color-ink)");
  });

  it("é igual ao traço gravado com os mesmos pontos", () => {
    const pontos = [
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 0 },
    ];
    const { unmount } = render(
      <StrokePreview points={pontos} color={6} tool={STROKE_TOOL_FOUNTAIN} />,
    );
    const previa = screen.getByTestId("stroke-preview").querySelector("path")?.getAttribute("d");
    unmount();

    render(
      <Strokes
        strokes={[
          stroke({ tool: STROKE_TOOL_FOUNTAIN, points: pontos.flatMap((p) => [p.x, p.y]) }),
        ]}
      />,
    );
    expect(screen.getByTestId("stroke").getAttribute("d")).toBe(previa);
  });

  /** A gravação arredonda os pontos; a prévia com frações mudaria de cara ao soltar. */
  it("pinta a prévia com os pontos inteiros que a gravação vai guardar", () => {
    const pontos = [
      { x: 0.4, y: 0.3 },
      { x: 40.6, y: 39.7 },
      { x: 80.2, y: 0.4 },
    ];
    render(<StrokePreview points={pontos} color={6} tool={STROKE_TOOL_FOUNTAIN} />);

    expect(screen.getByTestId("stroke-preview").querySelector("path")?.getAttribute("d")).toBe(
      polygonPath(fountainOutline([0, 0, 41, 40, 80, 0])),
    );
  });

  it("não simplifica a prévia do lápis", () => {
    render(<StrokePreview points={gesto} color={6} />);

    expect(
      screen.getByTestId("stroke-preview").querySelector("polyline")?.getAttribute("points"),
    ).toBe("0,0 10,0.4 20,-0.3 30,0.2 40,0");
  });
});

describe("espessura e opacidade do traço (#157)", () => {
  function tinta(): Element {
    const [elemento] = screen.getAllByTestId("stroke");
    if (elemento === undefined) throw new Error("sem tinta");
    return elemento;
  }

  it("pinta o lápis com a espessura e a opacidade do traço", () => {
    render(<Strokes strokes={[stroke({ w: 7, o: 9 })]} />);

    expect(tinta().getAttribute("stroke-width")).toBe(String(STROKE_WIDTH * STROKE_SIZES[7]));
    expect(tinta().getAttribute("opacity")).toBe(String(STROKE_OPACITIES[9] / 100));
  });

  it("pinta o marca-texto cheio quando o traço pede", () => {
    render(<Strokes strokes={[stroke({ tool: STROKE_TOOL_HIGHLIGHTER, w: 0, o: 19 })]} />);

    expect(tinta().getAttribute("stroke-width")).toBe(String(HIGHLIGHTER_WIDTH * STROKE_SIZES[0]));
    expect(tinta().hasAttribute("opacity")).toBe(false);
  });

  it("pinta a caneta tinteiro com a pena escalada e a opacidade do traço", () => {
    const caneta = stroke({ tool: STROKE_TOOL_FOUNTAIN, w: 4, o: 3, points: [0, 0, 40, 10] });
    render(<Strokes strokes={[caneta]} />);

    expect(tinta().getAttribute("d")).toBe(
      polygonPath(fountainOutline(caneta.points, STROKE_SIZES[4])),
    );
    expect(tinta().getAttribute("opacity")).toBe(String(STROKE_OPACITIES[3] / 100));
  });

  /** Opacidade no elemento, e não na cor: o traço que cruza a si mesmo não escurece. */
  it("aplica a opacidade à tinta inteira, e não à cor", () => {
    render(<Strokes strokes={[stroke({ o: 9, points: [0, 0, 10, 10, 10, 0, 0, 10] })]} />);

    expect(tinta().getAttribute("opacity")).toBe("0.5");
    expect(tinta().getAttribute("stroke-opacity")).toBeNull();
  });

  it("a prévia pinta com a espessura e a opacidade do gesto", () => {
    render(
      <StrokePreview
        points={[
          { x: 0, y: 0 },
          { x: 10, y: 5 },
        ]}
        color={6}
        size={5}
        opacity={1}
      />,
    );

    const linha = screen.getByTestId("stroke-preview").querySelector("polyline");
    expect(linha?.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH * STROKE_SIZES[5]));
    expect(linha?.getAttribute("opacity")).toBe(String(STROKE_OPACITIES[1] / 100));
  });

  it("a prévia do marca-texto na camada de tinta usa a espessura e a opacidade do gesto", () => {
    render(
      <HighlighterPreviewContext.Provider
        value={{
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 5 },
          ],
          color: 0,
          tool: STROKE_TOOL_HIGHLIGHTER,
          size: 6,
          opacity: 19,
        }}
      >
        <Strokes strokes={[]} />
      </HighlighterPreviewContext.Provider>,
    );

    const linha = screen.getByTestId("stroke-preview").querySelector("polyline");
    expect(linha?.getAttribute("stroke-width")).toBe(String(HIGHLIGHTER_WIDTH * STROKE_SIZES[6]));
    expect(linha?.hasAttribute("opacity")).toBe(false);
  });
});

describe("alvo de clique pela espessura do traço (#158)", () => {
  it("o alvo de um lápis grosso cresce pela sobra da tinta", () => {
    render(<Strokes strokes={[stroke({ w: 7 })]} />);

    // Lápis a 6×: 12 unidades de tinta, 10 além do padrão.
    expect(screen.getByTestId("stroke-hit").getAttribute("stroke-width")).toBe(
      String(STROKE_HIT_WIDTH + 10),
    );
  });

  it("o alvo de um lápis fino fica o do lápis padrão", () => {
    render(<Strokes strokes={[stroke({ w: 0 })]} />);

    expect(screen.getByTestId("stroke-hit").getAttribute("stroke-width")).toBe(
      String(STROKE_HIT_WIDTH),
    );
  });
});
