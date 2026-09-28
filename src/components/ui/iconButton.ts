/**
 * Aparência dos botões de ícone flutuantes sobre o quadro — o IconButton do Figma (1-124, #133).
 *
 * Zoom (#9) e compartilhar (#46) são a mesma classe de controle: 32px, ícone de 20px, sem
 * rótulo escrito. Menor que os 40px do Figma de propósito: nos cantos, 40px faziam as
 * pílulas pesarem mais que o próprio quadro. Mora num lugar só porque a alternativa já aconteceu — a string estava
 * copiada em dois arquivos, e ajustar o tema de um deixaria o outro para trás sem ninguém
 * perceber.
 *
 * Circular, com o mesmo fundo (`bg-control-active`) no hover, no clique em curso (`active`)
 * e no ligado (`aria-pressed`): o Figma desenha os três estados com a mesma tinta, e a
 * diferença entre "apontado" e "ligado" fica por conta de o ligado não sumir quando o
 * ponteiro sai.
 */
export const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-control-active active:bg-control-active aria-pressed:bg-control-active disabled:pointer-events-none disabled:opacity-40";

/**
 * Aparência dos botões e links de texto que aparecem em painéis sobre o quadro.
 *
 * Mesma razão da classe acima: a string já estava começando a ser copiada entre a tela de
 * link inválido (#47) e o estado de falha ao abrir um board (#21).
 */
export const panelButtonClass =
  "rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-canvas";

/**
 * Botões de texto secundários dentro dos painéis flutuantes.
 *
 * São as ações que acompanham a principal — cancelar, copiar, tentar de novo: mesmo peso
 * tipográfico, sem moldura, para não competerem com o botão que resolve.
 */
export const subtleButtonClass =
  "rounded-control px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-canvas hover:text-ink";

/**
 * O vidro das pílulas da moldura: a toolbar inferior e o bloco de cores (#137, #140) e os
 * grupos dos cantos (#138, #139). Branco a 90% com desfoque de 4px e borda a meio tom, como
 * no Figma (1-2, 1-625) — sem a sombra dos painéis, porque a pílula encosta no quadro e não
 * flutua sobre ele.
 *
 * A borda é um anel interno (`ring-inset`), e não `border`: desenhada por dentro, ela não soma
 * 2px à medida. Com `border`, uma pílula de botões de 32px e 4px de respiro teria 42 de
 * altura, e não 40 — e as dos cantos desalinhariam entre si.
 */
export const pillSurfaceClass =
  "rounded-full bg-surface/90 ring-1 ring-inset ring-border/50 backdrop-blur-xs";
