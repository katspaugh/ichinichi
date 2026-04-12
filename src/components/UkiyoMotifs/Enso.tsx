import type { SVGProps } from "react";

export function Enso(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M105,35 A65,65 0 1,1 95,35"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
      <circle
        cx="100"
        cy="100"
        r="25"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.2"
      />
    </svg>
  );
}
