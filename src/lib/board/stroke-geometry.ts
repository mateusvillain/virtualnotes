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
import { STROKE_TOOL_HIGHLIGHTER, type Stroke, type StrokeTool } from "./types";

/**
 * Espessura do traço de lápis, em unidades de canvas.
 *
 * Escala com o zoom, como todo conteúdo do canvas: uma linha que mantivesse a espessura na
 * tela engrossaria em relação ao desenho ao afastar, e o rabisco deixaria de ser parte do
 * quadro para virar sobreposição. Mora aqui, e não no componente que desenha, porque a
 * espessura passou a ter leitores geométricos: o alvo de clique e a borracha de cada
 * ferramenta perguntam quanto de tinta há em volta da linha (#116).
 */
export const STROKE_WIDTH = 2;

/**
 * Espessura do marca-texto, em unidades de canvas (#116).
 *
 * Oito vezes a do lápis: larga o bastante para cobrir uma linha de texto de nota numa
 * passada só, que é o gesto de destacar. Valor de partida, ajustável em revisão.
 */
export const HIGHLIGHTER_WIDTH = 16;

/** A espessura da tinta de uma ferramenta, em unidades de canvas. */
export function strokeInkWidth(tool: StrokeTool): number {
  return tool === STROKE_TOOL_HIGHLIGHTER ? HIGHLIGHTER_WIDTH : STROKE_WIDTH;
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

  for (let index = 0; index + 1 < points.length; index += 1) {
    if (segmentIntersectsRect(points[index]!, points[index + 1]!, rect)) return true;
  }

  return false;
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
