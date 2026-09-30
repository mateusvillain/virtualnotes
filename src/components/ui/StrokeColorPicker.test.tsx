import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  STROKE_COLOR_BLACK,
  STROKE_COLOR_GRAY,
  STROKE_COLOR_WHITE,
  STROKE_TOOLS,
  STROKE_TOOL_PENCIL,
  type StrokeColor,
  type StrokeTool,
} from "@/lib/board/types";
import { strokeColor } from "@/lib/theme/note-colors";
import { StrokeColorPicker } from "./StrokeColorPicker";
import { UI } from "@/lib/i18n/ui";

function cores(): HTMLElement[] {
  return screen.getAllByRole("radio");
}

/**
 * Cobre só o que é específico do lápis — quantas opções, ordem, rótulos e cor de fundo. A
 * navegação por teclado (Tab, setas, Home/End) é a mesma base de `ColorRadioGroup`, e já é
 * testada a fundo em `ColorPicker.test.tsx`; repeti-la aqui testaria a mesma implementação
 * duas vezes.
 */
describe("StrokeColorPicker", () => {
  it("mostra as oito cores do arco: neutros subindo, pastéis descendo", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(cores().map((cor) => cor.getAttribute("aria-label"))).toEqual([
      UI.en.pencil.black,
      UI.en.pencil.gray,
      UI.en.pencil.white,
      UI.en.note.colors.pink,
      UI.en.note.colors.orange,
      UI.en.note.colors.yellow,
      UI.en.note.colors.green,
      UI.en.note.colors.blue,
    ]);
  });

  it("pinta cada círculo com a cor de traço correspondente", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    const estilos = cores().map((cor) => cor.style.backgroundColor);
    expect(estilos).toEqual(
      [STROKE_COLOR_BLACK, STROKE_COLOR_GRAY, STROKE_COLOR_WHITE, 1, 5, 0, 2, 3].map((index) =>
        strokeColor(index as StrokeColor),
      ),
    );
  });

  it("marca o preto quando ele é a cor atual", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(cores()[0]?.getAttribute("aria-checked")).toBe("true");
    expect(cores()[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("avisa a cor escolhida no clique", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StrokeColorPicker
        tool={STROKE_TOOL_PENCIL}
        value={STROKE_COLOR_BLACK}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: UI.en.note.colors.blue }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("é um grupo de rádio com nome próprio, diferente do seletor de nota", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("radiogroup", { name: UI.en.pencil.color })).toBeDefined();
  });

  it("dá à paleta o nome e o testId da ferramenta (#112)", () => {
    const nomes = [UI.en.pencil.color, UI.en.fountain.color, UI.en.highlighter.color];

    STROKE_TOOLS.forEach((name, index) => {
      const tool = index as StrokeTool;
      const { unmount } = render(
        <StrokeColorPicker tool={tool} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
      );

      expect(screen.getByRole("radiogroup", { name: nomes[tool] })).toBeDefined();
      expect(screen.getByTestId(`${name}-color-picker`)).toBeDefined();
      unmount();
    });
  });
});

describe("StrokeColorPicker — círculos da toolbar (#140)", () => {
  it("desenha círculos, e a cor marcada maior que as outras", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    for (const cor of cores()) expect(cor.className).toContain("rounded-full");
    expect(cores()[0]?.className).toContain("h-7 w-7");
    expect(cores()[1]?.className).toContain("h-6 w-6");
    // O tamanho sozinho é pouco sinal num pastel: a marcada leva também o anel (WCAG 1.4.11).
    expect(cores()[0]?.className).toMatch(/(^|\s)ring-2(\s|$)/);
    expect(cores()[1]?.className).not.toMatch(/(^|\s)ring-2(\s|$)/);
  });

  it("as setas continuam andando entre as cores", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StrokeColorPicker
        tool={STROKE_TOOL_PENCIL}
        value={STROKE_COLOR_BLACK}
        onChange={onChange}
      />,
    );

    await user.tab();
    expect(document.activeElement).toBe(cores()[0]);

    // Do preto para o cinza: a seta segue o arco, não o índice guardado no board.
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(STROKE_COLOR_GRAY);
    expect(document.activeElement).toBe(cores()[1]);
  });
});

describe("StrokeColorPicker — cor livre", () => {
  function seletor(): HTMLInputElement {
    return screen.getByLabelText(UI.en.pencil.custom);
  }

  it("é a parada de Tab seguinte ao grupo, e não uma opção dele", async () => {
    const user = userEvent.setup();
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(cores()).not.toContain(seletor());
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(seletor());
  });

  it("avisa a cor escolhida no seletor, em hex minúsculo", () => {
    const onChange = vi.fn();
    render(
      <StrokeColorPicker
        tool={STROKE_TOOL_PENCIL}
        value={STROKE_COLOR_BLACK}
        onChange={onChange}
      />,
    );

    fireEvent.input(seletor(), { target: { value: "#FF8800" } });

    expect(onChange).toHaveBeenLastCalledWith("#ff8800");
  });

  it("com cor livre em uso, nenhuma das oito fica marcada e o seletor ganha o anel", () => {
    render(<StrokeColorPicker tool={STROKE_TOOL_PENCIL} value="#ff8800" onChange={vi.fn()} />);

    for (const cor of cores()) expect(cor.getAttribute("aria-checked")).toBe("false");
    expect(seletor().value).toBe("#ff8800");
    expect(screen.getByTestId("pencil-color-custom").dataset.selected).toBe("true");
  });
});
