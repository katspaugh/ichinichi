import {
  formatWeatherLabel,
  hasWeather,
  clearWeatherFromEditor,
  getPendingWeatherHrs,
  applyWeatherToHr,
} from "../features/weather/WeatherDom";
import type { WeatherData } from "../features/weather/WeatherRepository";

function makeWeather(overrides?: Partial<WeatherData>): WeatherData {
  return {
    temperature: 22,
    icon: "☀️",
    city: "Tokyo",
    timestamp: Date.now(),
    unit: "C",
    ...overrides,
  };
}

function createEditor(): HTMLDivElement {
  const editor = document.createElement("div");
  document.body.appendChild(editor);
  return editor;
}

function addHr(
  editor: HTMLElement,
  attrs?: Record<string, string>,
): HTMLHRElement {
  const hr = document.createElement("hr");
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      hr.setAttribute(key, value);
    }
  }
  editor.appendChild(hr);
  return hr;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("formatWeatherLabel", () => {
  it("formats with city, temperature, and icon", () => {
    const weather = makeWeather({ city: "Berlin", temperature: 15, unit: "C", icon: "☁️" });
    expect(formatWeatherLabel(weather)).toBe("Berlin, 15°C ☁️");
  });

  it("formats with Fahrenheit", () => {
    const weather = makeWeather({ city: "NYC", temperature: 72, unit: "F", icon: "🌤️" });
    expect(formatWeatherLabel(weather)).toBe("NYC, 72°F 🌤️");
  });

  it("omits city when empty", () => {
    const weather = makeWeather({ city: "", temperature: 10, unit: "C", icon: "🌧️" });
    expect(formatWeatherLabel(weather)).toBe("10°C 🌧️");
  });

  it("handles negative temperatures", () => {
    const weather = makeWeather({ city: "Oslo", temperature: -5, unit: "C", icon: "❄️" });
    expect(formatWeatherLabel(weather)).toBe("Oslo, -5°C ❄️");
  });

  it("handles zero temperature", () => {
    const weather = makeWeather({ city: "Moscow", temperature: 0, unit: "C", icon: "🌨️" });
    expect(formatWeatherLabel(weather)).toBe("Moscow, 0°C 🌨️");
  });
});

describe("hasWeather", () => {
  it("returns false for plain HR", () => {
    const editor = createEditor();
    const hr = addHr(editor);
    expect(hasWeather(hr)).toBe(false);
  });

  it("returns true for HR with data-weather attribute", () => {
    const editor = createEditor();
    const hr = addHr(editor, { "data-weather": "Tokyo, 22°C ☀️" });
    expect(hasWeather(hr)).toBe(true);
  });

  it("returns true even if data-weather is empty string", () => {
    const editor = createEditor();
    const hr = addHr(editor, { "data-weather": "" });
    expect(hasWeather(hr)).toBe(true);
  });
});

describe("clearWeatherFromEditor", () => {
  it("removes data-weather from all HRs", () => {
    const editor = createEditor();
    const hr1 = addHr(editor, { "data-weather": "A" });
    const hr2 = addHr(editor, { "data-weather": "B" });

    const changed = clearWeatherFromEditor(editor);

    expect(changed).toBe(true);
    expect(hr1.hasAttribute("data-weather")).toBe(false);
    expect(hr2.hasAttribute("data-weather")).toBe(false);
  });

  it("returns false when no HRs have weather", () => {
    const editor = createEditor();
    addHr(editor);

    const changed = clearWeatherFromEditor(editor);
    expect(changed).toBe(false);
  });

  it("only removes data-weather, preserves other attributes", () => {
    const editor = createEditor();
    const hr = addHr(editor, {
      "data-weather": "Tokyo, 22°C",
      "data-timestamp": "1234567890",
    });

    clearWeatherFromEditor(editor);

    expect(hr.hasAttribute("data-weather")).toBe(false);
    expect(hr.getAttribute("data-timestamp")).toBe("1234567890");
  });
});

describe("getPendingWeatherHrs", () => {
  it("returns HRs with data-timestamp but no data-weather", () => {
    const editor = createEditor();
    addHr(editor, { "data-timestamp": "123" }); // pending
    addHr(editor, { "data-timestamp": "456", "data-weather": "done" }); // done
    addHr(editor); // no timestamp

    const pending = getPendingWeatherHrs(editor);
    expect(pending).toHaveLength(1);
    expect(pending[0].getAttribute("data-timestamp")).toBe("123");
  });

  it("returns empty array when no pending HRs", () => {
    const editor = createEditor();
    addHr(editor, { "data-timestamp": "123", "data-weather": "done" });

    expect(getPendingWeatherHrs(editor)).toHaveLength(0);
  });

  it("returns multiple pending HRs in order", () => {
    const editor = createEditor();
    addHr(editor, { "data-timestamp": "a" });
    addHr(editor, { "data-timestamp": "b" });
    addHr(editor, { "data-timestamp": "c" });

    const pending = getPendingWeatherHrs(editor);
    expect(pending).toHaveLength(3);
    expect(pending.map((hr) => hr.getAttribute("data-timestamp"))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("applyWeatherToHr", () => {
  it("sets data-weather attribute with formatted label", () => {
    const editor = createEditor();
    const hr = addHr(editor, { "data-timestamp": "123" });
    const weather = makeWeather({ city: "London", temperature: 18, icon: "🌤️" });

    applyWeatherToHr(hr, weather);

    expect(hr.getAttribute("data-weather")).toBe("London, 18°C 🌤️");
  });

  it("overwrites existing data-weather", () => {
    const editor = createEditor();
    const hr = addHr(editor, { "data-weather": "old value" });
    const weather = makeWeather({ city: "Paris", temperature: 25, icon: "☀️" });

    applyWeatherToHr(hr, weather);

    expect(hr.getAttribute("data-weather")).toBe("Paris, 25°C ☀️");
  });
});
