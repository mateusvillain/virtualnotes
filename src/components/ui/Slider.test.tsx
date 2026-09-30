import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Slider, type SliderTrack } from "./Slider";

function Controlled({
  initial = 2,
  onChange = () => {},
  track = { kind: "fill" },
}: {
  initial?: number;
  onChange?: (value: number) => void;
  track?: SliderTrack;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Slider
      label="Espessura"
      steps={8}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      valueText={(step) => `passo ${step}`}
      track={track}
      testId="slider"
    />
  );
}

describe("Slider", () => {
  it("é um slider nomeado pelo rótulo visível, de 0 ao último passo", () => {
    render(<Controlled />);

    const slider = screen.getByRole("slider", { name: "Espessura" });
    expect(slider.getAttribute("min")).toBe("0");
    expect(slider.getAttribute("max")).toBe("7");
    expect(slider.getAttribute("step")).toBe("1");
    expect(screen.getByText("Espessura")).toBeDefined();
  });

  it("anuncia o valor pelo texto que recebe", () => {
    render(<Controlled initial={4} />);

    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe("passo 4");
  });

  it("anda pelas setas, Home e End", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const slider = screen.getByRole("slider");

    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(3);

    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith(7);

    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(slider.getAttribute("aria-valuetext")).toBe("passo 0");

    await user.keyboard("{PageUp}");
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("para nas pontas sem chamar onChange à toa", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={0} onChange={onChange} />);

    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowLeft}{Home}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("devolve o passo como número", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("a alça acompanha o valor, das pontas ao meio", () => {
    const { unmount } = render(<Controlled initial={0} />);
    expect(screen.getByTestId("slider-handle").style.left).toBe("0px");
    unmount();

    render(<Controlled initial={7} />);
    // 140 de trilha menos os 8 da alça.
    expect(screen.getByTestId("slider-handle").style.left).toBe("132px");
  });

  it("o xadrez vai do transparente até a cor pedida", () => {
    render(<Controlled track={{ kind: "checker", color: "rgb(255, 0, 0)" }} />);

    expect(screen.getByTestId("slider-gradient").style.backgroundImage).toBe(
      "linear-gradient(to right, transparent, rgb(255, 0, 0))",
    );
  });
});

describe("Slider — em pé", () => {
  function renderVertical(onChange = vi.fn()) {
    return render(
      <Slider
        label="Espessura"
        steps={8}
        value={2}
        onChange={onChange}
        valueText={(step) => `passo ${step}`}
        track={{ kind: "fill" }}
        orientation="vertical"
        testId="slider"
      />,
    );
  }

  it("esconde o rótulo da tela, mas continua nomeado por ele", () => {
    renderVertical();

    expect(screen.getByText("Espessura").className).toContain("sr-only");
    expect(screen.getByRole("slider", { name: "Espessura" })).toBeDefined();
  });

  it("é o slider deitado girado -90°, numa caixa em pé do mesmo comprimento", () => {
    renderVertical();

    const girado = screen.getByTestId("slider-handle").parentElement!;
    expect(girado.className).toContain("-rotate-90");
    expect(girado.parentElement!.style.height).toBe("140px");
  });

  it("a seta para cima sobe, como no deitado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderVertical(onChange);

    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenLastCalledWith(3);
  });
});
