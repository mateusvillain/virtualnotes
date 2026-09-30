import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HIGHLIGHTER_OPACITY,
  STROKE_OPACITIES,
  STROKE_OPACITY_FULL,
  STROKE_SIZES,
  STROKE_SIZE_BASE,
  STROKE_TOOL_HIGHLIGHTER,
  STROKE_TOOL_PENCIL,
  type StrokeOpacity,
  type StrokeSize,
  type StrokeTool,
} from "@/lib/board/types";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { UI } from "@/lib/i18n/ui";
import { StrokeSettings } from "./StrokeSettings";

function renderSettings({
  locale = "en",
  tool = STROKE_TOOL_PENCIL,
  size = STROKE_SIZE_BASE,
  opacity = STROKE_OPACITY_FULL,
}: {
  locale?: "en" | "pt";
  tool?: StrokeTool;
  size?: StrokeSize;
  opacity?: StrokeOpacity;
} = {}) {
  const onSizeChange = vi.fn();
  const onOpacityChange = vi.fn();
  render(
    <LocaleProvider locale={locale}>
      <StrokeSettings
        tool={tool}
        size={size}
        opacity={opacity}
        color="rgb(24, 24, 27)"
        onSizeChange={onSizeChange}
        onOpacityChange={onOpacityChange}
      />
    </LocaleProvider>,
  );
  return { onSizeChange, onOpacityChange };
}

describe("StrokeSettings", () => {
  it("o grupo tem o nome da ferramenta", () => {
    renderSettings({ tool: STROKE_TOOL_HIGHLIGHTER });

    expect(screen.getByRole("group", { name: UI.en.highlighter.stroke })).toBeDefined();
  });

  it("um slider por lista de passos", () => {
    renderSettings();

    const tamanho = screen.getByRole("slider", { name: UI.en.toolbar.size });
    const opacidade = screen.getByRole("slider", { name: UI.en.toolbar.opacity });
    expect(tamanho.getAttribute("max")).toBe(String(STROKE_SIZES.length - 1));
    expect(opacidade.getAttribute("max")).toBe(String(STROKE_OPACITIES.length - 1));
  });

  it("anuncia a espessura como multiplicador e a opacidade em porcentagem", () => {
    renderSettings({ tool: STROKE_TOOL_HIGHLIGHTER, opacity: DEFAULT_HIGHLIGHTER_OPACITY });

    expect(
      screen.getByRole("slider", { name: UI.en.toolbar.size }).getAttribute("aria-valuetext"),
    ).toBe("1×");
    expect(
      screen.getByRole("slider", { name: UI.en.toolbar.opacity }).getAttribute("aria-valuetext"),
    ).toBe("35%");
  });

  it("em português, o multiplicador sai com vírgula", () => {
    renderSettings({ locale: "pt", size: 0 });

    expect(
      screen.getByRole("slider", { name: UI.pt.toolbar.size }).getAttribute("aria-valuetext"),
    ).toBe("0,5×");
  });

  it("devolve os índices escolhidos", () => {
    const { onSizeChange, onOpacityChange } = renderSettings();

    fireEvent.change(screen.getByRole("slider", { name: UI.en.toolbar.size }), {
      target: { value: "6" },
    });
    fireEvent.change(screen.getByRole("slider", { name: UI.en.toolbar.opacity }), {
      target: { value: "3" },
    });

    expect(onSizeChange).toHaveBeenCalledWith(6);
    expect(onOpacityChange).toHaveBeenCalledWith(3);
  });
});
