import type { SVGProps } from "react";

export function Wave(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M0,100 Q25,60 50,85 Q75,110 100,75 Q125,40 150,70 Q175,100 200,65"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M0,120 Q25,80 50,105 Q75,130 100,95 Q125,60 150,90 Q175,120 200,85"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M0,140 Q25,100 50,125 Q75,150 100,115 Q125,80 150,110 Q175,140 200,105"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M0,160 Q25,125 50,145 Q75,165 100,135 Q125,105 150,130 Q175,155 200,125"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeLinecap="round"
        opacity="0.15"
      />
    </svg>
  );
}
