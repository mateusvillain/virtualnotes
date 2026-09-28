/**
 * As ferramentas que ligam e desligam — todos os modos do quadro menos a seleção (#137).
 *
 * São as que têm lugar na toolbar inferior. A seleção não tem: é o que vale com nenhuma delas
 * ligada.
 */
export type ToolMode = "placing" | "pencil" | "fountain" | "highlighter" | "erasing";

/**
 * A ferramenta ativa no quadro.
 *
 * As ferramentas são exclusivas entre si por natureza — um gesto de ponteiro faz uma coisa
 * de cada vez —, e este tipo é onde isso fica dito. É a mesma escolha que o `DragState` do
 * `Viewport` faz para os gestos.
 *
 * `"select"` no lugar do antigo `"none"` (#83). O estado sempre existiu: era ele que fazia
 * arrastar o fundo desenhar o retângulo de seleção. O que faltava era nome e rosto — sem
 * eles, sair do lápis era uma ação sem destino, e a ferramenta mais usada do quadro era a
 * única sem representação na tela. Não há mais "nenhuma": há sempre uma ferramenta, e a
 * de partida é a de selecionar.
 *
 * `"erasing"` chegou com a borracha (#98), como uma quarta ferramenta exclusiva das demais
 * — a mesma regra que já valia entre o lápis e a colocação de nota, agora com mais um nome.
 * `"highlighter"` (#117) é mais uma, pela mesma regra: ligar o marca-texto desliga o lápis.
 * `"fountain"` (#114) também: a caneta tinteiro desliga o lápis, o marca-texto e o resto.
 *
 * Desde a toolbar inferior (#137) a seleção voltou a não ter botão, mas continua tendo nome:
 * é o que vale com nenhuma ferramenta da toolbar ligada, e o destino de `V` e `Esc`.
 */
export type BoardMode = "select" | ToolMode;
