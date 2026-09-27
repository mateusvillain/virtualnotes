import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "@/lib/shortcuts";
import { TOOLTIP_DELAY_MS } from "./Tooltip";
import { ToolbarTool } from "./ToolbarTool";

function ControlledTool({ initial = false }: { initial?: boolean }) {
  const [active, setActive] = useState(initial);
  return (
    <ToolbarTool
      active={active}
      onToggle={() => setActive((current) => !current)}
      label="Lápis"
      shortcut={SHORTCUTS.pencil}
    >
      <svg aria-hidden="true" />
    </ToolbarTool>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ToolbarTool", () => {
  it("expõe nome, atalho e estado como os botões de ferramenta", () => {
    render(<ControlledTool />);
    const button = screen.getByRole("button", { name: "Lápis" });

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("aria-keyshortcuts")).toBe("P");
  });

  it("clicar liga, clicar de novo desliga", async () => {
    render(<ControlledTool />);
    const button = screen.getByRole("button", { name: "Lápis" });

    await userEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("ativo mantém a ilustração elevada; inativo só sobe no hover ou foco", () => {
    const { rerender } = render(
      <ToolbarTool active={false} onToggle={() => {}} label="Lápis" shortcut={SHORTCUTS.pencil}>
        <svg aria-hidden="true" />
      </ToolbarTool>,
    );
    const illustration = screen.getByTestId("toolbar-tool-illustration");
    expect(illustration.className).toContain("group-hover:-translate-y-2");
    expect(illustration.className).toContain("group-focus-visible:-translate-y-2");
    expect(illustration.className).not.toMatch(/(^|\s)-translate-y-2/);

    rerender(
      <ToolbarTool active onToggle={() => {}} label="Lápis" shortcut={SHORTCUTS.pencil}>
        <svg aria-hidden="true" />
      </ToolbarTool>,
    );
    expect(illustration.className).toMatch(/(^|\s)-translate-y-2/);
    expect(illustration.className).toContain("motion-reduce:transition-none");
  });

  it("mostra o tooltip acima, com o atalho", async () => {
    render(<ControlledTool />);

    await userEvent.hover(screen.getByRole("button", { name: "Lápis" }));
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS);

    const tooltip = (await screen.findByText("Lápis")).parentElement!;
    expect(tooltip.className).toContain("bottom-full");
    expect(tooltip.textContent).toContain("P");
  });
});
