/**
 * Uma fonte só para "qual é o atalho de cada ação" (issue #97).
 *
 * `mod`/`shift`/`key` e não duas strings já prontas: a forma escrita na dica (`⌘S`,
 * `Ctrl+Shift+Z`) e a do `aria-keyshortcuts` (`Control+S`, `Control+Shift+Z`) são só duas
 * leituras do mesmo atalho, e escrevê-las separadas é o que faria as duas divergirem no dia
 * em que uma tecla mudasse.
 */
export interface ButtonShortcut {
  /** O atalho usa o modificador da plataforma — `⌘` no Mac, `Ctrl` no resto. */
  mod?: boolean;
  /** O atalho também segura Shift. */
  shift?: boolean;
  /** A tecla final, já em maiúscula. */
  key: string;
}

/**
 * As ações da moldura que têm atalho hoje.
 *
 * Os botões sem entrada aqui — novo quadro, zoom, fechar o link — não recebem `shortcut`
 * nenhum, e a dica deles continua exatamente como era.
 */
export const SHORTCUTS = {
  select: { key: "V" },
  note: { key: "N" },
  pencil: { key: "P" },
  eraser: { key: "E" },
  undo: { mod: true, key: "Z" },
  redo: { mod: true, shift: true, key: "Z" },
  save: { mod: true, key: "S" },
} as const satisfies Record<string, ButtonShortcut>;

/**
 * A forma escrita, para a dica.
 *
 * No Mac os símbolos vêm colados à tecla, sem separador (`⇧⌘Z`) — é a convenção do sistema
 * para atalhos, e escrever `⇧+⌘+Z` pareceria traduzido. Fora do Mac cada peça é uma palavra,
 * e por isso leva `+` entre elas (`Ctrl+Shift+Z`).
 */
export function shortcutLabel(shortcut: ButtonShortcut, isMac: boolean): string {
  if (isMac) {
    const parts: string[] = [];
    if (shortcut.shift) parts.push("⇧");
    if (shortcut.mod) parts.push("⌘");
    parts.push(shortcut.key);
    return parts.join("");
  }

  const parts: string[] = [];
  if (shortcut.mod) parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  parts.push(shortcut.key);
  return parts.join("+");
}

/**
 * O valor de `aria-keyshortcuts`, na sintaxe própria do atributo.
 *
 * Sempre `Control`, nunca `⌘`: o atributo descreve o atalho para quem lê a árvore de
 * acessibilidade, não a tela, e por isso não troca com a plataforma — o que evitaria, de
 * quebra, uma divergência de hidratação que a dica visual já resolve com `useIsMac`.
 */
export function ariaKeyShortcuts(shortcut: ButtonShortcut): string {
  const parts: string[] = [];
  if (shortcut.mod) parts.push("Control");
  if (shortcut.shift) parts.push("Shift");
  parts.push(shortcut.key);
  return parts.join("+");
}
