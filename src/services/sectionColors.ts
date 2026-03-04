import { stringToHue } from "../utils/sectionTypes";

export function applySectionColors(editor: HTMLElement): void {
  const headers = editor.querySelectorAll<HTMLElement>("[data-section-type]");
  for (const header of headers) {
    const type = header.getAttribute("data-section-type");
    if (!type) continue;
    const hue = String(stringToHue(type));
    header.style.setProperty("--section-hue", hue);
    const body = header.nextElementSibling;
    if (body && !body.hasAttribute("data-section-type")) {
      (body as HTMLElement).style.setProperty("--section-hue", hue);
    }
  }
}
