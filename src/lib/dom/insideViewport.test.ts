import { describe, expect, it } from "vitest";
import { shiftInsideViewport, VIEWPORT_MARGIN } from "./insideViewport";

describe("shiftInsideViewport", () => {
  it("não mexe no que já cabe", () => {
    expect(shiftInsideViewport(100, 300, 800)).toBe(0);
  });

  it("empurra para a direita o que passa da borda esquerda", () => {
    expect(shiftInsideViewport(-20, 180, 800)).toBe(20 + VIEWPORT_MARGIN);
  });

  it("empurra para a esquerda o que passa da borda direita", () => {
    expect(shiftInsideViewport(700, 900, 800)).toBe(800 - VIEWPORT_MARGIN - 900);
  });

  it("mais larga que a janela, prende o começo na borda esquerda", () => {
    expect(shiftInsideViewport(100, 1000, 800)).toBe(VIEWPORT_MARGIN - 100);
  });
});
