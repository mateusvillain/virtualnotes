import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dropdown, type DropdownEntry } from "./Dropdown";

function Harness({
  entries,
  onGlobalKey = () => {},
}: {
  entries: readonly DropdownEntry[];
  onGlobalKey?: (key: string) => void;
}) {
  return (
    <div
      // Os atalhos do quadro ouvem o documento em captura; o menu precisa chegar antes deles.
      ref={(node) => {
        if (node === null) return;
        const handler = (event: KeyboardEvent) => onGlobalKey(event.key);
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
      }}
    >
      <button type="button">fora</button>
      <Dropdown
        entries={entries}
        renderTrigger={(props) => (
          <button type="button" aria-label="Zoom" {...props}>
            100%
          </button>
        )}
      />
      <button type="button">depois</button>
    </div>
  );
}

function makeEntries() {
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const fit = vi.fn();
  const half = vi.fn();
  const entries: DropdownEntry[] = [
    { kind: "item", label: "Zoom in", shortcut: { mod: true, key: "+" }, onSelect: zoomIn },
    { kind: "item", label: "Zoom out", shortcut: { mod: true, key: "-" }, onSelect: zoomOut },
    { kind: "item", label: "Zoom to fit", onSelect: fit },
    { kind: "separator" },
    { kind: "item", label: "Zoom to 50%", onSelect: half },
  ];
  return { entries, zoomIn, zoomOut, fit, half };
}

const trigger = () => screen.getByRole("button", { name: "Zoom" });
const item = (name: string) => screen.getByRole("menuitem", { name });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dropdown — ARIA", () => {
  it("o gatilho anuncia o menu, e o menu se nomeia pelo gatilho", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-controls")).toBeNull();

    await user.click(trigger());

    const menu = screen.getByRole("menu", { name: "Zoom" });
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(menu.id);
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("mostra o atalho à direita e o expõe em aria-keyshortcuts, fora do nome", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());

    const zoomIn = item("Zoom in");
    expect(zoomIn.textContent).toMatch(/Ctrl\+\+$/);
    expect(zoomIn.getAttribute("aria-keyshortcuts")).toBe("Control+Plus");
    expect(item("Zoom to fit").getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("no Mac, o atalho usa ⌘", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());

    expect(item("Zoom in").textContent).toMatch(/⌘\+$/);
  });
});

describe("Dropdown — abrir", () => {
  it("abre pelo clique, com o foco no primeiro item", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());

    expect(document.activeElement).toBe(item("Zoom in"));
  });

  it.each(["{Enter}", " "])("abre por %s no gatilho", async (key) => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    trigger().focus();
    await user.keyboard(key);

    expect(screen.getByRole("menu")).toBeDefined();
    expect(document.activeElement).toBe(item("Zoom in"));
  });

  it("abre pela seta para baixo no primeiro item, sem a seta chegar ao quadro", async () => {
    const user = userEvent.setup();
    const boardKey = vi.fn();
    render(<Harness entries={makeEntries().entries} onGlobalKey={boardKey} />);

    trigger().focus();
    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(item("Zoom in"));
    expect(boardKey).not.toHaveBeenCalledWith("ArrowDown");
  });

  it("abre pela seta para cima no último item", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    trigger().focus();
    await user.keyboard("{ArrowUp}");

    expect(document.activeElement).toBe(item("Zoom to 50%"));
  });

  it("clicar no gatilho de novo fecha", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());
    await user.click(trigger());

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Dropdown — navegar e ativar", () => {
  it("as setas andam pelos itens, pulam o separador e dão a volta", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item("Zoom to 50%"));

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Zoom in"));

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item("Zoom to 50%"));
  });

  it("Home e End vão às pontas", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(item("Zoom to 50%"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(item("Zoom in"));
  });

  it("as teclas nuas não chegam aos atalhos do quadro com o menu aberto", async () => {
    const user = userEvent.setup();
    const boardKey = vi.fn();
    render(<Harness entries={makeEntries().entries} onGlobalKey={boardKey} />);
    await user.click(trigger());

    await user.keyboard("{ArrowDown}n{Delete}");

    expect(boardKey).not.toHaveBeenCalled();
  });

  it("Enter ativa o item, fecha e devolve o foco ao gatilho", async () => {
    const user = userEvent.setup();
    const { entries, zoomOut } = makeEntries();
    render(<Harness entries={entries} />);
    await user.click(trigger());

    await user.keyboard("{ArrowDown}{Enter}");

    expect(zoomOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("clicar num item ativa e fecha", async () => {
    const user = userEvent.setup();
    const { entries, fit } = makeEntries();
    render(<Harness entries={entries} />);
    await user.click(trigger());

    await user.click(item("Zoom to fit"));

    expect(fit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("passar o ponteiro sobre um item o foca", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    fireEvent.pointerMove(item("Zoom to fit"));

    expect(document.activeElement).toBe(item("Zoom to fit"));
  });
});

describe("Dropdown — itens desabilitados", () => {
  function disabledEntries() {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const entries: DropdownEntry[] = [
      { kind: "item", label: "Zoom in", disabled: true, onSelect: zoomIn },
      { kind: "item", label: "Zoom out", onSelect: zoomOut },
    ];
    return { entries, zoomIn, zoomOut };
  }

  it("são pulados pelas setas e pelo foco inicial", async () => {
    const user = userEvent.setup();
    render(<Harness entries={disabledEntries().entries} />);
    await user.click(trigger());

    expect(item("Zoom in").getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(item("Zoom out"));

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item("Zoom out"));
  });

  it("não agem nem fecham o menu no clique", async () => {
    const user = userEvent.setup();
    const { entries, zoomIn } = disabledEntries();
    render(<Harness entries={entries} />);
    await user.click(trigger());

    await user.click(item("Zoom in"));

    expect(zoomIn).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeDefined();
    expect(document.activeElement).toBe(item("Zoom out"));
  });
});

describe("Dropdown — fechar", () => {
  it("Esc fecha, devolve o foco ao gatilho e não chega ao atalho global", async () => {
    const user = userEvent.setup();
    const boardKey = vi.fn();
    render(<Harness entries={makeEntries().entries} onGlobalKey={boardKey} />);
    await user.click(trigger());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(boardKey).not.toHaveBeenCalledWith("Escape");
  });

  it("clicar fora fecha e devolve o foco que estava no menu", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("Tab fecha e deixa o foco seguir", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    // Parte do gatilho, e não do topo do documento: o próximo controle depois dele.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "depois" }));
  });

  it("Shift+Tab fecha e volta para antes do gatilho", async () => {
    const user = userEvent.setup();
    render(<Harness entries={makeEntries().entries} />);
    await user.click(trigger());

    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "fora" }));
  });
});

describe("Dropdown — dentro da janela", () => {
  it("empurra o menu de volta quando passaria da borda direita", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.getAttribute("role") === "menu"
        ? DOMRect.fromRect({ x: 300, y: 0, width: 192, height: 200 })
        : DOMRect.fromRect();
    });
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());

    // 300 + 192 = 492; a borda útil é 400 - 8 = 392.
    expect(screen.getByRole("menu").style.marginLeft).toBe("-100px");
  });

  it("mede de novo a cada abertura, sem somar o ajuste anterior", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") !== "menu") return DOMRect.fromRect();
      // A posição medida inclui a margem aplicada: sem zerá-la antes, a segunda abertura
      // veria o menu já dentro e desfaria o ajuste.
      const margin = parseFloat(this.style.marginLeft) || 0;
      return DOMRect.fromRect({ x: 300 + margin, y: 0, width: 192, height: 200 });
    });
    render(<Harness entries={makeEntries().entries} />);

    await user.click(trigger());
    await user.keyboard("{Escape}");
    await user.click(trigger());

    expect(screen.getByRole("menu").style.marginLeft).toBe("-100px");
  });
});
