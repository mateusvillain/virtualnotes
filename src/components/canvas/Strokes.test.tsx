import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HIGHLIGHTER_OPACITY, StrokePreview, Strokes, polylinePoints } from "./Strokes";
import { HIGHLIGHTER_WIDTH, STROKE_WIDTH } from "@/lib/board/stroke-geometry";
import {
  STROKE_COLORS,
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

  it("a caneta tinteiro ainda sai como lápis, até ganhar a pena (#113)", () => {
    render(<Strokes strokes={[stroke({ tool: STROKE_TOOL_FOUNTAIN })]} />);

    expect(tintas()[0]?.getAttribute("stroke-width")).toBe(String(STROKE_WIDTH));
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

    expect(desenhados()).toEqual(["3,3 4,4", "1,1 2,2", "5,5 6,6"]);
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
