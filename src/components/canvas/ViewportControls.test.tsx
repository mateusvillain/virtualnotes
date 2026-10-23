import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MAX_SCALE, MIN_SCALE } from "@/lib/canvas/coords";
import { ViewportControls } from "./ViewportControls";
import { UI } from "@/lib/i18n/ui";

const ui = UI.en;

function setup(scale: number) {
  const actions = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToLevel: vi.fn(),
    zoomToFit: vi.fn(),
  };

  render(<ViewportControls viewport={{ x: 0, y: 0, scale }} {...actions} />);

  return actions;
}

const porcentagem = () => screen.getByRole("button", { name: ui.zoom.menu });
const item = (name: string) => screen.getByRole("menuitem", { name });

describe("ViewportControls", () => {
  it("mostra a escala atual em porcentagem", () => {
    setup(1.5);

    expect(porcentagem().textContent).toBe("150%");
  });

  it("os botões + e − ampliam e reduzem", async () => {
    const { zoomIn, zoomOut } = setup(1);

    await userEvent.click(screen.getByRole("button", { name: ui.zoom.in }));
    await userEvent.click(screen.getByRole("button", { name: ui.zoom.out }));

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
  });

  it("os botões + e − anunciam os atalhos", () => {
    setup(1);

    expect(screen.getByRole("button", { name: ui.zoom.in }).getAttribute("aria-keyshortcuts")).toBe(
      "Control+Plus",
    );
    expect(
      screen.getByRole("button", { name: ui.zoom.out }).getAttribute("aria-keyshortcuts"),
    ).toBe("Control+-");
  });

  it("desabilita ampliar no zoom máximo", () => {
    setup(MAX_SCALE);

    expect(screen.getByRole("button", { name: ui.zoom.in })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: ui.zoom.out })).toHaveProperty("disabled", false);
  });

  it("desabilita reduzir no zoom mínimo", () => {
    setup(MIN_SCALE);

    expect(screen.getByRole("button", { name: ui.zoom.out })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: ui.zoom.in })).toHaveProperty("disabled", false);
  });
});

describe("ViewportControls — menu de zoom (#141)", () => {
  it("a porcentagem abre o menu com os itens do Figma, na ordem", async () => {
    setup(1);

    await userEvent.click(porcentagem());

    expect(
      screen.getAllByRole("menuitem").map((element) => element.firstChild?.textContent),
    ).toEqual([
      ui.zoom.in,
      ui.zoom.out,
      ui.zoom.fit,
      ui.zoom.level[0.5],
      ui.zoom.level[1],
      ui.zoom.level[2],
    ]);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("Zoom to fit enquadra e fecha o menu", async () => {
    const { zoomToFit } = setup(1);

    await userEvent.click(porcentagem());
    await userEvent.click(item(ui.zoom.fit));

    expect(zoomToFit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each([
    [0.5, ui.zoom.level[0.5]],
    [1, ui.zoom.level[1]],
    [2, ui.zoom.level[2]],
  ] as const)("o item de %s vai para o nível fixo", async (level, label) => {
    const { zoomToLevel } = setup(1.5);

    await userEvent.click(porcentagem());
    await userEvent.click(item(label));

    expect(zoomToLevel).toHaveBeenCalledWith(level);
  });

  it("ampliar e reduzir também estão no menu", async () => {
    const { zoomIn, zoomOut } = setup(1);

    await userEvent.click(porcentagem());
    await userEvent.click(item(ui.zoom.in));
    await userEvent.click(porcentagem());
    await userEvent.click(item(ui.zoom.out));

    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).toHaveBeenCalledOnce();
  });

  it("mostra os atalhos de ampliar, reduzir e 100%", async () => {
    setup(1);

    await userEvent.click(porcentagem());

    expect(item(ui.zoom.in).getAttribute("aria-keyshortcuts")).toBe("Control+Plus");
    expect(item(ui.zoom.out).getAttribute("aria-keyshortcuts")).toBe("Control+-");
    expect(item(ui.zoom.level[1]).getAttribute("aria-keyshortcuts")).toBe("Control+0");
    expect(item(ui.zoom.level[1]).textContent).toBe(`${ui.zoom.level[1]}Ctrl+0`);
    expect(item(ui.zoom.fit).getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("no zoom máximo, ampliar fica desabilitado também no menu", async () => {
    setup(MAX_SCALE);

    await userEvent.click(porcentagem());

    expect(item(ui.zoom.in).getAttribute("aria-disabled")).toBe("true");
    expect(item(ui.zoom.out).getAttribute("aria-disabled")).toBeNull();
  });

  it("no zoom mínimo, reduzir fica desabilitado também no menu", async () => {
    setup(MIN_SCALE);

    await userEvent.click(porcentagem());

    expect(item(ui.zoom.out).getAttribute("aria-disabled")).toBe("true");
    expect(item(ui.zoom.in).getAttribute("aria-disabled")).toBeNull();
  });
});
