/**
 * Viewport do quadro e conversão de coordenadas.
 *
 * Todo comportamento espacial de post-it — criar no ponto do duplo clique, arrastar,
 * redimensionar, retângulo de seleção — depende de traduzir a posição do ponteiro na tela
 * para a posição no canvas. Essa tradução mora aqui, uma vez só, em funções puras: o React
 * fica de fora para que a matemática possa ser testada direto e reusada por qualquer
 * interação.
 *
 * O estado de viewport é efêmero: não vai para a URL nem para o autosave.
 */

export interface Point {
  x: number;
  y: number;
}

/** Retângulo alinhado aos eixos, em coordenadas de canvas. */
export interface Rect extends Size {
  x: number;
  y: number;
}

/** Dimensões de uma caixa, em unidades de canvas. */
export interface Size {
  w: number;
  h: number;
}

export interface Viewport {
  /** Deslocamento, em pixels de tela, do ponto (0,0) do canvas. */
  x: number;
  y: number;
  /** Fator de escala: 1 é 100%. */
  scale: number;
}

/**
 * Distância, em pixels de tela, abaixo da qual um gesto de ponteiro ainda é um clique.
 *
 * Medida sempre desde a origem do gesto, nunca passo a passo: um arrasto lento anda dois ou
 * três pixels por evento e nunca passaria de uma folga aplicada a cada passo.
 */
export const CLICK_SLOP = 4;

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

/** Os níveis fixos do menu de zoom (#141, Figma 1-477): 50%, 100% e 200%. */
export const ZOOM_LEVELS = [0.5, 1, 2] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

/** Viewport inicial: origem do canvas no canto do container, sem zoom. */
export const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

/**
 * Limita a escala ao intervalo navegável.
 *
 * `NaN` cai em 100%, porque não há para que lado clampar; infinito vai para o extremo
 * correspondente, que é o que um fator de zoom disparado deveria dar.
 */
export function clampScale(scale: number): number {
  if (Number.isNaN(scale)) return 1;
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/**
 * Converte um ponto da tela (relativo ao canto do container do quadro) para o canvas.
 *
 * Inversa exata de {@link canvasToScreen}.
 */
export function screenToCanvas(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

/** Converte um ponto do canvas para a tela, relativo ao canto do container do quadro. */
export function canvasToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

/**
 * Canto superior esquerdo de uma caixa de `size` centrada em `center`.
 *
 * Existe porque o board guarda o canto, mas todo gesto aponta para o meio: criar no ponto
 * do duplo clique é colocar o *centro* ali, não o canto.
 */
export function topLeftCenteredAt(center: Point, size: Size): Point {
  return { x: center.x - size.w / 2, y: center.y - size.h / 2 };
}

/**
 * Retângulo entre dois cantos, em qualquer ordem.
 *
 * Arrastar da direita para a esquerda é tão comum quanto o contrário, e um retângulo de
 * largura negativa não desenha nem intersecta nada.
 */
export function rectFromCorners(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/**
 * Converte um retângulo do canvas para a tela.
 *
 * A posição sai de {@link canvasToScreen} e as dimensões escalam junto. Mora aqui, com o
 * resto da conversão, para quem posiciona um controle pela caixa de uma seleção não
 * precisar refazer a multiplicação pela escala na mão.
 */
export function rectToScreen(rect: Rect, viewport: Viewport): Rect {
  const { x, y } = canvasToScreen(rect, viewport);
  return { x, y, w: rect.w * viewport.scale, h: rect.h * viewport.scale };
}

/**
 * Menor retângulo que contém todos os dados, ou `null` para uma lista vazia.
 *
 * `null`, e não um retângulo degenerado na origem: "nada selecionado" e "seleção colada no
 * canto do canvas" são coisas diferentes, e quem posiciona um controle pela caixa precisa
 * poder distinguir as duas para decidir se desenha alguma coisa.
 */
export function boundingRect(rects: readonly Rect[]): Rect | null {
  const first = rects[0];
  if (first === undefined) return null;

  let left = first.x;
  let top = first.y;
  let right = first.x + first.w;
  let bottom = first.y + first.h;

  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Sobreposição entre dois retângulos.
 *
 * Estritamente maior que zero: encostar não é intersectar, e retângulo sem área não toca
 * nada — nem aquele sobre o qual ele por acaso caiu. É o que um arrasto de um eixo só, ou
 * um clique, produz.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) return false;

  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Um segmento toca um retângulo.
 *
 * Existe para o retângulo de seleção pegar traços (#70). A caixa envolvente do rabisco não
 * serviria: um risco na diagonal tem caixa enorme e tinta nenhuma nos cantos, e selecionar
 * pela caixa marcaria traços que o retângulo nunca chegou perto de tocar.
 *
 * É o recorte de Liang-Barsky, e não quatro testes de cruzamento de segmentos. A tentativa
 * pelos cruzamentos tem um furo que aparece em uso real: um risco a 45° sobre um retângulo
 * quadrado entra e sai exatamente pelos cantos, e um teste de cruzamento estrito lê os dois
 * como "só encostou" e responde que não houve travessia — justamente no caso em que a linha
 * corta o retângulo ao meio. Aqui a pergunta é outra, e não tem esse ponto cego: existe um
 * pedaço do segmento dentro das duas faixas do retângulo ao mesmo tempo?
 *
 * Retângulo sem área não toca nada, como em {@link rectsIntersect} e pelo mesmo motivo: é o
 * que um clique sem arrasto produz, e ele não deveria marcar todo traço que passa pelo
 * ponto clicado.
 */
export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (rect.w <= 0 || rect.h <= 0) return false;

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  // O trecho do segmento ainda em disputa, como fração do caminho de `a` até `b`. Cada
  // borda examinada só pode encurtá-lo; se ele fechar, o segmento passa por fora.
  let entrada = 0;
  let saida = 1;

  // Uma entrada por borda: quanto o segmento avança contra ela, e quanto `a` está para
  // dentro dela. Esquerda e direita primeiro, depois topo e base.
  const avanco = [-dx, dx, -dy, dy];
  const folga = [a.x - rect.x, rect.x + rect.w - a.x, a.y - rect.y, rect.y + rect.h - a.y];

  for (let borda = 0; borda < 4; borda += 1) {
    if (avanco[borda] === 0) {
      // Paralelo a esta borda: ou já está do lado de dentro dela, e ela não tem nada a
      // dizer, ou está fora e nenhum avanço vai trazê-lo para dentro.
      if (folga[borda]! < 0) return false;
      continue;
    }

    const cruzamento = folga[borda]! / avanco[borda]!;
    if (avanco[borda]! < 0) {
      if (cruzamento > saida) return false;
      if (cruzamento > entrada) entrada = cruzamento;
    } else {
      if (cruzamento < entrada) return false;
      if (cruzamento < saida) saida = cruzamento;
    }
  }

  return true;
}

/**
 * Distância entre dois pontos, em linha reta.
 *
 * Existe para separar clicar de arrastar: a conta precisa ser sobre o deslocamento desde a
 * origem do gesto, e não sobre o passo de cada evento — um arrasto lento anda três pixels
 * por vez e nunca passaria de uma folga aplicada passo a passo.
 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Desloca o viewport em pixels de tela. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

/**
 * Aplica uma escala mantendo fixo o ponto sob o cursor.
 *
 * É o que dá a sensação de "aproximar naquele ponto" em vez de aproximar no canto: o ponto
 * do canvas sob o cursor antes do zoom continua sob o cursor depois dele.
 */
export function zoomAt(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const next = clampScale(scale);
  const canvasAnchor = screenToCanvas(anchor, viewport);

  return {
    scale: next,
    x: anchor.x - canvasAnchor.x * next,
    y: anchor.y - canvasAnchor.y * next,
  };
}

/** Multiplica a escala atual, ancorando no ponto dado. Útil para roda e botões. */
export function zoomByFactor(viewport: Viewport, factor: number, anchor: Point): Viewport {
  return zoomAt(viewport, viewport.scale * factor, anchor);
}

/**
 * Respiro, em pixels de tela, entre o conteúdo enquadrado e a borda da área visível.
 *
 * A moldura flutua sobre o quadro — as pílulas do topo e a toolbar da base ocupam cerca de
 * 70px de cada lado —, e um enquadramento colado na borda deixaria a primeira e a última
 * nota por baixo delas.
 */
export const FIT_PADDING = 80;

/**
 * O viewport que enquadra `bounds` inteiro numa área visível de `size`, centrado (#136).
 *
 * A escala é a maior que ainda cabe com {@link FIT_PADDING} de cada lado, limitada ao
 * intervalo navegável: um post-it sozinho não vira 4000%, e um quadro enorme para em 25% —
 * aí o conteúdo passa da tela, mas continua centrado.
 *
 * Sem nada para enquadrar (`null`), volta ao viewport inicial: 100% com a origem no canto, o
 * mesmo enquadramento de um quadro novo, que é onde o próximo post-it vai nascer.
 */
export function fitViewport(bounds: Rect | null, size: Size): Viewport {
  if (bounds === null) return IDENTITY_VIEWPORT;

  // Uma área menor que o respiro dos dois lados ainda enquadra alguma coisa: o espaço útil
  // nunca fica abaixo de metade da área.
  const room = {
    w: Math.max(size.w - FIT_PADDING * 2, size.w / 2),
    h: Math.max(size.h - FIT_PADDING * 2, size.h / 2),
  };
  // Lado zero — um traço reto — não limita a escala por aquele eixo.
  const scale = clampScale(
    Math.min(
      bounds.w > 0 ? room.w / bounds.w : Infinity,
      bounds.h > 0 ? room.h / bounds.h : Infinity,
    ),
  );

  return {
    scale,
    x: size.w / 2 - (bounds.x + bounds.w / 2) * scale,
    y: size.h / 2 - (bounds.y + bounds.h / 2) * scale,
  };
}

/** Escala como porcentagem inteira, para exibir na interface. */
export function scaleAsPercent(scale: number): number {
  return Math.round(scale * 100);
}
