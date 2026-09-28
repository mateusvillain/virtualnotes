import { describe, expect, it } from "vitest";
import { iconButtonClass } from "./iconButton";

/** O IconButton do Figma (1-124, #133): o que cada classe garante está no comentário ao lado. */
describe("iconButtonClass", () => {
  const classes = iconButtonClass.split(" ");

  it("tem 40px e é circular", () => {
    expect(classes).toEqual(expect.arrayContaining(["h-10", "w-10", "rounded-full"]));
  });

  it("usa o mesmo fundo no hover, no clique e no ligado", () => {
    expect(classes).toEqual(
      expect.arrayContaining([
        "hover:bg-control-active",
        "active:bg-control-active",
        "aria-pressed:bg-control-active",
      ]),
    );
  });

  it("continua esmaecido quando desabilitado", () => {
    expect(classes).toContain("disabled:opacity-40");
  });
});
