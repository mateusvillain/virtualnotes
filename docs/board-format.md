# Formato do board

Referência única do modelo de dados compartilhado por canvas, post-its, persistência e
exportação. O código vive em `src/lib/board/`: `types.ts` (contrato) e `schema.ts`
(validação/normalização).

## Modelo

```ts
Board = { version: number; notes: Note[]; strokes: Stroke[] }
Note = { id: string; x: number; y: number; w: number; h: number; color: 0..5; text: string; z: number }
Stroke = { id: string; color: 0..6; tool?: 1..2; w?: 0..7; o?: 0..19; points: number[]; z: number }
```

- `x`/`y` — canto superior esquerdo, em coordenadas de canvas (não de tela).
- `w`/`h` — dimensões em unidades de canvas; padrão 200×200, entre 80 e 2000.
- `color` da note — **índice** na paleta `NOTE_COLORS`, nunca o nome nem o hexadecimal.
- `text` — texto puro, sem formatação, até 2000 caracteres.
- `z` — ordem de empilhamento; maior fica por cima. Notes e traços têm pilhas de `z`
  independentes uma da outra.
- `color` do traço — índice na paleta `STROKE_COLORS`: as mesmas seis cores de `NOTE_COLORS`,
  na mesma ordem, mais o preto no índice `6` (o padrão do lápis, epic #64).
- `tool` do traço — índice em `STROKE_TOOLS` (`["pencil", "fountain", "highlighter"]`): a
  ferramenta que desenhou o traço (epic #107). **Ausente é lápis**, e o lápis é sempre
  gravado sem o campo: todo traço de antes do campo era lápis, então boards antigos não
  precisam de migração, e um board só com lápis gera exatamente o mesmo link de antes.
  Índice fora da lista também vira lápis, sem descartar o traço (#110).
- `w` do traço — índice em `STROKE_SIZES` (`[0.5, 0.75, 1, 1.5, 2, 3, 4, 6]`): um
  **multiplicador** da espessura-base da ferramenta, e não uma espessura absoluta (#153). O
  lápis tem 2 unidades e o marca-texto 16, e uma escala comum dá às três o mesmo controle; na
  caneta tinteiro, o fio e a largura da pena escalam juntos.
- `o` do traço — índice em `STROKE_OPACITIES` (5% a 100%, de 5 em 5): a opacidade do traço
  inteiro (#153).
- **`w` e `o` ausentes são o padrão da ferramenta**, e o padrão nunca é gravado: `1×` para as
  três; opacidade cheia para lápis e caneta, 35% para o marca-texto (`DEFAULT_STROKE_SIZES`,
  `DEFAULT_STROKE_OPACITIES`). O padrão é medido pela ferramenta já normalizada — 35% some de
  um traço de marca-texto, mas fica num de lápis, onde é escolha. Índice fora da lista vira o
  padrão, sem descartar o traço. Assim todo traço de antes dos campos continua gerando o mesmo
  link. As listas guardam posição: um valor novo só entra nas pontas, nunca no meio.
- `points` — coordenadas de canvas **achatadas**: `[x0, y0, x1, y1, …]`, e não uma lista de
  `{x, y}`. Comprimento par, com ao menos dois pontos (quatro números). É a mesma lógica da
  cor por índice — o traço é o rabisco inteiro, e cada ponto dele custa bytes de link — mas
  aqui o formato plano evita que cada ponto pague a chave `x`/`y` no JSON, o que custaria
  cerca do dobro por ponto num traço de qualquer tamanho. As coordenadas são **inteiras**:
  `parseBoard` arredonda na gravação, porque a fração de unidade de canvas que se perde é
  invisível e cada casa decimal é um caractere a mais no link (issue #67).
- `STROKE_MAX_POINTS` e `STROKE_MAX_COUNT` (em `types.ts`) tetam pontos por traço e traços
  por board, no mesmo espírito de `CANVAS_MAX_ABS_COORDINATE` e `NOTE_MAX_TEXT_LENGTH`.

## Por que é compacto

O board inteiro é serializado dentro da URL (issue #11), então cada caractere do modelo
compete com o limite prático de tamanho de link. As decisões que seguem dessa restrição:

1. **Cor como índice, não como string.** `0` custa 1 caractere; `"yellow"` custa 8. Como
   bônus, trocar o valor visual da paleta (issue #8) não invalida nenhum link já
   compartilhado — o índice continua apontando para o mesmo lugar.
2. **Chaves curtas de uma letra** no que é geométrico e repetido em toda note: `x`, `y`,
   `w`, `h`, `z`. Os nomes por extenso ficaram só onde a clareza importa mais que o byte
   (`id`, `color`, `text`).
3. **Sem campos derivados.** Nada que possa ser recalculado (bounding box, seleção,
   viewport) entra no board. O estado de viewport — pan e zoom — é efêmero e nunca é
   serializado.
4. **Sem formatação de texto.** Texto puro elimina toda uma árvore de marcação do payload.
   No traço, o equivalente é a **lista achatada de coordenadas inteiras**: sem chave `x`/`y`
   por ponto e sem casa decimal. O traço também chega ao board já simplificado por
   Ramer–Douglas–Peucker (`src/lib/canvas/simplify.ts`, issue #67) — o ponteiro reporta
   centenas de pontos por rabisco, e quase todos caem em cima da reta que os vizinhos já
   descrevem.
5. **Limites explícitos** (`NOTE_MAX_TEXT_LENGTH`, `CANVAS_MAX_ABS_COORDINATE`, tamanho
   máximo de note)
   dão um teto previsível ao tamanho do link, que a issue #23 usa para avisar o usuário
   antes de o board estourar.

A compressão e a codificação em si (`#11`) são outra camada: este documento define o que é
serializado, não como.

## Versionamento

`version` acompanha `SCHEMA_VERSION` (hoje `4`) e existe para os links não quebrarem quando
o formato evoluir. As regras de leitura:

- Versão **menor ou igual** à atual: aceita. Um board da v3 (sem `w` e `o`) abre com todo
  traço na espessura e na opacidade padrão da ferramenta. Um board da v2 (sem `tool`) abre com todo
  traço como lápis. Um board da v1 (sem `strokes`) abre normalmente — `parseBoard` trata o
  campo ausente como lista vazia, e não como erro. O board devolvido sempre sai carimbado
  com a versão atual, porque é nessa versão que ele foi normalizado.
- Versão **maior** que a atual: recusada com mensagem explícita. Um board escrito por uma
  versão mais nova pode ter campos com outro significado, e mostrar dados silenciosamente
  errados é pior do que avisar.

Incrementar `SCHEMA_VERSION` só em mudança incompatível. `strokes` (issue #66) é o exemplo
que definiu o que "incompatível" cobre aqui: o campo em si é opcional na leitura — um board
sem ele abre igual, com a lista vazia —, mas a versão subiu de `1` para `2` mesmo assim,
porque o app que não sabe ler `strokes` não erraria o dado, erraria o **desenho**: abriria
um board com traços e mostraria só os post-its, sem avisar que faltou algo. É essa classe de
erro silencioso — dado presente que a versão antiga não sabe interpretar — que a regra de
recusar versão futura existe para evitar. Um campo opcional só dispensa o incremento quando
nenhuma versão anterior do app pode mostrar o board de forma **visivelmente** incompleta por
ignorá-lo.

`tool` (#110) subiu a versão de `2` para `3` pela mesma regra: a v2 leria um traço de
marca-texto como uma linha fina e opaca de lápis — o dado está lá, mas o desenho sai errado,
sem aviso.

`w` e `o` (#153) subiram de `3` para `4` pela mesma regra: a v3 desenharia um traço de 6× na
espessura padrão, e um a 20% de opacidade cheio.

## Validação

`parseBoard(input: unknown)` é a porta de entrada de todo dado não confiável (autosave em
IndexedDB, board aberto por link compartilhado). Ela **nunca lança**:

```ts
type ParseBoardResult =
  { ok: true; board: Board; warnings: string[] } | { ok: false; error: string };
```

Um board parcialmente corrompido não derruba a tela. A regra é: **valor recuperável é
normalizado, não descartado**.

- **Descartada** só a note irrecuperável — sem `id`, sem posição numérica, ou com cor fora
  da paleta. Não há como adivinhar onde ela ficava nem de que cor era. Traço irrecuperável
  segue a mesma regra: sem `id`, sem cor válida, ou sem os dois pontos mínimos depois de
  descartados os pares com coordenada não numérica.
- **Renomeada** a note ou o traço com `id` duplicado (`"a"` → `"a-2"`): o identificador
  colide, mas o conteúdo está intacto, e apagá-lo seria perder trabalho por causa de um bug
  de codec. Note e traço têm espaços de id separados — o mesmo id numa note e num traço não
  é colisão.
- **Ajustado em silêncio** o resto: tamanho e coordenadas de note são limitados aos
  extremos, texto é truncado, `z` vira inteiro, campo ausente ganha o padrão. No traço, cada
  par de coordenadas fora do teto é limitado do mesmo jeito, e a lista de pontos (ou de
  traços do board) é cortada em `STROKE_MAX_POINTS` (ou `STROKE_MAX_COUNT`) quando passa do
  limite.

`warnings` cobre o que muda a identidade de uma note ou de um traço — descarte e
renomeação. Ajuste de campo não gera aviso: normalizar valor é o trabalho normal desta
função, e avisar a cada pixel limitado afogaria os avisos que importam.

`strokes` ausente do board de entrada não é um erro: é o formato de antes da issue #66, e
vira lista vazia sem aviso. `strokes` presente mas do formato errado (não é uma lista)
também vira lista vazia — perder só os traços de um board malformado é preferível a recusar
a abertura do board inteiro por um campo que só passou a existir agora.

Só um board irrecuperável (não é objeto, versão inválida, versão futura, sem lista de
notes) devolve `ok: false`. A lista de notes continua obrigatória; a de traços, não.

Para validar uma note isolada, sem board em volta, use `normalizeNote(input)` — devolve a
note normalizada ou `null`.
