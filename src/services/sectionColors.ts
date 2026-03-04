import { stringToHue } from "../utils/sectionTypes";

const PALETTE_SIZE = 8;

function hueSlot(type: string): number {
  return Math.floor((stringToHue(type) / 360) * PALETTE_SIZE);
}

export function applySectionColors(editor: HTMLElement): void {
  const headers = editor.querySelectorAll<HTMLElement>("[data-section-type]");
  for (const header of headers) {
    const type = header.getAttribute("data-section-type");
    if (!type) continue;
    const slot = hueSlot(type);
    // Remove any existing slot class
    for (let i = 0; i < PALETTE_SIZE; i++) {
      header.classList.remove(`section-hue-${i}`);
    }
    header.classList.add(`section-hue-${slot}`);
    const body = header.nextElementSibling;
    if (body && !body.hasAttribute("data-section-type")) {
      for (let i = 0; i < PALETTE_SIZE; i++) {
        body.classList.remove(`section-hue-${i}`);
      }
      body.classList.add(`section-hue-${slot}`);
    }
  }
}
