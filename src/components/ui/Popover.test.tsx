import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Popover } from "./Popover";

function Harness({ onGlobalEscape = () => {} }: { onGlobalEscape?: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      // O atalho global de Esc do quadro ouve o documento em captura; o painel precisa
      // chegar antes dele.
      ref={(node) => {
        if (node === null) return;
        const handler = (event: KeyboardEvent) => {
          if (event.key === "Escape") onGlobalEscape();
        };
        document.addEventListener("keydown", handler, true);
      }}
    >
      <button type="button">fora</button>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? "painel" : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          abrir
        </button>
        <Popover
          id="painel"
          open={open}
          onOpenChange={setOpen}
          triggerRef={triggerRef}
          label="Painel"
          offset={34}
        >
          <button type="button">primeiro</button>
          <button type="button">segundo</button>
        </Popover>
      </div>
    </div>
  );
}

describe("Popover", () => {
  it("abre pelo gatilho, com o foco no primeiro controle", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));

    const painel = screen.getByRole("dialog", { name: "Painel" });
    expect(painel.id).toBe("painel");
    expect(painel.getAttribute("aria-modal")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "primeiro" }));
  });

  it("clicar no gatilho de novo fecha", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const gatilho = screen.getByRole("button", { name: "abrir" });

    await user.click(gatilho);
    await user.click(gatilho);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc fecha, devolve o foco ao gatilho e não chega ao atalho global", async () => {
    const user = userEvent.setup();
    const global = vi.fn();
    render(<Harness onGlobalEscape={global} />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "abrir" }));
    expect(global).not.toHaveBeenCalled();
  });

  it("clicar fora fecha e devolve o foco que estava no painel", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "abrir" }));
  });

  it("clicar dentro não fecha", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));
    await user.click(screen.getByRole("button", { name: "segundo" }));

    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("fica acima do gatilho pela distância pedida", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "abrir" }));

    expect(screen.getByRole("dialog").style.bottom).toBe("calc(100% + 34px)");
  });
});
