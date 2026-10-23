/** Distância mínima entre um painel flutuante e a borda da janela. */
export const VIEWPORT_MARGIN = 8;

/**
 * Quanto empurrar na horizontal uma caixa que vai de `left` a `right` para ela caber na
 * janela, com {@link VIEWPORT_MARGIN} de respiro.
 *
 * Positivo empurra para a direita, negativo para a esquerda, zero deixa onde está. A borda
 * esquerda vence quando a caixa é mais larga que a janela: o começo do texto é o que se lê.
 *
 * Usado pelo `Popover` (#155) e pelo `Dropdown` (#135), que medem a caixa depois de montar e
 * antes de pintar.
 */
export function shiftInsideViewport(left: number, right: number, viewportWidth: number): number {
  if (left < VIEWPORT_MARGIN) return VIEWPORT_MARGIN - left;

  const max = viewportWidth - VIEWPORT_MARGIN;
  if (right > max) return Math.max(max - right, VIEWPORT_MARGIN - left);

  return 0;
}
