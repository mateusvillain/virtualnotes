import type { ReactNode } from "react";

interface AppShellProps {
  /** Conteúdo desenhado sobre o quadro. Ocupa toda a área do canvas. */
  children?: ReactNode;
  /** Controles flutuantes sobre o canvas — zoom e reset entram aqui na issue #9. */
  controls?: ReactNode;
  /**
   * Ações no canto superior direito — compartilhar entra aqui (#46).
   *
   * Canto oposto ao do zoom de propósito: navegar o quadro e publicá-lo são coisas
   * diferentes, e vizinhas elas virariam uma fileira de ícones em que o clique errado sai
   * caro (um deles manda o board para fora da máquina).
   */
  trailingActions?: ReactNode;
  /**
   * Ações no canto superior esquerdo — o whiteboard novo entra aqui (#58).
   *
   * Longe do canto de compartilhar por segurança de gesto: uma delas descarta o quadro
   * atual e a outra o publica, e vizinhas o clique errado é caro nos dois sentidos.
   */
  leadingActions?: ReactNode;
  /**
   * A toolbar de ferramentas, centrada na borda de baixo (#137), e o que empilha em cima dela
   * — os filhos entram numa coluna, de cima para baixo, e o último encosta na borda.
   *
   * Coluna, e não cada peça com a própria altura calculada: o que sobe acima da toolbar
   * (as ações de seleção do toque, a paleta do traço) não precisa saber quanto ela mede.
   */
  toolbar?: ReactNode;
}

/**
 * Moldura da aplicação: a superfície do quadro e o canto reservado aos controles flutuantes.
 *
 * Não há barra superior. O quadro é a interface inteira, e uma faixa fixa no topo custava
 * altura de tela sem oferecer nada que o próprio quadro não mostre — o nome do app já está
 * no título da aba.
 *
 * O shell não sabe nada sobre post-its nem sobre viewport; ele só garante que a área de
 * canvas ocupe a tela inteira e que os controles tenham onde morar sem disputar espaço com
 * o quadro.
 */
export function AppShell({
  children,
  controls,
  leadingActions,
  trailingActions,
  toolbar,
}: AppShellProps) {
  return (
    <main className="relative h-dvh overflow-hidden bg-canvas">
      {/*
        O nome continua na árvore, só não na tela: uma página sem cabeçalho nenhum não tem
        como ser anunciada por leitor de tela, e um `h1` invisível custa zero pixel.
      */}
      <h1 className="sr-only">Virtual Notes</h1>

      {children}

      {leadingActions === undefined && trailingActions === undefined ? null : (
        // Mesmo respiro do canto de baixo: colado na borda o controle parece parte da
        // moldura do navegador, e fica no caminho do gesto de fechar a aba.
        //
        // Uma faixa só para os dois cantos, e não duas sobrepostas: assim eles nunca podem
        // divergir de altura nem cobrir um ao outro.
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-4">
          <div className="pointer-events-auto">{leadingActions}</div>
          <div className="pointer-events-auto">{trailingActions}</div>
        </div>
      )}

      {toolbar === undefined ? null : (
        // 24px da borda, como no Figma (1-2). A faixa inteira deixa o ponteiro passar: só as
        // peças dentro dela recebem clique, e o quadro continua alcançável dos lados.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 p-6 *:pointer-events-auto">
          {toolbar}
        </div>
      )}

      {controls === undefined ? null : (
        // Acima do quadro **e** da barra de seleção (`z-20`): um controle da aplicação não
        // pode ser coberto por um overlay que segue os post-its.
        //
        // Em tela estreita (abaixo de `sm`) a faixa sobe acima da toolbar e do bloco de cores
        // (24 + 88 + 9 + 44 = 165px): com menos de ~640px de largura o canto direito encosta
        // na pílula central, e os dois dividiriam os mesmos pixels.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-end p-4 max-sm:bottom-40">
          <div className="pointer-events-auto rounded-control border border-border bg-surface p-1 shadow-control">
            {controls}
          </div>
        </div>
      )}
    </main>
  );
}
