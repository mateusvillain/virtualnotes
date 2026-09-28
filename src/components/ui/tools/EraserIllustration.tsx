import { useId, type SVGProps } from "react";

/**
 * Ilustração: Borracha (lápis visto pela ponta da borracha). Proporção 72×360 — ver `README.md` nesta pasta.
 */
export function EraserIllustration(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 72 360"
      aria-hidden="true"
      {...props}
    >
      <path fill={`url(#${id}-a)`} d="M72 116H0v244h72z" />
      <path fill={`url(#${id}-b)`} d="M2 80V20Q2 0 22 0h28q20 0 20 20v60z" />
      <path fill={`url(#${id}-c)`} d="M72 76H0v40h72z" />
      <path fill="#000" d="M0 88h72zm0 16h72z" opacity=".45" />
      <path fill="#6F6F6F" d="M72 103.4v1.2H0v-1.2zm0-16v1.2H0v-1.2z" opacity=".45" />
      <defs>
        <linearGradient
          id={`${id}-a`}
          x1="0"
          x2="72"
          y1="116"
          y2="116"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DCDCDC" />
          <stop offset=".3" stopColor="#fff" />
          <stop offset=".7" stopColor="#F6F6F6" />
          <stop offset="1" stopColor="#D4D4D4" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="2" x2="70" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3A393" />
          <stop offset=".35" stopColor="#F6C9BB" />
          <stop offset="1" stopColor="#D9907F" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="0"
          x2="72"
          y1="76"
          y2="76"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8F8F8F" />
          <stop offset=".3" stopColor="#F2F2F2" />
          <stop offset=".6" stopColor="#BDBDBD" />
          <stop offset="1" stopColor="#7C7C7C" />
        </linearGradient>
      </defs>
    </svg>
  );
}
