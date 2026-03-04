import { applySectionColors } from "../services/sectionColors";
import { stringToHue } from "../utils/sectionTypes";

describe("applySectionColors", () => {
  it("sets --section-hue on header and adjacent sibling", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-section-type="dream">+dream</div><div>body</div>';
    applySectionColors(container);

    const header = container.querySelector("[data-section-type]") as HTMLElement;
    const body = header.nextElementSibling as HTMLElement;
    const expectedHue = String(stringToHue("dream"));

    expect(header.style.getPropertyValue("--section-hue")).toBe(expectedHue);
    expect(body.style.getPropertyValue("--section-hue")).toBe(expectedHue);
  });

  it("does not set hue on non-adjacent elements", () => {
    const container = document.createElement("div");
    container.innerHTML =
      '<div data-section-type="dream">+dream</div><div>body</div><div>outside</div>';
    applySectionColors(container);

    const outside = container.children[2] as HTMLElement;
    expect(outside.style.getPropertyValue("--section-hue")).toBe("");
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

    expect(dreamBody.style.getPropertyValue("--section-hue")).toBe(
      String(stringToHue("dream")),
    );
    expect(gratitudeBody.style.getPropertyValue("--section-hue")).toBe(
      String(stringToHue("gratitude")),
    );
  });
});
