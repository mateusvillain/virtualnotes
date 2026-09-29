import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defined } from "@/test-utils/defined";
import { desvioMaximo, pontosDe } from "@/test-utils/geometry";
import { SIMPLIFY_TOLERANCE } from "@/lib/canvas/simplify";
import {
  CANVAS_MAX_ABS_COORDINATE,
  DEFAULT_HIGHLIGHTER_COLOR,
  DEFAULT_HIGHLIGHTER_OPACITY,
  STROKE_OPACITY_FULL,
  STROKE_SIZE_BASE,
  NOTE_COLORS,
  NOTE_SIZE,
  SCHEMA_VERSION,
  STROKE_COLOR_BLACK,
  STROKE_TOOL_FOUNTAIN,
  STROKE_TOOL_HIGHLIGHTER,
  STROKE_TOOL_PENCIL,
  type Board,
  type StrokeColor,
} from "./types";
import { selectionSize } from "./selection";
import { useBoard } from "./useBoard";

describe("useBoard", () => {
  it("começa vazio e sem ninguém em edição", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.notes).toEqual([]);
    expect(result.current.editingId).toBeNull();
  });

  it("cria o post-it centrado no ponto do canvas", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.createNoteAt({ x: 300, y: 200 }));
    const note = defined(result.current.notes[0], "o post-it criado");

    // O ponto é o centro, não o canto: o post-it nasce onde se olhou.
    expect(note.x + note.w / 2).toBe(300);
    expect(note.y + note.h / 2).toBe(200);
    expect(note.w).toBe(NOTE_SIZE.defaultWidth);
    expect(note.h).toBe(NOTE_SIZE.defaultHeight);
  });

  it("abre o post-it novo já em edição", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.createNoteAt({ x: 0, y: 0 }));

    expect(result.current.editingId).toBe(defined(result.current.notes[0], "o post-it criado").id);
  });

  it("dá ao post-it novo a cor padrão e o z mais alto do board", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => result.current.createNoteAt({ x: 500, y: 500 }));
    const primeiro = defined(result.current.notes[0], "o primeiro post-it");
    const segundo = defined(result.current.notes[1], "o segundo post-it");

    expect(NOTE_COLORS[primeiro.color]).toBe("yellow");
    expect(segundo.color).toBe(primeiro.color);
    expect(segundo.z).toBeGreaterThan(primeiro.z);
  });

  it("não abre edição de um post-it que não chegou a existir", () => {
    const { result } = renderHook(() => useBoard());

    // Coordenada impossível — um NaN escapado de uma conversão — não cria nada, e a store
    // devolve null em vez de lançar dentro do handler de evento.
    act(() => result.current.createNoteAt({ x: Number.NaN, y: 0 }));

    expect(result.current.notes).toEqual([]);
    expect(result.current.editingId).toBeNull();
  });

  it("grava o texto na store e fecha a edição", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    const id = defined(result.current.notes[0], "o post-it criado").id;

    act(() => result.current.commitText(id, "comprar pão"));

    expect(defined(result.current.notes[0], "o post-it criado").text).toBe("comprar pão");
    expect(result.current.editingId).toBeNull();
  });

  it("edita um post-it existente por pedido, um de cada vez", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => result.current.createNoteAt({ x: 500, y: 0 }));
    const primeiro = defined(result.current.notes[0], "o primeiro post-it");
    const segundo = defined(result.current.notes[1], "o segundo post-it");

    act(() => result.current.startEditing(primeiro.id));
    expect(result.current.editingId).toBe(primeiro.id);

    act(() => result.current.startEditing(segundo.id));
    expect(result.current.editingId).toBe(segundo.id);
  });

  it("não fecha a edição de outro post-it ao gravar um texto atrasado", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => result.current.createNoteAt({ x: 500, y: 0 }));
    const primeiro = defined(result.current.notes[0], "o primeiro post-it");
    const segundo = defined(result.current.notes[1], "o segundo post-it");

    act(() => result.current.startEditing(segundo.id));
    // Sair de um post-it costuma ser o mesmo gesto que entra no próximo: o blur do anterior
    // chega depois. Fechar a edição sem olhar o id fecharia a que acabou de abrir.
    act(() => result.current.commitText(primeiro.id, "texto do primeiro"));

    expect(result.current.editingId).toBe(segundo.id);
  });

  it("mantém uma store por montagem, sem vazar board entre elas", () => {
    const primeira = renderHook(() => useBoard());
    act(() => primeira.result.current.createNoteAt({ x: 0, y: 0 }));
    primeira.unmount();

    const segunda = renderHook(() => useBoard());

    expect(segunda.result.current.notes).toEqual([]);
  });
});

describe("useBoard — seleção", () => {
  /** Cria dois post-its e devolve os dois, já fora de edição. */
  function comDoisPostIts() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => hook.result.current.createNoteAt({ x: 500, y: 0 }));

    return {
      hook,
      primeiro: defined(hook.result.current.notes[0], "o primeiro post-it"),
      segundo: defined(hook.result.current.notes[1], "o segundo post-it"),
    };
  }

  it("começa sem nada selecionado", () => {
    const { result } = renderHook(() => useBoard());

    expect([...result.current.selection.notes]).toEqual([]);
  });

  it("já deixa selecionado o post-it recém-criado", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.createNoteAt({ x: 0, y: 0 }));

    expect([...result.current.selection.notes]).toEqual([
      defined(result.current.notes[0], "o post-it criado").id,
    ]);
  });

  it("selecionar um post-it desmarca os demais", () => {
    const { hook, primeiro } = comDoisPostIts();

    act(() => hook.result.current.selectElement("note", primeiro.id));

    expect([...hook.result.current.selection.notes]).toEqual([primeiro.id]);
  });

  it("shift-clique acrescenta e tira da seleção", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));
    expect([...hook.result.current.selection.notes].sort()).toEqual(
      [primeiro.id, segundo.id].sort(),
    );

    act(() => hook.result.current.selectElement("note", segundo.id, true));
    expect([...hook.result.current.selection.notes]).toEqual([primeiro.id]);
  });

  it("traz para a frente o post-it selecionado, e grava isso na store", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    const zDoSegundo = segundo.z;

    act(() => hook.result.current.selectElement("note", primeiro.id));

    const promovido = defined(
      hook.result.current.notes.find((note) => note.id === primeiro.id),
      "o post-it promovido",
    );
    expect(promovido.z).toBeGreaterThan(zDoSegundo);
  });

  it("também traz para a frente o post-it acrescentado com shift", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();

    act(() => hook.result.current.selectElement("note", segundo.id));
    act(() => hook.result.current.selectElement("note", primeiro.id, true));

    // Shift-clique também é apontar para um post-it, e numa ordem que o usuário escolheu.
    const promovido = defined(
      hook.result.current.notes.find((note) => note.id === primeiro.id),
      "o post-it promovido",
    );
    expect(promovido.z).toBeGreaterThan(
      defined(
        hook.result.current.notes.find((note) => note.id === segundo.id),
        "o outro post-it",
      ).z,
    );
  });

  it("não reordena o board ao tirar um post-it da seleção", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));
    const zAntes = hook.result.current.notes.map((note) => note.z);

    act(() => hook.result.current.selectElement("note", segundo.id, true));

    // Desmarcar não é apontar: trazer para a frente o que se acabou de tirar da seleção
    // seria o gesto fazendo o contrário do que diz.
    expect([...hook.result.current.selection.notes]).toEqual([primeiro.id]);
    expect(hook.result.current.notes.map((note) => note.z)).toEqual(zAntes);
  });

  it("o retângulo não reordena o board", () => {
    const { hook } = comDoisPostIts();
    const zAntes = hook.result.current.notes.map((note) => note.z);

    act(() => hook.result.current.selectInRect({ x: -1000, y: -1000, w: 3000, h: 3000 }));

    // Promover em lote reordenaria, um a um, post-its que o usuário não escolheu — numa
    // ordem que ele não pediu.
    expect([...hook.result.current.selection.notes]).toHaveLength(2);
    expect(hook.result.current.notes.map((note) => note.z)).toEqual(zAntes);
  });

  it("com additive, o retângulo soma ao que já estava marcado", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", segundo.id));

    act(() => hook.result.current.beginRectSelection(true));
    act(() => hook.result.current.selectInRect({ x: -150, y: -150, w: 300, h: 300 }));
    expect([...hook.result.current.selection.notes].sort()).toEqual(
      [primeiro.id, segundo.id].sort(),
    );

    // Encolher o retângulo até não tocar mais ninguém devolve a seleção ao que ela era.
    act(() => hook.result.current.selectInRect({ x: 5000, y: 5000, w: 10, h: 10 }));
    expect([...hook.result.current.selection.notes]).toEqual([segundo.id]);
  });

  it("sem additive, o retângulo substitui a seleção", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", segundo.id));

    act(() => hook.result.current.beginRectSelection(false));
    act(() => hook.result.current.selectInRect({ x: -150, y: -150, w: 100, h: 100 }));

    // Só o primeiro é tocado, e o segundo sai — arrastar é o gesto padrão de seleção desde
    // que o pan mudou para o espaço, e um gesto que só soma nunca desmarcaria nada.
    expect([...hook.result.current.selection.notes]).toEqual([primeiro.id]);
  });

  it("um retângulo que não toca ninguém esvazia a seleção", () => {
    const { hook, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", segundo.id));

    act(() => hook.result.current.beginRectSelection(false));
    act(() => hook.result.current.selectInRect({ x: 5000, y: 5000, w: 10, h: 10 }));

    // É isto que faz arrastar no vazio desmarcar tudo, sem um caminho próprio para isso.
    expect([...hook.result.current.selection.notes]).toEqual([]);
  });

  it("seleciona pelo retângulo quem ele toca, e só", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();

    act(() => hook.result.current.clearSelection());
    act(() => hook.result.current.beginRectSelection(false));
    // O primeiro nasce centrado em (0,0), o segundo em (500,0).
    act(() => hook.result.current.selectInRect({ x: -150, y: -150, w: 300, h: 300 }));

    expect([...hook.result.current.selection.notes]).toEqual([primeiro.id]);
    expect(hook.result.current.selection.notes.has(segundo.id)).toBe(false);
  });

  it("retângulo que não toca nada não marca ninguém", () => {
    const { hook } = comDoisPostIts();
    act(() => hook.result.current.clearSelection());
    act(() => hook.result.current.beginRectSelection(false));

    act(() => hook.result.current.selectInRect({ x: 5000, y: 5000, w: 10, h: 10 }));

    expect([...hook.result.current.selection.notes]).toEqual([]);
  });

  it("limpa a seleção quando pedido", () => {
    const { hook, primeiro } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.clearSelection());

    expect([...hook.result.current.selection.notes]).toEqual([]);
  });

  it("mantém a seleção fora do que a store guarda", () => {
    const { hook, primeiro } = comDoisPostIts();

    act(() => hook.result.current.selectElement("note", primeiro.id));

    // O que vai para a URL é o board. Um campo de seleção pendurado na note viajaria junto
    // — e a store congela justamente para impedir isso.
    for (const note of hook.result.current.notes) {
      expect(Object.keys(note).sort()).toEqual(["color", "h", "id", "text", "w", "x", "y", "z"]);
    }
  });
});

describe("useBoard — arraste", () => {
  function comDoisPostIts() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => hook.result.current.createNoteAt({ x: 500, y: 0 }));

    return {
      hook,
      primeiro: defined(hook.result.current.notes[0], "o primeiro post-it"),
      segundo: defined(hook.result.current.notes[1], "o segundo post-it"),
    };
  }

  function posicaoDe(hook: ReturnType<typeof comDoisPostIts>["hook"], id: string) {
    const note = defined(
      hook.result.current.notes.find((candidata) => candidata.id === id),
      `o post-it ${id}`,
    );
    return { x: note.x, y: note.y };
  }

  it("não tem deslocamento fora de um arraste", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.dragOffset).toBeNull();
  });

  it("não toca na store enquanto o gesto acontece", () => {
    const { hook, primeiro } = comDoisPostIts();
    const antes = posicaoDe(hook, primeiro.id);

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 120, y: 80 }));

    // A posição final é gravada só ao soltar: quem escuta a store é a persistência, que
    // reescreveria a URL a cada quadro do arraste.
    expect(hook.result.current.dragOffset).toEqual({ x: 120, y: 80 });
    expect(posicaoDe(hook, primeiro.id)).toEqual(antes);
  });

  it("grava a posição final ao soltar", () => {
    const { hook, primeiro } = comDoisPostIts();
    const antes = posicaoDe(hook, primeiro.id);

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 120, y: 80 }));
    act(() => hook.result.current.endDrag());

    expect(posicaoDe(hook, primeiro.id)).toEqual({ x: antes.x + 120, y: antes.y + 80 });
    expect(hook.result.current.dragOffset).toBeNull();
  });

  it("grava inteiros, mesmo com o deslocamento chegando fracionado pelo zoom", () => {
    const { hook, primeiro } = comDoisPostIts();
    const antes = posicaoDe(hook, primeiro.id);

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 10.4, y: -3.7 }));
    act(() => hook.result.current.endDrag());

    // Cada casa decimal custa caracteres de link.
    expect(posicaoDe(hook, primeiro.id)).toEqual({ x: antes.x + 10, y: antes.y - 4 });
  });

  it("move junto todos os post-its selecionados", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    const antesPrimeiro = posicaoDe(hook, primeiro.id);
    const antesSegundo = posicaoDe(hook, segundo.id);

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 50, y: 50 }));
    act(() => hook.result.current.endDrag());

    expect(posicaoDe(hook, primeiro.id)).toEqual({
      x: antesPrimeiro.x + 50,
      y: antesPrimeiro.y + 50,
    });
    expect(posicaoDe(hook, segundo.id)).toEqual({ x: antesSegundo.x + 50, y: antesSegundo.y + 50 });
  });

  it("move exatamente a seleção, e nada além dela", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    const antesSegundo = posicaoDe(hook, segundo.id);

    // Quem decide o que está selecionado é o gesto no post-it; o arraste só move o que
    // encontra marcado. Duas fontes para a mesma regra dariam duas respostas.
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 50, y: 0 }));
    act(() => hook.result.current.endDrag());

    expect(posicaoDe(hook, segundo.id)).toEqual(antesSegundo);
  });

  it("não mexe na seleção ao começar um arraste", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));

    act(() => hook.result.current.startDrag("note", segundo.id));

    expect([...hook.result.current.selection.notes]).toHaveLength(2);
  });

  it("traz para a frente o post-it que foi pego", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));

    act(() => hook.result.current.startDrag("note", primeiro.id));

    // Numa seleção que já existia, nenhum clique promoveu ninguém: sem isto, arrastar um
    // post-it de dentro do grupo o deixaria atrás dos outros.
    const pego = defined(
      hook.result.current.notes.find((note) => note.id === primeiro.id),
      "o post-it pego",
    );
    const outro = defined(
      hook.result.current.notes.find((note) => note.id === segundo.id),
      "o outro post-it",
    );
    expect(pego.z).toBeGreaterThan(outro.z);
  });

  it("cancelar devolve os post-its para onde estavam", () => {
    const { hook, primeiro } = comDoisPostIts();
    const antes = posicaoDe(hook, primeiro.id);

    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.startDrag("note", primeiro.id));
    act(() => hook.result.current.dragBy({ x: 200, y: 200 }));
    act(() => hook.result.current.cancelDrag());

    expect(hook.result.current.dragOffset).toBeNull();
    expect(posicaoDe(hook, primeiro.id)).toEqual(antes);
  });
});

describe("useBoard — estabilidade dos callbacks", () => {
  it("mantém a identidade dos callbacks de arraste ao longo do gesto", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    const antes = {
      startDrag: result.current.startDrag,
      dragBy: result.current.dragBy,
      endDrag: result.current.endDrag,
      cancelDrag: result.current.cancelDrag,
      selectElement: result.current.selectElement,
    };

    act(() => result.current.startDrag("note", defined(result.current.notes[0], "o post-it").id));
    act(() => result.current.dragBy({ x: 10, y: 10 }));
    act(() => result.current.dragBy({ x: 20, y: 20 }));

    // Esses callbacks descem até cada post-it. Se mudassem de identidade a cada movimento
    // do ponteiro, a memoização cairia e o quadro inteiro re-renderizaria por evento — que
    // é exatamente o que o critério de fluidez proíbe.
    expect(result.current.startDrag).toBe(antes.startDrag);
    expect(result.current.dragBy).toBe(antes.dragBy);
    expect(result.current.endDrag).toBe(antes.endDrag);
    expect(result.current.cancelDrag).toBe(antes.cancelDrag);
    expect(result.current.selectElement).toBe(antes.selectElement);
  });

  it("grava o último movimento quando ele chega junto com o fim do gesto", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 500, y: 500 }));
    const note = defined(result.current.notes[0], "o post-it");
    act(() => result.current.selectElement("note", note.id));
    act(() => result.current.startDrag("note", note.id));

    // Soltar o ponteiro reporta o último deslocamento e o fim do gesto no mesmo evento,
    // sem render entre os dois. Uma ref atualizada só no render seguinte gravaria a
    // posição anterior, e o post-it voltaria um pedaço ao ser solto.
    act(() => {
      result.current.dragBy({ x: 137, y: 12 });
      result.current.endDrag();
    });

    expect(defined(result.current.notes[0], "o post-it").x).toBe(note.x + 137);
  });

  it("grava o deslocamento atual mesmo com o endDrag lendo de ref", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 300, y: 300 }));
    const note = defined(result.current.notes[0], "o post-it");

    act(() => result.current.startDrag("note", note.id));
    act(() => result.current.dragBy({ x: 10, y: 10 }));
    act(() => result.current.dragBy({ x: 90, y: 40 }));
    act(() => result.current.endDrag());

    // Estável não é obsoleto: o callback é o mesmo, e o valor que ele lê é o último.
    expect(defined(result.current.notes[0], "o post-it").x).toBe(note.x + 90);
  });
});

describe("useBoard — redimensionamento", () => {
  function comUmPostIt() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 500, y: 500 }));
    return { hook, note: defined(hook.result.current.notes[0], "o post-it criado") };
  }

  function noteAtual(hook: ReturnType<typeof comUmPostIt>["hook"]) {
    return defined(hook.result.current.notes[0], "o post-it");
  }

  it("não redimensiona nada fora do gesto", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.resizing).toBeNull();
  });

  it("não toca na store enquanto a alça é arrastada", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 60, y: 40 }));

    expect(hook.result.current.resizing).toEqual({
      kind: "note",
      id: note.id,
      // A caixa de partida fica guardada no gesto: é dela que sai o tamanho novo, e é ela
      // que o traço precisa para saber de que escala partiu.
      from: { x: note.x, y: note.y, w: note.w, h: note.h },
      size: { w: note.w + 60, h: note.h + 40 },
    });
    expect(noteAtual(hook).w).toBe(note.w);
    expect(noteAtual(hook).h).toBe(note.h);
  });

  it("grava o tamanho final ao soltar", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 60, y: 40 }));
    act(() => hook.result.current.endResize());

    expect(noteAtual(hook).w).toBe(note.w + 60);
    expect(noteAtual(hook).h).toBe(note.h + 40);
    expect(hook.result.current.resizing).toBeNull();
  });

  it("grava inteiros, mesmo com o gesto chegando fracionado pelo zoom", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 10.6, y: -4.2 }));
    act(() => hook.result.current.endResize());

    expect(noteAtual(hook).w).toBe(note.w + 11);
    expect(noteAtual(hook).h).toBe(note.h - 4);
  });

  it("respeita o tamanho mínimo já enquanto se arrasta", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: -5000, y: -5000 }));

    // O limite aparece na hora, e não só ao gravar: deixar encolher além do mínimo e
    // devolver o tamanho ao soltar faria o post-it saltar na frente de quem o ajustava.
    expect(hook.result.current.resizing?.size).toEqual({
      w: NOTE_SIZE.minWidth,
      h: NOTE_SIZE.minHeight,
    });
  });

  it("respeita o tamanho máximo", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 999_999, y: 999_999 }));

    expect(hook.result.current.resizing?.size).toEqual({
      w: NOTE_SIZE.maxWidth,
      h: NOTE_SIZE.maxHeight,
    });
  });

  it("não move a âncora do post-it", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 120, y: 90 }));
    act(() => hook.result.current.endResize());

    // O post-it é descrito pelo canto superior esquerdo, e é ele que a alça do canto oposto
    // mantém parado.
    expect(noteAtual(hook).x).toBe(note.x);
    expect(noteAtual(hook).y).toBe(note.y);
  });

  it("mede sempre a partir do tamanho de quando o gesto começou", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 100, y: 0 }));
    act(() => hook.result.current.resizeBy({ x: 40, y: 0 }));
    act(() => hook.result.current.endResize());

    // O deslocamento vem acumulado desde a origem: somar cada aviso ao tamanho anterior
    // faria o post-it crescer o dobro.
    expect(noteAtual(hook).w).toBe(note.w + 40);
  });

  it("cancelar devolve o tamanho de antes", () => {
    const { hook, note } = comUmPostIt();

    act(() => hook.result.current.startResize("note", note.id));
    act(() => hook.result.current.resizeBy({ x: 300, y: 300 }));
    act(() => hook.result.current.cancelResize());

    expect(hook.result.current.resizing).toBeNull();
    expect(noteAtual(hook).w).toBe(note.w);
  });

  it("ignora o pedido para um post-it que não existe", () => {
    const { hook } = comUmPostIt();

    act(() => hook.result.current.startResize("note", "naoexiste"));

    expect(hook.result.current.resizing).toBeNull();
  });
});

describe("useBoard — o fim do gesto no mesmo evento do último movimento", () => {
  it("grava o tamanho do soltar, e não o do movimento anterior", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 500, y: 500 }));
    const note = defined(result.current.notes[0], "o post-it");

    act(() => {
      result.current.startResize("note", note.id);
      result.current.resizeBy({ x: 70, y: 30 });
      result.current.endResize();
    });

    // Começo, movimento e fim podem acontecer no mesmo evento: um arrasto rápido dispara
    // pointermove e pointerup sem render entre eles.
    expect(defined(result.current.notes[0], "o post-it").w).toBe(note.w + 70);
    expect(defined(result.current.notes[0], "o post-it").h).toBe(note.h + 30);
  });
});

describe("useBoard — cor da seleção", () => {
  /** Cria dois post-its e devolve os dois, já fora de edição. */
  function comDoisPostIts() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => hook.result.current.createNoteAt({ x: 500, y: 0 }));

    return {
      hook,
      primeiro: defined(hook.result.current.notes[0], "o primeiro post-it"),
      segundo: defined(hook.result.current.notes[1], "o segundo post-it"),
    };
  }

  /** A cor gravada de um post-it, lida da store. */
  function corDe(hook: ReturnType<typeof comDoisPostIts>["hook"], id: string) {
    return defined(
      hook.result.current.notes.find((note) => note.id === id),
      "o post-it",
    ).color;
  }

  it("não tem cor comum com o board vazio", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.selectionColor).toBeNull();
    expect(result.current.selected).toEqual([]);
  });

  it("expõe a cor do post-it selecionado", () => {
    const { hook, primeiro } = comDoisPostIts();

    act(() => hook.result.current.selectElement("note", primeiro.id));

    expect(hook.result.current.selectionColor).toBe(primeiro.color);
  });

  it("pinta o post-it selecionado e grava na store", () => {
    const { hook, primeiro } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.colorSelection(4));

    expect(corDe(hook, primeiro.id)).toBe(4);
    expect(hook.result.current.selectionColor).toBe(4);
  });

  it("pinta a seleção inteira", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));

    act(() => hook.result.current.colorSelection(2));

    expect(corDe(hook, primeiro.id)).toBe(2);
    expect(corDe(hook, segundo.id)).toBe(2);
  });

  it("não pinta quem está fora da seleção", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.colorSelection(5));

    expect(corDe(hook, segundo.id)).toBe(segundo.color);
  });

  it("sem cor comum quando a seleção tem cores diferentes", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.colorSelection(1));

    act(() => hook.result.current.selectElement("note", segundo.id, true));

    // O segundo continua na cor padrão: não há uma cor a marcar no seletor.
    expect(hook.result.current.selectionColor).toBeNull();
  });

  it("pintar em lote reconcilia a cor comum", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.colorSelection(1));
    act(() => hook.result.current.selectElement("note", segundo.id, true));

    act(() => hook.result.current.colorSelection(3));

    expect(hook.result.current.selectionColor).toBe(3);
  });

  it("não faz nada sem seleção", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.clearSelection());

    act(() => hook.result.current.colorSelection(5));

    expect(corDe(hook, primeiro.id)).toBe(primeiro.color);
    expect(corDe(hook, segundo.id)).toBe(segundo.color);
  });

  it("aceita toda cor da paleta", () => {
    const { hook, primeiro } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    for (let color = 0; color < NOTE_COLORS.length; color += 1) {
      act(() => hook.result.current.colorSelection(color as 0));
      expect(corDe(hook, primeiro.id)).toBe(color);
    }
  });
});

describe("useBoard — apagar a seleção", () => {
  function comDoisPostIts() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => hook.result.current.createNoteAt({ x: 500, y: 0 }));

    return {
      hook,
      primeiro: defined(hook.result.current.notes[0], "o primeiro post-it"),
      segundo: defined(hook.result.current.notes[1], "o segundo post-it"),
    };
  }

  it("apaga o post-it marcado", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.deleteSelection());

    expect(hook.result.current.notes.map((note) => note.id)).toEqual([segundo.id]);
  });

  it("apaga a seleção inteira", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));
    act(() => hook.result.current.selectElement("note", segundo.id, true));

    act(() => hook.result.current.deleteSelection());

    expect(hook.result.current.notes).toEqual([]);
  });

  it("esvazia a seleção depois de apagar", () => {
    const { hook, primeiro } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.deleteSelection());

    // Ids de post-its que não existem mais fariam a próxima ação em lote agir sobre nada.
    expect([...hook.result.current.selection.notes]).toEqual([]);
  });

  it("fecha a edição do post-it apagado", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));

    // Criar já deixa o post-it selecionado e em edição.
    act(() => result.current.deleteSelection());

    expect(result.current.editingId).toBeNull();
  });

  it("não mexe na edição de quem não foi apagado", () => {
    const { hook, primeiro, segundo } = comDoisPostIts();
    act(() => hook.result.current.startEditing(segundo.id));
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.deleteSelection());

    expect(hook.result.current.editingId).toBe(segundo.id);
  });

  it("não faz nada sem seleção", () => {
    const { hook } = comDoisPostIts();
    act(() => hook.result.current.clearSelection());
    const antes = hook.result.current.notes;

    act(() => hook.result.current.deleteSelection());

    expect(hook.result.current.notes).toBe(antes);
  });

  it("apagar duas vezes seguidas não quebra", () => {
    const { hook, primeiro } = comDoisPostIts();
    act(() => hook.result.current.selectElement("note", primeiro.id));

    act(() => hook.result.current.deleteSelection());
    act(() => hook.result.current.deleteSelection());

    expect(hook.result.current.notes).toHaveLength(1);
  });
});

describe("useBoard — duplicar a seleção (#99)", () => {
  function comUmPostIt() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 100, y: 100 }));

    return { hook, original: defined(hook.result.current.notes[0], "o post-it") };
  }

  it("cria uma cópia com id próprio, deslocada do original", () => {
    const { hook, original } = comUmPostIt();

    act(() => hook.result.current.duplicateSelection());

    expect(hook.result.current.notes).toHaveLength(2);
    const copia = defined(
      hook.result.current.notes.find((note) => note.id !== original.id),
      "a cópia",
    );
    expect(copia.x).not.toBe(original.x);
    expect(copia.y).not.toBe(original.y);
  });

  it("a cópia nasce marcada, e só ela", () => {
    const { hook, original } = comUmPostIt();

    act(() => hook.result.current.duplicateSelection());

    const copia = defined(
      hook.result.current.notes.find((note) => note.id !== original.id),
      "a cópia",
    );
    expect([...hook.result.current.selection.notes]).toEqual([copia.id]);
  });

  it("duplica post-it e traço da mesma seleção, numa publicação só", () => {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() =>
      hook.result.current.addStroke([
        { x: 0, y: 200 },
        { x: 100, y: 200 },
      ]),
    );
    act(() => hook.result.current.selectEverything());

    act(() => hook.result.current.duplicateSelection());

    expect(hook.result.current.notes).toHaveLength(2);
    expect(hook.result.current.strokes).toHaveLength(2);
  });

  it("um passo só de desfazer para a seleção inteira", () => {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 0, y: 0 }));
    act(() =>
      hook.result.current.addStroke([
        { x: 0, y: 200 },
        { x: 100, y: 200 },
      ]),
    );
    act(() => hook.result.current.selectEverything());

    act(() => hook.result.current.duplicateSelection());
    act(() => hook.result.current.undo());

    expect(hook.result.current.notes).toHaveLength(1);
    expect(hook.result.current.strokes).toHaveLength(1);
  });

  it("sem seleção, não faz nada", () => {
    const { hook } = comUmPostIt();
    act(() => hook.result.current.clearSelection());
    const antes = hook.result.current.notes;

    act(() => hook.result.current.duplicateSelection());

    expect(hook.result.current.notes).toBe(antes);
  });

  it("duplicar de novo em seguida parte da cópia, e não empilha sobre o original", () => {
    const { hook } = comUmPostIt();

    act(() => hook.result.current.duplicateSelection());
    const primeiraCopia = defined(
      hook.result.current.notes[hook.result.current.notes.length - 1],
      "a primeira cópia",
    );

    act(() => hook.result.current.duplicateSelection());
    const segundaCopia = defined(
      hook.result.current.notes[hook.result.current.notes.length - 1],
      "a segunda cópia",
    );

    expect(hook.result.current.notes).toHaveLength(3);
    expect(segundaCopia.x).not.toBe(primeiraCopia.x);
    expect(segundaCopia.y).not.toBe(primeiraCopia.y);
  });
});

describe("resetBoard", () => {
  it("descarta os post-its e começa um quadro vazio", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 10, y: 10 }));
    expect(result.current.notes).toHaveLength(1);

    act(() => result.current.resetBoard());

    expect(result.current.notes).toEqual([]);
  });

  it("leva junto a seleção e a edição em andamento", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 10, y: 10 }));
    const id = defined(result.current.notes[0], "o post-it criado").id;
    act(() => result.current.selectElement("note", id));
    act(() => result.current.startEditing(id));

    act(() => result.current.resetBoard());

    // Seleção e edição apontariam para post-its que não existem mais, e a próxima ação em
    // lote agiria sobre nada.
    expect(selectionSize(result.current.selection)).toBe(0);
    expect(result.current.editingId).toBeNull();
  });
});

describe("useBoard — traço à mão livre", () => {
  it("grava o traço desenhado, na cor com que o lápis nasce", () => {
    const { result } = renderHook(() => useBoard());

    act(() =>
      result.current.addStroke([
        { x: 0, y: 0 },
        { x: 50, y: 20 },
      ]),
    );

    const stroke = defined(result.current.strokes[0], "o traço gravado");
    expect(stroke.points).toEqual([0, 0, 50, 20]);
    expect(stroke.color).toBe(STROKE_COLOR_BLACK);
  });

  it("simplifica antes de gravar: o board guarda a forma, não a amostragem do ponteiro", () => {
    const { result } = renderHook(() => useBoard());
    // Uma reta reportada em 40 passos, como o ponteiro faz.
    const reta = Array.from({ length: 40 }, (_, index) => ({ x: index * 5, y: index * 5 }));

    act(() => result.current.addStroke(reta));

    // Sobram os extremos: os do meio não descrevem nada que eles já não digam.
    expect(defined(result.current.strokes[0], "o traço gravado").points).toEqual([0, 0, 195, 195]);
  });

  it("arredonda as coordenadas, que é o que o contrato guarda", () => {
    const { result } = renderHook(() => useBoard());

    act(() =>
      result.current.addStroke([
        { x: 0.4, y: 10.5 },
        { x: 50.6, y: 20.49 },
      ]),
    );

    expect(defined(result.current.strokes[0], "o traço gravado").points).toEqual([0, 11, 51, 20]);
  });

  it("cada traço novo nasce na frente do anterior", () => {
    const { result } = renderHook(() => useBoard());
    const traço = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];

    act(() => result.current.addStroke(traço));
    act(() => result.current.addStroke(traço));

    const [primeiro, segundo] = result.current.strokes;
    expect(defined(segundo, "o segundo traço").z).toBeGreaterThan(
      defined(primeiro, "o primeiro traço").z,
    );
  });

  /**
   * O critério da #67 fala do desvio do traço **original**, e o que se compara aqui é o que
   * o board guarda de verdade — depois da simplificação e do arredondamento das coordenadas.
   * Medir só a saída da função pura verificaria a garantia num valor que não é o gravado.
   */
  it("o traço gravado não se afasta do desenhado além do orçamento de desvio", () => {
    const { result } = renderHook(() => useBoard());
    const rabisco = Array.from({ length: 600 }, (_, index) => {
      const t = (index / 599) * Math.PI * 4;
      return { x: index * 0.8, y: 120 + Math.sin(t) * 60 + Math.sin(t * 3) * 8 };
    });

    act(() => result.current.addStroke(rabisco));

    const gravado = pontosDe(defined(result.current.strokes[0], "o traço gravado").points);
    // Tolerância mais o arredondamento: meia unidade por eixo, `SQRT1_2` na diagonal.
    expect(desvioMaximo(rabisco, gravado)).toBeLessThanOrEqual(SIMPLIFY_TOLERANCE + Math.SQRT1_2);
    expect(gravado.length).toBeLessThan(rabisco.length / 10);
  });

  it("não grava um traço sem os dois pontos que o contrato exige", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.addStroke([{ x: 5, y: 5 }]));

    expect(result.current.strokes).toEqual([]);
  });
});

describe("useBoard — cor do lápis (#69)", () => {
  it("o lápis nasce preto", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.strokeColors[STROKE_TOOL_PENCIL]).toBe(STROKE_COLOR_BLACK);
  });

  it("a cor trocada vale para o próximo traço", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.setStrokeColor(STROKE_TOOL_PENCIL, 3));
    act(() =>
      result.current.addStroke([
        { x: 0, y: 0 },
        { x: 50, y: 20 },
      ]),
    );

    expect(defined(result.current.strokes[0], "o traço gravado").color).toBe(3);
  });

  it("continua valendo para os traços seguintes, até ser trocada de novo", () => {
    const { result } = renderHook(() => useBoard());
    const traço = [
      { x: 0, y: 0 },
      { x: 50, y: 20 },
    ];

    act(() => result.current.setStrokeColor(STROKE_TOOL_PENCIL, 1));
    act(() => result.current.addStroke(traço));
    act(() => result.current.addStroke(traço));

    expect(result.current.strokes.map((stroke) => stroke.color)).toEqual([1, 1]);
  });

  it("não recolore o que já foi desenhado", () => {
    const { result } = renderHook(() => useBoard());
    const traço = [
      { x: 0, y: 0 },
      { x: 50, y: 20 },
    ];

    act(() => result.current.addStroke(traço));
    act(() => result.current.setStrokeColor(STROKE_TOOL_PENCIL, 4));

    expect(defined(result.current.strokes[0], "o traço gravado").color).toBe(STROKE_COLOR_BLACK);
  });

  it("é independente da cor de post-it: trocar uma não muda a outra", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.createNoteAt({ x: 0, y: 0 }));
    act(() => result.current.selectEverything());

    act(() => result.current.colorSelection(5));

    expect(result.current.strokeColors[STROKE_TOOL_PENCIL]).toBe(STROKE_COLOR_BLACK);
  });
});

describe("useBoard — uma cor por ferramenta (#112)", () => {
  const traço = [
    { x: 0, y: 0 },
    { x: 50, y: 20 },
  ];

  it("lápis e caneta nascem pretos, o marca-texto nasce amarelo", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.strokeColors).toEqual([
      STROKE_COLOR_BLACK,
      STROKE_COLOR_BLACK,
      DEFAULT_HIGHLIGHTER_COLOR,
    ]);
    expect(NOTE_COLORS[DEFAULT_HIGHLIGHTER_COLOR]).toBe("yellow");
  });

  it("trocar a cor de uma ferramenta não mexe nas outras", () => {
    const { result } = renderHook(() => useBoard());

    const verde = NOTE_COLORS.indexOf("green") as StrokeColor;
    act(() => result.current.setStrokeColor(STROKE_TOOL_HIGHLIGHTER, verde));

    expect(result.current.strokeColors).toEqual([STROKE_COLOR_BLACK, STROKE_COLOR_BLACK, verde]);
  });

  it("o traço grava a cor e a ferramenta de quem o desenhou", () => {
    const { result } = renderHook(() => useBoard());
    const azul = NOTE_COLORS.indexOf("blue") as StrokeColor;
    act(() => result.current.setStrokeColor(STROKE_TOOL_FOUNTAIN, azul));

    act(() => result.current.addStroke(traço, STROKE_TOOL_FOUNTAIN));
    act(() => result.current.addStroke(traço, STROKE_TOOL_HIGHLIGHTER));
    act(() => result.current.addStroke(traço));

    expect(result.current.strokes.map(({ color, tool }) => ({ color, tool }))).toEqual([
      { color: azul, tool: STROKE_TOOL_FOUNTAIN },
      { color: DEFAULT_HIGHLIGHTER_COLOR, tool: STROKE_TOOL_HIGHLIGHTER },
      { color: STROKE_COLOR_BLACK, tool: undefined },
    ]);
  });

  it("repetir a mesma cor não troca a referência", () => {
    const { result } = renderHook(() => useBoard());
    const antes = result.current.strokeColors;

    act(() => result.current.setStrokeColor(STROKE_TOOL_PENCIL, STROKE_COLOR_BLACK));

    expect(result.current.strokeColors).toBe(antes);
  });
});

describe("useBoard — mover a seleção pelo teclado", () => {
  /** Um quadro com um post-it e um traço, cada um com posição conhecida. */
  function comNotaETraço() {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: 300, y: 200 }));
    act(() =>
      hook.result.current.addStroke([
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ]),
    );

    return {
      hook,
      note: defined(hook.result.current.notes[0], "o post-it"),
      stroke: defined(hook.result.current.strokes[0], "o traço"),
    };
  }

  it("move o que está marcado pelo deslocamento pedido", () => {
    const { hook, note } = comNotaETraço();

    act(() => hook.result.current.selectElement("note", note.id));
    act(() => {
      hook.result.current.nudgeSelection({ x: 1, y: -1 });
    });

    const movida = defined(hook.result.current.notes[0], "o post-it movido");
    expect({ x: movida.x, y: movida.y }).toEqual({ x: note.x + 1, y: note.y - 1 });
  });

  it("move notas e traços juntos, num passo de desfazer só", () => {
    const { hook, note, stroke } = comNotaETraço();

    act(() => hook.result.current.selectEverything());
    act(() => {
      hook.result.current.nudgeSelection({ x: 10, y: 10 });
    });

    expect(defined(hook.result.current.strokes[0], "o traço movido").points).toEqual(
      stroke.points.map((valor) => valor + 10),
    );

    // Um `Ctrl+Z` devolve os dois: a seleção inteira é uma publicação, e é isso que a torna
    // um passo só — quem escuta é a persistência e o histórico, pelo mesmo aviso.
    act(() => hook.result.current.undo());

    const voltou = defined(hook.result.current.notes[0], "o post-it de volta");
    expect({ x: voltou.x, y: voltou.y }).toEqual({ x: note.x, y: note.y });
    expect(defined(hook.result.current.strokes[0], "o traço de volta").points).toEqual(
      stroke.points,
    );
  });

  it("não move quem está fora da seleção", () => {
    const { hook, note, stroke } = comNotaETraço();

    act(() => hook.result.current.selectElement("note", note.id));
    act(() => {
      hook.result.current.nudgeSelection({ x: 25, y: 0 });
    });

    expect(defined(hook.result.current.strokes[0], "o traço parado").points).toEqual(stroke.points);
  });

  it("sem seleção não move nada, e devolve a tecla a quem a tinha", () => {
    const { hook, note } = comNotaETraço();
    let moveu = true;

    // Criar já marca o que nasceu (#73), então a seleção precisa ser desfeita para o caso
    // ser o que ele diz ser.
    act(() => hook.result.current.clearSelection());
    act(() => {
      moveu = hook.result.current.nudgeSelection({ x: 10, y: 10 });
    });

    // `false` é o que faz a seta continuar rolando a página lá em cima: sem nada marcado, a
    // tecla não é do quadro.
    expect(moveu).toBe(false);
    const parada = defined(hook.result.current.notes[0], "o post-it parado");
    expect({ x: parada.x, y: parada.y }).toEqual({ x: note.x, y: note.y });
  });

  it("respeita os limites de coordenada do board", () => {
    const hook = renderHook(() => useBoard());
    act(() => hook.result.current.createNoteAt({ x: CANVAS_MAX_ABS_COORDINATE, y: 0 }));
    const note = defined(hook.result.current.notes[0], "o post-it na borda");

    act(() => hook.result.current.selectElement("note", note.id));
    act(() => {
      hook.result.current.nudgeSelection({ x: 5_000, y: 0 });
    });

    // O limite é da store, e não das setas: quem move não precisa saber onde o quadro
    // acaba, e uma segunda regra sobre isso divergiria da primeira.
    expect(defined(hook.result.current.notes[0], "o post-it na borda").x).toBe(
      CANVAS_MAX_ABS_COORDINATE,
    );
  });
});

describe("useBoard — borracha (#98)", () => {
  /** Um quadro com dois traços separados e um post-it, cada um com posição conhecida. */
  function comDoisTraçosEUmaNota() {
    const hook = renderHook(() => useBoard());
    act(() =>
      hook.result.current.addStroke([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ]),
    );
    act(() =>
      hook.result.current.addStroke([
        { x: 0, y: 200 },
        { x: 40, y: 200 },
      ]),
    );
    act(() => hook.result.current.createNoteAt({ x: 500, y: 500 }));

    return {
      hook,
      primeiro: defined(hook.result.current.strokes[0], "o primeiro traço"),
      segundo: defined(hook.result.current.strokes[1], "o segundo traço"),
      nota: defined(hook.result.current.notes[0], "o post-it"),
    };
  }

  it("some da lista na hora em que a borracha toca, antes de soltar o ponteiro", () => {
    const { hook, primeiro } = comDoisTraçosEUmaNota();
    const podiaDesfazerAntes = hook.result.current.canUndo;

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 0 }));

    expect(hook.result.current.strokes.map((s) => s.id)).not.toContain(primeiro.id);
    // Ainda não gravado: a passada em curso não é, por si só, um passo novo de histórico.
    expect(hook.result.current.canUndo).toBe(podiaDesfazerAntes);
  });

  it("um ponto só, sem arrasto, já apaga a área tocada (toque simples)", () => {
    const { hook, primeiro, segundo } = comDoisTraçosEUmaNota();

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 0 }));
    act(() => hook.result.current.endErasing());

    const ids = hook.result.current.strokes.map((s) => s.id);
    expect(ids).not.toContain(primeiro.id);
    expect(ids).toContain(segundo.id);
    // O toque foi no meio do traço: o que sobra dos dois lados do buraco continua de pé,
    // como uma borracha de verdade — não some o traço inteiro por um toque no meio dele.
    expect(hook.result.current.strokes.filter((s) => s.id !== segundo.id)).toHaveLength(2);
  });

  it("não afeta post-it: a borracha só apaga traço", () => {
    const { hook, primeiro, nota } = comDoisTraçosEUmaNota();

    act(() => hook.result.current.beginErasing());
    // O segmento cobre a área toda, inclusive onde o post-it está.
    act(() => hook.result.current.eraseSegment({ x: 0, y: 0 }, { x: 600, y: 600 }));
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes.map((s) => s.id)).not.toContain(primeiro.id);
    expect(hook.result.current.notes.map((n) => n.id)).toEqual([nota.id]);
  });

  it("ignora o traço fora do alcance do segmento", () => {
    const { hook } = comDoisTraçosEUmaNota();
    const antes = hook.result.current.strokes;

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 900, y: 900 }, { x: 950, y: 950 }));
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes).toBe(antes);
  });

  it("uma passada que apaga vários traços é um passo de desfazer só", () => {
    const { hook, primeiro, segundo } = comDoisTraçosEUmaNota();

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 0 }));
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 200 }));
    act(() => hook.result.current.endErasing());

    const ids = hook.result.current.strokes.map((s) => s.id);
    expect(ids).not.toContain(primeiro.id);
    expect(ids).not.toContain(segundo.id);

    act(() => hook.result.current.undo());

    // Um `Ctrl+Z` só devolve os dois originais: a passada inteira, tocando os dois traços,
    // foi um passo só de desfazer.
    expect(hook.result.current.strokes.map((s) => s.id).sort()).toEqual(
      [primeiro.id, segundo.id].sort(),
    );
  });

  it("um traço já tocado na passada não é testado de novo, mesmo continuando sob a borracha", () => {
    const { hook, primeiro } = comDoisTraçosEUmaNota();

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 0, y: 0 }, { x: 40, y: 0 }));
    act(() => hook.result.current.eraseSegment({ x: 40, y: 0 }, { x: 0, y: 0 }));
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes.map((s) => s.id)).not.toContain(primeiro.id);
  });

  it("soltar sem ter tocado nada não grava e não mexe no histórico", () => {
    const { hook } = comDoisTraçosEUmaNota();
    const antes = hook.result.current.strokes;
    const podiaDesfazerAntes = hook.result.current.canUndo;

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes).toBe(antes);
    expect(hook.result.current.canUndo).toBe(podiaDesfazerAntes);
  });

  it("tira da seleção o traço que a borracha apagou", () => {
    const { hook, primeiro } = comDoisTraçosEUmaNota();
    act(() => hook.result.current.selectElement("stroke", primeiro.id));

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 0 }));
    act(() => hook.result.current.endErasing());

    expect([...hook.result.current.selection.strokes]).toEqual([]);
  });

  it("uma nova passada esquece o que a anterior tinha tocado", () => {
    const { hook, primeiro, segundo } = comDoisTraçosEUmaNota();

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 0 }, { x: 20, y: 0 }));
    act(() => hook.result.current.endErasing());
    let ids = hook.result.current.strokes.map((s) => s.id);
    expect(ids).not.toContain(primeiro.id);
    expect(ids).toContain(segundo.id);

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 20, y: 200 }, { x: 20, y: 200 }));
    act(() => hook.result.current.endErasing());

    // A segunda passada apaga `segundo` sem precisar retocar o que a primeira já tinha
    // tratado: o controle de "já tocado" não vaza de uma passada para a outra.
    ids = hook.result.current.strokes.map((s) => s.id);
    expect(ids).not.toContain(segundo.id);
  });
});

describe("useBoard — borracha na caneta tinteiro (#115)", () => {
  /** Uma caneta e um lápis na mesma linha y = 0, lado a lado em x. */
  const board: Board = {
    version: SCHEMA_VERSION,
    notes: [],
    strokes: [
      { id: "caneta", color: 6, tool: STROKE_TOOL_FOUNTAIN, points: [0, 0, 200, 0], z: 1 },
      { id: "lapis", color: 6, points: [300, 0, 500, 0], z: 2 },
    ],
  };

  function passa(x: number, y: number) {
    const hook = renderHook(() => useBoard({ initialBoard: board, autosave: false }));
    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x, y }, { x, y }));
    act(() => hook.result.current.endErasing());
    return hook.result.current.strokes.map((s) => s.id);
  }

  it("apaga a caneta encostando na borda da tinta, além do alcance do lápis", () => {
    // Raio do lápis: 8. A pena passa 1,5 da linha do lápis de cada lado: 9 alcança a caneta.
    expect(passa(100, 9)).not.toContain("caneta");
    expect(passa(400, 9)).toContain("lapis");
  });

  it("não alcança além da borda da tinta", () => {
    expect(passa(100, 12)).toContain("caneta");
  });

  it("cortar a caneta no meio deixa dois pedaços de caneta", () => {
    const hook = renderHook(() => useBoard({ initialBoard: board, autosave: false }));
    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 100, y: -20 }, { x: 100, y: 20 }));
    act(() => hook.result.current.endErasing());

    const pedacos = hook.result.current.strokes.filter((s) => s.id !== "lapis");
    expect(pedacos).toHaveLength(2);
    for (const pedaco of pedacos) expect(pedaco.tool).toBe(STROKE_TOOL_FOUNTAIN);
  });
});

describe("useBoard — borracha no marca-texto (#118)", () => {
  /** Um destaque horizontal na linha y = 0, com a tinta indo de y = -8 a y = 8. */
  const comDestaque: Board = {
    version: SCHEMA_VERSION,
    notes: [],
    strokes: [
      { id: "mt", color: 0, tool: STROKE_TOOL_HIGHLIGHTER, points: [0, 0, 200, 0], z: 1 },
      { id: "lapis", color: 6, points: [0, 100, 200, 100], z: 2 },
    ],
  };

  function passa(y: number) {
    const hook = renderHook(() => useBoard({ initialBoard: comDestaque, autosave: false }));
    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 100, y }, { x: 100, y }));
    act(() => hook.result.current.endErasing());
    return hook.result.current.strokes;
  }

  it("apaga o destaque encostando só na borda visível dele", () => {
    // Longe demais da linha do meio para o alvo do lápis (raio 8), mas dentro da tinta.
    const restantes = passa(14);

    expect(restantes.filter((s) => s.tool === STROKE_TOOL_HIGHLIGHTER)).toHaveLength(2);
    expect(restantes.map((s) => s.id)).not.toContain("mt");
  });

  it("não alcança além da borda do destaque", () => {
    expect(passa(30).map((s) => s.id)).toContain("mt");
  });

  it("a barra de ações se ancora na caixa da tinta, e não na linha do meio", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comDestaque, autosave: false }));
    act(() => hook.result.current.selectEverything());

    // Destaque: linha em y = 0, tinta de −8 a 8 (sobra de 7 além do lápis). Lápis: igual.
    expect(hook.result.current.selectedRects).toEqual([
      { x: -7, y: -7, w: 214, h: 14 },
      { x: 0, y: 100, w: 200, h: 0 },
    ]);
  });

  it("o lápis continua com o alcance de antes", () => {
    // Mesma distância da linha do meio que apagou o destaque acima: o lápis sobrevive.
    expect(passa(100 + 14).map((s) => s.id)).toContain("lapis");
    expect(passa(100 + 6).map((s) => s.id)).not.toContain("lapis");
  });
});

/**
 * O que `useBoard` recria a partir de um traço existente — duplicar, colar e o que sobra da
 * borracha — leva a ferramenta do original (#110).
 */
describe("useBoard — ferramenta do traço (#110)", () => {
  const comMarcaTexto: Board = {
    version: SCHEMA_VERSION,
    notes: [],
    strokes: [{ id: "mt", color: 0, tool: 2, points: [0, 0, 100, 0], z: 1 }],
  };

  it("duplicar preserva a ferramenta", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comMarcaTexto, autosave: false }));
    act(() => hook.result.current.selectEverything());

    act(() => hook.result.current.duplicateSelection());

    expect(hook.result.current.strokes.map((s) => s.tool)).toEqual([2, 2]);
  });

  it("copiar e colar preserva a ferramenta", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comMarcaTexto, autosave: false }));
    act(() => hook.result.current.selectEverything());
    const texto = defined(hook.result.current.copySelection() ?? undefined, "o recorte");

    act(() => {
      hook.result.current.pasteFromClipboard(texto);
    });

    expect(hook.result.current.strokes.map((s) => s.tool)).toEqual([2, 2]);
  });

  it("redimensionar preserva a ferramenta", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comMarcaTexto, autosave: false }));

    act(() => hook.result.current.startResize("stroke", "mt"));
    act(() => hook.result.current.resizeBy({ x: 50, y: 0 }));
    act(() => hook.result.current.endResize());

    const traço = defined(hook.result.current.strokes[0], "o traço redimensionado");
    expect(traço.points).not.toEqual([0, 0, 100, 0]);
    expect(traço.tool).toBe(2);
  });

  it("os pedaços que a borracha deixa continuam com a ferramenta", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comMarcaTexto, autosave: false }));

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 50, y: 0 }, { x: 50, y: 0 }));
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes).toHaveLength(2);
    expect(hook.result.current.strokes.every((s) => s.tool === 2)).toBe(true);
  });
});

/**
 * Espessura e opacidade viajam com o traço pelos mesmos caminhos que a ferramenta (#153):
 * um campo esquecido num deles mudaria o desenho do traço copiado em silêncio.
 */
describe("useBoard — espessura e opacidade do traço (#153)", () => {
  const comTraçoGrosso: Board = {
    version: SCHEMA_VERSION,
    notes: [],
    strokes: [{ id: "g", color: 0, w: 7, o: 9, points: [0, 0, 100, 0], z: 1 }],
  };

  const estilos = (strokes: readonly { w?: number; o?: number }[]) =>
    strokes.map(({ w, o }) => ({ w, o }));

  it("duplicar preserva espessura e opacidade", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comTraçoGrosso, autosave: false }));
    act(() => hook.result.current.selectEverything());

    act(() => hook.result.current.duplicateSelection());

    expect(estilos(hook.result.current.strokes)).toEqual([
      { w: 7, o: 9 },
      { w: 7, o: 9 },
    ]);
  });

  it("copiar e colar preserva espessura e opacidade", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comTraçoGrosso, autosave: false }));
    act(() => hook.result.current.selectEverything());
    const texto = defined(hook.result.current.copySelection() ?? undefined, "o recorte");

    act(() => {
      hook.result.current.pasteFromClipboard(texto);
    });

    expect(estilos(hook.result.current.strokes)).toEqual([
      { w: 7, o: 9 },
      { w: 7, o: 9 },
    ]);
  });

  it("os pedaços que a borracha deixa continuam com espessura e opacidade", () => {
    const hook = renderHook(() => useBoard({ initialBoard: comTraçoGrosso, autosave: false }));

    act(() => hook.result.current.beginErasing());
    act(() => hook.result.current.eraseSegment({ x: 50, y: 0 }, { x: 50, y: 0 }));
    act(() => hook.result.current.endErasing());

    expect(hook.result.current.strokes).toHaveLength(2);
    expect(estilos(hook.result.current.strokes)).toEqual([
      { w: 7, o: 9 },
      { w: 7, o: 9 },
    ]);
  });
});

describe("useBoard — espessura e opacidade por ferramenta (#159)", () => {
  const traço = [
    { x: 0, y: 0 },
    { x: 50, y: 20 },
  ];

  it("todas nascem na base; lápis e caneta cheios, o marca-texto a 35%", () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current.strokeSizes).toEqual([
      STROKE_SIZE_BASE,
      STROKE_SIZE_BASE,
      STROKE_SIZE_BASE,
    ]);
    expect(result.current.strokeOpacities).toEqual([
      STROKE_OPACITY_FULL,
      STROKE_OPACITY_FULL,
      DEFAULT_HIGHLIGHTER_OPACITY,
    ]);
  });

  it("trocar a espessura ou a opacidade de uma ferramenta não mexe nas outras", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.setStrokeSize(STROKE_TOOL_FOUNTAIN, 6));
    act(() => result.current.setStrokeOpacity(STROKE_TOOL_PENCIL, 9));

    expect(result.current.strokeSizes).toEqual([STROKE_SIZE_BASE, 6, STROKE_SIZE_BASE]);
    expect(result.current.strokeOpacities).toEqual([
      9,
      STROKE_OPACITY_FULL,
      DEFAULT_HIGHLIGHTER_OPACITY,
    ]);
  });

  it("o traço grava a espessura e a opacidade da ferramenta que o desenhou", () => {
    const { result } = renderHook(() => useBoard());
    act(() => result.current.setStrokeSize(STROKE_TOOL_PENCIL, 7));
    act(() => result.current.setStrokeOpacity(STROKE_TOOL_PENCIL, 9));
    act(() => result.current.setStrokeOpacity(STROKE_TOOL_HIGHLIGHTER, STROKE_OPACITY_FULL));

    act(() => result.current.addStroke(traço));
    act(() => result.current.addStroke(traço, STROKE_TOOL_HIGHLIGHTER));

    expect(result.current.strokes.map(({ w, o }) => ({ w, o }))).toEqual([
      { w: 7, o: 9 },
      // Cheio é escolha no marca-texto; a espessura na base é o padrão, e fica de fora.
      { w: undefined, o: STROKE_OPACITY_FULL },
    ]);
  });

  it("o traço com os valores padrão sai sem os campos", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.addStroke(traço));
    act(() => result.current.addStroke(traço, STROKE_TOOL_HIGHLIGHTER));

    for (const stroke of result.current.strokes) {
      expect(stroke).not.toHaveProperty("w");
      expect(stroke).not.toHaveProperty("o");
    }
  });

  it("trocar a espessura ou a opacidade não entra no histórico de desfazer", () => {
    const { result } = renderHook(() => useBoard());

    act(() => result.current.setStrokeSize(STROKE_TOOL_PENCIL, 5));
    act(() => result.current.setStrokeOpacity(STROKE_TOOL_PENCIL, 3));

    expect(result.current.canUndo).toBe(false);
  });

  it("repetir o mesmo valor não troca a referência", () => {
    const { result } = renderHook(() => useBoard());
    const tamanhos = result.current.strokeSizes;
    const opacidades = result.current.strokeOpacities;

    act(() => result.current.setStrokeSize(STROKE_TOOL_PENCIL, STROKE_SIZE_BASE));
    act(() => result.current.setStrokeOpacity(STROKE_TOOL_PENCIL, STROKE_OPACITY_FULL));

    expect(result.current.strokeSizes).toBe(tamanhos);
    expect(result.current.strokeOpacities).toBe(opacidades);
  });
});
