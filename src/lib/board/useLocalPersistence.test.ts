import { renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBoard, saveBoard } from "./localStore";
import { createBoardStore } from "./store";
import { SCHEMA_VERSION, createEmptyBoard, type Board } from "./types";
import { SAVE_DEBOUNCE_MS, useLocalPersistence } from "./useLocalPersistence";

// `loadBoard` passa direto para o original; o espião só existe para um caso poder segurar a
// leitura do hook e afirmar sobre o intervalo em que ela ainda não voltou.
vi.mock("./localStore", async (importOriginal) => {
  const original = await importOriginal<typeof import("./localStore")>();
  return { ...original, loadBoard: vi.fn(original.loadBoard) };
});

const originalIndexedDB = globalThis.indexedDB;

function boardWith(text: string): Board {
  return {
    version: SCHEMA_VERSION,
    notes: [{ id: "a1b2c3", x: 10, y: 20, w: 200, h: 200, color: 0, text, z: 1 }],
    strokes: [],
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.indexedDB = originalIndexedDB;
});

describe("useLocalPersistence", () => {
  it("restaura o board salvo ao montar", async () => {
    await saveBoard(boardWith("de ontem"));
    const store = createBoardStore();

    renderHook(() => useLocalPersistence(store));

    await waitFor(() => {
      expect(store.getBoard().notes[0]?.text).toBe("de ontem");
    });
  });

  it("deixa o board vazio quando não há nada salvo", async () => {
    const store = createBoardStore();

    renderHook(() => useLocalPersistence(store));

    await waitFor(() => expect(store.getBoard().notes).toEqual([]));
  });

  it("grava as alterações da store com debounce", async () => {
    const store = createBoardStore();
    renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes).toEqual([]));

    store.addNote({ x: 0, y: 0 });
    // Antes do debounce, nada foi gravado ainda.
    expect(await loadBoard()).toBeNull();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await waitFor(async () => expect((await loadBoard())?.notes).toHaveLength(1));
  });

  it("grava uma vez só para uma rajada de alterações", async () => {
    const store = createBoardStore();
    renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes).toEqual([]));

    const note = store.addNote({ x: 0, y: 0 });
    for (const text of ["a", "an", "ano", "anot"]) {
      store.updateNote(note!.id, { text });
    }
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    // Só o estado final chega ao banco; os intermediários morreram no debounce.
    await waitFor(async () => expect((await loadBoard())?.notes[0]?.text).toBe("anot"));
  });

  it("não grava nada enquanto a leitura do board salvo não volta", async () => {
    await saveBoard(boardWith("trabalho de ontem"));
    const store = createBoardStore();
    // A leitura do hook fica presa até o teste soltar. Sem isso, a asserção abaixo correria
    // contra o banco: quando a leitura volta primeiro, o quadro vazio passa a ser um descarte
    // legítimo (#58) e é gravado — foi essa corrida que deixou o caso instável (#78).
    let releaseRead!: () => void;
    const pendingRead = loadBoard().then(
      (board) => new Promise<Board | null>((resolve) => (releaseRead = () => resolve(board))),
    );
    vi.mocked(loadBoard).mockReturnValueOnce(pendingRead);

    renderHook(() => useLocalPersistence(store));
    // Uma publicação da store enquanto a leitura ainda corre: sem o guard de restauração,
    // isto agendaria a gravação do board vazio por cima do que está salvo.
    store.replaceBoard(createEmptyBoard());
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);

    expect((await loadBoard())?.notes[0]?.text).toBe("trabalho de ontem");
    releaseRead();
  });

  it("junta o board salvo com o que o usuário criou enquanto a leitura corria", async () => {
    await saveBoard(boardWith("de ontem"));
    const store = createBoardStore();

    renderHook(() => useLocalPersistence(store));
    // Mais rápido que o banco: cria um post-it antes de a leitura voltar. Descartar
    // qualquer um dos dois lados aqui seria perda de trabalho real.
    store.addNote({ x: 5, y: 5, text: "de agora" });

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    const texts = () => store.getBoard().notes.map((note) => note.text);
    await waitFor(() => expect(texts()).toEqual(["de ontem", "de agora"]));
    await waitFor(async () => {
      const saved = await loadBoard();
      expect(saved?.notes.map((note) => note.text)).toEqual(["de ontem", "de agora"]);
    });
  });

  it("não apaga a sessão anterior ao sair antes de a leitura voltar", async () => {
    await saveBoard(boardWith("de ontem"));
    const store = createBoardStore();

    const { unmount } = renderHook(() => useLocalPersistence(store));
    store.addNote({ x: 5, y: 5, text: "de agora" });
    unmount();

    await waitFor(async () => {
      const saved = await loadBoard();
      expect(saved?.notes.map((note) => note.text)).toEqual(["de ontem", "de agora"]);
    });
  });

  it("grava a alteração pendente ao esconder a página, sem esperar o desmonte", async () => {
    const store = createBoardStore();
    renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes).toEqual([]));

    store.addNote({ x: 0, y: 0, text: "fechou a aba" });
    // Fechar a aba não desmonta o componente; é este evento que chega.
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(async () => {
      expect((await loadBoard())?.notes[0]?.text).toBe("fechou a aba");
    });
  });

  it("grava a alteração pendente ao desmontar", async () => {
    const store = createBoardStore();
    const { unmount } = renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes).toEqual([]));

    store.addNote({ x: 0, y: 0, text: "não pode sumir" });
    unmount();

    await waitFor(async () => {
      expect((await loadBoard())?.notes[0]?.text).toBe("não pode sumir");
    });
  });

  it("para de gravar depois de desmontar", async () => {
    const store = createBoardStore();
    const { unmount } = renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes).toEqual([]));
    unmount();

    store.addNote({ x: 0, y: 0, text: "depois do desmonte" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);

    expect(await loadBoard()).toBeNull();
  });

  it("grava o quadro vazio quando o board é descartado", async () => {
    await saveBoard(boardWith("rascunho antigo"));
    const store = createBoardStore();
    renderHook(() => useLocalPersistence(store));
    await waitFor(() => expect(store.getBoard().notes[0]?.text).toBe("rascunho antigo"));

    // É o que "criar um novo whiteboard" (#58) faz na store.
    store.replaceBoard(createEmptyBoard());
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await waitFor(async () => expect((await loadBoard())?.notes).toEqual([]));
  });

  it("não ressuscita o board descartado antes de a leitura voltar", async () => {
    await saveBoard(boardWith("rascunho antigo"));
    const store = createBoardStore();

    renderHook(() => useLocalPersistence(store));
    // Descartar enquanto o banco ainda responde: mesclar aqui traria de volta justamente o
    // que acabou de ser jogado fora.
    store.replaceBoard(createEmptyBoard());
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    await waitFor(() => expect(store.getBoard().notes).toEqual([]));
    await waitFor(async () => expect((await loadBoard())?.notes).toEqual([]));
  });

  it("segue funcionando sem IndexedDB, só sem autosave", async () => {
    // @ts-expect-error simula navegador sem suporte
    delete globalThis.indexedDB;
    const store = createBoardStore();

    expect(() => renderHook(() => useLocalPersistence(store))).not.toThrow();

    store.addNote({ x: 0, y: 0, text: "só em memória" });
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);

    expect(store.getBoard().notes[0]?.text).toBe("só em memória");
  });
});
