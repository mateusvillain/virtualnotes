"use client";

import {
  STROKE_OPACITIES,
  STROKE_SIZES,
  STROKE_TOOLS,
  type StrokeOpacity,
  type StrokeSize,
  type StrokeTool,
} from "@/lib/board/types";
import { useLocale, useUi } from "@/lib/i18n/LocaleProvider";
import { Slider } from "@/components/ui/Slider";

interface StrokeSettingsProps {
  /** A ferramenta cujos valores o painel mostra. Dá ao grupo o nome acessível. */
  tool: StrokeTool;
  /** Índice em `STROKE_SIZES`. */
  size: StrokeSize;
  /** Índice em `STROKE_OPACITIES`. */
  opacity: StrokeOpacity;
  /** Cor do traço, em CSS: é até onde o gradiente do slider de opacidade vai. */
  color: string;
  onSizeChange: (size: StrokeSize) => void;
  onOpacityChange: (opacity: StrokeOpacity) => void;
}

/**
 * O painel de traço (#161): os sliders de espessura e de opacidade de uma ferramenta, lado a
 * lado, como na variante `Variant3` do Penpot.
 *
 * Só apresentação: recebe os índices e devolve os novos. Os sliders não sabem o que os
 * passos significam; é aqui que o índice vira "2×" e "35%" para o leitor de tela, no
 * formato de número do idioma da página ("0,5×" em português).
 */
export function StrokeSettings({
  tool,
  size,
  opacity,
  color,
  onSizeChange,
  onOpacityChange,
}: StrokeSettingsProps) {
  const ui = useUi();
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);

  return (
    <div
      role="group"
      aria-label={ui[STROKE_TOOLS[tool]].stroke}
      className="flex items-start gap-2"
      data-testid="stroke-settings"
    >
      <Slider
        label={ui.toolbar.size}
        steps={STROKE_SIZES.length}
        value={size}
        onChange={(value) => onSizeChange(value as StrokeSize)}
        valueText={(value) => `${number.format(STROKE_SIZES[value as StrokeSize])}×`}
        track={{ kind: "fill" }}
        testId="stroke-size"
      />
      <Slider
        label={ui.toolbar.opacity}
        steps={STROKE_OPACITIES.length}
        value={opacity}
        onChange={(value) => onOpacityChange(value as StrokeOpacity)}
        valueText={(value) => `${STROKE_OPACITIES[value as StrokeOpacity]}%`}
        track={{ kind: "checker", color }}
        testId="stroke-opacity"
      />
    </div>
  );
}
