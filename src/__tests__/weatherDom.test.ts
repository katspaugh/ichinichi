import {
  formatWeatherLabel,
  hasWeatherAttr,
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

interface MockNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  nodeSize: number;
}

function makeMockNode(
  attrs: Record<string, unknown>,
  typeName = "timestampHorizontalRule",
): MockNode {
  return {
    type: { name: typeName },
    attrs: { ...attrs },
    nodeSize: 1,
  };
}

/**
 * Creates a minimal mock Editor with a flat list of nodes.
 * `descendants` iterates over them; `nodeAt` looks up by position.
 */
function makeMockEditor(nodes: MockNode[]) {
  const dispatched: unknown[] = [];

  const doc = {
    descendants(cb: (node: MockNode, pos: number) => void) {
      nodes.forEach((node, i) => cb(node, i));
    },
    nodeAt(pos: number): MockNode | null {
      return nodes[pos] ?? null;
    },
  };

  const setNodeMarkupCalls: Array<{
    pos: number;
    type: undefined;
    attrs: Record<string, unknown>;
  }> = [];

  const tr = {
    setNodeMarkup(
      pos: number,
      type: undefined,
      attrs: Record<string, unknown>,
    ) {
      setNodeMarkupCalls.push({ pos, type, attrs });
      // Also update the mock node so subsequent reads reflect the change
      if (nodes[pos]) {
        nodes[pos].attrs = { ...attrs };
      }
    },
  };

  const editor = {
    state: { doc, tr },
    view: {
      dispatch(transaction: unknown) {
        dispatched.push(transaction);
      },
    },
  };

  return { editor, dispatched, setNodeMarkupCalls };
}

describe("formatWeatherLabel", () => {
  it("formats with city, temperature, and icon", () => {
    const weather = makeWeather({
      city: "Berlin",
      temperature: 15,
      unit: "C",
      icon: "☁️",
    });
    expect(formatWeatherLabel(weather)).toBe("Berlin, 15°C ☁️");
  });

  it("formats with Fahrenheit", () => {
    const weather = makeWeather({
      city: "NYC",
      temperature: 72,
      unit: "F",
      icon: "🌤️",
    });
    expect(formatWeatherLabel(weather)).toBe("NYC, 72°F 🌤️");
  });

  it("omits city when empty", () => {
    const weather = makeWeather({
      city: "",
      temperature: 10,
      unit: "C",
      icon: "🌧️",
    });
    expect(formatWeatherLabel(weather)).toBe("10°C 🌧️");
  });

  it("handles negative temperatures", () => {
    const weather = makeWeather({
      city: "Oslo",
      temperature: -5,
      unit: "C",
      icon: "❄️",
    });
    expect(formatWeatherLabel(weather)).toBe("Oslo, -5°C ❄️");
  });

  it("handles zero temperature", () => {
    const weather = makeWeather({
      city: "Moscow",
      temperature: 0,
      unit: "C",
      icon: "🌨️",
    });
    expect(formatWeatherLabel(weather)).toBe("Moscow, 0°C 🌨️");
  });
});

describe("hasWeatherAttr", () => {
  it("returns false when no weather attr", () => {
    expect(hasWeatherAttr({ timestamp: "123" })).toBe(false);
  });

  it("returns true when weather attr is set", () => {
    expect(hasWeatherAttr({ weather: "Tokyo, 22°C ☀️" })).toBe(true);
  });

  it("returns false when weather is null", () => {
    expect(hasWeatherAttr({ weather: null })).toBe(false);
  });

  it("returns false when weather is empty string", () => {
    expect(hasWeatherAttr({ weather: "" })).toBe(false);
  });
});

describe("clearWeatherFromEditor", () => {
  it("removes weather from all timestamp HRs", () => {
    const nodes = [
      makeMockNode({ timestamp: "1", weather: "A" }),
      makeMockNode({ timestamp: "2", weather: "B" }),
    ];
    const { editor, dispatched, setNodeMarkupCalls } = makeMockEditor(nodes);

    const changed = clearWeatherFromEditor(editor as never);

    expect(changed).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(setNodeMarkupCalls).toHaveLength(2);
    expect(setNodeMarkupCalls[0].attrs.weather).toBeNull();
    expect(setNodeMarkupCalls[1].attrs.weather).toBeNull();
  });

  it("returns false when no HRs have weather", () => {
    const nodes = [makeMockNode({ timestamp: "1" })];
    const { editor, dispatched } = makeMockEditor(nodes);

    const changed = clearWeatherFromEditor(editor as never);

    expect(changed).toBe(false);
    expect(dispatched).toHaveLength(0);
  });

  it("preserves other attributes when clearing weather", () => {
    const nodes = [
      makeMockNode({ timestamp: "1", label: "10:30 AM", weather: "Tokyo" }),
    ];
    const { editor, setNodeMarkupCalls } = makeMockEditor(nodes);

    clearWeatherFromEditor(editor as never);

    expect(setNodeMarkupCalls[0].attrs.timestamp).toBe("1");
    expect(setNodeMarkupCalls[0].attrs.label).toBe("10:30 AM");
    expect(setNodeMarkupCalls[0].attrs.weather).toBeNull();
  });

  it("ignores non-timestampHorizontalRule nodes", () => {
    const nodes = [
      makeMockNode({ weather: "A" }, "paragraph"),
      makeMockNode({ timestamp: "1", weather: "B" }),
    ];
    const { editor, setNodeMarkupCalls } = makeMockEditor(nodes);

    clearWeatherFromEditor(editor as never);

    expect(setNodeMarkupCalls).toHaveLength(1);
    expect(setNodeMarkupCalls[0].pos).toBe(1);
  });
});

describe("getPendingWeatherHrs", () => {
  it("returns HRs with timestamp but no weather", () => {
    const nodes = [
      makeMockNode({ timestamp: "123" }), // pending
      makeMockNode({ timestamp: "456", weather: "done" }), // done
      makeMockNode({}), // no timestamp
    ];
    const { editor } = makeMockEditor(nodes);

    const pending = getPendingWeatherHrs(editor as never);

    expect(pending).toHaveLength(1);
    expect(pending[0].timestamp).toBe("123");
    expect(pending[0].pos).toBe(0);
  });

  it("returns empty array when no pending HRs", () => {
    const nodes = [
      makeMockNode({ timestamp: "123", weather: "done" }),
    ];
    const { editor } = makeMockEditor(nodes);

    expect(getPendingWeatherHrs(editor as never)).toHaveLength(0);
  });

  it("returns multiple pending HRs in order", () => {
    const nodes = [
      makeMockNode({ timestamp: "a" }),
      makeMockNode({ timestamp: "b" }),
      makeMockNode({ timestamp: "c" }),
    ];
    const { editor } = makeMockEditor(nodes);

    const pending = getPendingWeatherHrs(editor as never);

    expect(pending).toHaveLength(3);
    expect(pending.map((hr) => hr.timestamp)).toEqual(["a", "b", "c"]);
    expect(pending.map((hr) => hr.pos)).toEqual([0, 1, 2]);
  });
});

describe("applyWeatherToHr", () => {
  it("sets weather attribute with formatted label", () => {
    const nodes = [makeMockNode({ timestamp: "123" })];
    const { editor, dispatched, setNodeMarkupCalls } = makeMockEditor(nodes);
    const weather = makeWeather({
      city: "London",
      temperature: 18,
      icon: "🌤️",
    });

    applyWeatherToHr(editor as never, 0, weather);

    expect(dispatched).toHaveLength(1);
    expect(setNodeMarkupCalls[0].attrs.weather).toBe("London, 18°C 🌤️");
  });

  it("overwrites existing weather", () => {
    const nodes = [makeMockNode({ timestamp: "1", weather: "old value" })];
    const { editor, setNodeMarkupCalls } = makeMockEditor(nodes);
    const weather = makeWeather({
      city: "Paris",
      temperature: 25,
      icon: "☀️",
    });

    applyWeatherToHr(editor as never, 0, weather);

    expect(setNodeMarkupCalls[0].attrs.weather).toBe("Paris, 25°C ☀️");
  });

  it("does nothing if node at pos is not a timestampHorizontalRule", () => {
    const nodes = [makeMockNode({}, "paragraph")];
    const { editor, dispatched } = makeMockEditor(nodes);
    const weather = makeWeather();

    applyWeatherToHr(editor as never, 0, weather);

    expect(dispatched).toHaveLength(0);
  });

  it("does nothing if no node at pos", () => {
    const { editor, dispatched } = makeMockEditor([]);
    const weather = makeWeather();

    applyWeatherToHr(editor as never, 5, weather);

    expect(dispatched).toHaveLength(0);
  });
});
