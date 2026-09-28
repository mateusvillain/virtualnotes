# Ilustrações das ferramentas

As cinco ilustrações da toolbar inferior (#131, epic #128), como componentes SVG.

| Componente                | Ferramenta      | Proporção (viewBox) |
| ------------------------- | --------------- | ------------------- |
| `NoteIllustration`        | Nota            | 95.865 × 98.758     |
| `PencilIllustration`      | Lápis           | 72 × 364            |
| `FountainPenIllustration` | Caneta tinteiro | 72 × 368            |
| `HighlighterIllustration` | Marca-texto     | 72 × 352            |
| `EraserIllustration`      | Borracha        | 72 × 360            |

## Origem

- Figma: [node 1-168](https://www.figma.com/design/2dxkr8UKngsyEvlXleH10R/Untitled?node-id=1-168)
  (ilustrações) e [node 1-625](https://www.figma.com/design/2dxkr8UKngsyEvlXleH10R/Untitled?node-id=1-625)
  (toolbar, de onde saiu a nota).
- Exportadas como SVG e otimizadas com SVGO 3 (`preset-default` sem `removeViewBox`,
  `removeDimensions`).

## Por que componentes, e não arquivos em `public/`

- Vetor: nítido em qualquer densidade de tela, sem `@2x`.
- Sem requisição extra: a toolbar aparece no primeiro quadro, junto com o resto da moldura.
- Os `id` dos gradientes saem de `useId()`, um por instância. Inline na mesma página, dois SVGs
  com o mesmo `id` fariam um desenho pintar com o gradiente do outro — e um prefixo fixo por
  arquivo só resolveria até a mesma ilustração aparecer duas vezes.

As ilustrações são corpo inteiro (a ponta até o fim do cabo): quem usa corta a parte de baixo.
São decorativas (`aria-hidden`) — o nome acessível mora no botão que as contém.

Para trocar uma ilustração: exportar de novo do Figma, rodar o SVGO com as mesmas opções e
substituir o miolo do `<svg>`, trocando cada `id="x"`/`url(#x)` por `` `${id}-x` ``.
