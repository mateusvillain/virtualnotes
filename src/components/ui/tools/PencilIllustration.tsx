import type { SVGProps } from "react";

/**
 * Ilustração: Lápis. Proporção 72×364 — ver `README.md` nesta pasta.
 */
export function PencilIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 72 364"
      aria-hidden="true"
      {...props}
    >
      <path fill="url(#tool-pencil-a)" d="M72 124H0v240h72z" />
      <path fill="url(#tool-pencil-b)" d="m0 124 21.4-76q14.6 6 29.2 0L72 124z" />
      <path fill="#000" d="m24 124 6-73zm24 0-6-73z" opacity=".5" />
      <path
        fill="#B8935C"
        d="m30.598 51.049-6 73-1.196-.098 6-73zm18 72.902-1.196.098-6-73 1.196-.098z"
        opacity=".5"
      />
      <path fill="url(#tool-pencil-c)" d="m21.398 48 14.6-48 14.6 48q-14.6 6-29.2 0" />
      <path fill="url(#tool-pencil-d)" d="M72 116H0v16h72z" />
      <defs>
        <linearGradient
          id="tool-pencil-a"
          x1="0"
          x2="72"
          y1="124"
          y2="124"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DCDCDC" />
          <stop offset=".3" stopColor="#fff" />
          <stop offset=".7" stopColor="#F6F6F6" />
          <stop offset="1" stopColor="#D4D4D4" />
        </linearGradient>
        <linearGradient
          id="tool-pencil-b"
          x1="0"
          x2="72"
          y1="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D8B886" />
          <stop offset=".4" stopColor="#F3DFB9" />
          <stop offset="1" stopColor="#CFA970" />
        </linearGradient>
        <linearGradient
          id="tool-pencil-c"
          x1="21.398"
          x2="50.598"
          y1="0"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#111" />
          <stop offset=".45" stopColor="#3A3A3A" />
          <stop offset="1" stopColor="#0A0A0A" />
        </linearGradient>
        <linearGradient
          id="tool-pencil-d"
          x1="0"
          x2="72"
          y1="116"
          y2="116"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0D0D0D" />
          <stop offset=".35" stopColor="#3B3B3B" />
          <stop offset="1" stopColor="#0D0D0D" />
        </linearGradient>
      </defs>
    </svg>
  );
}
