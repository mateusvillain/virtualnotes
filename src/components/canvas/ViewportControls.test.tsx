import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MAX_SCALE, MIN_SCALE } from "@/lib/canvas/coords";
import { ZOOM_STEP } from "@/lib/canvas/useViewport";
import { ViewportControls } from "./ViewportControls";
import { UI } from "@/lib/i18n/ui";

function setup(scale: number) {
  const zoomBy = vi.fn();
  const reset = vi.fn();
  const anchor = () => ({ x: 50, y: 40 });

  render(
    <ViewportControls
      viewport={{ x: 0, y: 0, scale }}
      zoomBy={zoomBy}
      reset={reset}
      anchor={anchor}
    />,
  );

  return { zoomBy, reset };
}

describe("ViewportControls", () => {
  it("mostra a escala atual em porcentagem", () => {
    setup(1.5);

    expect(screen.getByRole("button", { name: UI.en.zoom.menu }).textContent).toBe("150%");
  });

  it("amplia e reduz ancorando no centro informado", async () => {
    const { zoomBy } = setup(1);

    await userEvent.click(screen.getByRole("button", { name: UI.en.zoom.in }));
    await userEvent.click(screen.getByRole("button", { name: UI.en.zoom.out }));

    expect(zoomBy).toHaveBeenNthCalledWith(1, ZOOM_STEP, { x: 50, y: 40 });
    expect(zoomBy).toHaveBeenNthCalledWith(2, 1 / ZOOM_STEP, { x: 50, y: 40 });
  });

  it("a porcentagem abre o menu de zoom, e o item de 100% reseta o viewport", async () => {
    const { reset } = setup(2);

    await userEvent.click(screen.getByRole("button", { name: UI.en.zoom.menu }));
    await userEvent.click(screen.getByRole("menuitem", { name: UI.en.zoom.reset }));

    expect(reset).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("o menu amplia e reduz pelo mesmo centro dos botões", async () => {
    const { zoomBy } = setup(1);
    const porcentagem = screen.getByRole("button", { name: UI.en.zoom.menu });

    await userEvent.click(porcentagem);
    await userEvent.click(screen.getByRole("menuitem", { name: UI.en.zoom.in }));
    await userEvent.click(porcentagem);
    await userEvent.click(screen.getByRole("menuitem", { name: UI.en.zoom.out }));

    expect(zoomBy).toHaveBeenNthCalledWith(1, ZOOM_STEP, { x: 50, y: 40 });
    expect(zoomBy).toHaveBeenNthCalledWith(2, 1 / ZOOM_STEP, { x: 50, y: 40 });
  });

  it("no zoom máximo, ampliar fica desabilitado também no menu", async () => {
    setup(MAX_SCALE);

    await userEvent.click(screen.getByRole("button", { name: UI.en.zoom.menu }));

    expect(
      screen.getByRole("menuitem", { name: UI.en.zoom.in }).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: UI.en.zoom.out }).getAttribute("aria-disabled"),
    ).toBeNull();
  });

  it("desabilita ampliar no zoom máximo", () => {
    setup(MAX_SCALE);

    expect(screen.getByRole("button", { name: UI.en.zoom.in })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: UI.en.zoom.out })).toHaveProperty("disabled", false);
  });

  it("desabilita reduzir no zoom mínimo", () => {
    setup(MIN_SCALE);

    expect(screen.getByRole("button", { name: UI.en.zoom.out })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: UI.en.zoom.in })).toHaveProperty("disabled", false);
  });
});
