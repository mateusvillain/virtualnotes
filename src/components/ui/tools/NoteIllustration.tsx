import { useId, type SVGProps } from "react";

/**
 * Ilustração: Nota (post-it com a ponta dobrada). Proporção 95.865×98.758 — ver `README.md` nesta pasta.
 */
export function NoteIllustration(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 95.865 98.758"
      aria-hidden="true"
      {...props}
    >
      <path
        fill={`url(#${id}-a)`}
        d="m84.506 2.231-82.34 8.742a2.196 2.196 0 0 0-1.938 2.42L8.882 96.57a2.184 2.184 0 0 0 2.395 1.958l82.339-8.742a2.195 2.195 0 0 0 1.939-2.419L86.901 4.19a2.184 2.184 0 0 0-2.395-1.959"
      />
      <path
        fill={`url(#${id}-b)`}
        d="M90.647 1.995 7.904 4.914A2.19 2.19 0 0 0 5.803 7.19l2.889 83.585a2.19 2.19 0 0 0 2.253 2.122l82.743-2.918a2.19 2.19 0 0 0 2.101-2.277L92.9 4.118a2.19 2.19 0 0 0-2.254-2.123"
      />
      <path fill={`url(#${id}-c)`} d="M34.82.492h58.101q2.905 0 2.905 2.935V88.53H8.676V26.904z" />
      <path fill="#B8912E" d="M34.82.492 8.677 26.904l31.955 5.869z" opacity=".18" />
      <path
        fill={`url(#${id}-d)`}
        d="M34.82.492 8.677 26.904q20.335 5.869 29.05 4.401Q39.178 15.165 34.82.492"
      />
      <g opacity=".8">
        <path fill="#000" d="M34.82.492 8.677 26.904Z" />
        <path stroke="#C9A444" strokeWidth="1.4" d="M34.82.492 8.677 26.904" />
      </g>
      <defs>
        <linearGradient
          id={`${id}-a`}
          x1="0"
          x2="96.549"
          y1="11.203"
          y2="88.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F4D68A" />
          <stop offset="1" stopColor="#E8C066" />
        </linearGradient>
        <linearGradient
          id={`${id}-b`}
          x1="5.727"
          x2="96.714"
          y1="4.991"
          y2="88.983"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F4D68A" />
          <stop offset="1" stopColor="#E8C066" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="8.676"
          x2="96.709"
          y1=".492"
          y2="87.638"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FBE7A6" />
          <stop offset="1" stopColor="#F3D27A" />
        </linearGradient>
        <linearGradient
          id={`${id}-d`}
          x1="8.676"
          x2="39.734"
          y1=".492"
          y2="29.86"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E3BD55" />
          <stop offset=".6" stopColor="#FFF1C4" />
          <stop offset="1" stopColor="#FFFAF0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
