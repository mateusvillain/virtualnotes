import type { SVGProps } from "react";

/**
 * Ilustração: Caneta tinteiro. Proporção 72×368 — ver `README.md` nesta pasta.
 */
export function FountainPenIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 72 368"
      aria-hidden="true"
      {...props}
    >
      <path fill="url(#tool-fountain-pen-a)" d="M72 136H0v232h72z" />
      <path fill="url(#tool-fountain-pen-b)" d="M19 92Q16 52 36 0q20 52 17 92z" />
      <path fill="#5E4716" d="M36.799 65v27h-1.6V65zm0-61v55h-1.6V4z" />
      <path fill="#3D2E0D" d="M35.998 65.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2" />
      <path fill="url(#tool-fountain-pen-c)" d="m4 136 10-44h44l10 44z" />
      <path fill="url(#tool-fountain-pen-d)" d="M72 128H0v10h72z" />
      <defs>
        <linearGradient
          id="tool-fountain-pen-a"
          x1="0"
          x2="72"
          y1="136"
          y2="136"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DCDCDC" />
          <stop offset=".3" stopColor="#fff" />
          <stop offset=".7" stopColor="#F6F6F6" />
          <stop offset="1" stopColor="#D4D4D4" />
        </linearGradient>
        <linearGradient
          id="tool-fountain-pen-b"
          x1="18.609"
          x2="53.392"
          y1="0"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9C7A2E" />
          <stop offset=".35" stopColor="#F3DC8E" />
          <stop offset=".6" stopColor="#D4B25A" />
          <stop offset="1" stopColor="#8A6A24" />
        </linearGradient>
        <linearGradient
          id="tool-fountain-pen-c"
          x1="4"
          x2="68"
          y1="92"
          y2="92"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#151515" />
          <stop offset=".35" stopColor="#474747" />
          <stop offset="1" stopColor="#101010" />
        </linearGradient>
        <linearGradient
          id="tool-fountain-pen-d"
          x1="0"
          x2="72"
          y1="128"
          y2="128"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8F8F8F" />
          <stop offset=".3" stopColor="#F2F2F2" />
          <stop offset="1" stopColor="#7C7C7C" />
        </linearGradient>
      </defs>
    </svg>
  );
}
