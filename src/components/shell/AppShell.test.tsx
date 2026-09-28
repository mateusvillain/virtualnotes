import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("não desenha barra superior nenhuma", () => {
    const { container } = render(<AppShell />);

    // O quadro é a interface inteira: uma faixa fixa no topo custaria altura de tela.
    expect(container.querySelector("header")).toBeNull();
  });

  it("mantém o nome do app para leitor de tela", () => {
    render(<AppShell />);

    // Invisível, mas presente: uma página sem cabeçalho nenhum não tem como ser anunciada.
    expect(screen.getByRole("heading", { name: "Virtual Notes" }).className).toContain("sr-only");
  });

  it("põe os cantos de cima a 24px da borda, acima da barra de seleção (#139)", () => {
    render(
      <AppShell
        leadingActions={<button type="button">esquerda</button>}
        trailingActions={<button type="button">direita</button>}
      />,
    );
    const faixa = screen.getByRole("button", { name: "esquerda" }).parentElement!.parentElement!;

    expect(faixa.className).toContain("top-0");
    expect(faixa.className).toContain("justify-between");
    expect(faixa.className).toContain("p-6");
    // A SelectionToolbar é z-20 e segue os post-its: pode cair justamente sob os controles.
    expect(faixa.className).toContain("z-30");
  });

  it("centra a toolbar na borda de baixo, com o que vem acima empilhado em coluna", () => {
    render(
      <AppShell
        toolbar={
          <>
            <button type="button">acima</button>
            <button type="button">toolbar</button>
          </>
        }
      />,
    );
    const faixa = screen.getByRole("button", { name: "toolbar" }).parentElement!;

    expect(faixa.className).toContain("bottom-0");
    expect(faixa.className).toContain("flex-col");
    expect(faixa.className).toContain("items-center");
    expect(faixa.className).toContain("z-30");
    // A ordem da árvore é a da tela: a última peça é a que encosta na borda.
    expect(faixa.lastElementChild?.textContent).toBe("toolbar");
  });

  it("renderiza o conteúdo do canvas", () => {
    render(<AppShell>conteúdo do quadro</AppShell>);

    expect(screen.getByText("conteúdo do quadro")).toBeDefined();
  });
});
