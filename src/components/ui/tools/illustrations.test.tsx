import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EraserIllustration } from "./EraserIllustration";
import { FountainPenIllustration } from "./FountainPenIllustration";
import { HighlighterIllustration } from "./HighlighterIllustration";
import { NoteIllustration } from "./NoteIllustration";
import { PencilIllustration } from "./PencilIllustration";

const ILLUSTRATIONS = [
  ["note", NoteIllustration, "0 0 95.865 98.758"],
  ["pencil", PencilIllustration, "0 0 72 364"],
  ["fountain-pen", FountainPenIllustration, "0 0 72 368"],
  ["highlighter", HighlighterIllustration, "0 0 72 352"],
  ["eraser", EraserIllustration, "0 0 72 360"],
] as const;

describe("ilustrações das ferramentas", () => {
  it.each(ILLUSTRATIONS)(
    "%s mantém a proporção do Figma e é decorativa",
    (_, Illustration, viewBox) => {
      const { container } = render(<Illustration className="h-4" />);
      const svg = container.querySelector("svg")!;

      expect(svg.getAttribute("viewBox")).toBe(viewBox);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("class")).toBe("h-4");
    },
  );

  it("todo gradiente referenciado existe e nenhum id se repete, nem com cada uma duas vezes", () => {
    const { container } = render(
      <>
        {ILLUSTRATIONS.map(([name, Illustration]) => (
          <Illustration key={name} />
        ))}
        {ILLUSTRATIONS.map(([name, Illustration]) => (
          <Illustration key={`${name}-2`} />
        ))}
      </>,
    );

    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    const references = [...container.querySelectorAll("[fill^='url(']")].map((element) =>
      element.getAttribute("fill")!.slice(5, -1),
    );
    for (const reference of references) expect(ids).toContain(reference);
  });
});
