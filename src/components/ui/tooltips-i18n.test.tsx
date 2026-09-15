import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "@/test-utils/matchMedia";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { UI } from "@/lib/i18n/ui";
import { LOCALES } from "@/lib/seo/site";
import { TOOLTIP_DELAY_MS } from "@/components/ui/Tooltip";
import { Whiteboard } from "@/components/canvas/Whiteboard";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "@/lib/shortcuts";

afterEach(() => vi.unstubAllGlobals());

/** Finge a máquina de quem está lendo: Mac ou não, como no teste da apresentação. */
function aparelho({ mac = false } = {}) {
  vi.stubGlobal("navigator", { platform: mac ? "MacIntel" : "Win32", userAgent: "" });
}

/**
 * O idioma dos botões flutuantes do quadro.
 *
 * A regressão que este arquivo existe para impedir aconteceu de verdade: a página em `/`
 * passou a se declarar `lang="en"` e as dicas dos botões continuaram em português, porque
 * cada uma era uma string solta dentro do seu componente. Um teste por componente não
 * pegaria isso — o que falha aqui é a montagem inteira, no idioma da rota.
 */
describe("interface do quadro em cada idioma", () => {
  it("nomeia os botões no idioma da rota", () => {
    for (const locale of LOCALES) {
      stubMatchMedia(false);
      const { unmount } = render(
        <LocaleProvider locale={locale}>
          <Whiteboard />
        </LocaleProvider>,
      );
      const ui = UI[locale];

      expect(screen.getByRole("button", { name: ui.save.action })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.newBoard.action })).toBeDefined();
      // Os dois botões de modo entram aqui pela mesma razão que os outros: são a única porta
      // para o lápis e para a colocação de nota em quem não tem teclado.
      expect(screen.getByRole("button", { name: ui.note.action })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.pencil.action })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.select.action })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.history.undo })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.history.redo })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.zoom.in })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.zoom.out })).toBeDefined();
      expect(screen.getByRole("button", { name: ui.zoom.reset })).toBeDefined();

      unmount();
    }
  });

  /**
   * O `Tooltip` deste projeto **repete** o `aria-label` do gatilho, em vez de derivá-lo. Se
   * os dois textos divergirem, a tela e o leitor de tela passam a dizer coisas diferentes
   * sobre o mesmo botão — e a única defesa contra isso é os dois saírem da mesma chave.
   */
  it("escreve na dica o mesmo que anuncia ao leitor de tela", async () => {
    // Mesmo par do teste do Tooltip: sem `shouldAdvanceTime`, o `userEvent` fica esperando
    // um relógio que ninguém anda.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubMatchMedia(false);
    render(
      <LocaleProvider locale="pt">
        <Whiteboard />
      </LocaleProvider>,
    );

    await userEvent.hover(screen.getByRole("button", { name: UI.pt.save.action }));
    await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS);

    // A dica é escondida do leitor de tela justamente por repetir o `aria-label`; o que
    // este caso guarda é que ela **continua** repetindo, e no mesmo idioma.
    const dica = await screen.findByText(UI.pt.save.action);

    expect(dica.closest("[aria-hidden='true']")?.getAttribute("aria-hidden")).toBe("true");
    vi.useRealTimers();
  });

  /**
   * As seis ações com atalho (issue #97): seleção, nota, lápis, borracha, desfazer, refazer
   * e salvar. O nome continua saindo de `ui`, como no teste acima; o que este caso guarda é
   * o atalho ao lado, e o `aria-keyshortcuts` do botão que o anuncia para quem usa leitor de
   * tela.
   */
  it.each(LOCALES)("mostra o atalho de cada ação, no Mac e fora dele — %s", async (locale) => {
    const ui = UI[locale];
    const acoes = [
      { name: ui.select.action, shortcut: SHORTCUTS.select },
      { name: ui.note.action, shortcut: SHORTCUTS.note },
      { name: ui.pencil.action, shortcut: SHORTCUTS.pencil },
      { name: ui.eraser.action, shortcut: SHORTCUTS.eraser },
      { name: ui.history.undo, shortcut: SHORTCUTS.undo },
      { name: ui.history.redo, shortcut: SHORTCUTS.redo },
      { name: ui.save.action, shortcut: SHORTCUTS.save },
    ];

    for (const mac of [true, false]) {
      aparelho({ mac });
      stubMatchMedia(false);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { unmount } = render(
        <LocaleProvider locale={locale}>
          <Whiteboard />
        </LocaleProvider>,
      );

      for (const { name, shortcut } of acoes) {
        const button = screen.getByRole("button", { name });
        expect(button.getAttribute("aria-keyshortcuts")).toBe(ariaKeyShortcuts(shortcut));

        await userEvent.hover(button);
        await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS);
        expect(await screen.findByText(shortcutLabel(shortcut, mac))).toBeDefined();
        await userEvent.unhover(button);
      }

      vi.useRealTimers();
      unmount();
    }
  });

  /**
   * Novo quadro e zoom não têm atalho hoje — o botão de fechar o link também não, coberto à
   * parte em `ShareButton.test.tsx` porque só existe depois de salvar. A dica deles não pode
   * ganhar um atalho por engano, nem perder o nome que já tinham.
   */
  it("não mexe na dica dos botões sem atalho", async () => {
    aparelho();
    stubMatchMedia(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <LocaleProvider locale="en">
        <Whiteboard />
      </LocaleProvider>,
    );
    const ui = UI.en;

    for (const name of [ui.newBoard.action, ui.zoom.in, ui.zoom.out, ui.zoom.reset]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-keyshortcuts")).toBeNull();

      await userEvent.hover(button);
      await vi.advanceTimersByTimeAsync(TOOLTIP_DELAY_MS);
      const dica = await screen.findByText(name);
      expect(dica.parentElement?.textContent).toBe(name);
      await userEvent.unhover(button);
    }

    vi.useRealTimers();
  });
});
