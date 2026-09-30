import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UI } from "@/lib/i18n/ui";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { TOOLBAR_TOOLS, Toolbar, type StrokeControls } from "./Toolbar";

const ui = UI.en;

function renderToolbar(
  active: Parameters<typeof Toolbar>[0]["active"] = null,
  stroke: Partial<StrokeControls> = {},
) {
  const onToggle = vi.fn();
  const props = {
    active,
    onToggle,
    stroke: {
      enabled: false,
      color: "rgb(24, 24, 27)",
      colorPicker: <span data-testid="cores">cores</span>,
      settings: <input aria-label="espessura" data-testid="sliders" />,
      ...stroke,
    },
  };
  const view = render(
    <LocaleProvider locale="en">
      <Toolbar {...props} />
    </LocaleProvider>,
  );
  return {
    onToggle,
    rerender: (next: Partial<StrokeControls>) =>
      view.rerender(
        <LocaleProvider locale="en">
          <Toolbar {...props} stroke={{ ...props.stroke, ...next }} />
        </LocaleProvider>,
      ),
  };
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
    const toolbar = screen.getByRole("group", { name: ui.toolbar.label });

    for (const button of within(toolbar).getAllByRole("button")) {
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
    const toolbar = screen.getByRole("group", { name: ui.toolbar.label });
    for (const button of within(toolbar).getAllByRole("button")) expect(button.tabIndex).toBe(0);
  });

  it("mede 88px, com o raio e o degradê do Penpot", () => {
    renderToolbar();
    const className = screen.getByTestId("toolbar").className;

    expect(className).toContain("h-22");
    expect(className).toContain("rounded-t-[32px]");
    expect(className).toContain("rounded-b-2xl");
    expect(className).toContain("from-white");
  });

  it("separa as três seções com dois divisores", () => {
    renderToolbar();

    expect(screen.getAllByTestId("toolbar-divider")).toHaveLength(2);
  });

  it("o círculo e o rabisco ficam fora do grupo das ferramentas", () => {
    renderToolbar("pencil", { enabled: true });
    const toolbar = screen.getByRole("group", { name: ui.toolbar.label });

    expect(within(toolbar).queryByRole("button", { name: ui.toolbar.color })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: ui.toolbar.stroke })).toBeNull();
  });

  describe("Color Controls (#154)", () => {
    it("sem ferramenta de traço, os dois botões aparecem desabilitados", () => {
      renderToolbar("erasing");

      const cor = screen.getByRole("button", { name: ui.toolbar.color });
      const traco = screen.getByRole("button", { name: ui.toolbar.stroke });
      expect((cor as HTMLButtonElement).disabled).toBe(true);
      expect((traco as HTMLButtonElement).disabled).toBe(true);
    });

    it("com ferramenta de traço, os dois habilitam e o círculo tem a cor dela", () => {
      renderToolbar("pencil", { enabled: true, color: "rgb(191, 219, 254)" });

      const cor = screen.getByRole("button", { name: ui.toolbar.color }) as HTMLButtonElement;
      expect(cor.disabled).toBe(false);
      expect(cor.getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByTestId("stroke-color-swatch").style.backgroundColor).toBe(
        "rgb(191, 219, 254)",
      );
    });

    it("o círculo abre o bloco de cores e o rabisco abre o painel, um por vez", async () => {
      const user = userEvent.setup();
      renderToolbar("pencil", { enabled: true });
      const cor = screen.getByRole("button", { name: ui.toolbar.color });
      const traco = screen.getByRole("button", { name: ui.toolbar.stroke });

      await user.click(cor);
      expect(screen.getByTestId("cores")).toBeDefined();
      expect(cor.getAttribute("aria-expanded")).toBe("true");
      expect(cor.getAttribute("aria-controls")).toBe(
        screen.getByRole("dialog", { name: ui.toolbar.color }).id,
      );

      // O arco continua montado enquanto gira para fora, mas já fechado: inerte.
      await user.click(traco);
      expect(screen.getByTestId("stroke-color-panel").dataset.state).toBe("closed");
      expect(screen.getByTestId("sliders")).toBeDefined();
      expect(traco.getAttribute("aria-expanded")).toBe("true");

      // O painel continua montado enquanto some, mas já fechado: inerte.
      await user.click(traco);
      expect(screen.getByTestId("stroke-settings-panel").dataset.state).toBe("closed");
      expect(screen.getByTestId("stroke-settings-panel").hasAttribute("inert")).toBe(true);
    });

    it("o rabisco anuncia os atalhos de espessura", () => {
      renderToolbar("pencil", { enabled: true });

      const traco = screen.getByRole("button", { name: ui.toolbar.stroke });
      expect(traco.getAttribute("aria-keyshortcuts")).toBe("[ ]");
    });

    it("o arco de cores abre sem vidro, e o painel de traço tem 24px em cima e 8 embaixo", async () => {
      const user = userEvent.setup();
      renderToolbar("pencil", { enabled: true });

      // O arco desenha o próprio fundo: um vidro retangular em volta sobraria nas pontas.
      await user.click(screen.getByRole("button", { name: ui.toolbar.color }));
      expect(screen.getByTestId("stroke-color-panel").className).not.toContain("rounded-full");
      expect(screen.getByTestId("stroke-color-panel").className).not.toContain("backdrop-blur");

      await user.click(screen.getByRole("button", { name: ui.toolbar.stroke }));
      expect(screen.getByTestId("stroke-settings-surface").className).toContain(
        "rounded-t-3xl rounded-b-lg",
      );
    });

    it("desabilitar a seção fecha o painel aberto", async () => {
      const user = userEvent.setup();
      const { rerender } = renderToolbar("pencil", { enabled: true });

      await user.click(screen.getByRole("button", { name: ui.toolbar.stroke }));
      rerender({ enabled: false });
      expect(screen.getByTestId("stroke-settings-panel").dataset.state).toBe("closed");

      // Reabilitar não reabre: o painel termina a saída e some.
      rerender({ enabled: true });
      await waitFor(() => expect(screen.queryByTestId("stroke-settings-panel")).toBeNull());
    });
  });
});
