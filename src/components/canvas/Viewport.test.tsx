import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IDENTITY_VIEWPORT } from "@/lib/canvas/coords";
import { STROKE_TOOL_HIGHLIGHTER, type StrokeTool } from "@/lib/board/types";
import { stubPointerCapture } from "@/test-utils/pointer";
import { Viewport } from "./Viewport";

/**
 * O zoom escuta a roda por listener nativo não passivo, então o teste também precisa
 * disparar um evento de verdade — o `fireEvent.wheel` do React não passaria por ele.
 */
function wheelEvent(init: WheelEventInit): WheelEvent {
  return new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
}

/** Segura a barra de espaço, que é o modificador de navegação. */
function seguraEspaco(): void {
  fireEvent.keyDown(document, { key: " " });
}

function soltaEspaco(): void {
  fireEvent.keyUp(document, { key: " " });
}

function setup() {
  const pan = vi.fn();
  const zoomBy = vi.fn();

  render(
    <Viewport viewport={IDENTITY_VIEWPORT} pan={pan} zoomBy={zoomBy}>
      <span>post-it</span>
    </Viewport>,
  );

  const surface = screen.getByTestId("viewport-surface");
  stubPointerCapture(surface);

  return { surface, pan, zoomBy };
}

describe("Viewport", () => {
  it("mantém uma única camada transformada por mais elementos que existam", () => {
    const { container } = render(
      <Viewport viewport={{ x: 10, y: 20, scale: 1.5 }} pan={vi.fn()} zoomBy={vi.fn()}>
        {Array.from({ length: 200 }, (_, index) => (
          <span key={index}>post-it {index}</span>
        ))}
      </Viewport>,
    );

    // O custo de pan e zoom não cresce com a quantidade de post-its: quem se move é uma
    // transform só, não cada elemento.
    const transformados = [...container.querySelectorAll<HTMLElement>("[style]")].filter(
      (element) => element.style.transform !== "",
    );

    expect(transformados).toHaveLength(1);
    expect(transformados[0]?.dataset.testid).toBe("viewport-layer");
  });

  it("renderiza o conteúdo do canvas", () => {
    setup();

    expect(screen.getByText("post-it")).toBeDefined();
  });

  it("com espaço, arrastar o fundo desloca a visualização pela diferença de posição", () => {
    const { surface, pan } = setup();
    seguraEspaco();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 112, clientY: 93 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 122, clientY: 93 });

    expect(pan).toHaveBeenNthCalledWith(1, 12, -7);
    expect(pan).toHaveBeenNthCalledWith(2, 10, 0);
  });

  it("com espaço, arrastar a camada do canvas também desloca, não só o fundo", () => {
    const { pan } = setup();
    seguraEspaco();
    const layer = screen.getByTestId("viewport-layer");

    fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 5, clientY: 5 });

    expect(pan).toHaveBeenCalledWith(5, 5);
  });

  it("sem espaço, arrastar o fundo não desloca — isso é seleção", () => {
    const { surface, pan } = setup();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 40, clientY: 40 });

    expect(pan).not.toHaveBeenCalled();
  });

  it("com espaço, desloca mesmo com o gesto nascendo sobre um post-it", () => {
    const { surface, pan } = setup();
    seguraEspaco();

    // O post-it para o pointerdown antes da superfície; a captura do espaço vem antes dele.
    fireEvent.pointerDown(screen.getByText("post-it"), {
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 12, clientY: 12 });

    expect(pan).toHaveBeenCalledWith(12, 12);
  });

  it("soltar o espaço devolve o arrasto à seleção", () => {
    const { surface, pan } = setup();
    seguraEspaco();
    soltaEspaco();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 40, clientY: 40 });

    expect(pan).not.toHaveBeenCalled();
  });

  it("ignora botão que não seja o principal", () => {
    const { surface, pan } = setup();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 2 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 12, clientY: 12 });

    expect(pan).not.toHaveBeenCalled();
  });

  it("para de deslocar depois de soltar o ponteiro, liberando a captura", () => {
    const { surface, pan } = setup();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 20, clientY: 20 });

    expect(pan).not.toHaveBeenCalled();
  });

  it("ignora o movimento de um segundo ponteiro durante o arraste", () => {
    const { surface, pan } = setup();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 30, clientY: 30 });

    expect(pan).not.toHaveBeenCalled();
  });

  it("solta a captura sem lançar quando o ponteiro é cancelado", () => {
    const { surface } = setup();
    surface.hasPointerCapture = vi.fn(() => false);

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });

    expect(() => fireEvent.pointerCancel(surface, { pointerId: 1 })).not.toThrow();
    expect(surface.releasePointerCapture).not.toHaveBeenCalled();
  });

  it("a roda move o quadro no sentido contrário ao dedo", () => {
    const { surface, pan, zoomBy } = setup();

    surface.dispatchEvent(wheelEvent({ deltaY: 100 }));

    // Rolar para baixo empurra o conteúdo para cima, como em qualquer página.
    expect(pan).toHaveBeenCalledWith(-0, -100);
    expect(zoomBy).not.toHaveBeenCalled();
  });

  it("dois dedos no trackpad movem nos dois eixos", () => {
    const { surface, pan } = setup();

    surface.dispatchEvent(wheelEvent({ deltaX: 30, deltaY: -20 }));

    expect(pan).toHaveBeenCalledWith(-30, 20);
  });

  it("com Shift, a roda de um eixo só move na horizontal", () => {
    const { surface, pan } = setup();

    surface.dispatchEvent(wheelEvent({ deltaY: 100, shiftKey: true }));

    expect(pan).toHaveBeenCalledWith(-100, 0);
  });

  it("com Shift, não desvia o que já veio na horizontal", () => {
    const { surface, pan } = setup();

    // No trackpad o browser já entrega deltaX; desviar de novo cancelaria o eixo vertical.
    surface.dispatchEvent(wheelEvent({ deltaX: 10, deltaY: 5, shiftKey: true }));

    expect(pan).toHaveBeenCalledWith(-10, -5);
  });

  it("ctrl+roda amplia para cima e reduz para baixo, ancorado no cursor", () => {
    const { surface, zoomBy } = setup();

    surface.dispatchEvent(wheelEvent({ deltaY: -100, clientX: 200, clientY: 150, ctrlKey: true }));
    surface.dispatchEvent(wheelEvent({ deltaY: 100, clientX: 200, clientY: 150, ctrlKey: true }));

    const [ampliar, reduzir] = zoomBy.mock.calls;
    expect(ampliar?.[0]).toBeGreaterThan(1);
    expect(reduzir?.[0]).toBeLessThan(1);
    expect(ampliar?.[1]).toEqual({ x: 200, y: 150 });
  });

  it("cancela o zoom da página no ctrl+roda e no pinch do trackpad", () => {
    const { surface, zoomBy } = setup();
    const event = wheelEvent({ deltaY: -50, clientX: 10, clientY: 10, ctrlKey: true });

    surface.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(zoomBy).toHaveBeenCalledOnce();
  });

  it("⌘+roda também amplia, que é o atalho do Mac", () => {
    const { surface, zoomBy } = setup();

    surface.dispatchEvent(wheelEvent({ deltaY: -100, metaKey: true }));

    expect(zoomBy.mock.calls[0]?.[0]).toBeGreaterThan(1);
  });

  it("normaliza a rolagem em linhas para não ficar lenta no Firefox", () => {
    const { surface, zoomBy } = setup();

    surface.dispatchEvent(
      wheelEvent({ deltaY: -3, deltaMode: WheelEvent.DOM_DELTA_LINE, ctrlKey: true }),
    );
    surface.dispatchEvent(wheelEvent({ deltaY: -48, ctrlKey: true }));

    expect(zoomBy.mock.calls[0]?.[0]).toBeCloseTo(zoomBy.mock.calls[1]?.[0] as number, 10);
  });

  it("normaliza a rolagem em linhas também ao mover", () => {
    const { surface, pan } = setup();

    surface.dispatchEvent(wheelEvent({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }));

    expect(pan).toHaveBeenCalledWith(-0, -48);
  });
});

describe("Viewport — duplo clique no fundo", () => {
  function renderComDuploClique(viewport = IDENTITY_VIEWPORT) {
    const onBackgroundDoubleClick = vi.fn();
    render(
      <Viewport
        viewport={viewport}
        pan={vi.fn()}
        zoomBy={vi.fn()}
        onBackgroundDoubleClick={onBackgroundDoubleClick}
      >
        <span data-testid="conteudo">post-it</span>
      </Viewport>,
    );

    return { onBackgroundDoubleClick };
  }

  it("avisa com o ponto já convertido para coordenadas de canvas", () => {
    const { onBackgroundDoubleClick } = renderComDuploClique();

    fireEvent.doubleClick(screen.getByTestId("viewport-surface"), { clientX: 120, clientY: 90 });

    expect(onBackgroundDoubleClick).toHaveBeenCalledExactlyOnceWith({ x: 120, y: 90 });
  });

  it("desfaz o pan e o zoom na conversão, para o ponto cair sob o cursor", () => {
    const { onBackgroundDoubleClick } = renderComDuploClique({ x: 40, y: 20, scale: 2 });

    fireEvent.doubleClick(screen.getByTestId("viewport-surface"), { clientX: 140, clientY: 120 });

    // Sem dividir pela escala e descontar o deslocamento, o post-it nasceria longe do
    // cursor em qualquer zoom diferente de 100%.
    expect(onBackgroundDoubleClick).toHaveBeenCalledExactlyOnceWith({ x: 50, y: 50 });
  });

  it("também aceita o duplo clique na camada do canvas, que é fundo igual", () => {
    const { onBackgroundDoubleClick } = renderComDuploClique();

    fireEvent.doubleClick(screen.getByTestId("viewport-layer"), { clientX: 10, clientY: 10 });

    expect(onBackgroundDoubleClick).toHaveBeenCalledOnce();
  });

  it("só age no botão primário", () => {
    const { onBackgroundDoubleClick } = renderComDuploClique();

    // Mesma regra do pan. Os browsers atuais só disparam dblclick no primário, mas a
    // guarda existir aqui e não ali seria assimetria sem razão.
    fireEvent.doubleClick(screen.getByTestId("viewport-surface"), { button: 2 });

    expect(onBackgroundDoubleClick).not.toHaveBeenCalled();
  });

  it("impede a seleção nativa de texto que o gesto dispararia", () => {
    renderComDuploClique();
    const evento = new MouseEvent("dblclick", { bubbles: true, cancelable: true });

    screen.getByTestId("viewport-surface").dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true);
  });

  it("ignora o duplo clique nascido em algo desenhado sobre o fundo", () => {
    const { onBackgroundDoubleClick } = renderComDuploClique();

    // O conteúdo do canvas não é fundo: criar um post-it atrás do que se clicou é
    // exatamente o que o critério da #13 proíbe.
    fireEvent.doubleClick(screen.getByTestId("conteudo"), { clientX: 10, clientY: 10 });

    expect(onBackgroundDoubleClick).not.toHaveBeenCalled();
  });
});

describe("Viewport — retângulo de seleção", () => {
  function setupMarquee(viewport = IDENTITY_VIEWPORT) {
    const onSelectionRect = vi.fn();
    const onBackgroundClick = vi.fn();
    const pan = vi.fn();
    render(
      <Viewport
        viewport={viewport}
        pan={pan}
        zoomBy={vi.fn()}
        onSelectionRect={onSelectionRect}
        onBackgroundClick={onBackgroundClick}
      />,
    );

    const surface = screen.getByTestId("viewport-surface");
    stubPointerCapture(surface);

    return { surface, onSelectionRect, onBackgroundClick, pan };
  }

  it("shift + arrastar desenha o retângulo em vez de navegar", () => {
    const { surface, onSelectionRect, pan } = setupMarquee();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 10,
      clientY: 20,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 110, clientY: 220 });

    expect(onSelectionRect).toHaveBeenCalledWith({ x: 10, y: 20, w: 100, h: 200 });
    // O PRD reserva o arrasto puro do fundo para navegar; o Shift é o que separa os dois.
    expect(pan).not.toHaveBeenCalled();
    expect(screen.getByTestId("selection-box")).toBeDefined();
  });

  it("normaliza o retângulo arrastado para trás", () => {
    const { surface, onSelectionRect } = setupMarquee();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 200,
      clientY: 300,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 100, clientY: 100 });

    // Arrastar da direita para a esquerda é tão comum quanto o contrário.
    expect(onSelectionRect).toHaveBeenCalledWith({ x: 100, y: 100, w: 100, h: 200 });
  });

  it("desenha o retângulo em coordenadas de canvas, não de tela", () => {
    const { surface, onSelectionRect } = setupMarquee({ x: 40, y: 20, scale: 2 });

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 140,
      clientY: 120,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 240, clientY: 220 });

    expect(onSelectionRect).toHaveBeenCalledWith({ x: 50, y: 50, w: 50, h: 50 });
  });

  it("some com o retângulo ao soltar", () => {
    const { surface } = setupMarquee();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(screen.getByTestId("selection-box")).toBeDefined();

    fireEvent.pointerUp(surface, { pointerId: 1 });

    expect(screen.queryByTestId("selection-box")).toBeNull();
  });

  it("arrastar o retângulo não conta como clique no fundo", () => {
    const { surface, onBackgroundClick } = setupMarquee();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    // Limpar a seleção logo depois de desenhá-la seria o gesto se anulando.
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});

describe("Viewport — clique no fundo", () => {
  function setupClique() {
    const onBackgroundClick = vi.fn();
    const onSelectionRect = vi.fn();
    render(
      <Viewport
        viewport={IDENTITY_VIEWPORT}
        pan={vi.fn()}
        zoomBy={vi.fn()}
        onBackgroundClick={onBackgroundClick}
        onSelectionRect={onSelectionRect}
      >
        <span data-testid="conteudo">post-it</span>
      </Viewport>,
    );

    const surface = screen.getByTestId("viewport-surface");
    stubPointerCapture(surface);

    return { surface, onBackgroundClick, onSelectionRect };
  }

  it("avisa do clique quando o ponteiro não andou", () => {
    const { surface, onBackgroundClick } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 30, clientY: 30 });

    expect(onBackgroundClick).toHaveBeenCalledOnce();
  });

  it("tolera o tremor da mão entre apertar e soltar", () => {
    const { surface, onBackgroundClick } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 32, clientY: 31 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 32, clientY: 31 });

    expect(onBackgroundClick).toHaveBeenCalledOnce();
  });

  it("não confunde arrasto lento com clique", () => {
    const { surface, onBackgroundClick } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    // Passos de dois pixels, o caso normal de mouse. Uma folga aplicada passo a passo nunca
    // veria movimento nenhum, e o arrasto terminaria limpando a seleção.
    for (let passo = 1; passo <= 10; passo += 1) {
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: 30 + passo * 2,
        clientY: 30 + passo * 2,
      });
    }
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 50, clientY: 50 });

    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it("cancelamento do sistema não é clique", () => {
    const { surface, onBackgroundClick } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerCancel(surface, { pointerId: 1 });

    // Um gesto interrompido pelo SO não decidiu nada; limpar a seleção por causa dele seria
    // uma ação que o usuário não pediu.
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it("não confunde navegar pelo quadro com clicar no fundo", () => {
    const { surface, onBackgroundClick } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    // Sem isso, todo pan terminaria limpando a seleção.
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it("o arrasto que volta ao ponto de partida termina com um retângulo vazio", () => {
    const { surface, onBackgroundClick, onSelectionRect } = setupClique();

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 30, clientY: 30 });

    // Não é o caminho do clique — o retângulo chegou a existir. Mas o resultado visível é o
    // mesmo: um retângulo sem área não toca ninguém, e sem Shift ele substitui a seleção.
    expect(onBackgroundClick).not.toHaveBeenCalled();
    expect(onSelectionRect).toHaveBeenLastCalledWith({ x: 30, y: 30, w: 0, h: 0 });
  });

  it("ignora o clique nascido em algo desenhado sobre o fundo", () => {
    const { onBackgroundClick } = setupClique();
    const conteudo = screen.getByTestId("conteudo");

    fireEvent.pointerDown(conteudo, { pointerId: 1, button: 0 });
    fireEvent.pointerUp(conteudo, { pointerId: 1 });

    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});

/**
 * A prévia do traço em curso nasce na mesma altura em que o traço vai ficar (#116): o
 * marca-texto por baixo de toda a tinta do board, o resto por cima dela.
 */
describe("Viewport — altura da prévia do traço", () => {
  function desenhaCom(drawingTool?: StrokeTool): HTMLElement[] {
    render(
      <Viewport
        viewport={IDENTITY_VIEWPORT}
        pan={vi.fn()}
        zoomBy={vi.fn()}
        pencil
        drawingTool={drawingTool}
      >
        <span data-testid="tinta-do-board">tinta</span>
      </Viewport>,
    );
    const surface = screen.getByTestId("viewport-surface");
    stubPointerCapture(surface);

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 80, clientY: 40 });

    const camada = screen.getByTestId("viewport-layer");
    return [...camada.children].filter((child): child is HTMLElement =>
      ["stroke-preview", "tinta-do-board"].includes(child.getAttribute("data-testid") ?? ""),
    );
  }

  it("o lápis desenha a prévia depois do board", () => {
    const ordem = desenhaCom().map((child) => child.getAttribute("data-testid"));

    expect(ordem).toEqual(["tinta-do-board", "stroke-preview"]);
  });

  it("o marca-texto desenha a prévia antes do board, por baixo da tinta", () => {
    const ordem = desenhaCom(STROKE_TOOL_HIGHLIGHTER).map((child) =>
      child.getAttribute("data-testid"),
    );

    expect(ordem).toEqual(["stroke-preview", "tinta-do-board"]);
  });
});
