import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UI } from "@/lib/i18n/ui";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { TOOLBAR_TOOLS, Toolbar } from "./Toolbar";

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
    const toolbar = screen.getByRole("group", { name: ui.toolbar.label });

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

  it.each(TOOLBAR_TOOLS.map(({ name, mode }) => [ui[name].action, mode]))(
    "%s pede o modo %s",
    async (nome, modo) => {
      const { onToggle } = renderToolbar();

      await userEvent.click(screen.getByRole("button", { name: nome }));

      expect(onToggle).toHaveBeenCalledWith(modo);
    },
  );

  it("é um grupo, e não uma toolbar com navegação por setas que ele não tem", () => {
    renderToolbar();

    expect(screen.queryByRole("toolbar")).toBeNull();
    // Cada ferramenta é um ponto de Tab próprio, como os botões do resto da moldura.
    for (const button of screen.getAllByRole("button")) expect(button.tabIndex).toBe(0);
  });

  it("mede 88px contando a borda, como no Figma", () => {
    renderToolbar();
    const className = screen.getByTestId("toolbar").className;

    // `h-22` em border-box: a borda entra nos 88px, em vez de somar 2px por fora.
    expect(className).toContain("h-22");
    expect(className).not.toContain("box-content");
  });
});
