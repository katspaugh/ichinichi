import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Wave } from "./Wave";
import { Mountain } from "./Mountain";
import { Bamboo } from "./Bamboo";
import { Enso } from "./Enso";

const motifs: ComponentType<SVGProps<SVGSVGElement>>[] = [
  Wave,
  Mountain,
  Bamboo,
  Enso,
];

function pickRandom() {
  return motifs[Math.floor(Math.random() * motifs.length)];
}

interface RandomMotifProps {
  className?: string;
}

export function RandomMotif({ className }: RandomMotifProps) {
  const [Motif] = useState(pickRandom);

  return <Motif className={className} aria-hidden="true" />;
}
