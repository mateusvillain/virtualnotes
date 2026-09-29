/**
 * A forma de um traço, lida a partir da lista achatada do contrato.
 *
 * O board guarda `points` como `[x0,y0,x1,y1,…]` por uma razão de bytes (o quadro inteiro
 * viaja na URL), e essa escolha não deveria vazar para quem faz perguntas geométricas sobre
 * o rabisco. Aqui ela é desfeita uma vez, em funções puras, e o resto do sistema pergunta
 * "onde este traço está?" sem saber como ele foi serializado.
 *
 * Fora do React de propósito, como `coords.ts`: selecionar por clique, selecionar por
 * retângulo e ancorar a barra de ações fazem a mesma pergunta, e nenhuma delas precisa de
 * um componente montado para ser testada.
 */

import {
  rectFromCorners,
  segmentIntersectsRect,
  type Point,
  type Rect,
  type Size,
} from "@/lib/canvas/coords";
import {
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  strokeSizeScale,
  strokeTool,
  type Stroke,
  type StrokeStyle,
  type StrokeTool,
} from "./types";

/**
 * Espessura do traço de lápis, em unidades de canvas.
 *
 * Escala com o zoom, como todo conteúdo do canvas: uma linha que mantivesse a espessura na
 * tela engrossaria em relação ao desenho ao afastar, e o rabisco deixaria de ser parte do
 * quadro para virar sobreposição. Mora aqui, e não no componente que desenha, porque com o
 * marca-texto (#116) a espessura deixa de ser detalhe de pintura: o alvo de clique e a
 * borracha precisam saber quanto de tinta há em volta da linha (#118).
 */
export const STROKE_WIDTH = 2;

/**
 * Espessura do marca-texto, em unidades de canvas (#116).
 *
 * Oito vezes a do lápis: larga o bastante para cobrir uma linha de texto de nota numa
 * passada só, que é o gesto de destacar. Valor de partida, ajustável em revisão.
 */
export const HIGHLIGHTER_WIDTH = 16;

/**
 * A espessura da tinta de um traço, em unidades de canvas: a base da ferramenta vezes o
 * multiplicador de espessura do traço (#157, `strokeSizeScale`).
 *
 * Para a caneta tinteiro, que não tem espessura única, é a **maior** que a pena alcança
 * (#115): os alvos precisam cobrir a tinta onde ela é mais grossa, ou o clique na parte
 * larga de uma letra passaria direto para o quadro. Nos trechos finos a folga sobra, e sobra
 * pouco — a pena inteira é de {@link FOUNTAIN_MAX_WIDTH} unidades.
 *
 * Recebe o traço, e não a ferramenta e o multiplicador soltos (#158): é a conta única da
 * espessura, lida pela pintura (`Strokes.tsx`) e pelos alvos ({@link inkOverhang}), para
 * que o que se vê e o que se clica nunca divirjam.
 */
export function strokeInkWidth(style: StrokeStyle): number {
  return toolBaseWidth(strokeTool(style)) * strokeSizeScale(style);
}

/** A espessura da tinta de uma ferramenta a 1×, antes do multiplicador do traço. */
function toolBaseWidth(tool: StrokeTool): number {
  if (tool === STROKE_TOOL_HIGHLIGHTER) return HIGHLIGHTER_WIDTH;
  if (tool === STROKE_TOOL_FOUNTAIN) return FOUNTAIN_MAX_WIDTH;
  return STROKE_WIDTH;
}

/**
 * Quanto a tinta de um traço passa do traço padrão do lápis, de cada lado da linha (#118).
 *
 * Os alvos — o clique, o retângulo de seleção, a borracha — foram calibrados para o lápis, e
 * o que muda com uma tinta mais larga é só essa sobra: somá-la ao alvo dá ao marca-texto a
 * mesma folga que o lápis sempre teve, medida a partir da **borda** visível, e deixa o lápis
 * exatamente como estava (a sobra dele é zero).
 *
 * Mede a tinta do **traço**, e não só da ferramenta (#158): a espessura escolhida (#153)
 * multiplica a base, e um lápis de 6× tem a mesma sobra que teria um marca-texto daquela
 * largura. Nunca negativa: um traço mais fino que o lápis padrão fica com o alvo do lápis —
 * a folga sobra, e é folga que a pessoa não vê, mas encolher o alvo junto com a tinta
 * tornaria o traço fino quase inclicável, e a moldura cortaria para dentro dos pontos.
 */
export function inkOverhang(style: StrokeStyle): number {
  return Math.max(0, (strokeInkWidth(style) - STROKE_WIDTH) / 2);
}

/**
 * Uma largura de alvo calibrada para o lápis, alargada pela sobra da tinta dos dois lados.
 * É a regra única dos alvos por traço (#118, #158): clique, borracha e o que vier.
 */
export function widenByInk(width: number, style: StrokeStyle): number {
  return width + inkOverhang(style) * 2;
}

/**
 * Ângulo da pena da caneta tinteiro, em radianos (#111): 45° acima da horizontal, subindo
 * para a direita, como a pena de quem escreve com a mão direita.
 *
 * Medido como se lê na tela, e não no eixo do canvas — lá o `y` cresce para baixo, e a pena
 * aponta para `(cos, −sin)`. O risco que corre paralelo a ela (↗ ou ↙) sai no fio; o que
 * corre perpendicular (↘ ou ↖), na largura inteira.
 */
export const FOUNTAIN_NIB_ANGLE = Math.PI / 4;

/**
 * Espessura mínima da tinta da caneta tinteiro, em unidades de canvas: o fio, quando o
 * movimento corre paralelo à pena. Não zero, porque uma pena de verdade tem espessura, e um
 * traço paralelo a ela sumiria. Valor de partida, ajustável em revisão.
 */
export const FOUNTAIN_MIN_WIDTH = 1;

/**
 * Espessura máxima da tinta da caneta tinteiro, em unidades de canvas: a largura da pena,
 * quando o movimento corre perpendicular a ela. Valor de partida, ajustável em revisão.
 */
export const FOUNTAIN_MAX_WIDTH = 5;

/** A pena como vetor unitário, em coordenadas de canvas (`y` para baixo). */
const NIB: Point = { x: Math.cos(FOUNTAIN_NIB_ANGLE), y: -Math.sin(FOUNTAIN_NIB_ANGLE) };

/**
 * A espessura da tinta da caneta tinteiro para um movimento na direção `direction` (#111).
 *
 * Proporcional ao seno do ângulo entre o movimento e a pena — é quanto da pena fica de
 * través ao caminho —, entre {@link FOUNTAIN_MIN_WIDTH} e {@link FOUNTAIN_MAX_WIDTH}. O
 * sentido não importa: ↗ e ↙ são o mesmo risco, andado ao contrário. Um vetor nulo não tem
 * direção, e fica no fio.
 *
 * `scale` multiplica o fio e a largura juntos (#157): a pena fica maior ou menor, mas com a
 * mesma proporção entre os dois, e a letra continua caligráfica em qualquer espessura.
 */
export function fountainWidth(direction: Point, scale = 1): number {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) return FOUNTAIN_MIN_WIDTH * scale;

  const sin = Math.abs(direction.x * NIB.y - direction.y * NIB.x) / length;
  return (FOUNTAIN_MIN_WIDTH + (FOUNTAIN_MAX_WIDTH - FOUNTAIN_MIN_WIDTH) * sin) * scale;
}

/** `v` com comprimento 1, ou `null` se ele não tiver comprimento nenhum. */
function unit(v: Point): Point | null {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? null : { x: v.x / length, y: v.y / length };
}

/**
 * A marca de uma pena parada: um retângulo da largura da pena, na inclinação dela.
 *
 * É o que um traço sem comprimento — dois pontos iguais, que um board de fora pode trazer —
 * desenha, em vez de um polígono de área zero que não pintaria nada.
 */
function nibDab(center: Point, scale: number): Point[] {
  const min = FOUNTAIN_MIN_WIDTH * scale;
  const max = FOUNTAIN_MAX_WIDTH * scale;
  // O comprimento é aparado para os cantos caberem no círculo da pena inteira: é essa largura
  // que os alvos consideram (#115), e um canto de fora dela seria tinta inclicável.
  const reach = Math.sqrt((max / 2) ** 2 - (min / 2) ** 2);
  const along = { x: NIB.x * reach, y: NIB.y * reach };
  const across = { x: (-NIB.y * min) / 2, y: (NIB.x * min) / 2 };

  return [
    { x: center.x - along.x - across.x, y: center.y - along.y - across.y },
    { x: center.x + along.x - across.x, y: center.y + along.y - across.y },
    { x: center.x + along.x + across.x, y: center.y + along.y + across.y },
    { x: center.x - along.x + across.x, y: center.y - along.y + across.y },
  ];
}

/**
 * O contorno da tinta de uma caneta tinteiro que passa pelos pontos `flat` (#111), como um
 * polígono fechado: a borda de um lado, na ordem do traço, e a do outro, de volta.
 *
 * A espessura não é gravada no board: ela sai da direção de cada trecho, aqui, na hora de
 * desenhar (ver {@link fountainWidth}). Cada vértice é empurrado para os dois lados pela
 * **bissetriz** dos dois trechos que se encontram nele, com a média das duas espessuras — é
 * o que faz a largura mudar aos poucos ao longo do trecho, em vez de saltar na junta, e a
 * borda dobrar a esquina sem abrir um bico. Numa volta completa (o traço vira para trás
 * sobre si mesmo), a bissetriz não existe, e vale a direção de chegada.
 *
 * Pontos repetidos em sequência não têm direção, e são descartados antes. Um traço que só
 * tem um ponto distinto vira a marca da pena parada ({@link nibDab}); sem ponto nenhum, não
 * há contorno.
 *
 * `scale` é o multiplicador de espessura do traço (#157): a pena inteira cresce ou encolhe
 * junto — ver {@link fountainWidth}.
 */
export function fountainOutline(flat: readonly number[], scale = 1): Point[] {
  const points = pointsFromFlat(flat).filter(
    (point, index, all) =>
      index === 0 || point.x !== all[index - 1]!.x || point.y !== all[index - 1]!.y,
  );

  const first = points[0];
  if (first === undefined) return [];
  if (points.length === 1) return nibDab(first, scale);

  const left: Point[] = [];
  const right: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    const before = points[index - 1];
    const after = points[index + 1];

    // Os dois trechos que se encontram aqui. Nas pontas, só existe um, que vale pelos dois.
    const incoming =
      before === undefined ? null : unit({ x: point.x - before.x, y: point.y - before.y });
    const outgoing =
      after === undefined ? null : unit({ x: after.x - point.x, y: after.y - point.y });
    const into = incoming ?? outgoing!;
    const out = outgoing ?? incoming!;

    const tangent = unit({ x: into.x + out.x, y: into.y + out.y }) ?? into;
    // Na bissetriz, a borda fica mais perto da linha do que a meia-largura: numa junta de
    // 90°, a tinta sairia com ~0,71 da espessura. Dividir pelo cosseno do meio ângulo (a
    // mitra) devolve a espessura na junta; o teto na meia pena impede que uma volta fechada
    // estique a borda para longe — e mantém a tinta dentro do alcance dos alvos (#115).
    const cos = into.x * tangent.x + into.y * tangent.y;
    const half = Math.min(
      (fountainWidth(into, scale) + fountainWidth(out, scale)) / 4 / Math.max(cos, Number.EPSILON),
      (FOUNTAIN_MAX_WIDTH * scale) / 2,
    );
    const normal = { x: -tangent.y * half, y: tangent.x * half };

    left.push({ x: point.x + normal.x, y: point.y + normal.y });
    right.push({ x: point.x - normal.x, y: point.y - normal.y });
  }

  return [...left, ...right.reverse()];
}

/**
 * Um polígono fechado como o atributo `d` de um `<path>` SVG. Vazio para uma lista vazia:
 * um `d` sem comando não desenha nada, que é o que se quer de um contorno sem forma.
 */
export function polygonPath(polygon: readonly Point[]): string {
  if (polygon.length === 0) return "";
  return `M${polygon.map((point) => `${point.x} ${point.y}`).join("L")}Z`;
}

/**
 * Uma lista achatada de coordenadas, despachada aos pares.
 *
 * Um número solto no fim é ignorado. O contrato não produz isso — `normalizeStroke` exige
 * comprimento par —, mas um board vindo de um link antigo ou editado à mão pode trazer, e
 * meio ponto não é um ponto.
 */
export function pointsFromFlat(flat: readonly number[]): Point[] {
  const points: Point[] = [];

  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push({ x: flat[index]!, y: flat[index + 1]! });
  }

  return points;
}

/** Os pontos do traço, despachados aos pares — ver {@link pointsFromFlat}. */
export function strokePoints(stroke: Stroke): Point[] {
  return pointsFromFlat(stroke.points);
}

/** O inverso de {@link strokePoints}: pares de volta à lista achatada do contrato. */
export function flattenPoints(points: readonly Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

/**
 * Menor retângulo que contém o traço, ou `null` para um traço sem pontos.
 *
 * `null`, e não um retângulo degenerado na origem, pela mesma razão de `boundingRect`:
 * "não tem forma" e "tem forma colada no canto do canvas" são coisas diferentes, e quem
 * posiciona a barra de ações pela caixa da seleção precisa distinguir as duas.
 */
export function strokeBounds(stroke: Stroke): Rect | null {
  const points = strokePoints(stroke);
  const first = points[0];
  if (first === undefined) return null;

  let left = first.x;
  let top = first.y;
  let right = first.x;
  let bottom = first.y;

  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }

  return rectFromCorners({ x: left, y: top }, { x: right, y: bottom });
}

/**
 * O retângulo de seleção toca a tinta deste traço.
 *
 * Segmento a segmento, e não pela caixa envolvente: um risco na diagonal tem caixa enorme e
 * tinta nenhuma nos cantos dela, e o teste pela caixa marcaria rabiscos que o retângulo
 * nunca chegou perto de tocar.
 *
 * Um traço de um ponto só — que o contrato não produz, mas um board de fora pode trazer —
 * não tem segmento nenhum, e por isso não é tocado por retângulo nenhum. É a mesma resposta
 * que `rectsIntersect` dá a uma caixa sem área: encostar não é intersectar.
 */
export function strokeIntersectsRect(stroke: Stroke, rect: Rect): boolean {
  const points = strokePoints(stroke);
  // A tinta larga (#118) conta: um retângulo que só encosta na borda do marca-texto toca o
  // que a pessoa vê, mesmo sem chegar à linha do meio.
  const alvo = inflate(rect, inkOverhang(stroke));

  for (let index = 0; index + 1 < points.length; index += 1) {
    if (segmentIntersectsRect(points[index]!, points[index + 1]!, alvo)) return true;
  }

  return false;
}

/** `rect` alargado por `by` de cada lado. */
function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

/**
 * A caixa da **tinta** de um traço: {@link strokeBounds} alargada pela sobra da ferramenta
 * (#118) — a caixa de um marca-texto horizontal, pelos pontos, teria altura zero.
 *
 * É onde a barra de ações da seleção se ancora, para não cair em cima do destaque. A
 * moldura faz a mesma conta à parte, porque durante o redimensionamento o tamanho vem do
 * gesto, medido pelos pontos, e não do traço gravado.
 */
export function strokeInkBounds(stroke: Stroke): Rect | null {
  const bounds = strokeBounds(stroke);
  return bounds === null ? null : inflate(bounds, inkOverhang(stroke));
}

/**
 * Menor lado que um traço pode ter depois de redimensionado, em unidades de canvas.
 *
 * Bem menor que o mínimo do post-it, e de propósito: uma nota precisa caber texto, e um
 * rabisco não precisa caber nada. O que este número impede é o achatamento até zero, do
 * qual não há volta — um traço sem largura perde a proporção e não cresce de novo, porque
 * não sobra dimensão para multiplicar.
 */
export const STROKE_MIN_SIZE = 4;

/**
 * Largura do alvo da borracha, em unidades de canvas.
 *
 * Mesma ideia do alvo de clique do traço (`STROKE_HIT_WIDTH`, em `Strokes.tsx`): a tinta
 * tem 2 unidades, e exigir acerto exato do gesto de apagar tornaria a ferramenta inútil no
 * toque, onde o dedo cobre a linha sem nunca coincidir com ela pixel a pixel.
 */
export const ERASER_HIT_WIDTH = 16;

/**
 * A largura do alvo da borracha para a tinta de um traço (#118, #158): a de sempre, mais a
 * sobra da tinta dos dois lados. A borracha corta pela linha do meio do traço, e sem isso
 * teria de passar pelo meio de um marca-texto — ou de um lápis grosso — para apagá-lo:
 * encostar na borda, que é o que se vê, não bastaria.
 */
export function eraserHitWidth(style: StrokeStyle): number {
  return widenByInk(ERASER_HIT_WIDTH, style);
}

/** O retângulo do alvo da borracha: a caixa de `a` a `b`, alargada por `hitWidth`. */
function eraserRect(a: Point, b: Point, hitWidth: number): Rect {
  const box = rectFromCorners(a, b);
  return {
    x: box.x - hitWidth / 2,
    y: box.y - hitWidth / 2,
    w: box.w + hitWidth,
    h: box.h + hitWidth,
  };
}

/**
 * O trecho que a borracha andou, de `a` a `b`, toca a tinta deste traço.
 *
 * Um ponto só — `a` igual a `b` — é o toque sem arrasto: o clique simples que o critério de
 * aceite pede. A caixa que envolve os dois pontos, alargada por `hitWidth`, vira a mesma
 * pergunta que a seleção por retângulo já sabe responder; não há geometria nova aqui, só um
 * retângulo mais generoso em volta do gesto.
 *
 * `hitWidth` é o alvo **do lápis**: a sobra da tinta larga (#118) já entra por
 * `strokeIntersectsRect`, e passar `eraserHitWidth` aqui a somaria duas vezes.
 */
export function strokeIntersectsSegment(
  stroke: Stroke,
  a: Point,
  b: Point,
  hitWidth: number = ERASER_HIT_WIDTH,
): boolean {
  return strokeIntersectsRect(stroke, eraserRect(a, b, hitWidth));
}

/** Ponto entre `p` e `q`, na fração `t` (0 é `p`, 1 é `q`). */
function lerp(p: Point, q: Point, t: number): Point {
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/**
 * O trecho de `p`→`q`, como fração `[t0, t1]` do caminho, que cai dentro do círculo de
 * centro `c` e raio `r` — ou `null` se o segmento nunca entra nele.
 *
 * É a borda redonda do alvo da borracha (#98), resolvida direto: `|p + t·(q−p) − c|² = r²`
 * é uma equação do segundo grau em `t`, e as raízes são onde o segmento cruza o círculo. Sem
 * raiz real, o segmento passa inteiro por fora. `t` fica preso a `[0, 1]`: o que existe fora
 * do segmento não é deste segmento.
 */
function segmentCircleInterval(p: Point, q: Point, c: Point, r: number): [number, number] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const fx = p.x - c.x;
  const fy = p.y - c.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r * r;

  // p e q coincidem: não há segmento, só um ponto — dentro ou fora do círculo por inteiro.
  if (a === 0) return cc <= 0 ? [0, 1] : null;

  const discriminant = b * b - 4 * a * cc;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const t0 = Math.max(0, (-b - root) / (2 * a));
  const t1 = Math.min(1, (-b + root) / (2 * a));

  return t0 < t1 ? [t0, t1] : null;
}

/**
 * Une intervalos de `[0, 1]` que se sobrepõem ou se tocam, em ordem crescente.
 *
 * Vários círculos ao longo do trecho `a`→`b` (ver {@link eraserSamples}) podem tocar o mesmo
 * segmento do traço em intervalos que se emendam; sem unir, o corte ficaria picotado em
 * pedaços curtos demais para formar um traço (`STROKE_MIN_SIZE`) em vez de um buraco só.
 */
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return intervals;

  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [sorted[0]!];

  for (const [start, end] of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (start > last[1]) {
      merged.push([start, end]);
    } else if (end > last[1]) {
      last[1] = end;
    }
  }

  return merged;
}

/**
 * Pontos ao longo de `a`→`b`, espaçados no máximo por `radius`, para aproximar o alvo da
 * borracha — uma cápsula (dois semicírculos nas pontas, reto no meio) — pela união dos
 * círculos centrados neles.
 *
 * Um arrasto rápido entre dois eventos de ponteiro anda vários pixels de uma vez, e testar
 * só as pontas `a` e `b` deixaria buracos no meio do trecho — a tinta bem no centro do
 * arrasto sobreviveria por estar longe demais dos dois círculos das pontas. Espaçar por não
 * mais que o raio garante que os círculos vizinhos se sobrepõem, sem falha na cobertura.
 */
function eraserSamples(a: Point, b: Point, radius: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return [a];

  const steps = Math.max(1, Math.ceil(length / radius));
  const samples: Point[] = [];
  for (let step = 0; step <= steps; step += 1) samples.push(lerp(a, b, step / steps));

  return samples;
}

/**
 * O que sobra de uma polilinha depois que a borracha passa de `a` a `b` por cima dela, como
 * uma borracha de verdade: só some a tinta que o círculo do alvo tocou, não o segmento
 * inteiro onde ele tocou de raspão.
 *
 * Cada segmento da polilinha é cortado no ponto exato onde entra e sai do alvo — não no
 * vértice mais próximo —, porque um traço simplificado (#67) tem vértices espaçados, e um
 * segmento longo entre dois deles não pode sumir inteiro por um toque de leve no meio dele.
 * O que sobra de cada lado do corte continua de pé como uma polilinha própria — daí a lista
 * de listas, não uma lista só. Um pedaço com um ponto só é descartado: um ponto não é um
 * traço, pela mesma regra do contrato (`normalizeStroke`) que já exige dois.
 *
 * `null` quando nenhum segmento foi tocado — o chamador não tem pedaço nenhum a substituir.
 * Isso é diferente de devolver a lista vazia, que é "a borracha comeu a polilinha inteira".
 */
export function splitPolylineBySegment(
  points: readonly Point[],
  a: Point,
  b: Point,
  hitWidth: number = ERASER_HIT_WIDTH,
): Point[][] | null {
  if (points.length < 2) return null;

  const radius = hitWidth / 2;
  const samples = eraserSamples(a, b, radius);

  const runs: Point[][] = [];
  let current: Point[] = [];
  let touched = false;

  for (let index = 0; index + 1 < points.length; index += 1) {
    const p = points[index]!;
    const q = points[index + 1]!;

    const erased = mergeIntervals(
      samples.flatMap((center): [number, number][] => {
        const interval = segmentCircleInterval(p, q, center, radius);
        return interval === null ? [] : [interval];
      }),
    );

    if (erased.length === 0) {
      if (current.length === 0) current.push(p);
      current.push(q);
      continue;
    }

    touched = true;
    let cursor = 0;

    for (const [t0, t1] of erased) {
      if (t0 > cursor) {
        if (current.length === 0) current.push(cursor === 0 ? p : lerp(p, q, cursor));
        current.push(lerp(p, q, t0));
      }
      if (current.length >= 2) runs.push(current);
      current = [];
      cursor = t1;
    }

    if (cursor < 1) {
      current.push(cursor === 0 ? p : lerp(p, q, cursor));
      current.push(q);
    }
  }

  if (current.length >= 2) runs.push(current);
  if (!touched) return null;

  return runs;
}

/** O traço deslocado, em coordenadas de canvas. Devolve a lista achatada do contrato. */
export function translateStrokePoints(stroke: Stroke, offset: Point): number[] {
  return stroke.points.map((value, index) => value + (index % 2 === 0 ? offset.x : offset.y));
}

/**
 * O traço reescalado para caber num tamanho novo, ancorado no canto superior esquerdo.
 *
 * Mesma âncora do post-it, e pela mesma razão: a alça fica no canto oposto, e crescer para
 * a direita e para baixo é a única direção em que a posição não precisa mudar junto.
 *
 * Um eixo sem extensão — um risco perfeitamente horizontal não tem altura — é deixado como
 * está, e não multiplicado. Não há proporção a preservar num eixo de tamanho zero, e a
 * conta seria uma divisão por zero: o traço inteiro viraria `NaN` e sumiria do quadro.
 */
export function scaleStrokePoints(stroke: Stroke, from: Rect, size: Size): number[] {
  const fatorX = from.w === 0 ? 1 : size.w / from.w;
  const fatorY = from.h === 0 ? 1 : size.h / from.h;

  return stroke.points.map((value, index) =>
    index % 2 === 0 ? from.x + (value - from.x) * fatorX : from.y + (value - from.y) * fatorY,
  );
}
