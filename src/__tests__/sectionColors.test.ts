import { applySectionColors } from "../services/sectionColors";
import { stringToHue } from "../utils/sectionTypes";

const PALETTE_SIZE = 8;

function expectedSlot(type: string): number {
  return Math.floor((stringToHue(type) / 360) * PALETTE_SIZE);
}

describe("applySectionColors", () => {
  it("adds hue class to header and adjacent sibling", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-section-type="dream">+dream</div><div>body</div>';
    applySectionColors(container);

    const header = container.querySelector("[data-section-type]") as HTMLElement;
    const body = header.nextElementSibling as HTMLElement;
    const slot = expectedSlot("dream");

    expect(header.classList.contains(`section-hue-${slot}`)).toBe(true);
    expect(body.classList.contains(`section-hue-${slot}`)).toBe(true);
  });

  it("does not add hue class to non-adjacent elements", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-section-type="dream">+dream</div><div>body</div><div>outside</div>';
    applySectionColors(container);

    const outside = container.children[2] as HTMLElement;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(outside.classList.contains(`section-hue-${i}`)).toBe(false);
    }
  });

  it("handles multiple sections", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-section-type="dream">+dream</div><div>a</div>' +
      '<div data-section-type="gratitude">+gratitude</div><div>b</div>';
    applySectionColors(container);

    const headers = container.querySelectorAll("[data-section-type]");
    const dreamBody = headers[0].nextElementSibling as HTMLElement;
    const gratitudeBody = headers[1].nextElementSibling as HTMLElement;

    expect(
      dreamBody.classList.contains(`section-hue-${expectedSlot("dream")}`),
    ).toBe(true);
    expect(
      gratitudeBody.classList.contains(
        `section-hue-${expectedSlot("gratitude")}`,
      ),
    ).toBe(true);
  });
});
