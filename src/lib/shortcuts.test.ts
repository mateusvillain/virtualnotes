import { describe, expect, it } from "vitest";
import { ariaKeyShortcuts, shortcutLabel, SHORTCUTS } from "./shortcuts";

describe("shortcutLabel", () => {
  it("mostra a tecla nua igual nas duas plataformas", () => {
    expect(shortcutLabel(SHORTCUTS.select, true)).toBe("V");
    expect(shortcutLabel(SHORTCUTS.select, false)).toBe("V");
  });

  it("no Mac, cola o símbolo do modificador na tecla", () => {
    expect(shortcutLabel(SHORTCUTS.save, true)).toBe("⌘S");
  });

  it("fora do Mac, escreve o modificador por extenso com +", () => {
    expect(shortcutLabel(SHORTCUTS.save, false)).toBe("Ctrl+S");
  });

  it("no Mac, o refazer sai como ⇧⌘Z", () => {
    expect(shortcutLabel(SHORTCUTS.redo, true)).toBe("⇧⌘Z");
  });

  it("fora do Mac, o refazer sai como Ctrl+Shift+Z", () => {
    expect(shortcutLabel(SHORTCUTS.redo, false)).toBe("Ctrl+Shift+Z");
  });
});

describe("ariaKeyShortcuts", () => {
  it("nunca troca com a plataforma — sempre Control, nunca ⌘", () => {
    expect(ariaKeyShortcuts(SHORTCUTS.save)).toBe("Control+S");
    expect(ariaKeyShortcuts(SHORTCUTS.redo)).toBe("Control+Shift+Z");
  });

  it("uma tecla nua sai sozinha", () => {
    expect(ariaKeyShortcuts(SHORTCUTS.pencil)).toBe("P");
  });
});
