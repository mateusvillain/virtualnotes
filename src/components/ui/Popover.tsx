"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { glassSurfaceClass } from "@/components/ui/iconButton";

/** Distância mínima entre o painel e a borda da janela. */
export const POPOVER_VIEWPORT_MARGIN = 8;

/** O que abre um controle de foco no painel: o primeiro que a tecla Tab alcançaria. */
const FOCUSABLE =
  'input:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]';

interface PopoverProps {
  /** `id` do painel, para o `aria-controls` do gatilho. */
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * O botão que abre o painel. Clicar nele não conta como clique fora — quem o alterna é o
   * próprio botão —, e é para ele que o foco volta ao fechar.
   */
  triggerRef: RefObject<HTMLElement | null>;
  /** Nome acessível do painel. */
  label: string;
  /**
   * Quanto o painel sobe acima do topo do gatilho, em px. Na toolbar é a distância até a
   * borda de cima da pílula mais o respiro entre as duas peças.
   */
  offset: number;
  /** Raio do vidro: cheio no bloco de cores, 8px no painel de traço (Penpot). */
  rounded?: "full" | "panel";
  /**
   * Sem o vidro: o conteúdo desenha o próprio fundo. É o arco de cores, cuja forma não é um
   * retângulo arredondado.
   */
  bare?: boolean;
  /**
   * Quanto tempo o painel continua montado depois de fechar, em ms, para o conteúdo tocar a
   * própria animação de saída. Nesse intervalo ele leva `data-state="closed"` e fica `inert`:
   * aparece saindo, mas já não recebe clique nem foco. Sem valor, some na hora.
   */
  exitMs?: number;
  /** Respiro interno e o que mais o conteúdo pedir de layout. */
  className?: string;
  testId?: string;
  children: ReactNode;
}

/** O raio de cada variante. */
const ROUNDED = { full: "rounded-full", panel: "rounded-lg" } as const;

/**
 * Painel não modal preso acima de um gatilho da toolbar (#155): o bloco de cores e o painel
 * de traço, abertos pela seção Color Controls.
 *
 * `role="dialog"` sem `aria-modal`, e não um menu: o conteúdo são controles de valor (rádios,
 * sliders), e o quadro por trás continua usável com ele aberto.
 *
 * Centrado no gatilho, como no Penpot, e empurrado de volta para dentro da janela quando o
 * centro deixaria uma ponta de fora. A medida é feita depois de montar (`useLayoutEffect`),
 * antes de pintar: o painel nunca aparece cortado por um quadro.
 *
 * Fecha com Esc ou com um clique fora do painel e do gatilho. O Esc é ouvido na janela, em
 * captura, e não segue adiante: o atalho global de Esc desliga a ferramenta, e fechar o
 * painel não pode levar a ferramenta junto.
 */
export function Popover({
  id,
  open,
  onOpenChange,
  triggerRef,
  label,
  offset,
  rounded = "full",
  bare = false,
  exitMs = 0,
  className = "",
  testId,
  children,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Deslocamento horizontal que traz o painel para dentro da janela. */
  const [shift, setShift] = useState(0);
  /** Ainda montado: aberto, ou fechando durante {@link exitMs}. */
  const [present, setPresent] = useState(open);

  // Ajustado durante o render, e não num efeito, para o painel montar no mesmo quadro em que
  // abre — e sumir no mesmo quadro em que fecha, quando não há saída para tocar.
  if (open && !present) setPresent(true);
  if (!open && present && exitMs === 0) setPresent(false);

  useEffect(() => {
    if (open || !present) return;
    const timer = setTimeout(() => setPresent(false), exitMs);
    return () => clearTimeout(timer);
  }, [exitMs, open, present]);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel === null) return;

    // Mede sem o ajuste anterior, ou a correção se somaria a si mesma a cada abertura. O
    // valor novo vai direto para o DOM também: se for igual ao do estado, o React não
    // reescreveria o estilo que acabou de ser zerado aqui.
    panel.style.marginLeft = "0px";
    const { left, right } = panel.getBoundingClientRect();
    const max = window.innerWidth - POPOVER_VIEWPORT_MARGIN;
    const next =
      left < POPOVER_VIEWPORT_MARGIN
        ? POPOVER_VIEWPORT_MARGIN - left
        : right > max
          ? max - right
          : 0;
    panel.style.marginLeft = `${next}px`;
    setShift(next);
  }, [open]);

  // O foco entra no painel ao abrir, no primeiro controle: quem abriu pelo teclado não
  // precisa atravessar a toolbar até chegar nos valores.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target === null) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;

      // O foco só volta ao gatilho se estava no painel, que vai sumir: sem isso ele cairia
      // no começo do documento. Se estava em outro lugar, fica onde está.
      const focusInside = panelRef.current?.contains(document.activeElement) ?? false;
      onOpenChange(false);
      if (focusInside) triggerRef.current?.focus();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [onOpenChange, open, triggerRef]);

  if (!open && !present) return null;

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      // O vidro das pílulas (Penpot: branco a 90%, borda `#e4e4e4` a meio tom).
      className={`absolute left-1/2 z-10 w-max -translate-x-1/2 ${
        bare ? "" : `${glassSurfaceClass} ${ROUNDED[rounded]}`
      } ${className}`}
      style={{ bottom: `calc(100% + ${offset}px)`, marginLeft: shift }}
      data-state={open ? "open" : "closed"}
      inert={!open}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
