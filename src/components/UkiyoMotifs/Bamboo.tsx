import type { SVGProps } from "react";

export function Bamboo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <line x1="80" y1="180" x2="80" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="80" y1="60" x2="80" y2="60" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity="0.5" />
      <line x1="80" y1="110" x2="80" y2="110" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity="0.5" />
      <line x1="82" y1="55" x2="105" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="82" y1="58" x2="102" y2="65" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
      <line x1="115" y1="180" x2="115" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      <line x1="115" y1="85" x2="115" y2="85" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity="0.4" />
      <line x1="113" y1="80" x2="93" y2="70" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
      <line x1="145" y1="180" x2="145" y2="65" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" />
    </svg>
  );
}
