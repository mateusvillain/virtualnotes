import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defined } from "@/test-utils/defined";
import { stubMatchMedia } from "@/test-utils/matchMedia";
import { NOTE_COLORS, NOTE_SIZE, SCHEMA_VERSION, STROKE_COLORS } from "@/lib/board/types";
import { MAX_SCALE, MIN_SCALE, scaleAsPercent } from "@/lib/canvas/coords";
import { strokeColor } from "@/lib/theme/note-colors";
import { Whiteboard } from "./Whiteboard";
import { UI } from "@/lib/i18n/ui";

/**
 * Testes de ponta a ponta do quadro, no nível em que o usuário age: duplo clique no fundo,
 * digitar, sair. É aqui que os critérios da #13 e da #14 param de ser contrato entre
 * componentes e viram comportamento observável.
 */
function duploCliqueNoFundo(x: number, y: number): void {
  fireEvent.doubleClick(screen.getByTestId("viewport-surface"), { clientX: x, clientY: y });
}

/** Segura espaço e arrasta: o gesto que desloca o quadro. */
function navegaOQuadro(dx: number, dy: number): void {
  const surface = screen.getByTestId("viewport-surface");

  fireEvent.keyDown(document, { key: " " });
  fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(surface, { pointerId: 1, clientX: dx, clientY: dy });
  fireEvent.pointerUp(surface, { pointerId: 1, clientX: dx, clientY: dy });
  fireEvent.keyUp(document, { key: " " });
}

/**
 * Rola a roda sobre o quadro. O listener é nativo, então o evento também precisa ser.
 *
 * Dentro de `act` porque o `dispatchEvent` cru não passa pelo empacotamento que o
 * `fireEvent` faz: o `setState` do listener nativo fica agendado e não pintado, e quem
 * afirmasse alguma coisa sobre o que apareceu na tela leria o quadro anterior à rolagem.
 */
function rola(init: WheelEventInit): void {
  const surface = screen.getByTestId("viewport-surface");
  act(() => {
    surface.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }));
  });
}

function postIts(): HTMLElement[] {
  return screen.queryAllByTestId("post-it");
}

/** O n-ésimo post-it desenhado, falhando o teste se ele não existir. */
function postIt(indice: number): HTMLElement {
  return defined(postIts()[indice], `o post-it de índice ${indice}`);
}

describe("Whiteboard", () => {
  it("começa com o quadro vazio", () => {
    render(<Whiteboard />);

    expect(postIts()).toEqual([]);
  });

  it("cria um post-it no ponto do duplo clique, já pronto para escrever", () => {
    render(<Whiteboard />);

    duploCliqueNoFundo(300, 240);

    expect(postIts()).toHaveLength(1);
    const editor = screen.getByTestId("post-it-editor");
    expect(document.activeElement).toBe(editor);
  });

  it("centra o post-it novo no cursor", () => {
    render(<Whiteboard />);

    duploCliqueNoFundo(300, 240);

    expect(
      Number.parseFloat(postIt(0).style.left) + Number.parseFloat(postIt(0).style.width) / 2,
    ).toBe(300);
    expect(
      Number.parseFloat(postIt(0).style.top) + Number.parseFloat(postIt(0).style.height) / 2,
    ).toBe(240);
  });

  it("nasce sob o cursor mesmo com o quadro afastado e deslocado", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    // Zoom por botão, que ancora no centro da área — e no jsdom a área mede zero, então o
    // resultado é um viewport com escala diferente de 1. O que este teste guarda é que a
    // conversão desfaz a transformação seja ela qual for.
    await user.click(screen.getByLabelText(UI.en.zoom.in));
    navegaOQuadro(70, -35);
    duploCliqueNoFundo(320, 260);

    const centroX =
      Number.parseFloat(postIt(0).style.left) + Number.parseFloat(postIt(0).style.width) / 2;
    const centroY =
      Number.parseFloat(postIt(0).style.top) + Number.parseFloat(postIt(0).style.height) / 2;
    const camada = screen.getByTestId("viewport-layer");
    const transform = camada.style.transform;
    const escala = Number(transform.match(/scale\(([^)]+)\)/)?.[1]);
    const [deslocX, deslocY] = (transform.match(/translate\(([^)]+)\)/)?.[1] ?? "")
      .split(",")
      .map(Number.parseFloat);

    // O post-it é descrito em coordenadas de canvas: onde ele cai na tela é o centro dele
    // vezes a escala, mais o deslocamento — a mesma transformação da camada. Tem que dar o
    // ponto onde o cursor estava.
    expect(escala).not.toBe(1);
    expect(deslocX).toBe(70);
    expect(deslocY).toBe(-35);
    expect(centroX * escala + (deslocX ?? 0)).toBeCloseTo(320);
    expect(centroY * escala + (deslocY ?? 0)).toBeCloseTo(260);
  });

  it("guarda o texto escrito ao sair da edição", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    duploCliqueNoFundo(200, 200);
    await user.keyboard("comprar pão{Escape}");

    // O texto sobreviveu ao fim da edição: está no board, desenhado em modo leitura.
    expect(screen.queryByTestId("post-it-editor")).toBeNull();
    expect(postIt(0).textContent).toBe("comprar pão");
  });

  it("reabre para edição com duplo clique, sem criar outro post-it", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    duploCliqueNoFundo(200, 200);
    await user.keyboard("comprar pão{Escape}");
    await user.dblClick(postIt(0));

    expect(postIts()).toHaveLength(1);
    expect((screen.getByTestId("post-it-editor") as HTMLTextAreaElement).value).toBe("comprar pão");
  });

  it("empilha cada post-it novo na frente dos anteriores", () => {
    render(<Whiteboard />);

    duploCliqueNoFundo(100, 100);
    duploCliqueNoFundo(400, 300);

    expect(Number(postIt(1).style.zIndex)).toBeGreaterThan(Number(postIt(0).style.zIndex));
  });

  it("passa a edição de um post-it para o outro sem perder o texto do anterior", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    duploCliqueNoFundo(100, 100);
    await user.keyboard("primeiro{Escape}");
    duploCliqueNoFundo(500, 100);
    await user.keyboard("segundo");
    await user.dblClick(postIt(0));

    expect(postIt(1).textContent).toBe("segundo");
    expect((screen.getByTestId("post-it-editor") as HTMLTextAreaElement).value).toBe("primeiro");
  });
});

describe("Whiteboard — seleção", () => {
  /**
   * Cria um post-it e sai da edição.
   *
   * O post-it novo nasce escrevendo, e no browser apertar o ponteiro em outro lugar tira o
   * foco do editor sozinho. O jsdom não faz isso por conta própria, então o teste sai da
   * edição de forma explícita — como o usuário sai, pelo Escape.
   */
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    // O Escape tira o foco, e é a perda de foco que encerra a edição.
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** Aperta e solta no fundo sem andar: o clique que limpa a seleção. */
  function cliqueNoFundo(): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 700, clientY: 500 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 700, clientY: 500 });
  }

  /** Shift + arrastar no fundo, de um canto de tela ao outro. */
  function retanguloDeSelecao(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: de[0],
      clientY: de[1],
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1 });
  }

  function selecionados(): (string | undefined)[] {
    return postIts()
      .filter((element) => element.dataset.selected === "true")
      .map((element) => element.dataset.noteId);
  }

  it("deixa selecionado o post-it que acabou de nascer", () => {
    render(<Whiteboard />);

    duploCliqueNoFundo(200, 200);

    expect(selecionados()).toEqual([postIt(0).dataset.noteId]);
  });

  it("clicar num post-it o seleciona e desmarca os demais", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(700, 200);

    fireEvent.pointerDown(postIt(0), { button: 0 });

    expect(selecionados()).toEqual([postIt(0).dataset.noteId]);
  });

  it("shift-clique acrescenta o segundo post-it à seleção", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(700, 200);

    fireEvent.pointerDown(postIt(0), { button: 0 });
    fireEvent.pointerDown(postIt(1), { button: 0, shiftKey: true });

    expect(selecionados()).toHaveLength(2);
  });

  it("clicar no fundo vazio limpa a seleção", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);

    cliqueNoFundo();

    expect(selecionados()).toEqual([]);
  });

  it("o retângulo seleciona os post-its que ele toca, e só", () => {
    render(<Whiteboard />);
    criaPostIt(150, 150);
    criaPostIt(900, 150);
    const perto = postIt(0).dataset.noteId;
    cliqueNoFundo();

    // Os post-its têm 200 de lado, então o primeiro ocupa de 50 a 250 e o segundo, de 800 a
    // 1000. O retângulo só alcança o primeiro.
    retanguloDeSelecao([0, 0], [400, 400]);

    expect(selecionados()).toEqual([perto]);
  });

  it("o retângulo soma ao que já estava selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(150, 150);
    criaPostIt(900, 150);

    // O segundo continua selecionado desde que nasceu; o retângulo alcança só o primeiro.
    retanguloDeSelecao([0, 0], [400, 400]);

    // O Shift acrescenta à seleção no clique; abrir o retângulo com ele e substituir tudo
    // seria o mesmo modificador com dois significados.
    expect(selecionados()).toHaveLength(2);
  });

  it("encolher o retângulo desmarca quem ele deixou de tocar", () => {
    render(<Whiteboard />);
    criaPostIt(150, 150);
    criaPostIt(900, 150);
    const perto = postIt(0).dataset.noteId;
    cliqueNoFundo();

    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 1100, clientY: 400 });
    expect(selecionados()).toHaveLength(2);

    // Recalcula a partir do que havia antes do gesto, e não do quadro anterior: sem isso o
    // retângulo só cresceria.
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 400, clientY: 400 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 400, clientY: 400 });

    expect(selecionados()).toEqual([perto]);
  });

  it("traz para a frente o post-it selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(700, 200);
    expect(Number(postIt(1).style.zIndex)).toBeGreaterThan(Number(postIt(0).style.zIndex));

    fireEvent.pointerDown(postIt(0), { button: 0 });

    // O post-it clicado vai para a frente dos demais — critério de conclusão da Epic #2.
    expect(Number(postIt(0).style.zIndex)).toBeGreaterThan(Number(postIt(1).style.zIndex));
  });

  it("navegar pelo quadro com espaço não limpa a seleção", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);

    navegaOQuadro(120, 80);

    expect(selecionados()).toHaveLength(1);
  });

  it("navegar pela roda não limpa a seleção", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);

    rola({ deltaY: 120 });

    expect(selecionados()).toHaveLength(1);
  });
});

describe("Whiteboard — arraste", () => {
  /** Cria um post-it e sai da edição, como no bloco de seleção. */
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** Arrasta um post-it pelo deslocamento pedido, em pixels de tela. */
  function arrastaPostIt(indice: number, dx: number, dy: number): void {
    const element = postIt(indice);
    fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerId: 1, clientX: dx, clientY: dy });
    fireEvent.pointerUp(element, { pointerId: 1, clientX: dx, clientY: dy });
  }

  function posicao(indice: number): { x: number; y: number } {
    const element = postIt(indice);
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
    };
  }

  it("move o post-it, e não o quadro", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const antes = posicao(0);
    const camadaAntes = screen.getByTestId("viewport-layer").style.transform;

    arrastaPostIt(0, 120, 80);

    expect(posicao(0)).toEqual({ x: antes.x + 120, y: antes.y + 80 });
    // O quadro ficou onde estava: o gesto começou no post-it, não no fundo.
    expect(screen.getByTestId("viewport-layer").style.transform).toBe(camadaAntes);
  });

  it("acompanha o cursor com precisão em qualquer zoom", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const antes = posicao(0);

    await user.click(screen.getByLabelText(UI.en.zoom.in));
    const escala = Number(
      screen.getByTestId("viewport-layer").style.transform.match(/scale\(([^)]+)\)/)?.[1],
    );
    arrastaPostIt(0, 100, 0);

    // Cem pixels de tela valem menos de cem unidades de canvas quando o quadro está
    // aproximado; sem dividir pela escala, o post-it andaria mais que o cursor.
    expect(escala).toBeGreaterThan(1);
    expect(posicao(0).x).toBe(antes.x + Math.round(100 / escala));
  });

  it("não grava nada enquanto o gesto acontece", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const antes = posicao(0);
    const element = postIt(0);

    fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerId: 1, clientX: 120, clientY: 80 });

    // Durante o arraste o post-it se move por transform; a posição só muda ao soltar.
    expect(posicao(0)).toEqual(antes);
    expect(postIt(0).style.transform).toBe("translate(120px, 80px)");
  });

  it("move junto os post-its selecionados", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(700, 200);
    fireEvent.pointerDown(postIt(0), { button: 0 });
    fireEvent.pointerDown(postIt(1), { button: 0, shiftKey: true });
    const antesPrimeiro = posicao(0);
    const antesSegundo = posicao(1);

    arrastaPostIt(0, 60, 40);

    expect(posicao(0)).toEqual({ x: antesPrimeiro.x + 60, y: antesPrimeiro.y + 40 });
    expect(posicao(1)).toEqual({ x: antesSegundo.x + 60, y: antesSegundo.y + 40 });
  });

  it("arrastar não abre a edição de texto", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);

    arrastaPostIt(0, 150, 150);

    expect(screen.queryByTestId("post-it-editor")).toBeNull();
  });
});

describe("Whiteboard — redimensionamento", () => {
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  function alca(): HTMLElement {
    return screen.getByTestId("resize-handle");
  }

  function tamanho(): { w: number; h: number } {
    const element = postIt(0);
    return {
      w: Number.parseFloat(element.style.width),
      h: Number.parseFloat(element.style.height),
    };
  }

  function posicao(): { x: number; y: number } {
    const element = postIt(0);
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
    };
  }

  /** Puxa a alça pelo deslocamento pedido, em pixels de tela. */
  function puxaAlca(dx: number, dy: number, solta = true): void {
    const handle = alca();
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: dx, clientY: dy });
    if (solta) fireEvent.pointerUp(handle, { pointerId: 1, clientX: dx, clientY: dy });
  }

  it("mostra a alça no post-it selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    expect(alca().dataset.visible).toBe("true");
  });

  it("esconde a alça enquanto se escreve", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(400, 400);

    // Ali o post-it é um campo de texto, não uma caixa a ajustar.
    expect(screen.queryByTestId("resize-handle")).toBeNull();
  });

  it("altera largura e altura acompanhando o cursor", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = tamanho();

    puxaAlca(70, 30);

    expect(tamanho()).toEqual({ w: antes.w + 70, h: antes.h + 30 });
  });

  it("acompanha o cursor também com o quadro aproximado", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = tamanho();

    await user.click(screen.getByLabelText(UI.en.zoom.in));
    const escala = Number(
      screen.getByTestId("viewport-layer").style.transform.match(/scale\(([^)]+)\)/)?.[1],
    );
    puxaAlca(100, 0);

    expect(escala).toBeGreaterThan(1);
    expect(tamanho().w).toBe(antes.w + Math.round(100 / escala));
  });

  it("não grava nada enquanto a alça está sendo puxada", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = tamanho();

    puxaAlca(70, 30, false);
    expect(tamanho()).toEqual({ w: antes.w + 70, h: antes.h + 30 });

    // O que se vê já é o tamanho novo; o que está gravado só muda ao soltar. O teste do
    // hook cobre a store; aqui o que importa é que o gesto termine no mesmo lugar.
    fireEvent.pointerUp(alca(), { pointerId: 1, clientX: 70, clientY: 30 });
    expect(tamanho()).toEqual({ w: antes.w + 70, h: antes.h + 30 });
  });

  it("não deixa encolher além do mínimo", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    puxaAlca(-5000, -5000);

    expect(tamanho()).toEqual({ w: NOTE_SIZE.minWidth, h: NOTE_SIZE.minHeight });
  });

  it("não move o post-it ao redimensionar", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao();

    puxaAlca(120, 90);

    expect(posicao()).toEqual(antes);
  });

  it("acompanha o cursor também com o quadro afastado", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = tamanho();

    await user.click(screen.getByLabelText(UI.en.zoom.out));
    const escala = Number(
      screen.getByTestId("viewport-layer").style.transform.match(/scale\(([^)]+)\)/)?.[1],
    );
    puxaAlca(100, 0);

    // Afastado, cada pixel de tela vale mais de um de canvas: o post-it cresce **mais** que
    // os cem pixels do cursor. É o lado da conversão em que o arredondamento é mais grosso.
    expect(escala).toBeLessThan(1);
    expect(tamanho().w).toBe(antes.w + Math.round(100 / escala));
  });

  it("duplo clique na alça não abre o editor", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    fireEvent.doubleClick(alca(), { button: 0 });

    // A alça é para ajustar o tamanho; abrir o editor ali cobriria justamente o que se
    // estava ajustando.
    expect(screen.queryByTestId("post-it-editor")).toBeNull();
  });

  it("puxar a alça não arrasta o post-it junto", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao();

    puxaAlca(150, 150, false);

    expect(postIt(0).dataset.dragging).toBe("false");
    expect(posicao()).toEqual(antes);
  });
});

describe("Whiteboard — cor do post-it", () => {
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** Aperta e solta no fundo sem andar: o clique que limpa a seleção. */
  function cliqueNoFundoLimpando(): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 900, clientY: 600 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 900, clientY: 600 });
  }

  function seletor(): HTMLElement | null {
    return screen.queryByTestId("color-picker");
  }

  /** A cor de fundo desenhada no n-ésimo post-it. */
  function corDe(indice: number): string {
    return postIt(indice).style.backgroundColor;
  }

  function escolheCor(nome: string): void {
    fireEvent.click(screen.getByRole("radio", { name: nome }));
  }

  it("não mostra o seletor sem seleção", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    cliqueNoFundoLimpando();

    expect(seletor()).toBeNull();
  });

  it("mostra o seletor para o post-it selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    expect(seletor()).not.toBeNull();
  });

  it("indica a cor atual do post-it", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    // O post-it nasce amarelo, que é o índice 0 da paleta.
    expect(
      screen.getByRole("radio", { name: UI.en.note.colors.yellow }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("escolher uma cor pinta o post-it na hora", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = corDe(0);

    escolheCor(UI.en.note.colors.green);

    expect(corDe(0)).not.toBe(antes);
    expect(corDe(0)).toBe("var(--color-note-green)");
  });

  it("a cor escolhida passa a ser a indicada", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    escolheCor(UI.en.note.colors.purple);

    expect(
      screen.getByRole("radio", { name: UI.en.note.colors.purple }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("pinta todos os post-its selecionados", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(700, 300);
    fireEvent.pointerDown(postIt(0), { button: 0, shiftKey: true });

    escolheCor(UI.en.note.colors.blue);

    expect(corDe(0)).toBe("var(--color-note-blue)");
    expect(corDe(1)).toBe("var(--color-note-blue)");
  });

  it("não indica cor quando os selecionados divergem", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    escolheCor(UI.en.note.colors.pink);
    criaPostIt(700, 300);
    fireEvent.pointerDown(postIt(0), { button: 0, shiftKey: true });

    // Um rosa e um amarelo: não há uma cor atual a marcar.
    const marcadas = screen
      .getAllByRole("radio")
      .filter((cor) => cor.getAttribute("aria-checked") === "true");
    expect(marcadas).toEqual([]);
  });

  it("clicar numa cor não desmarca o post-it", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    escolheCor(UI.en.note.colors.orange);

    // A barra vive fora da superfície do quadro justamente para o clique não chegar ao
    // fundo, que o leria como o pedido de limpar a seleção.
    expect(postIt(0).dataset.selected).toBe("true");
    expect(seletor()).not.toBeNull();
  });

  it("dá para chegar ao seletor e trocar a cor só pelo teclado", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(400, 400);
    cliqueNoFundoLimpando();

    // Do zero: focar o post-it, marcá-lo, tabular até o seletor e andar até uma cor.
    postIt(0).focus();
    await user.keyboard("{Enter}");
    expect(postIt(0).dataset.selected).toBe("true");

    await user.tab();
    expect(screen.getAllByRole("radio").includes(document.activeElement as HTMLElement)).toBe(true);

    await user.keyboard("{ArrowRight}");

    // Sem isto o critério de acessibilidade seria decorativo: o seletor é navegável, mas
    // nada que dependa de seleção chegaria até ele.
    expect(corDe(0)).toBe("var(--color-note-pink)");
  });

  it("esconde o seletor enquanto se arrasta um post-it", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    fireEvent.pointerDown(postIt(0), { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(postIt(0), { pointerId: 1, clientX: 80, clientY: 80 });

    // A caixa da seleção usa as posições já gravadas: a barra ficaria parada enquanto o
    // post-it anda por baixo dela.
    expect(seletor()).toBeNull();

    fireEvent.pointerUp(postIt(0), { pointerId: 1, clientX: 80, clientY: 80 });
    expect(seletor()).not.toBeNull();
  });

  it("esconde o seletor enquanto se redimensiona", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const handle = screen.getByTestId("resize-handle");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 60, clientY: 60 });

    expect(seletor()).toBeNull();

    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 60, clientY: 60 });
    expect(seletor()).not.toBeNull();
  });
});

describe("Whiteboard — apagar com Delete", () => {
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** A tecla chega pelo documento, que é onde o atalho global ouve. */
  function apertaTecla(key: string): void {
    fireEvent.keyDown(document, { key });
  }

  function cliqueNoFundoLimpando(): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 900, clientY: 600 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 900, clientY: 600 });
  }

  it("apaga o post-it selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    apertaTecla("Delete");

    expect(postIts()).toEqual([]);
  });

  it("apaga todos os selecionados", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(700, 300);
    fireEvent.pointerDown(postIt(0), { button: 0, shiftKey: true });

    apertaTecla("Delete");

    expect(postIts()).toEqual([]);
  });

  it("não apaga quem não está selecionado", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(700, 300);

    // Só o segundo ficou marcado ao ser criado.
    apertaTecla("Delete");

    expect(postIts()).toHaveLength(1);
  });

  it("sem nada selecionado não faz nada", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    cliqueNoFundoLimpando();

    apertaTecla("Delete");

    expect(postIts()).toHaveLength(1);
  });

  it("não apaga enquanto se escreve dentro do post-it", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(400, 400);

    // O erro clássico do atalho global: apagar o post-it em vez do caractere.
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Delete" });
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Backspace" });

    expect(postIts()).toHaveLength(1);
    expect(screen.getByTestId("post-it-editor")).toBeDefined();
  });

  // Ver DELETE_KEYS no hook: no Mac a tecla escrita "delete" emite Backspace.
  it("Backspace também apaga fora da edição", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);

    apertaTecla("Backspace");

    expect(postIts()).toEqual([]);
  });

  it("apaga com o post-it focado pelo teclado", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(400, 400);
    cliqueNoFundoLimpando();

    postIt(0).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Delete}");

    // O post-it é tabulável desde a #17, mas não é campo de texto: a guarda olha o alvo, e
    // aqui ela deixa passar de propósito.
    expect(postIts()).toEqual([]);
  });

  it("o seletor de cor some junto com o post-it apagado", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    expect(screen.queryByTestId("color-picker")).not.toBeNull();

    apertaTecla("Delete");

    // A barra é ancorada na seleção, que ficou vazia.
    expect(screen.queryByTestId("color-picker")).toBeNull();
  });

  it("não apaga com o board vazio", () => {
    render(<Whiteboard />);

    apertaTecla("Delete");

    expect(postIts()).toEqual([]);
  });
});

describe("Whiteboard — mover a seleção com as setas", () => {
  /** Cria um post-it e sai da edição, como nos blocos acima. */
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** A tecla chega pelo documento, que é onde o atalho global ouve. */
  function seta(key: string, init: KeyboardEventInit = {}): boolean {
    return !fireEvent.keyDown(document, { key, ...init });
  }

  /** Aperta e solta, que é o gesto de quem dá um toque na seta. */
  function toque(key: string, init: KeyboardEventInit = {}): boolean {
    const engolida = seta(key, init);
    fireEvent.keyUp(document, { key });
    return engolida;
  }

  function posicao(indice: number): { x: number; y: number } {
    const element = postIt(indice);
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
    };
  }

  function cliqueNoFundoLimpando(): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 900, clientY: 600 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 900, clientY: 600 });
  }

  it("move o post-it selecionado uma unidade por tecla", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao(0);

    toque("ArrowRight");
    toque("ArrowDown");

    expect(posicao(0)).toEqual({ x: antes.x + 1, y: antes.y + 1 });
  });

  it("com Shift o passo é grande", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao(0);

    toque("ArrowLeft", { shiftKey: true });

    expect(posicao(0)).toEqual({ x: antes.x - 10, y: antes.y });
  });

  it("segurar a seta move continuamente", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao(0);

    // A repetição do teclado chega como uma sequência de `keydown`, e é assim que ela é
    // exercitada: dez teclas, dez unidades.
    for (let i = 0; i < 10; i += 1) seta("ArrowUp", { repeat: i > 0 });

    expect(posicao(0)).toEqual({ x: antes.x, y: antes.y - 10 });
  });

  it("duas setas seguradas movem na diagonal", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    const antes = posicao(0);

    // `↑` continua apertada quando `→` chega: o sistema repete só a última tecla, e é a
    // soma das seguradas que mantém o movimento na diagonal.
    seta("ArrowUp");
    seta("ArrowRight");
    seta("ArrowRight", { repeat: true });

    // Um passo para cima, e depois dois na diagonal.
    expect(posicao(0)).toEqual({ x: antes.x + 2, y: antes.y - 3 });
  });

  it("sem seleção a seta não mexe no quadro nem é engolida", () => {
    render(<Whiteboard />);
    criaPostIt(400, 400);
    cliqueNoFundoLimpando();
    const antes = posicao(0);

    // Devolvida ao navegador: sem nada marcado, a seta ainda é a tecla que rola a página.
    expect(toque("ArrowRight")).toBe(false);
    expect(posicao(0)).toEqual(antes);
  });

  it("não move o quadro enquanto se escreve dentro do post-it", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(400, 400);
    const editor = screen.getByTestId("post-it-editor");

    // O erro clássico do atalho global: mover o post-it em vez de andar pelo texto.
    fireEvent.keyDown(editor, { key: "ArrowLeft" });
    fireEvent.keyDown(editor, { key: "ArrowUp" });

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(posicao(0)).toEqual({
      x: 400 - NOTE_SIZE.defaultWidth / 2,
      y: 400 - NOTE_SIZE.defaultHeight / 2,
    });
  });
});

describe("Whiteboard — seleção por arrasto no fundo", () => {
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** Arrasta um retângulo no fundo, de um canto ao outro, em pixels de tela. */
  function retangulo(
    de: [number, number],
    ate: [number, number],
    opcoes: { shiftKey?: boolean } = {},
  ): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      clientX: de[0],
      clientY: de[1],
      ...opcoes,
    });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
  }

  function selecionados(): (string | undefined)[] {
    return screen
      .queryAllByTestId("post-it")
      .filter((element) => element.dataset.selected === "true")
      .map((element) => element.dataset.noteId);
  }

  it("arrastar no fundo seleciona quem o retângulo toca", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(800, 300);
    const primeiro = postIt(0).dataset.noteId;

    retangulo([150, 150], [450, 450]);

    expect(selecionados()).toEqual([primeiro]);
  });

  it("o retângulo substitui a seleção anterior", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(800, 300);
    const primeiro = postIt(0).dataset.noteId;

    // O segundo ficou marcado ao ser criado; o retângulo pega só o primeiro.
    retangulo([150, 150], [450, 450]);

    expect(selecionados()).toEqual([primeiro]);
  });

  it("com Shift, o retângulo soma à seleção", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(800, 300);

    retangulo([150, 150], [450, 450], { shiftKey: true });

    expect(selecionados()).toHaveLength(2);
  });

  it("arrastar no vazio desmarca tudo", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);

    retangulo([900, 700], [1100, 900]);

    expect(selecionados()).toEqual([]);
  });

  it("com espaço, arrastar navega e não seleciona", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    criaPostIt(800, 300);
    const antes = selecionados();

    fireEvent.keyDown(document, { key: " " });
    retangulo([150, 150], [450, 450]);
    fireEvent.keyUp(document, { key: " " });

    // O mesmo arrasto que selecionaria agora move o quadro, e a seleção não muda.
    expect(selecionados()).toEqual(antes);
  });

  it("shift+clique no fundo não desmarca", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      shiftKey: true,
      clientX: 900,
      clientY: 700,
    });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 900, clientY: 700 });

    // O Shift acrescenta, no post-it e no retângulo; errar o alvo não pode desfazer a
    // seleção que o gesto ia ampliar.
    expect(selecionados()).toHaveLength(1);
  });

  it("clique sem Shift no fundo desmarca", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 900, clientY: 700 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 900, clientY: 700 });

    expect(selecionados()).toEqual([]);
  });

  it("um dedo navega, já que no toque não há espaço para segurar", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const surface = screen.getByTestId("viewport-surface");
    const antes = screen.getByTestId("viewport-layer").style.transform;

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      button: 0,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 160,
      clientY: 140,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 160,
      clientY: 140,
    });

    // O quadro andou, e a seleção ficou de pé: no toque, arrastar não desenha retângulo.
    expect(screen.getByTestId("viewport-layer").style.transform).not.toBe(antes);
    expect(selecionados()).toHaveLength(1);
  });

  it("com espaço, arrastar a partir de um post-it navega em vez de movê-lo", () => {
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const posicaoAntes = postIt(0).style.left;
    const camadaAntes = screen.getByTestId("viewport-layer").style.transform;

    fireEvent.keyDown(document, { key: " " });
    // O gesto nasce **no post-it**, que para o pointerdown antes da superfície: só a captura
    // chega antes dele.
    fireEvent.pointerDown(postIt(0), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("viewport-surface"), {
      pointerId: 1,
      clientX: 180,
      clientY: 150,
    });
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), { pointerId: 1 });
    fireEvent.keyUp(document, { key: " " });

    expect(screen.getByTestId("viewport-layer").style.transform).not.toBe(camadaAntes);
    expect(postIt(0).style.left).toBe(posicaoAntes);
  });

  it("o cursor conta qual gesto o arrasto vai virar", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    // Com a ferramenta de seleção — a de partida —, a seta do sistema: apontar e clicar é o
    // gesto que a pessoa já conhece de qualquer outra tela, e ele não precisa de desenho
    // próprio.
    expect(surface.className).toContain("cursor-default");

    fireEvent.keyDown(document, { key: " " });
    expect(surface.className).toContain("cursor-grab");
    expect(surface.dataset.spaceHeld).toBe("true");
  });

  /**
   * A cruz sobrou para quem mira: colocar uma nota é escolher um ponto, e é aí que ela
   * significa alguma coisa. Como padrão da ferramenta de seleção, ela estava ligada o tempo
   * todo prometendo uma mira que não existia.
   */
  it("a cruz é da colocação de nota, e não do estado de partida", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "n" });
    expect(surface.className).toContain("cursor-crosshair");

    fireEvent.keyDown(document, { key: "v" });
    expect(surface.className).toContain("cursor-default");
    expect(surface.className).not.toContain("cursor-crosshair");
  });
});

/** Simula um aparelho de toque (ou de ponteiro) para a consulta de mídia. */
function aparelhoDeToque(toque: boolean): void {
  stubMatchMedia(toque);
}

/** A escala mostrada pelos controles, em porcento. */
function escalaAtual(): string {
  return defined(
    screen.getByRole("button", { name: UI.en.zoom.reset }).textContent,
    "o percentual de zoom",
  );
}

/** Os traços gravados no board, cada um com o atributo `points` do SVG. */
function tracos(): (string | null)[] {
  return screen.queryAllByTestId("stroke").map((element) => element.getAttribute("points"));
}

/** Pinça dois dedos sobre o quadro, do afastamento inicial para o final. */
function pinca(de: number, para: number): void {
  const surface = screen.getByTestId("viewport-surface");

  fireEvent.pointerDown(surface, {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX: 0,
    clientY: 0,
  });
  fireEvent.pointerDown(surface, {
    pointerId: 2,
    pointerType: "touch",
    button: 0,
    clientX: de,
    clientY: 0,
  });
  fireEvent.pointerMove(surface, { pointerId: 2, pointerType: "touch", clientX: para, clientY: 0 });
  fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 });
  fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "touch", clientX: para, clientY: 0 });
}

describe("Whiteboard — toque", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dá zoom com a pinça de dois dedos", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    expect(escalaAtual()).toBe("100%");

    pinca(100, 200);

    // Dedos ao dobro da distância: o quadro dobra de escala.
    expect(escalaAtual()).toBe("200%");
  });

  it("reduz quando os dedos se aproximam", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);

    pinca(200, 100);

    expect(escalaAtual()).toBe("50%");
  });

  it("respeita o limite máximo de escala", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);

    // Um afastamento absurdo não pode passar do teto que os botões respeitam.
    pinca(10, 10000);

    expect(escalaAtual()).toBe(`${scaleAsPercent(MAX_SCALE)}%`);
  });

  it("respeita o limite mínimo de escala", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);

    pinca(10000, 10);

    expect(escalaAtual()).toBe(`${scaleAsPercent(MIN_SCALE)}%`);
  });

  it("pinça mesmo quando um dedo encosta num post-it", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    duploCliqueNoFundo(150, 150);
    fireEvent.blur(screen.getByRole("textbox", { name: UI.en.note.text }));
    const surface = screen.getByTestId("viewport-surface");

    // Primeiro dedo sobre a nota, segundo no fundo: num quadro cheio é o caso comum, e sem
    // contar o dedo na fase de captura a pinça nunca começaria.
    fireEvent.pointerDown(postIt(0), {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 350,
      clientY: 150,
    });

    expect(escalaAtual()).toBe("200%");
  });

  it("não move o post-it que o primeiro dedo tinha pegado", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    duploCliqueNoFundo(150, 150);
    fireEvent.blur(screen.getByRole("textbox", { name: UI.en.note.text }));
    const surface = screen.getByTestId("viewport-surface");
    const antes = postIt(0).style.transform;

    fireEvent.pointerDown(postIt(0), {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 250,
      clientY: 150,
    });
    fireEvent.pointerMove(postIt(0), {
      pointerId: 1,
      pointerType: "touch",
      clientX: 190,
      clientY: 190,
    });

    // O segundo dedo cancela o arraste da nota: sem isso ela andaria enquanto a pessoa acha
    // que só está dando zoom.
    expect(postIt(0).style.transform).toBe(antes);
  });

  it("ignora um terceiro dedo em vez de trocar a referência da pinça", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 0,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 3,
      pointerType: "touch",
      button: 0,
      clientX: 400,
      clientY: 0,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 0,
    });

    // O terceiro dedo não entra na conta; a escala segue a dos dois primeiros.
    expect(escalaAtual()).toBe("200%");
  });

  it("volta a navegar com um dedo quando o outro sai", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");
    const layer = screen.getByTestId("viewport-layer");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 0,
    });
    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 0 });
    const antes = layer.style.transform;
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 60,
      clientY: 40,
    });

    // O dedo que ficou retoma a navegação, sem salto: o quadro anda com ele.
    expect(layer.style.transform).not.toBe(antes);
  });

  it("solta a captura do dedo que sai da pinça", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");
    // O jsdom não implementa captura de ponteiro; o stub global responde sempre "não
    // capturado", e sem isto o teste passaria sem provar nada.
    vi.spyOn(surface, "hasPointerCapture").mockReturnValue(true);
    const release = vi.spyOn(surface, "releasePointerCapture");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 0,
    });
    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "touch", clientX: 100, clientY: 0 });

    // Na pinça os dedos são capturados sem um gesto correspondente; sem soltar aqui, a
    // captura ficaria pendurada no ponteiro que já saiu.
    expect(release).toHaveBeenCalledWith(2);
  });

  it("encerra a pinça quando o sistema cancela o gesto", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 0,
    });
    fireEvent.pointerCancel(surface, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerCancel(surface, { pointerId: 2, pointerType: "touch" });
    const depoisDoCancelamento = escalaAtual();
    // Dedos "fantasma": se o cancelamento não limpasse a contagem, este movimento ainda
    // seria lido como pinça.
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 400,
      clientY: 0,
    });

    expect(escalaAtual()).toBe(depoisDoCancelamento);
  });

  it("esconde os controles de zoom em aparelho de toque", () => {
    aparelhoDeToque(true);

    render(<Whiteboard />);

    // A pinça faz o mesmo trabalho, e o painel disputaria o canto do polegar.
    expect(screen.queryByRole("button", { name: UI.en.zoom.in })).toBeNull();
    expect(screen.queryByRole("button", { name: UI.en.zoom.out })).toBeNull();
  });

  it("mantém os controles em aparelho com ponteiro", () => {
    aparelhoDeToque(false);

    render(<Whiteboard />);

    expect(screen.getByRole("button", { name: UI.en.zoom.in })).toBeDefined();
  });

  it("não esconde as ações do documento no toque", () => {
    aparelhoDeToque(true);

    render(<Whiteboard />);

    // Só o zoom sai: compartilhar e criar um novo quadro não têm gesto equivalente.
    expect(screen.getByRole("button", { name: UI.en.save.action })).toBeDefined();
    expect(screen.getByRole("button", { name: UI.en.newBoard.action })).toBeDefined();
  });
});

describe("Whiteboard — apresentação do quadro vazio", () => {
  afterEach(() => vi.unstubAllGlobals());

  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  function apresentacao(): HTMLElement | null {
    return screen.queryByTestId("onboarding");
  }

  it("recebe quem chega no quadro vazio", () => {
    stubMatchMedia(false);

    render(<Whiteboard />);

    expect(apresentacao()).not.toBeNull();
  });

  it("sai de cena assim que o primeiro post-it aparece", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    duploCliqueNoFundo(300, 240);

    expect(apresentacao()).toBeNull();
  });

  /**
   * Quem apagou tudo já sabe criar um post-it — foi o que acabou de fazer. Trazer as
   * instruções de volta no meio de uma limpeza de quadro seria ensinar o já aprendido
   * justamente no momento em que a tela precisa estar livre.
   */
  it("não volta quando o quadro fica vazio de novo", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);
    criaPostIt(400, 400);

    fireEvent.keyDown(document, { key: "Delete" });

    expect(postIts()).toEqual([]);
    expect(apresentacao()).toBeNull();
  });

  /**
   * "Não volta quando o quadro fica vazio de novo" (acima) é sobre apagar dentro do **mesmo**
   * quadro. Este caso é o oposto: um quadro **novo** é, para quem olha, tão vazio quanto o
   * primeiro, e a apresentação precisa voltar — mesmo que a anterior já tivesse sido
   * dispensada.
   */
  it("volta quando um novo quadro é criado", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(<Whiteboard />);
    criaPostIt(400, 400);
    expect(apresentacao()).toBeNull();

    await user.click(screen.getByLabelText(UI.en.newBoard.action));
    await user.click(screen.getByRole("button", { name: UI.en.newBoard.startWithoutSaving }));

    expect(postIts()).toEqual([]);
    expect(apresentacao()).not.toBeNull();
  });

  /**
   * O quadro vazio não pergunta nada antes de recomeçar (não há trabalho para proteger), e é
   * justamente esse caminho mais curto que não pode ficar de fora.
   */
  it("volta mesmo quando o quadro já estava vazio", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    expect(apresentacao()).toBeNull();

    await user.click(screen.getByLabelText(UI.en.newBoard.action));

    expect(apresentacao()).not.toBeNull();
  });

  it("não aparece num board que já vem com post-its", () => {
    stubMatchMedia(false);

    render(
      <Whiteboard
        initialBoard={{
          version: SCHEMA_VERSION,
          notes: [
            {
              id: "a1b2c3",
              x: 10,
              y: 20,
              w: NOTE_SIZE.defaultWidth,
              h: NOTE_SIZE.defaultHeight,
              color: 0,
              text: "oi",
              z: 1,
            },
          ],
          strokes: [],
        }}
      />,
    );

    // A asserção do post-it é o que dá sentido à de cima: sem ela, um `initialBoard` que o
    // quadro ignorasse deixaria o teste passar pelo motivo errado.
    expect(postIts()).toHaveLength(1);
    expect(apresentacao()).toBeNull();
  });
});

describe("Whiteboard — atalhos de teclado", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // `restoreAllMocks` e não só `unstubAllGlobals`: um `spyOn(globalThis, "fetch")` do
    // caso anterior sobrevive, e o `spyOn` seguinte devolve **o mesmo** espião, com as
    // chamadas antigas ainda contadas. É a convenção do resto da suíte.
    vi.restoreAllMocks();
  });

  /**
   * `N` deixou de criar (#73). Ele arma a colocação, e quem diz onde a nota fica é o clique
   * seguinte — a mesma precisão que o duplo clique sempre teve, agora para quem está no
   * teclado. Criar no centro da área visível era pôr a nota num lugar que ninguém escolheu.
   */
  it("N não cria nada sozinho: arma a colocação e espera o clique", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "n" });

    expect(postIts()).toEqual([]);
    expect(screen.getByTestId("viewport-surface").dataset.placing).toBe("true");
  });

  it("N também dispensa a apresentação do quadro vazio", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "n" });

    expect(screen.queryByTestId("onboarding")).toBeNull();
  });

  it("Ctrl+S salva o quadro pelo mesmo caminho do botão", async () => {
    stubMatchMedia(false);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ url: "https://site/board/abc" }));
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "s", ctrlKey: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/boards",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByLabelText(UI.en.save.linkField)).toHaveProperty(
      "value",
      "https://site/board/abc",
    );
  });

  it("⌘+S salva mesmo com o cursor dentro de um post-it", () => {
    stubMatchMedia(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 240);

    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "s", metaKey: true });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("Whiteboard — navegar com a rodinha apertada", () => {
  /** Aperta o botão do meio e arrasta: o gesto de quem vem de editor de imagem ou de mapa. */
  function arrastaComARodinha(dx: number, dy: number): boolean {
    const surface = screen.getByTestId("viewport-surface");
    const down = createEvent.pointerDown(surface, {
      pointerId: 1,
      button: 1,
      clientX: 0,
      clientY: 0,
    });

    fireEvent(surface, down);
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: dx, clientY: dy });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: dx, clientY: dy });

    return down.defaultPrevented;
  }

  /** Onde o post-it está na tela, que é o que denuncia o deslocamento do quadro. */
  function posicaoDoPostIt(): { x: number; y: number } {
    return {
      x: Number.parseFloat(postIt(0).style.left),
      y: Number.parseFloat(postIt(0).style.top),
    };
  }

  /**
   * O gesto da rodinha já funcionava; o que faltava era ele se anunciar (#84).
   *
   * Mão **fechada**, e não a mão aberta do espaço: a rodinha não promete o gesto, confirma
   * que ele está acontecendo — ela só se conhece no `pointerdown`, que é o mesmo instante em
   * que o pan começa.
   */
  it("a rodinha apertada mostra a mão, e solta a devolve", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");
    expect(surface.className).toContain("cursor-default");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 1, clientX: 0, clientY: 0 });
    expect(surface.className).toContain("cursor-grabbing");
    expect(surface.dataset.wheelPanning).toBe("true");

    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 60, clientY: 30 });
    // Durante o movimento nada muda: o cursor já está certo, e o pan não redesenha por evento.
    expect(surface.className).toContain("cursor-grabbing");

    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 60, clientY: 30 });
    expect(surface.className).toContain("cursor-default");
    expect(surface.dataset.wheelPanning).toBe("false");
  });

  /**
   * Uma notificação do sistema no meio do gesto não pode deixar a mão fechada na tela para
   * sempre. O `pointercancel` passa pelo mesmo caminho de saída que a subida.
   */
  it("o gesto cancelado pelo sistema também devolve o cursor", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(surface, { pointerId: 1 });

    expect(surface.className).toContain("cursor-default");
    expect(surface.dataset.wheelPanning).toBe("false");
  });

  /**
   * Espaço ganha de tudo, inclusive de um pan já em curso: é a mesma prioridade com que os
   * gestos se decidem no `pointerdown`, e o desenho não pode prometer diferente do gesto.
   */
  it("com espaço segurado, o espaço manda no cursor", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 1, clientX: 0, clientY: 0 });
    fireEvent.keyDown(document, { key: " " });

    // A classe do espaço, e não a da rodinha: `cursor-grab` com o `active:` que fecha a mão
    // ao apertar. Comparada como classe inteira, porque `cursor-grabbing` aparece dentro da
    // variante `active:` e um `toContain` solto passaria pelos dois casos.
    const classes = surface.className.split(/\s+/);
    expect(classes).toContain("cursor-grab");
    expect(classes).toContain("active:cursor-grabbing");
    expect(classes).not.toContain("cursor-grabbing");
  });

  /** A mão da rodinha ganha do lápis: navegar existe em qualquer ferramenta. */
  it("a rodinha mostra a mão mesmo com o lápis ligado", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");
    expect(surface.className).toContain("cursor-pencil");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 1, clientX: 0, clientY: 0 });

    expect(surface.className).toContain("cursor-grabbing");
    expect(surface.className).not.toContain("cursor-pencil");
  });

  it("desloca o quadro como segurar espaço", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 240);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    const antes = posicaoDoPostIt();

    arrastaComARodinha(80, 40);

    // O post-it não se move em coordenadas de canvas: quem andou foi o quadro inteiro.
    expect(posicaoDoPostIt()).toEqual(antes);
    expect(screen.getByTestId("viewport-layer").style.transform).toContain("translate(80px, 40px)");
  });

  /**
   * Sem isto, o Windows e o Linux entram no modo de rolagem automática — aquele ícone que
   * fica preso no meio da tela rolando a página sozinho enquanto se tenta navegar o quadro.
   */
  it("engole o evento para o navegador não entrar em rolagem automática", () => {
    render(<Whiteboard />);

    expect(arrastaComARodinha(10, 10)).toBe(true);
  });

  it("não seleciona: a rodinha navega, e quem seleciona é o botão principal", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 240);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    fireEvent.pointerDown(screen.getByTestId("viewport-surface"), {
      pointerId: 9,
      button: 0,
      clientX: 900,
      clientY: 700,
    });
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), { pointerId: 9 });

    arrastaComARodinha(-400, -300);

    expect(screen.queryByTestId("selection-box")).toBeNull();
  });
});

describe("Whiteboard — colocar nota (#73)", () => {
  /** O botão da moldura, que é a porta do modo para quem não tem teclado. */
  function botaoNota(): HTMLElement {
    return screen.getByLabelText(UI.en.note.action);
  }

  function modoArmado(): boolean {
    return botaoNota().getAttribute("aria-pressed") === "true";
  }

  function previa(): HTMLElement | null {
    return screen.queryByTestId("note-placement-preview");
  }

  /** Move o ponteiro sobre o quadro, que é o que a prévia segue. */
  function moveOPonteiro(x: number, y: number): void {
    fireEvent.pointerMove(screen.getByTestId("viewport-surface"), {
      pointerId: 1,
      clientX: x,
      clientY: y,
    });
  }

  /** Clica no quadro: com o modo armado, é o gesto que fixa a nota. */
  function clicaNoQuadro(x: number, y: number): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: x, clientY: y });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: x, clientY: y });
  }

  /** Canto superior esquerdo da prévia, em unidades de canvas. */
  function cantoDaPrevia(): { x: number; y: number } {
    const caixa = screen.getByTestId("note-placement-preview");
    return {
      x: Number.parseFloat(caixa.style.left),
      y: Number.parseFloat(caixa.style.top),
    };
  }

  it("N arma o modo, e N de novo desarma", () => {
    render(<Whiteboard />);

    expect(modoArmado()).toBe(false);

    fireEvent.keyDown(document, { key: "n" });
    expect(modoArmado()).toBe(true);

    fireEvent.keyDown(document, { key: "n" });
    expect(modoArmado()).toBe(false);
  });

  it("o botão da moldura arma e desarma, como a tecla", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    await user.click(botaoNota());
    expect(modoArmado()).toBe(true);
    expect(screen.getByTestId("viewport-surface").dataset.placing).toBe("true");

    await user.click(botaoNota());
    expect(modoArmado()).toBe(false);
  });

  it("a nota translúcida acompanha o cursor", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });

    moveOPonteiro(300, 240);
    // O centro da nota vai para o cursor, então o canto sobe metade do tamanho.
    expect(cantoDaPrevia()).toEqual({
      x: 300 - NOTE_SIZE.defaultWidth / 2,
      y: 240 - NOTE_SIZE.defaultHeight / 2,
    });

    moveOPonteiro(500, 400);
    expect(cantoDaPrevia()).toEqual({
      x: 500 - NOTE_SIZE.defaultWidth / 2,
      y: 400 - NOTE_SIZE.defaultHeight / 2,
    });
  });

  /**
   * O critério que este caso guarda é literal: "sem ponteiro sobre o quadro, a
   * pré-visualização não aparece em um canto arbitrário". Depois de `N` com o cursor fora
   * da janela não há ponto nenhum para obedecer, e desenhar na origem — ou em qualquer
   * outro lugar escolhido por falta de resposta — seria pior do que não desenhar.
   */
  it("sem ponteiro sobre o quadro, não desenha prévia nenhuma", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "n" });

    expect(modoArmado()).toBe(true);
    expect(previa()).toBeNull();
  });

  it("o cursor saindo do quadro leva a prévia junto", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);

    fireEvent.pointerLeave(screen.getByTestId("viewport-surface"), { pointerId: 1 });

    expect(previa()).toBeNull();
  });

  /**
   * A promessa da prévia é "o que você vê é o que vai ficar". Por isso o tamanho e a cor
   * são comparados com um post-it de verdade, e não com literais: um valor escrito à mão
   * aqui continuaria passando no dia em que a nota mudasse de tamanho ou de cor padrão.
   */
  it("tem o tamanho e a cor da nota que será criada", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(600, 500);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    const notaDeVerdade = postIt(0);

    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);
    const caixa = screen.getByTestId("note-placement-preview");

    expect(caixa.style.width).toBe(notaDeVerdade.style.width);
    expect(caixa.style.height).toBe(notaDeVerdade.style.height);
    expect(caixa.style.backgroundColor).toBe(notaDeVerdade.style.backgroundColor);
  });

  it("não captura o ponteiro: o clique atravessa e chega ao quadro", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);

    expect(screen.getByTestId("note-placement-preview").className).toContain("pointer-events-none");
  });

  it("o clique fixa a nota naquele ponto, já pronta para escrever", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);

    clicaNoQuadro(300, 240);

    expect(postIts()).toHaveLength(1);
    const nota = postIt(0);
    expect(Number.parseFloat(nota.style.left) + Number.parseFloat(nota.style.width) / 2).toBe(300);
    expect(Number.parseFloat(nota.style.top) + Number.parseFloat(nota.style.height) / 2).toBe(240);
    expect(document.activeElement).toBe(screen.getByTestId("post-it-editor"));
  });

  /**
   * Colocar encerra o modo. Um modo que ficasse armado transformaria o clique seguinte —
   * dado para marcar a nota que acabou de nascer — numa segunda nota por cima dela.
   */
  it("colocar desarma o modo, e a prévia some junto", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);

    clicaNoQuadro(300, 240);

    expect(modoArmado()).toBe(false);
    expect(previa()).toBeNull();
  });

  /**
   * O critério mais importante da issue: um `N` cancelado não deixa rastro. Nada chega à
   * store até o clique — a prévia é estado de gesto e vive dentro do `Viewport` —, e é por
   * isso que o autosave, que escuta a store, não tem o que gravar.
   */
  it("Esc sai do modo sem criar nada", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);
    moveOPonteiro(420, 360);
    moveOPonteiro(150, 90);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(postIts()).toEqual([]);
    expect(modoArmado()).toBe(false);
    expect(previa()).toBeNull();
  });

  it("N de novo também cancela, sem criar nada", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);

    fireEvent.keyDown(document, { key: "n" });

    expect(postIts()).toEqual([]);
    expect(previa()).toBeNull();
  });

  /**
   * A prévia é desenhada dentro da camada transformada, mas o ponto é guardado em pixels de
   * tela: é o que a mantém sob o cursor quando quem anda é o quadro. Guardado em canvas, o
   * fantasma ficaria grudado no ponto do quadro e escaparia do cursor durante um pan.
   *
   * A roda é o gesto certo para provar isso porque ela move o quadro **sem** mover o
   * ponteiro: se a posição só se corrigisse no `pointermove` seguinte, este caso falharia.
   */
  it("a prévia continua sob o cursor quando o quadro anda por baixo", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });
    moveOPonteiro(300, 240);
    const antes = cantoDaPrevia();

    rola({ deltaY: 100 });

    // O quadro subiu 100px, então o mesmo pixel de tela passou a ser 100 unidades mais
    // abaixo no canvas — e é para lá que a prévia vai, para continuar sob o cursor.
    expect(cantoDaPrevia()).toEqual({ x: antes.x, y: antes.y + 100 });
  });

  it("dispensa a apresentação do quadro vazio, mesmo antes de a nota existir", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "n" });

    expect(screen.queryByTestId("onboarding")).toBeNull();
  });

  /**
   * Os dois modos são exclusivos por natureza — um gesto de ponteiro faz uma coisa de cada
   * vez —, e o quadro guarda um modo só. Este caso é o que impede alguém de trocar aquele
   * estado por dois booleanos e reabrir a possibilidade de os dois ficarem ligados juntos.
   */
  it("armar a colocação desliga o lápis, e ligar o lápis desarma a colocação", () => {
    render(<Whiteboard />);
    const lapisLigado = () =>
      screen.getByLabelText(UI.en.pencil.action).getAttribute("aria-pressed") === "true";

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "n" });
    expect(modoArmado()).toBe(true);
    expect(lapisLigado()).toBe(false);

    fireEvent.keyDown(document, { key: "p" });
    expect(lapisLigado()).toBe(true);
    expect(modoArmado()).toBe(false);
  });

  /**
   * Colocar ganha do retângulo de seleção: com o modo armado, arrastar o fundo deixaria a
   * nota nascer no fim de uma seleção que ninguém pediu.
   */
  it("o clique com o modo armado não desenha retângulo de seleção", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });

    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 400, clientY: 300 });

    expect(screen.queryByTestId("selection-box")).toBeNull();
    expect(postIts()).toHaveLength(1);
  });

  /**
   * Navegar é o gesto que precisa existir em qualquer modo, e quem segurou espaço está
   * procurando onde colocar a nota — não colocando-a.
   */
  it("com espaço segurado, arrastar navega em vez de colocar", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });

    navegaOQuadro(120, 80);

    expect(postIts()).toEqual([]);
    expect(modoArmado()).toBe(true);
  });
});

describe("Whiteboard — copiar e colar (#88)", () => {
  /** O que o quadro escreveu na área de transferência do sistema. */
  let copiado: string | null = null;

  function fingeClipboard(): void {
    copiado = null;
  }

  function criaPostIt(x: number, y: number, texto = ""): void {
    duploCliqueNoFundo(x, y);
    const editor = screen.getByTestId("post-it-editor");
    if (texto !== "") fireEvent.change(editor, { target: { value: texto } });
    fireEvent.keyDown(editor, { key: "Escape" });
  }

  function desenha(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.keyDown(document, { key: "v" });
  }

  /**
   * Dispara o evento nativo de copiar, que é por onde o recorte sai de verdade.
   *
   * Pelo evento, e não pela tecla: é o navegador que abre a janela em que a escrita pode
   * acontecer de forma síncrona, e foi trocar `writeText` no `keydown` por isto que fez
   * copiar passar a funcionar de verdade.
   */
  function copia(target: EventTarget = document.body): boolean {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        setData: (_tipo: string, text: string) => {
          copiado = text;
        },
      },
    });
    act(() => {
      target.dispatchEvent(event);
    });

    return event.defaultPrevented;
  }

  /**
   * Dispara o evento nativo de colar, que é por onde o conteúdo chega de verdade.
   *
   * Dentro de `act`, e pela mesma razão do `rola`: o `dispatchEvent` cru não passa pelo
   * empacotamento que o `fireEvent` faz, e o `setState` do ouvinte fica agendado sem ser
   * pintado. Devolve se o evento foi engolido — é assim que o quadro diz que entendeu o
   * conteúdo.
   */
  function cola(text: string, target: EventTarget = document.body): boolean {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => text },
    });
    act(() => {
      target.dispatchEvent(event);
    });

    return event.defaultPrevented;
  }

  function tracos(): HTMLElement[] {
    return screen.queryAllByTestId("stroke-group");
  }

  function marcados(): number {
    return (
      postIts().filter((each) => each.dataset.selected === "true").length +
      tracos().filter((each) => each.dataset.selected === "true").length
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it("copia a seleção e cola de volta no quadro", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200, "oi");
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });

    copia();
    expect(copiado).not.toBeNull();

    cola(copiado ?? "");

    expect(postIts()).toHaveLength(2);
  });

  it("copia notas e traços da mesma seleção", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    desenha([400, 400], [500, 500]);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });

    copia();
    cola(copiado ?? "");

    expect(postIts()).toHaveLength(2);
    expect(tracos()).toHaveLength(2);
  });

  /**
   * O colado nasce marcado: é sobre ele que a próxima ação age, e é também o que torna
   * visível que alguma coisa aconteceu.
   */
  it("o que foi colado nasce marcado, e só ele", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");

    expect(marcados()).toBe(1);
    expect(postIt(1).dataset.selected).toBe("true");
  });

  /** Colar em cima do original é indistinguível de não ter colado. */
  it("o colado não fica escondido embaixo do original", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");

    expect(postIt(1).style.left).not.toBe(postIt(0).style.left);
    expect(postIt(1).style.top).not.toBe(postIt(0).style.top);
  });

  it("colar duas vezes dá dois resultados distintos, e não dois empilhados", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");
    cola(copiado ?? "");

    expect(postIts()).toHaveLength(3);
    const posicoes = postIts().map((each) => `${each.style.left},${each.style.top}`);
    expect(new Set(posicoes).size).toBe(3);
  });

  it("o colado tem id próprio: não duplica identidade no board", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");

    const ids = postIts().map((each) => each.dataset.noteId);
    expect(new Set(ids).size).toBe(2);
  });

  it("o texto do post-it vai junto", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200, "levo isto comigo");
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");

    expect(postIt(1).textContent).toContain("levo isto comigo");
  });

  it("colar é um passo de desfazer, mesmo com vários elementos", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(500, 200);
    desenha([700, 400], [800, 500]);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();
    cola(copiado ?? "");
    expect(postIts()).toHaveLength(4);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(postIts()).toHaveLength(2);
    expect(tracos()).toHaveLength(1);
  });

  it("copiar sem seleção não toca na área de transferência", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    // Um clique no fundo desmarca tudo.
    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 9, button: 0, clientX: 900, clientY: 700 });
    fireEvent.pointerUp(surface, { pointerId: 9, clientX: 900, clientY: 700 });

    const engoliu = copia();

    // O que a pessoa tinha copiado de outro programa continua lá, e o evento segue intacto
    // para o navegador fazer o que quiser com ele.
    expect(copiado).toBeNull();
    expect(engoliu).toBe(false);
  });

  /**
   * O `preventDefault` é o ponto do mecanismo: ele **substitui** a cópia nativa em vez de
   * disputar com ela. Sem isso, o navegador seguiria copiando a seleção de texto do
   * documento — que não existe, porque o quadro tem `select-none` — por cima do recorte.
   */
  it("copiar substitui a cópia nativa, e não disputa com ela", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });

    expect(copia()).toBe(true);
    expect(copiado).not.toBeNull();
  });

  /** Dentro de um post-it, copiar é do texto: o quadro não intercepta. */
  it("copiar dentro do editor pertence ao texto", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    duploCliqueNoFundo(600, 200);

    const engoliu = copia(screen.getByTestId("post-it-editor"));

    expect(engoliu).toBe(false);
    expect(copiado).toBeNull();
  });

  it("colar texto que não é do quadro não quebra nem esvazia o board", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);

    cola("uma frase qualquer");
    cola('{"foo":1}');
    cola("[1,2,3]");

    expect(postIts()).toHaveLength(1);
  });

  /** Dentro de um post-it, colar é do texto: quem escreve quer a frase, não um post-it novo. */
  it("colar dentro do editor pertence ao texto", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();
    duploCliqueNoFundo(600, 200);

    cola(copiado ?? "", screen.getByTestId("post-it-editor"));

    // Dois: o original e o que o duplo clique criou. Nenhum terceiro veio da colagem.
    expect(postIts()).toHaveLength(2);
  });

  /** Só o que foi entendido é engolido; o resto continua sendo do navegador. */
  it("engole o evento do recorte, e devolve o do texto estranho", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    expect(cola(copiado ?? "")).toBe(true);
    expect(cola("uma frase qualquer")).toBe(false);
  });

  /** Colar dez post-its não pode abrir um editor. */
  it("o post-it colado não entra em edição", () => {
    fingeClipboard();
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    copia();

    cola(copiado ?? "");

    expect(screen.queryByTestId("post-it-editor")).toBeNull();
  });
});

describe("Whiteboard — selecionar tudo (#85)", () => {
  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  function desenha(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.keyDown(document, { key: "v" });
  }

  function marcados(): { notas: number; tracos: number } {
    return {
      notas: postIts().filter((element) => element.dataset.selected === "true").length,
      tracos: screen
        .queryAllByTestId("stroke-group")
        .filter((element) => element.dataset.selected === "true").length,
    };
  }

  function selecionaTudo(): void {
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
  }

  it("Ctrl+A marca notas e traços de uma vez", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(600, 200);
    desenha([100, 400], [300, 500]);

    selecionaTudo();

    expect(marcados()).toEqual({ notas: 2, tracos: 1 });
  });

  it("⌘+A faz o mesmo, para quem está no Mac", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);

    fireEvent.keyDown(document, { key: "a", metaKey: true });

    expect(marcados().notas).toBe(1);
  });

  it("marca também o que estava fora da seleção anterior", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(600, 200);
    criaPostIt(900, 200);
    // A criação já deixa marcada só a última.
    expect(marcados().notas).toBe(1);

    selecionaTudo();

    expect(marcados().notas).toBe(3);
  });

  it("num quadro vazio não deixa seleção fantasma", () => {
    render(<Whiteboard />);

    selecionaTudo();

    expect(marcados()).toEqual({ notas: 0, tracos: 0 });
    // Sem seleção não há barra de ações: a peça não pode aparecer ancorada em nada.
    expect(screen.queryByTestId("selection-toolbar")).toBeNull();
  });

  it("Delete depois de Ctrl+A esvazia o quadro", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(600, 200);
    desenha([100, 400], [300, 500]);

    selecionaTudo();
    fireEvent.keyDown(document, { key: "Delete" });

    expect(postIts()).toEqual([]);
    expect(screen.queryAllByTestId("stroke-group")).toEqual([]);
  });

  /**
   * Uma publicação só, e por isso um passo só de desfazer (#86): a unidade de passo é o
   * `commit` da store, e apagar notas e traços juntos passa por `removeElements`.
   */
  it("o quadro esvaziado por Ctrl+A e Delete volta inteiro num Ctrl+Z", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(600, 200);
    desenha([100, 400], [300, 500]);

    selecionaTudo();
    fireEvent.keyDown(document, { key: "Delete" });
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(postIts()).toHaveLength(2);
    expect(screen.queryAllByTestId("stroke-group")).toHaveLength(1);
  });

  /**
   * Dentro de um post-it a tecla é do texto. É a única forma que quem escreve tem de marcar
   * o que escreveu, e roubá-la seria pior do que não ter o atalho.
   */
  it("Ctrl+A dentro do editor pertence ao texto", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    // Criar já marca a nota nova, e só ela: é essa marcação que precisa continuar de pé.
    duploCliqueNoFundo(600, 200);
    expect(marcados().notas).toBe(1);

    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "a", ctrlKey: true });

    // Continua uma, e não duas: o quadro não viu a tecla, e a nota antiga segue desmarcada.
    expect(marcados().notas).toBe(1);
  });

  /** Seleção mista: a barra aparece e colorir alcança só as notas (a #70 já definiu isso). */
  it("a barra de ações se comporta como numa seleção mista", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    desenha([100, 400], [300, 500]);

    selecionaTudo();

    expect(screen.getByTestId("selection-toolbar")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(UI.en.note.colors.green));
    expect(postIt(0).style.backgroundColor).toBe("var(--color-note-green)");
    expect(screen.queryAllByTestId("stroke-group")).toHaveLength(1);
  });
});

describe("Whiteboard — desfazer e refazer (#86, #87)", () => {
  function desfazer(): HTMLElement {
    return screen.getByLabelText(UI.en.history.undo);
  }

  function refazer(): HTMLElement {
    return screen.getByLabelText(UI.en.history.redo);
  }

  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  function ctrl(key: string, extra: Record<string, unknown> = {}): void {
    fireEvent.keyDown(document, { key, ctrlKey: true, ...extra });
  }

  it("Ctrl+Z desfaz a criação de um post-it", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    expect(postIts()).toHaveLength(1);

    ctrl("z");

    expect(postIts()).toEqual([]);
  });

  it("Ctrl+Shift+Z refaz o que o desfazer levou", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    ctrl("z");

    ctrl("z", { shiftKey: true });

    expect(postIts()).toHaveLength(1);
  });

  /** É a convenção do Windows, e quem a tem no dedo não deveria ter de aprender a outra. */
  it("Ctrl+Y também refaz", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    ctrl("z");

    ctrl("y");

    expect(postIts()).toHaveLength(1);
  });

  it("desfaz o apagamento e devolve o que foi apagado", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    fireEvent.keyDown(document, { key: "Delete" });
    expect(postIts()).toEqual([]);

    ctrl("z");

    expect(postIts()).toHaveLength(1);
  });

  /**
   * O critério que a issue chamou de mais importante: uma seleção de vários apagada de uma
   * vez volta de uma vez. Sai de graça porque a unidade de passo é o `commit` da store, que
   * já era o mesmo gargalo que decidia o que é **uma** publicação.
   */
  it("uma seleção apagada de uma vez volta de uma vez", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(500, 200);
    criaPostIt(800, 200);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    // Sem `Ctrl+A` ainda (#85): o retângulo de seleção faz o mesmo trabalho aqui.
    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 3, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 3, clientX: 1200, clientY: 600 });
    fireEvent.pointerUp(surface, { pointerId: 3, clientX: 1200, clientY: 600 });
    fireEvent.keyDown(document, { key: "Delete" });
    expect(postIts()).toEqual([]);

    ctrl("z");

    expect(postIts()).toHaveLength(3);
  });

  it("desfaz o rabisco", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 160 });
    fireEvent.keyDown(document, { key: "v" });
    expect(screen.queryAllByTestId("stroke-group")).toHaveLength(1);

    ctrl("z");

    expect(screen.queryAllByTestId("stroke-group")).toEqual([]);
  });

  it("desfaz o arraste, devolvendo a posição anterior", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    const antes = postIt(0).style.left;
    const nota = postIt(0);
    fireEvent.pointerDown(nota, { pointerId: 4, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(nota, { pointerId: 4, clientX: 90, clientY: 0 });
    fireEvent.pointerUp(nota, { pointerId: 4, clientX: 90, clientY: 0 });
    expect(postIt(0).style.left).not.toBe(antes);

    ctrl("z");

    expect(postIt(0).style.left).toBe(antes);
  });

  /**
   * Fazer algo novo apaga o que havia para refazer: o futuro guardado era o de outra linha
   * do tempo, e colá-lo depois seria trazer um estado que nunca veio daqui.
   */
  it("alterar depois de desfazer descarta o refazer", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    ctrl("z");
    // Desfeito, há o que refazer.
    expect(refazer().hasAttribute("disabled")).toBe(false);

    criaPostIt(600, 400);

    // E a alteração nova apaga esse futuro: ele era de outra linha do tempo.
    expect(refazer().hasAttribute("disabled")).toBe(true);
    expect(postIts()).toHaveLength(1);
  });

  it("desfazer num quadro intocado não faz nada", () => {
    render(<Whiteboard />);

    ctrl("z");
    ctrl("z");

    expect(postIts()).toEqual([]);
  });

  /**
   * `Ctrl+Z` dentro de um post-it é o desfazer do próprio texto. Roubá-lo tiraria de quem
   * está escrevendo a única forma de voltar atrás no que escreveu.
   */
  it("Ctrl+Z dentro do editor pertence ao texto", () => {
    render(<Whiteboard />);
    criaPostIt(200, 200);
    criaPostIt(600, 200);
    duploCliqueNoFundo(900, 200);

    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "z", ctrlKey: true });

    // Nenhum post-it desapareceu: o quadro não viu a tecla.
    expect(postIts()).toHaveLength(3);
  });

  it("os botões começam desabilitados e habilitam com o histórico", () => {
    render(<Whiteboard />);

    expect(desfazer().hasAttribute("disabled")).toBe(true);
    expect(refazer().hasAttribute("disabled")).toBe(true);

    criaPostIt(200, 200);
    expect(desfazer().hasAttribute("disabled")).toBe(false);
    expect(refazer().hasAttribute("disabled")).toBe(true);

    ctrl("z");
    expect(desfazer().hasAttribute("disabled")).toBe(true);
    expect(refazer().hasAttribute("disabled")).toBe(false);
  });

  it("os botões fazem o mesmo que os atalhos", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(200, 200);

    await user.click(desfazer());
    expect(postIts()).toEqual([]);

    await user.click(refazer());
    expect(postIts()).toHaveLength(1);
  });

  /**
   * O editor é não controlado — quem manda enquanto se digita é o DOM. Desfazer por baixo
   * dele deixaria um textarea escrevendo num texto que o board já não tem, e ao sair ele
   * gravaria de volta justamente o que se acabou de desfazer.
   */
  it("desfazer fecha a edição em curso", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(200, 200);
    expect(screen.getByTestId("post-it-editor")).toBeTruthy();

    ctrl("z");

    expect(screen.queryByTestId("post-it-editor")).toBeNull();
  });

  it("desfazer o novo quadro devolve o que havia nele", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    criaPostIt(200, 200);

    await user.click(screen.getByLabelText(UI.en.newBoard.action));
    await user.click(screen.getByRole("button", { name: UI.en.newBoard.startWithoutSaving }));
    expect(postIts()).toEqual([]);

    ctrl("z");

    // A ação mais destrutiva do quadro é a que mais precisa de volta.
    expect(postIts()).toHaveLength(1);
  });
});

describe("Whiteboard — ferramenta de seleção (#83)", () => {
  function botao(nome: string): HTMLElement {
    return screen.getByLabelText(nome);
  }

  function ativo(nome: string): boolean {
    return botao(nome).getAttribute("aria-pressed") === "true";
  }

  const SELECAO = UI.en.select.action;
  const NOTA = UI.en.note.action;
  const LAPIS = UI.en.pencil.action;

  /**
   * A ferramenta de partida do quadro.
   *
   * O estado sempre existiu — era ele que fazia arrastar o fundo desenhar o retângulo de
   * seleção —, mas nascia sem representação: os três botões apareciam apagados enquanto uma
   * das três estava, de fato, valendo.
   */
  it("o quadro começa com a seleção ativa, sem ninguém ter clicado", () => {
    render(<Whiteboard />);

    expect(ativo(SELECAO)).toBe(true);
    expect(ativo(NOTA)).toBe(false);
    expect(ativo(LAPIS)).toBe(false);
  });

  it("V escolhe a seleção", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    expect(ativo(SELECAO)).toBe(false);

    fireEvent.keyDown(document, { key: "v" });

    expect(ativo(SELECAO)).toBe(true);
    expect(ativo(LAPIS)).toBe(false);
  });

  /**
   * `V` escolhe, e não alterna. A ferramenta de partida não tem para onde ser desligada —
   * alternar aqui exigiria de volta o estado "nenhuma ferramenta", que é justamente o que
   * esta issue veio tirar.
   */
  it("V de novo não desliga a seleção", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "v" });
    fireEvent.keyDown(document, { key: "v" });

    expect(ativo(SELECAO)).toBe(true);
  });

  it("o botão escolhe a seleção, como a tecla", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    await user.click(botao(SELECAO));

    expect(ativo(SELECAO)).toBe(true);
    expect(screen.getByTestId("viewport-surface").dataset.pencil).toBe("false");
  });

  it("clicar no botão já ativo não muda nada", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    await user.click(botao(SELECAO));

    expect(ativo(SELECAO)).toBe(true);
  });

  /** Uma ferramenta de cada vez: escolher o cursor larga as outras duas. */
  it("a seleção exclui o lápis e a colocação de nota", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "n" });
    fireEvent.keyDown(document, { key: "v" });
    expect(ativo(SELECAO)).toBe(true);
    expect(ativo(NOTA)).toBe(false);
    expect(screen.getByTestId("viewport-surface").dataset.placing).toBe("false");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "v" });
    expect(ativo(SELECAO)).toBe(true);
    expect(ativo(LAPIS)).toBe(false);
  });

  /**
   * Desligar uma ferramenta deixou de ser uma ação sem destino: `P` no lápis ligado, `Esc` e
   * `V` chegam todos ao mesmo lugar, que agora tem nome.
   */
  it("largar o lápis leva à seleção, por qualquer um dos três caminhos", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "p" });
    expect(ativo(SELECAO)).toBe(true);

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(ativo(SELECAO)).toBe(true);

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "v" });
    expect(ativo(SELECAO)).toBe(true);
  });

  it("colocar uma nota devolve a seleção", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "n" });

    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 200, clientY: 200 });

    expect(ativo(SELECAO)).toBe(true);
  });

  it("V não dispara com o cursor dentro do texto de uma nota", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    duploCliqueNoFundo(300, 300);

    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "v" });

    // A tecla pertence a quem está escrevendo: `v` no meio de uma frase é a letra.
    expect(ativo(SELECAO)).toBe(false);
  });

  it("V com modificador segurado é do navegador, não do quadro", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    fireEvent.keyDown(document, { key: "v", ctrlKey: true });
    fireEvent.keyDown(document, { key: "v", metaKey: true });

    // `Ctrl+V` é colar, e roubá-la seria pior do que não ter atalho.
    expect(ativo(SELECAO)).toBe(false);
  });

  /**
   * A apresentação não ganhou linha para o `V` (#83): ela ensina o que não se descobre
   * olhando, e `V` leva à ferramenta em que o quadro já começa. O teto de quatro que a #72
   * registrou continua valendo.
   */
  it("a apresentação continua com quatro linhas", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText(UI.en.select.action)).toBeNull();
  });
});

describe("Whiteboard — modo lápis", () => {
  /** O botão do lápis na moldura, que é a indicação visível de que o modo está ligado. */
  function botaoLapis(): HTMLElement {
    return screen.getByLabelText(UI.en.pencil.action);
  }

  function modoLigado(): boolean {
    return botaoLapis().getAttribute("aria-pressed") === "true";
  }

  /**
   * Rabisca de um ponto ao outro, passando por `intermediarios` pontos de tela.
   *
   * Vários `pointermove`, e não um só: é assim que o ponteiro reporta um traço, e é o que
   * separa "desenhou uma linha" de "clicou e soltou noutro lugar".
   */
  function rabisca(de: [number, number], ate: [number, number], intermediarios = 4): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    for (let passo = 1; passo <= intermediarios; passo += 1) {
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: de[0] + ((ate[0] - de[0]) * passo) / intermediarios,
        clientY: de[1] + ((ate[1] - de[1]) * passo) / intermediarios,
      });
    }
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
  }

  it("P liga o modo, e P de novo desliga", () => {
    render(<Whiteboard />);

    expect(modoLigado()).toBe(false);

    fireEvent.keyDown(document, { key: "p" });
    expect(modoLigado()).toBe(true);

    fireEvent.keyDown(document, { key: "p" });
    expect(modoLigado()).toBe(false);
  });

  it("Esc desliga o modo", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(modoLigado()).toBe(false);
  });

  it("Esc com o modo desligado não o liga", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(modoLigado()).toBe(false);
  });

  it("o botão da moldura liga e desliga, como a tecla", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    await user.click(botaoLapis());
    expect(modoLigado()).toBe(true);
    expect(screen.getByTestId("viewport-surface").dataset.pencil).toBe("true");

    await user.click(botaoLapis());
    expect(modoLigado()).toBe(false);
  });

  it("P não dispara com o cursor dentro do texto de uma nota", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 300);

    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "p" });

    expect(modoLigado()).toBe(false);
  });

  it("P com modificador segurado é do navegador, não do quadro", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "p", ctrlKey: true });
    fireEvent.keyDown(document, { key: "p", metaKey: true });

    expect(modoLigado()).toBe(false);
  });

  it("arrastar com o modo ligado desenha, e o traço entra no board ao soltar", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    rabisca([100, 100], [300, 200]);

    expect(tracos()).toHaveLength(1);
    // O traço guarda por onde passou: começa e termina onde o ponteiro começou e terminou.
    expect(tracos()[0]).toMatch(/^100,100 /);
    expect(tracos()[0]).toMatch(/ 300,200$/);
  });

  it("o traço acompanha o ponteiro enquanto o gesto acontece", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 120, clientY: 90 });

    // Desenhando ainda: o traço aparece na tela sem existir no board.
    expect(screen.getByTestId("stroke-preview")).toBeTruthy();
    expect(tracos()).toEqual([]);

    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 120, clientY: 90 });

    // Solto: some a prévia, entra o traço.
    expect(screen.queryByTestId("stroke-preview")).toBeNull();
    expect(tracos()).toHaveLength(1);
  });

  it("o modo continua ligado entre traços", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    rabisca([100, 100], [200, 100]);
    rabisca([100, 200], [200, 200]);

    expect(modoLigado()).toBe(true);
    expect(tracos()).toHaveLength(2);
  });

  it("um clique parado não vira traço", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 100, clientY: 100 });

    expect(tracos()).toEqual([]);
  });

  it("com o modo ligado, arrastar no fundo não seleciona", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 300);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    fireEvent.keyDown(document, { key: "p" });

    rabisca([150, 150], [450, 450]);

    expect(screen.queryByTestId("selection-box")).toBeNull();
    expect(tracos()).toHaveLength(1);
  });

  it("com o modo desligado, arrastar volta a selecionar e não desenha", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "p" });

    rabisca([150, 150], [450, 450]);

    expect(tracos()).toEqual([]);
  });

  it("segurar espaço continua navegando, mesmo com o lápis ligado", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    navegaOQuadro(70, -35);

    // Navegou: a camada andou. E não sobrou traço nenhum do gesto.
    expect(screen.getByTestId("viewport-layer").style.transform).toContain(
      "translate(70px, -35px)",
    );
    expect(tracos()).toEqual([]);
  });

  it("o traço é gravado em coordenadas de canvas, e não de tela", () => {
    render(<Whiteboard />);
    navegaOQuadro(100, 50);
    fireEvent.keyDown(document, { key: "p" });

    rabisca([300, 250], [400, 250]);

    // O quadro está deslocado em (100, 50): o ponto de tela (300, 250) é o ponto de canvas
    // (200, 200). Sem a conversão, o traço nasceria colado à tela e andaria com o pan.
    expect(tracos()[0]).toMatch(/^200,200 /);
    expect(tracos()[0]).toMatch(/ 300,200$/);
  });

  it("o traço desenhado sobre uma nota é traço, e não arraste da nota", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 300);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    const antes = postIt(0).style.left;
    fireEvent.keyDown(document, { key: "p" });

    const nota = postIt(0);
    fireEvent.pointerDown(nota, { pointerId: 1, button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(screen.getByTestId("viewport-surface"), {
      pointerId: 1,
      clientX: 340,
      clientY: 320,
    });
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), {
      pointerId: 1,
      clientX: 340,
      clientY: 320,
    });

    expect(tracos()).toHaveLength(1);
    expect(postIt(0).style.left).toBe(antes);
  });

  it("o cursor do quadro vira lápis com o modo ligado", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");
    expect(surface.className).toContain("cursor-default");

    fireEvent.keyDown(document, { key: "p" });

    // O modo muda o que arrastar faz, e o cursor é o que anuncia isso antes do gesto.
    expect(surface.className).toContain("cursor-pencil");
    expect(surface.className).not.toContain("cursor-default");
  });

  /**
   * Shift+P continua ligando, como Shift+N continua criando post-it: quem segurou Shift sem
   * querer não deveria ficar sem o atalho, e Shift+P não é atalho de navegador nenhum.
   */
  it("Shift+P também alterna o modo", () => {
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "P", shiftKey: true });

    expect(modoLigado()).toBe(true);
  });

  it("a rodinha apertada continua navegando com o lápis ligado", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 3, button: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 3, clientX: 60, clientY: 25 });
    fireEvent.pointerUp(surface, { pointerId: 3, clientX: 60, clientY: 25 });

    expect(screen.getByTestId("viewport-layer").style.transform).toContain("translate(60px, 25px)");
    expect(tracos()).toEqual([]);
  });

  it("o zoom vale para o traço, como para qualquer conteúdo do canvas", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(<Whiteboard />);
    await user.click(screen.getByLabelText(UI.en.zoom.in));
    fireEvent.keyDown(document, { key: "p" });

    rabisca([200, 200], [300, 200]);

    // O traço é gravado em canvas: com o quadro afastado, o mesmo gesto de tela cobre uma
    // distância diferente de canvas. Desenhar em pixels de tela prenderia o traço ao zoom
    // do instante em que foi feito.
    const escala = Number(
      screen.getByTestId("viewport-layer").style.transform.match(/scale\(([^)]+)\)/)?.[1],
    );
    expect(escala).toBeGreaterThan(1);
    const [primeiro, ultimo] = (tracos()[0] ?? "").split(" ");
    const larguraEmCanvas = Number(ultimo?.split(",")[0]) - Number(primeiro?.split(",")[0]);
    expect(larguraEmCanvas).toBeCloseTo(100 / escala, 0);
  });

  it("grava o traço simplificado, e não um ponto por evento de ponteiro", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    // Uma reta reportada em 20 passos: os 18 do meio não descrevem nada que os extremos já
    // não digam, e é isso que a simplificação (#67) tira antes de gravar.
    rabisca([0, 0], [200, 200], 20);

    expect(tracos()[0]).toBe("0,0 200,200");
  });
});

describe("Whiteboard — modo borracha (#98)", () => {
  /** O botão da borracha na moldura, que é a indicação visível de que o modo está ligado. */
  function botaoBorracha(): HTMLElement {
    return screen.getByLabelText(UI.en.eraser.action);
  }

  function modoLigado(): boolean {
    return botaoBorracha().getAttribute("aria-pressed") === "true";
  }

  /** Rabisca com o lápis, ligando o modo antes e desligando depois — só o traço importa aqui. */
  function desenha(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.keyDown(document, { key: "p" });
  }

  /**
   * Passa a borracha de um ponto ao outro, em vários `pointermove` — como `rabisca`, mas
   * sem soltar ao final: alguns testes precisam inspecionar o quadro em pleno gesto.
   */
  function passaABorracha(de: [number, number], ate: [number, number], intermediarios = 4): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 2, button: 0, clientX: de[0], clientY: de[1] });
    for (let passo = 1; passo <= intermediarios; passo += 1) {
      fireEvent.pointerMove(surface, {
        pointerId: 2,
        clientX: de[0] + ((ate[0] - de[0]) * passo) / intermediarios,
        clientY: de[1] + ((ate[1] - de[1]) * passo) / intermediarios,
      });
    }
  }

  function tracos(): (string | null)[] {
    return screen.queryAllByTestId("stroke").map((element) => element.getAttribute("points"));
  }

  it("E liga o modo, e E de novo desliga", () => {
    render(<Whiteboard />);

    expect(modoLigado()).toBe(false);

    fireEvent.keyDown(document, { key: "e" });
    expect(modoLigado()).toBe(true);

    fireEvent.keyDown(document, { key: "e" });
    expect(modoLigado()).toBe(false);
  });

  it("Esc desliga o modo", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "e" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(modoLigado()).toBe(false);
  });

  it("o botão da moldura liga e desliga, como a tecla", async () => {
    const user = userEvent.setup();
    render(<Whiteboard />);

    await user.click(botaoBorracha());
    expect(modoLigado()).toBe(true);
    expect(screen.getByTestId("viewport-surface").dataset.erasing).toBe("true");

    await user.click(botaoBorracha());
    expect(modoLigado()).toBe(false);
  });

  it("a borracha exclui o lápis e as outras ferramentas", () => {
    render(<Whiteboard />);
    fireEvent.keyDown(document, { key: "p" });

    fireEvent.keyDown(document, { key: "e" });

    expect(modoLigado()).toBe(true);
    expect(screen.getByLabelText(UI.en.pencil.action).getAttribute("aria-pressed")).toBe("false");
  });

  it("arrastar sobre um traço corta a área tocada na hora, sem esperar soltar o ponteiro", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 100]);
    expect(tracos()).toHaveLength(1);
    fireEvent.keyDown(document, { key: "e" });

    passaABorracha([200, 90], [200, 110]);

    // Ainda em gesto — sem `pointerup` — e o traço já aparece cortado em dois: só o buraco
    // do meio sumiu da tela, não o rabisco inteiro.
    expect(tracos()).toHaveLength(2);
  });

  it("um toque sem arrasto sobre o traço também corta a área tocada", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 100]);
    fireEvent.keyDown(document, { key: "e" });
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 2, button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 200, clientY: 100 });

    expect(tracos()).toHaveLength(2);
  });

  it("não afeta post-it: passar a borracha por cima de uma nota não faz nada com ela", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(300, 300);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    const antes = postIt(0).style.left;
    fireEvent.keyDown(document, { key: "e" });

    passaABorracha([250, 250], [350, 350]);
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), {
      pointerId: 2,
      clientX: 350,
      clientY: 350,
    });

    expect(postIts()).toHaveLength(1);
    expect(postIt(0).style.left).toBe(antes);
  });

  it("corta só a área tocada, mesmo tocado num só ponto do meio do traço", () => {
    render(<Whiteboard />);
    desenha([0, 0], [400, 0]);
    fireEvent.keyDown(document, { key: "e" });

    passaABorracha([200, 0], [200, 0], 1);
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), {
      pointerId: 2,
      clientX: 200,
      clientY: 0,
    });

    // O toque foi um ponto só, no meio: o que sobra dos dois lados do buraco continua de
    // pé, como uma borracha de verdade — não some o traço inteiro.
    expect(tracos()).toEqual(["0,0 192,0", "208,0 400,0"]);
  });

  it("uma passada que apaga vários traços é um passo de desfazer só", () => {
    render(<Whiteboard />);
    desenha([0, 0], [200, 0]);
    desenha([0, 100], [200, 100]);
    expect(tracos()).toHaveLength(2);
    fireEvent.keyDown(document, { key: "e" });

    passaABorracha([0, 0], [0, 100]);
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), {
      pointerId: 2,
      clientX: 0,
      clientY: 100,
    });
    // Os dois traços saem cortados, não apagados por inteiro, mas a área tocada — a ponta
    // esquerda de cada um — some dos dois.
    for (const pontos of tracos()) expect(pontos).not.toMatch(/^0,/);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    // Um `Ctrl+Z` só devolve os dois originais: a passada inteira, tocando os dois traços,
    // foi um passo só de desfazer.
    expect(tracos()).toEqual(["0,0 200,0", "0,100 200,100"]);
  });

  it("funciona no toque com um dedo, como o próprio lápis (#71)", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 100]);
    fireEvent.keyDown(document, { key: "e" });
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, {
      pointerId: 5,
      button: 0,
      pointerType: "touch",
      clientX: 200,
      clientY: 90,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 200,
      clientY: 110,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 5,
      pointerType: "touch",
      clientX: 200,
      clientY: 110,
    });

    expect(tracos()).toEqual(["100,100 193,100", "207,100 300,100"]);
  });

  it("sair da ferramenta não apaga o que a borracha ainda não tinha tocado", () => {
    render(<Whiteboard />);
    desenha([0, 0], [200, 0]);
    desenha([0, 100], [200, 100]);
    fireEvent.keyDown(document, { key: "e" });
    const surface = screen.getByTestId("viewport-surface");

    // Toca só o primeiro traço, solta, e sai da ferramenta sem chegar perto do segundo.
    fireEvent.pointerDown(surface, { pointerId: 2, button: 0, clientX: 100, clientY: 0 });
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 100, clientY: 0 });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(modoLigado()).toBe(false);
    // O primeiro traço sai cortado no meio; o segundo, que a borracha nunca chegou a
    // tocar, continua inteiro.
    expect(tracos()).toEqual(["0,100 200,100", "0,0 92,0", "108,0 200,0"]);
  });

  it("o cursor do sistema some com o modo ligado — o círculo do alvo responde por ele", () => {
    render(<Whiteboard />);
    const surface = screen.getByTestId("viewport-surface");
    expect(surface.className).toContain("cursor-default");

    fireEvent.keyDown(document, { key: "e" });

    expect(surface.className).toContain("cursor-none");
    expect(surface.className).not.toContain("cursor-default");
  });
});

describe("Whiteboard — selecionar e apagar rabiscos (#70)", () => {
  /**
   * Rabisca de um ponto ao outro com o lápis ligado, e desliga o modo depois.
   *
   * Desligar faz parte: com o lápis ligado a superfície reivindica todo `pointerdown` para
   * desenhar, e nenhum clique chegaria ao traço. Quem quer selecionar já saiu do modo.
   */
  function desenha(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    for (let passo = 1; passo <= 4; passo += 1) {
      fireEvent.pointerMove(surface, {
        pointerId: 1,
        clientX: de[0] + ((ate[0] - de[0]) * passo) / 4,
        clientY: de[1] + ((ate[1] - de[1]) * passo) / 4,
      });
    }
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.keyDown(document, { key: "Escape" });
  }

  function tracos(): HTMLElement[] {
    return screen.queryAllByTestId("stroke-group");
  }

  /** O n-ésimo traço desenhado, falhando o teste se ele não existir. */
  function traco(indice: number): HTMLElement {
    return defined(tracos()[indice], `o traço de índice ${indice}`);
  }

  /**
   * Uma das três linhas de um traço desenhado: o halo, a tinta ou o alvo de clique.
   *
   * Falha o teste em vez de devolver `null` pela mesma razão do `defined`: uma asserção
   * sobre `null?.x` compara `undefined` com `undefined` e passa, escondendo a falha.
   */
  function parteDoTraco(indice: number, testId: string): Element {
    const parte = traco(indice).querySelector(`[data-testid="${testId}"]`);
    if (parte === null) throw new Error(`Esperava ${testId} no traço ${indice}, e não havia.`);
    return parte;
  }

  /** Ids dos traços marcados, na ordem em que o board os guarda. */
  function tracosMarcados(): (string | undefined)[] {
    return tracos()
      .filter((element) => element.dataset.selected === "true")
      .map((element) => element.dataset.strokeId);
  }

  /** Clica no alvo do n-ésimo traço, que é a faixa larga em volta da tinta. */
  function clicaNoTraco(indice: number, { shift = false } = {}): void {
    const alvo = parteDoTraco(indice, "stroke-hit");

    // Descer **e** subir: um traço já selecionado adia o colapso da seleção para o soltar,
    // como o post-it faz, e um helper que só apertasse nunca veria essa metade do gesto.
    fireEvent.pointerDown(alvo, { pointerId: 5, button: 0, shiftKey: shift });
    fireEvent.pointerUp(alvo, { pointerId: 5, shiftKey: shift });
  }

  /** Arrasta um retângulo de seleção no fundo do quadro. */
  function retangulo(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 7, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 7, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 7, clientX: ate[0], clientY: ate[1] });
  }

  function notasMarcadas(): (string | undefined)[] {
    return postIts()
      .filter((element) => element.dataset.selected === "true")
      .map((element) => element.dataset.noteId);
  }

  it("clicar num traço o seleciona", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    expect(tracosMarcados()).toEqual([]);

    clicaNoTraco(0);

    expect(tracosMarcados()).toHaveLength(1);
  });

  it("clicar noutro traço larga o primeiro", () => {
    render(<Whiteboard />);
    desenha([100, 100], [200, 150]);
    desenha([400, 400], [500, 450]);

    clicaNoTraco(0);
    const primeiro = tracosMarcados();
    clicaNoTraco(1);

    expect(tracosMarcados()).toHaveLength(1);
    expect(tracosMarcados()).not.toEqual(primeiro);
  });

  it("shift-clique acrescenta e tira, como na nota", () => {
    render(<Whiteboard />);
    desenha([100, 100], [200, 150]);
    desenha([400, 400], [500, 450]);

    clicaNoTraco(0);
    clicaNoTraco(1, { shift: true });
    expect(tracosMarcados()).toHaveLength(2);

    clicaNoTraco(1, { shift: true });
    expect(tracosMarcados()).toHaveLength(1);
  });

  /**
   * O alvo é largo de propósito: uma linha de 2 unidades exigiria acerto exato do ponteiro.
   * O que este caso guarda é a folga em si — sem ela, o alvo teria a espessura da tinta e
   * errar o rabisco por um pixel viraria a experiência normal.
   */
  it("o alvo de clique é mais largo que a tinta", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    const tinta = parteDoTraco(0, "stroke");
    const alvo = parteDoTraco(0, "stroke-hit");

    expect(Number(alvo.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(tinta.getAttribute("stroke-width")),
    );
    // Invisível, mas alcançável: é a faixa que recebe o ponteiro, não uma linha a mais na tela.
    expect(alvo.getAttribute("stroke")).toBe("transparent");
    expect(alvo.getAttribute("pointer-events")).toBe("stroke");
  });

  /**
   * A moldura fica em volta da **área** do desenho, e não colada na tinta.
   *
   * Um contorno que acompanhasse a linha diria "esta linha está marcada" — verdade, mas
   * inútil: o que se faz com um traço selecionado é movê-lo e redimensioná-lo, e as duas
   * coisas acontecem sobre a caixa dele. A caixa é a alça de mão do objeto.
   */
  it("o traço marcado ganha uma moldura em volta da área do desenho", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    expect(screen.queryByTestId("stroke-frame")).toBeNull();

    clicaNoTraco(0);

    const moldura = screen.getByTestId("stroke-frame");
    // A caixa cobre o traço inteiro, e não a espessura da linha.
    expect(Number.parseFloat(moldura.style.left)).toBeCloseTo(100, 0);
    expect(Number.parseFloat(moldura.style.top)).toBeCloseTo(100, 0);
    expect(Number.parseFloat(moldura.style.width)).toBeCloseTo(200, 0);
    expect(Number.parseFloat(moldura.style.height)).toBeCloseTo(100, 0);
    // O mesmo contorno do post-it: as duas espécies dizem "marcado" da mesma forma.
    expect(moldura.className).toContain("outline-selection");
  });

  /**
   * A caixa de um rabisco grande cobre muito quadro vazio. Se ela capturasse o ponteiro,
   * esse vazio ficaria inclicável — inclusive para o clique no fundo que desfaz a seleção.
   */
  it("a moldura não captura o ponteiro; só a alça captura", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);

    const moldura = screen.getByTestId("stroke-frame");
    const envoltorioDaAlca = screen.getByTestId("resize-handle").parentElement;

    expect(moldura.className).toContain("pointer-events-none");
    expect(defined(envoltorioDaAlca ?? undefined, "o envoltório da alça").className).toContain(
      "pointer-events-auto",
    );
  });

  it("o retângulo de seleção pega traços e notas juntos", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(200, 200);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    desenha([160, 160], [260, 260]);

    retangulo([50, 50], [400, 400]);

    expect(notasMarcadas()).toHaveLength(1);
    expect(tracosMarcados()).toHaveLength(1);
  });

  it("o retângulo não pega o traço que ele não toca", () => {
    render(<Whiteboard />);
    desenha([600, 600], [700, 700]);

    retangulo([0, 0], [100, 100]);

    expect(tracosMarcados()).toEqual([]);
  });

  it("Delete apaga os traços marcados", () => {
    render(<Whiteboard />);
    desenha([100, 100], [200, 150]);
    desenha([400, 400], [500, 450]);
    clicaNoTraco(0);

    fireEvent.keyDown(document, { key: "Delete" });

    expect(tracos()).toHaveLength(1);
  });

  it("Backspace apaga igual, como já apagava nota", () => {
    render(<Whiteboard />);
    desenha([100, 100], [200, 150]);
    clicaNoTraco(0);

    fireEvent.keyDown(document, { key: "Backspace" });

    expect(tracos()).toEqual([]);
  });

  /** O critério da seleção mista: um `Delete` só leva as duas espécies embora. */
  it("Delete apaga notas e traços da mesma seleção", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(200, 200);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    desenha([160, 160], [260, 260]);
    retangulo([50, 50], [400, 400]);

    fireEvent.keyDown(document, { key: "Delete" });

    expect(postIts()).toEqual([]);
    expect(tracos()).toEqual([]);
  });

  it("apagar esvazia a seleção: o Delete seguinte não tem o que fazer", () => {
    render(<Whiteboard />);
    desenha([100, 100], [200, 150]);
    desenha([400, 400], [500, 450]);
    clicaNoTraco(0);
    fireEvent.keyDown(document, { key: "Delete" });

    fireEvent.keyDown(document, { key: "Delete" });

    // O segundo traço continua: a seleção morreu junto com o que ela apontava.
    expect(tracos()).toHaveLength(1);
  });

  it("clicar num traço larga as notas que estavam marcadas", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(600, 600);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    desenha([100, 100], [200, 150]);
    retangulo([50, 50], [700, 700]);
    expect(notasMarcadas()).toHaveLength(1);

    clicaNoTraco(0);

    // "Só este" vale entre espécies: senão a nota ficaria marcada invisivelmente atrás do
    // rabisco recém-clicado, e o `Delete` seguinte a levaria junto.
    expect(notasMarcadas()).toEqual([]);
    expect(tracosMarcados()).toHaveLength(1);
  });

  /** Arrasta o traço pela própria tinta, que é onde a mão vai. */
  function arrastaTraco(indice: number, dx: number, dy: number): void {
    const alvo = parteDoTraco(indice, "stroke-hit");

    fireEvent.pointerDown(alvo, { pointerId: 8, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alvo, { pointerId: 8, clientX: dx, clientY: dy });
    fireEvent.pointerUp(alvo, { pointerId: 8, clientX: dx, clientY: dy });
  }

  /** Caixa da moldura do traço marcado, em unidades de canvas. */
  function moldura(): { x: number; y: number; w: number; h: number } {
    const caixa = screen.getByTestId("stroke-frame");
    return {
      x: Number.parseFloat(caixa.style.left),
      y: Number.parseFloat(caixa.style.top),
      w: Number.parseFloat(caixa.style.width),
      h: Number.parseFloat(caixa.style.height),
    };
  }

  it("arrastar o traço o move, como no post-it", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);
    const antes = moldura();

    arrastaTraco(0, 60, 40);

    expect(moldura().x).toBeCloseTo(antes.x + 60, 0);
    expect(moldura().y).toBeCloseTo(antes.y + 40, 0);
    // O tamanho não muda: mover é mover.
    expect(moldura().w).toBeCloseTo(antes.w, 0);
    expect(moldura().h).toBeCloseTo(antes.h, 0);
  });

  it("um arraste que não passou da folga é clique, e não move nada", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);
    const antes = moldura();

    // Dois pixels: a mão que treme ao clicar não pode gravar posição nova na store.
    arrastaTraco(0, 2, 1);

    expect(moldura().x).toBeCloseTo(antes.x, 0);
  });

  it("arrastar leva a seleção inteira junto, notas e traços", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(500, 500);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    desenha([100, 100], [200, 200]);
    retangulo([50, 50], [700, 700]);
    const notaAntes = Number.parseFloat(postIt(0).style.left);
    const tracoAntes = moldura().x;

    arrastaTraco(0, 70, 0);

    expect(Number.parseFloat(postIt(0).style.left)).toBeCloseTo(notaAntes + 70, 0);
    expect(moldura().x).toBeCloseTo(tracoAntes + 70, 0);
  });

  it("a alça redimensiona o traço, ancorando no canto de cima à esquerda", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);
    const antes = moldura();

    const alca = screen.getByTestId("resize-handle");
    fireEvent.pointerDown(alca, { pointerId: 9, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alca, { pointerId: 9, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(alca, { pointerId: 9, clientX: 100, clientY: 50 });

    expect(moldura().w).toBeCloseTo(antes.w + 100, 0);
    expect(moldura().h).toBeCloseTo(antes.h + 50, 0);
    // O canto de partida fica parado: é a mesma âncora do post-it, e é o que a alça no
    // canto oposto significa.
    expect(moldura().x).toBeCloseTo(antes.x, 0);
    expect(moldura().y).toBeCloseTo(antes.y, 0);
  });

  it("a alça não encolhe o traço até sumir", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);

    const alca = screen.getByTestId("resize-handle");
    fireEvent.pointerDown(alca, { pointerId: 9, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(alca, { pointerId: 9, clientX: -9000, clientY: -9000 });
    fireEvent.pointerUp(alca, { pointerId: 9, clientX: -9000, clientY: -9000 });

    // Achatar até zero não tem volta: sem dimensão não sobra o que multiplicar para crescer
    // de novo.
    expect(moldura().w).toBeGreaterThan(0);
    expect(moldura().h).toBeGreaterThan(0);
  });

  it("o traço movido continua sendo o mesmo traço, e não um novo", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);

    arrastaTraco(0, 60, 40);

    expect(tracos()).toHaveLength(1);
    expect(tracosMarcados()).toHaveLength(1);
  });

  /**
   * A apresentação existe para o quadro **vazio**, e quem rabiscou está tão longe do quadro
   * vazio quanto quem criou uma nota. Deixar o texto no meio da tela é justamente onde ele
   * mais atrapalha: por cima do próprio desenho.
   */
  it("desenhar dispensa a apresentação, como criar uma nota já dispensava", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);
    expect(screen.getByTestId("onboarding")).toBeTruthy();

    desenha([100, 100], [300, 200]);

    expect(screen.queryByTestId("onboarding")).toBeNull();
  });

  it("ligar o lápis já dispensa a apresentação, antes do primeiro traço", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);

    fireEvent.keyDown(document, { key: "p" });

    // Quem achou o `P` aprendeu o que a peça tinha para ensinar — e é onde o rabisco vai passar.
    expect(screen.queryByTestId("onboarding")).toBeNull();
  });

  /**
   * Apagar o último traço não traz as instruções de volta, pelo mesmo motivo que apagar a
   * última nota nunca trouxe: a peça reapareceria no meio de uma limpeza de quadro.
   */
  it("apagar o último traço não traz a apresentação de volta", () => {
    stubMatchMedia(false);
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    clicaNoTraco(0);
    fireEvent.keyDown(document, { key: "Delete" });

    expect(tracos()).toEqual([]);
    expect(screen.queryByTestId("onboarding")).toBeNull();
  });

  /**
   * Um quadro só de rabiscos também é trabalho. Antes da #70 a pergunta era só sobre
   * post-its, e um quadro cheio de traços era substituído sem aviso nenhum.
   */
  it("um quadro só com traços avisa antes de ser substituído", async () => {
    const user = userEvent.setup();
    stubMatchMedia(false);
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    await user.click(screen.getByLabelText(UI.en.newBoard.action));

    expect(screen.getByText(UI.en.newBoard.warning)).toBeTruthy();
    expect(tracos()).toHaveLength(1);
  });

  /**
   * A moldura é só contorno: nada de fundo.
   *
   * O azul translúcido que aparecia dentro dela não vinha de classe nenhuma deste projeto —
   * era o realce de seleção de texto do navegador, criado por arrastar sobre o quadro e
   * pintado por cima de toda caixa dentro do intervalo, inclusive de uma caixa vazia. Quem
   * o impede é o `select-none` da superfície, e é ele que este caso guarda.
   */
  it("a moldura é só contorno, e o quadro não deixa nascer seleção de texto", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);
    clicaNoTraco(0);

    expect(screen.getByTestId("stroke-frame").className).not.toMatch(/\bbg-/);
    expect(screen.getByTestId("viewport-surface").className).toContain("select-none");
  });

  it("clicar num traço não deixa o retângulo de seleção nascer por baixo", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    clicaNoTraco(0);

    expect(screen.queryByTestId("selection-box")).toBeNull();
  });

  /**
   * A barra de ações só carrega o seletor de cor, que pinta post-it. Sobre uma seleção de
   * rabiscos ela seria seis cores que não fazem nada.
   */
  it("a barra de ações não aparece sobre uma seleção só de traços", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 200]);

    clicaNoTraco(0);

    expect(screen.queryByTestId("selection-toolbar")).toBeNull();
  });

  it("a barra volta numa seleção mista, e colorir alcança só a nota", () => {
    render(<Whiteboard />);
    duploCliqueNoFundo(200, 200);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
    desenha([160, 160], [260, 260]);
    retangulo([50, 50], [400, 400]);

    const barra = screen.getByTestId("selection-toolbar");
    expect(barra).toBeTruthy();

    fireEvent.click(screen.getByLabelText(UI.en.note.colors.green));

    // A nota mudou de cor e o traço continua onde estava, inteiro: colorir não é ação de
    // rabisco, e uma seleção mista não pode quebrar por causa disso.
    expect(postIt(0).style.backgroundColor).toBe("var(--color-note-green)");
    expect(tracos()).toHaveLength(1);
  });

  /**
   * Com o lápis ligado o quadro inteiro é superfície de desenho, e a superfície reivindica
   * o gesto na descida. Sem isso, começar um traço em cima de um rabisco existente
   * selecionaria o rabisco em vez de desenhar.
   */
  it("com o lápis ligado, riscar por cima de um traço desenha em vez de selecionar", () => {
    render(<Whiteboard />);
    desenha([100, 100], [300, 300]);

    fireEvent.keyDown(document, { key: "p" });
    const surface = screen.getByTestId("viewport-surface");
    fireEvent.pointerDown(surface, { pointerId: 3, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 3, clientX: 240, clientY: 210 });
    fireEvent.pointerUp(surface, { pointerId: 3, clientX: 240, clientY: 210 });

    expect(tracos()).toHaveLength(2);
    expect(tracosMarcados()).toEqual([]);
  });
});

describe("Whiteboard — modo lápis no toque", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
    Os casos abaixo alternam entre `aparelhoDeToque(true)` e `(false)`, e a escolha não é
    descuido: o gesto é sempre de toque, porque quem decide isso é o `pointerType` do evento.
    O que a consulta de mídia muda é a moldura — num aparelho de toque o painel de zoom some
    (#57), e é dele que `escalaAtual()` lê. Quem precisa conferir a escala pede `(false)`.
  */

  /** Aperta `P`, que liga o modo lápis — e, apertado de novo, desliga. */
  function alternaOLapis(): void {
    fireEvent.keyDown(document, { key: "p" });
  }

  /** Encosta um dedo no quadro. */
  function encosta(pointerId: number, x: number, y: number): void {
    fireEvent.pointerDown(screen.getByTestId("viewport-surface"), {
      pointerId,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
    });
  }

  /** Arrasta um dedo que já está encostado. */
  function arrasta(pointerId: number, x: number, y: number): void {
    fireEvent.pointerMove(screen.getByTestId("viewport-surface"), {
      pointerId,
      pointerType: "touch",
      clientX: x,
      clientY: y,
    });
  }

  /** Tira o dedo da tela. */
  function levanta(pointerId: number, x: number, y: number): void {
    fireEvent.pointerUp(screen.getByTestId("viewport-surface"), {
      pointerId,
      pointerType: "touch",
      clientX: x,
      clientY: y,
    });
  }

  it("com o lápis ligado, um dedo desenha em vez de navegar", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    const layer = screen.getByTestId("viewport-layer");
    const antes = layer.style.transform;
    alternaOLapis();

    encosta(1, 100, 100);
    arrasta(1, 160, 140);
    levanta(1, 160, 140);

    expect(tracos()).toEqual(["100,100 160,140"]);
    // E o quadro ficou parado: com o lápis ligado, um dedo não navega mais.
    expect(layer.style.transform).toBe(antes);
  });

  it("com o lápis desligado, um dedo volta a navegar exatamente como antes", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    const layer = screen.getByTestId("viewport-layer");
    alternaOLapis();
    alternaOLapis();

    encosta(1, 100, 100);
    arrasta(1, 160, 140);
    levanta(1, 160, 140);

    expect(layer.style.transform).toContain("translate(60px, 40px)");
    expect(tracos()).toEqual([]);
  });

  it("dois dedos continuam navegando e dando zoom com o lápis ligado", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const layer = screen.getByTestId("viewport-layer");
    const antes = layer.style.transform;
    alternaOLapis();

    pinca(100, 200);

    // A pinça é o gesto inteiro: afastar dá zoom e arrastar move, no mesmo movimento. Com o
    // lápis ligado ela vira a única forma de navegar, então precisa continuar fazendo as duas.
    expect(escalaAtual()).toBe("200%");
    expect(layer.style.transform).not.toBe(antes);
    expect(tracos()).toEqual([]);
  });

  it("o segundo dedo vira pinça sem deixar traço pela metade", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    alternaOLapis();

    // Um dedo começa a desenhar…
    encosta(1, 0, 0);
    arrasta(1, 40, 40);
    expect(screen.getByTestId("stroke-preview")).toBeTruthy();

    // …e o segundo chega no meio do gesto.
    encosta(2, 100, 0);
    arrasta(2, 200, 0);
    levanta(1, 40, 40);
    levanta(2, 200, 0);

    // Nem prévia pendurada na tela, nem meio-rabisco gravado no board.
    expect(screen.queryByTestId("stroke-preview")).toBeNull();
    expect(tracos()).toEqual([]);
    // E a pinça aconteceu: quem encostou o segundo dedo estava pinçando. O quanto ela
    // aproxima é assunto dos testes de pinça — aqui a referência é a distância entre os
    // dedos no instante em que o segundo encostou, com o primeiro já deslocado.
    expect(Number.parseInt(escalaAtual(), 10)).toBeGreaterThan(100);
  });

  it("o dedo que sobra da pinça não navega com o lápis ligado", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    const layer = screen.getByTestId("viewport-layer");
    alternaOLapis();

    encosta(1, 0, 0);
    encosta(2, 100, 0);
    levanta(2, 100, 0);
    const antes = layer.style.transform;
    arrasta(1, 60, 40);

    // Sem o lápis, o dedo que ficou retomaria a navegação (ver o teste da pinça). Com ele
    // ligado, um dedo não navega — e também não deixa tinta no caminho de volta do gesto.
    expect(layer.style.transform).toBe(antes);
    expect(tracos()).toEqual([]);
  });

  it("desenhar com o dedo sobre uma nota é traço, e não arraste da nota", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    duploCliqueNoFundo(150, 150);
    fireEvent.blur(screen.getByRole("textbox", { name: UI.en.note.text }));
    const antes = postIt(0).style.left;
    alternaOLapis();

    fireEvent.pointerDown(postIt(0), {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 150,
      clientY: 150,
    });
    arrasta(1, 200, 190);
    levanta(1, 200, 190);

    expect(tracos()).toHaveLength(1);
    expect(postIt(0).style.left).toBe(antes);
  });

  it("um terceiro dedo durante a pinça não começa um traço por baixo do gesto", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    alternaOLapis();

    encosta(1, 0, 0);
    encosta(2, 100, 0);
    const antes = screen.getByTestId("viewport-layer").style.transform;
    encosta(3, 50, 200);
    arrasta(3, 60, 210);
    levanta(3, 60, 210);

    expect(tracos()).toEqual([]);
    expect(screen.queryByTestId("stroke-preview")).toBeNull();
    // Nem traço, nem navegação: o terceiro dedo não é contado pela pinça, e com o lápis
    // ligado um dedo não move o quadro — nem pelas costas do gesto que já acontece.
    expect(screen.getByTestId("viewport-layer").style.transform).toBe(antes);
  });

  /**
   * No celular não há tecla `P` nem `Esc`, e o cursor não muda de forma: o botão é a única
   * coisa que diz que o modo existe, que ele está ligado, e como sair dele.
   */
  it("o indicador do modo é alcançável e desliga o modo no toque", async () => {
    const user = userEvent.setup();
    aparelhoDeToque(true);
    render(<Whiteboard />);

    const botao = screen.getByLabelText(UI.en.pencil.action);
    expect(botao).toBeTruthy();

    await user.click(botao);
    expect(botao.getAttribute("aria-pressed")).toBe("true");

    await user.click(botao);
    expect(botao.getAttribute("aria-pressed")).toBe("false");

    // E desligado pelo botão, o dedo volta a navegar.
    encosta(1, 100, 100);
    arrasta(1, 160, 140);
    levanta(1, 160, 140);
    expect(screen.getByTestId("viewport-layer").style.transform).toContain("translate(60px, 40px)");
  });
});

describe("Whiteboard — remover e duplicar no toque (#99)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function criaPostIt(x: number, y: number): void {
    duploCliqueNoFundo(x, y);
    fireEvent.keyDown(screen.getByTestId("post-it-editor"), { key: "Escape" });
  }

  /** Rabisca com o lápis, ligando o modo antes e desligando depois. */
  function desenha(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.keyDown(document, { key: "Escape" });
  }

  function tracos(): HTMLElement[] {
    return screen.queryAllByTestId("stroke-group");
  }

  /** Clica no alvo do n-ésimo traço, que é a faixa larga em volta da tinta. */
  function clicaNoTraco(indice: number): void {
    const alvo = tracos()[indice]?.querySelector('[data-testid="stroke-hit"]');
    if (alvo === null || alvo === undefined) throw new Error(`traço ${indice} não encontrado`);

    fireEvent.pointerDown(alvo, { pointerId: 5, button: 0 });
    fireEvent.pointerUp(alvo, { pointerId: 5 });
  }

  function botaoRemover(): HTMLElement | null {
    return screen.queryByLabelText(UI.en.selectionActions.remove);
  }

  function botaoDuplicar(): HTMLElement | null {
    return screen.queryByLabelText(UI.en.selectionActions.duplicate);
  }

  it("não aparece em desktop, mesmo com algo marcado", () => {
    aparelhoDeToque(false);
    render(<Whiteboard />);
    criaPostIt(300, 300);

    expect(botaoRemover()).toBeNull();
    expect(botaoDuplicar()).toBeNull();
  });

  it("não aparece no toque sem nada marcado", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);

    expect(botaoRemover()).toBeNull();
    expect(botaoDuplicar()).toBeNull();
  });

  it("aparece no toque com um post-it marcado", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    criaPostIt(300, 300);

    expect(botaoRemover()).not.toBeNull();
    expect(botaoDuplicar()).not.toBeNull();
  });

  // Critério de aceite: a barra de cor esconde uma seleção só de traço de propósito (#70),
  // mas os ícones de remover e duplicar do toque não têm essa restrição.
  it("aparece no toque com um traço marcado, mesmo sem post-it na seleção", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    desenha([100, 100], [300, 100]);
    clicaNoTraco(0);

    expect(botaoRemover()).not.toBeNull();
    expect(botaoDuplicar()).not.toBeNull();
  });

  it("some durante um arraste em curso", () => {
    aparelhoDeToque(true);
    render(<Whiteboard />);
    criaPostIt(300, 300);
    const element = postIt(0);

    fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(botaoRemover()).toBeNull();

    fireEvent.pointerUp(element, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(botaoRemover()).not.toBeNull();
  });

  it("remover apaga a seleção, como o Delete", async () => {
    const user = userEvent.setup();
    aparelhoDeToque(true);
    render(<Whiteboard />);
    criaPostIt(300, 300);

    await user.click(defined(botaoRemover() ?? undefined, "o botão de remover"));

    expect(postIts()).toEqual([]);
  });

  it("duplicar cria uma cópia deslocada do original, e a deixa marcada", async () => {
    const user = userEvent.setup();
    aparelhoDeToque(true);
    render(<Whiteboard />);
    criaPostIt(300, 300);

    await user.click(defined(botaoDuplicar() ?? undefined, "o botão de duplicar"));

    expect(postIts()).toHaveLength(2);
    expect(postIt(1).style.left).not.toBe(postIt(0).style.left);
    expect(postIt(1).style.top).not.toBe(postIt(0).style.top);
    expect(postIt(1).dataset.selected).toBe("true");
    expect(postIt(0).dataset.selected).toBe("false");
  });

  it("duplica post-it e traço da mesma seleção, num passo só de desfazer", async () => {
    const user = userEvent.setup();
    aparelhoDeToque(true);
    render(<Whiteboard />);
    criaPostIt(300, 300);
    desenha([400, 400], [500, 500]);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });

    await user.click(defined(botaoDuplicar() ?? undefined, "o botão de duplicar"));

    expect(postIts()).toHaveLength(2);
    expect(tracos()).toHaveLength(2);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    // Um `Ctrl+Z` só desfaz a duplicação inteira: post-it e traço somem juntos.
    expect(postIts()).toHaveLength(1);
    expect(tracos()).toHaveLength(1);
  });
});

describe("Whiteboard — cor do lápis (#69)", () => {
  function ligaLapis(): void {
    fireEvent.keyDown(document, { key: "p" });
  }

  /** Rabisca de um ponto ao outro, com o lápis já ligado. */
  function rabisca(de: [number, number], ate: [number, number]): void {
    const surface = screen.getByTestId("viewport-surface");

    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: ate[0], clientY: ate[1] });
  }

  function paleta(): HTMLElement | null {
    return screen.queryByTestId("pencil-color-picker");
  }

  /** A paleta, exigindo que ela exista — para os testes que já ligaram o lápis antes. */
  function paletaAberta(): HTMLElement {
    return defined(paleta() ?? undefined, "a paleta do lápis");
  }

  /** A cor de tinta de cada traço gravado — o atributo `stroke` do SVG. */
  function coresDosTracos(): (string | null)[] {
    return screen.queryAllByTestId("stroke").map((element) => element.getAttribute("stroke"));
  }

  it("a paleta só aparece com o modo lápis ligado", () => {
    render(<Whiteboard />);
    expect(paleta()).toBeNull();

    ligaLapis();
    expect(paleta()).not.toBeNull();

    ligaLapis();
    expect(paleta()).toBeNull();
  });

  it("oferece sete opções: as seis da nota, mais o preto", () => {
    render(<Whiteboard />);
    ligaLapis();

    const cores = within(paletaAberta()).getAllByRole("radio");
    expect(cores).toHaveLength(STROKE_COLORS.length);
    expect(cores.map((cor) => cor.getAttribute("aria-label"))).toEqual([
      ...NOTE_COLORS.map((name) => UI.en.note.colors[name]),
      UI.en.pencil.black,
    ]);
  });

  it("o preto é a cor do primeiro traço da sessão", () => {
    render(<Whiteboard />);
    ligaLapis();

    rabisca([100, 100], [300, 100]);

    expect(coresDosTracos()).toEqual([strokeColor(6)]);
  });

  it("a cor escolhida vale para o próximo traço, até ser trocada de novo", () => {
    render(<Whiteboard />);
    ligaLapis();
    const azul = within(paletaAberta()).getByRole("radio", {
      name: UI.en.note.colors.blue,
    });
    fireEvent.click(azul);

    rabisca([100, 100], [300, 100]);
    rabisca([100, 200], [300, 200]);

    expect(coresDosTracos()).toEqual([strokeColor(3), strokeColor(3)]);
  });

  it("não recolore o que já foi desenhado", () => {
    render(<Whiteboard />);
    ligaLapis();
    rabisca([100, 100], [300, 100]);

    const azul = within(paletaAberta()).getByRole("radio", {
      name: UI.en.note.colors.blue,
    });
    fireEvent.click(azul);

    expect(coresDosTracos()).toEqual([strokeColor(6)]);
  });

  it("desligar e religar o modo mantém a última cor escolhida", () => {
    render(<Whiteboard />);
    ligaLapis();
    const verde = within(paletaAberta()).getByRole("radio", {
      name: UI.en.note.colors.green,
    });
    fireEvent.click(verde);
    ligaLapis();

    ligaLapis();
    rabisca([100, 100], [300, 100]);

    expect(coresDosTracos()).toEqual([strokeColor(2)]);
  });
});
