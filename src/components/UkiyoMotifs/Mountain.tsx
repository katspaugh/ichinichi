import type { SVGProps } from "react";

export function Mountain(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <polygon
        points="100,30 170,170 30,170"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="100,60 150,170 50,170"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <polygon
        points="100,90 130,170 70,170"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.25"
      />
      <line
        x1="82"
        y1="55"
        x2="118"
        y2="55"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}
