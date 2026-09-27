import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UI } from "@/lib/i18n/ui";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { Toolbar } from "./Toolbar";

const ui = UI.en;

function renderToolbar(active: Parameters<typeof Toolbar>[0]["active"] = null) {
  const onToggle = vi.fn();
  render(
    <LocaleProvider locale="en">
      <Toolbar active={active} onToggle={onToggle} />
    </LocaleProvider>,
  );
  return { onToggle };
}

describe("Toolbar", () => {
  it("mostra as cinco ferramentas na ordem do Figma", () => {
    renderToolbar();
    const toolbar = screen.getByRole("toolbar", { name: ui.toolbar.label });

    const nomes = [...toolbar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
    expect(nomes).toEqual([
      ui.note.action,
      ui.pencil.action,
      ui.fountain.action,
      ui.highlighter.action,
      ui.eraser.action,
    ]);
  });

  it("marca só a ferramenta ativa", () => {
    renderToolbar("highlighter");

    for (const button of screen.getAllByRole("button")) {
      const esperado = button.getAttribute("aria-label") === ui.highlighter.action;
      expect(button.getAttribute("aria-pressed")).toBe(String(esperado));
    }
  });

  it.each([
    [ui.note.action, "placing"],
    [ui.pencil.action, "pencil"],
    [ui.fountain.action, "fountain"],
    [ui.highlighter.action, "highlighter"],
    [ui.eraser.action, "erasing"],
  ])("%s pede o modo %s", async (nome, modo) => {
    const { onToggle } = renderToolbar();

    await userEvent.click(screen.getByRole("button", { name: nome }));

    expect(onToggle).toHaveBeenCalledWith(modo);
  });
});
