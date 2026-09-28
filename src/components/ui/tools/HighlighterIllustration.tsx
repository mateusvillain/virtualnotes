import { useId, type SVGProps } from "react";

/**
 * Ilustração: Marca-texto. Proporção 72×352 — ver `README.md` nesta pasta.
 */
export function HighlighterIllustration(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 72 352"
      aria-hidden="true"
      {...props}
    >
      <path fill={`url(#${id}-a)`} d="M72 128H0v224h72z" />
      <path fill={`url(#${id}-b)`} d="M18 76V20L54 0v76z" />
      <path fill="#FFF9B0" d="M18 20 54 0v6L18 26z" opacity=".7" />
      <path fill={`url(#${id}-c)`} d="m4 116 8-44h48l8 44z" />
      <path fill={`url(#${id}-d)`} d="M72 112H0v18h72z" />
      <defs>
        <linearGradient
          id={`${id}-a`}
          x1="0"
          x2="72"
          y1="128"
          y2="128"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DCDCDC" />
          <stop offset=".3" stopColor="#fff" />
          <stop offset=".7" stopColor="#F6F6F6" />
          <stop offset="1" stopColor="#D4D4D4" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="18" x2="54" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E2CF1F" />
          <stop offset=".35" stopColor="#FBF07A" />
          <stop offset="1" stopColor="#D6C312" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="4"
          x2="68"
          y1="72"
          y2="72"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#262626" />
          <stop offset=".35" stopColor="#555" />
          <stop offset="1" stopColor="#1C1C1C" />
        </linearGradient>
        <linearGradient
          id={`${id}-d`}
          x1="0"
          x2="72"
          y1="112"
          y2="112"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E4D11E" />
          <stop offset=".35" stopColor="#FDF36E" />
          <stop offset="1" stopColor="#D4C010" />
        </linearGradient>
      </defs>
    </svg>
  );
}
