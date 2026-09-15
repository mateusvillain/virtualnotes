import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./ShareButton";
import type { ShareApi, ShareState } from "@/lib/board/useShareBoard";
import { UI } from "@/lib/i18n/ui";
import { ariaKeyShortcuts, SHORTCUTS } from "@/lib/shortcuts";

function renderButton(state: ShareState, overrides: Partial<ShareApi> = {}) {
  const api: ShareApi = { state, share: vi.fn(), dismiss: vi.fn(), ...overrides };
  render(<ShareButton {...api} />);
  return api;
}

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  // `vi.stubGlobal` é desfeito no `afterEach`; `Object.assign(navigator, …)` vazaria o
  // clipboard falso para os testes seguintes do arquivo.
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShareButton", () => {
  it("é só ícone, e se anuncia por aria-label", () => {
    renderButton({ status: "idle" });

    const button = screen.getByRole("button", { name: UI.en.save.action });
    // Sem rótulo escrito: o quadro é a interface inteira, e o texto custaria largura.
    expect(button.textContent).toBe("");
  });

  it("salva ao clicar", async () => {
    const api = renderButton({ status: "idle" });

    await userEvent.click(screen.getByRole("button", { name: UI.en.save.action }));

    expect(api.share).toHaveBeenCalledOnce();
  });

  it("avisa enquanto o link está sendo gerado, sem travar o resto da tela", () => {
    renderButton({ status: "sharing" });

    expect(screen.getByRole("status").textContent).toBe(UI.en.save.saving);
    expect(screen.getByText(UI.en.save.saving, { selector: "p:not(.sr-only)" })).toBeDefined();
  });

  it("não perde o foco do botão enquanto o envio acontece", async () => {
    const api = renderButton({ status: "sharing" });

    const button = screen.getByRole("button", { name: UI.en.save.action });
    button.focus();

    // Desabilitar tiraria o foco de quem acabou de acionar pelo teclado; o clique é
    // barrado sem desabilitar.
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(api.share).not.toHaveBeenCalled();
  });

  it("anuncia o atalho de salvar por aria-keyshortcuts", () => {
    renderButton({ status: "idle" });

    const button = screen.getByRole("button", { name: UI.en.save.action });
    expect(button.getAttribute("aria-keyshortcuts")).toBe(ariaKeyShortcuts(SHORTCUTS.save));
  });

  it("não dá atalho ao botão de fechar o link", () => {
    renderButton({ status: "shared", url: "https://site/board/abc" });

    const button = screen.getByRole("button", { name: UI.en.save.closeLink });
    expect(button.getAttribute("aria-keyshortcuts")).toBeNull();
  });

  it("explica o que fazer quando o board é grande demais, sem sugerir insistir", () => {
    renderButton({ status: "too-large" });

    // A região de anúncio e o painel visível dizem a mesma coisa, cada um para o seu
    // público.
    expect(screen.getByRole("status").textContent).toBe(UI.en.save.tooLarge);
    expect(screen.getByText(UI.en.save.tooLargeHint)).toBeDefined();
    // Tentar de novo não resolveria: o próximo envio falharia igual.
    expect(screen.queryByRole("button", { name: UI.en.save.retry })).toBeNull();
  });

  it("mostra o link gerado num campo fácil de copiar", () => {
    renderButton({ status: "shared", url: "https://site/board/abc" });

    const field = screen.getByLabelText(UI.en.save.linkField);
    expect(field).toHaveProperty("value", "https://site/board/abc");
    expect(field).toHaveProperty("readOnly", true);
  });

  it("copia o link e confirma", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderButton({ status: "shared", url: "https://site/board/abc" });

    await userEvent.click(screen.getByRole("button", { name: UI.en.save.copy }));

    expect(writeText).toHaveBeenCalledWith("https://site/board/abc");
    expect(await screen.findByRole("button", { name: UI.en.save.copied })).toBeDefined();
  });

  it("mantém o link visível quando copiar não é permitido", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error("negado")));
    renderButton({ status: "shared", url: "https://site/board/abc" });

    await userEvent.click(screen.getByRole("button", { name: UI.en.save.copy }));

    // Sem confirmação falsa, e com o link ainda na tela para selecionar na mão.
    expect(screen.getByRole("button", { name: UI.en.save.copy })).toBeDefined();
    expect(screen.getByLabelText(UI.en.save.linkField)).toBeDefined();
  });

  it("continua oferecendo salvar depois de já ter um link", () => {
    renderButton({ status: "shared", url: "https://site/board/abc" });

    // Salvar de novo cria outro documento; o botão não vira "salvo".
    expect(screen.getByRole("button", { name: UI.en.save.action })).toHaveProperty(
      "disabled",
      false,
    );
    // O link **é** o quadro salvo, e quem já mandou o anterior precisa saber que ele não
    // quebrou. As duas coisas moram na mesma frase do painel.
    expect(screen.getByText(UI.en.save.keepLink)).toBeDefined();
  });

  it("sinaliza a falha e deixa tentar de novo", async () => {
    const api = renderButton({ status: "error" });

    expect(screen.getByRole("status").textContent).toBe(UI.en.save.error);

    await userEvent.click(screen.getByRole("button", { name: UI.en.save.retry }));

    expect(api.share).toHaveBeenCalledOnce();
  });

  it("fecha o link e devolve o foco ao botão", async () => {
    const api = renderButton({ status: "shared", url: "https://site/board/abc" });

    await userEvent.click(screen.getByRole("button", { name: UI.en.save.closeLink }));

    expect(api.dismiss).toHaveBeenCalledOnce();
    // Sem devolver o foco, quem navega por teclado volta para o início do documento.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: UI.en.save.action }));
  });
});
