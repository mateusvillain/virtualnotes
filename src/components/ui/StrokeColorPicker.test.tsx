import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  NOTE_COLORS,
  STROKE_COLORS,
  STROKE_COLOR_BLACK,
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
  it("mostra sete opções: as seis da nota, mais o preto por último", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(cores()).toHaveLength(STROKE_COLORS.length);
    expect(cores().map((cor) => cor.getAttribute("aria-label"))).toEqual([
      ...NOTE_COLORS.map((name) => UI.en.note.colors[name]),
      UI.en.pencil.black,
    ]);
  });

  it("pinta cada quadradinho com a cor de traço correspondente", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    const estilos = cores().map((cor) => cor.style.backgroundColor);
    expect(estilos).toEqual(STROKE_COLORS.map((_, index) => strokeColor(index as StrokeColor)));
  });

  it("marca o preto quando ele é a cor atual", () => {
    render(
      <StrokeColorPicker tool={STROKE_TOOL_PENCIL} value={STROKE_COLOR_BLACK} onChange={vi.fn()} />,
    );

    expect(cores()[6]?.getAttribute("aria-checked")).toBe("true");
    expect(cores()[0]?.getAttribute("aria-checked")).toBe("false");
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
    expect(cores()[6]?.className).toContain("h-7 w-7");
    expect(cores()[0]?.className).toContain("h-6 w-6");
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
    expect(document.activeElement).toBe(cores()[6]);

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(document.activeElement).toBe(cores()[0]);
  });
});
