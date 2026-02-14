import type { Editor } from "@tiptap/core";
import type { WeatherData } from "./WeatherRepository";

export function formatWeatherLabel(weather: WeatherData): string {
  const temp = `${weather.temperature}°${weather.unit}`;
  if (weather.city) {
    return `${weather.city}, ${temp} ${weather.icon}`;
  }
  return `${temp} ${weather.icon}`;
}

export function hasWeatherAttr(attrs: Record<string, unknown>): boolean {
  return !!attrs.weather;
}

export function clearWeatherFromEditor(editor: Editor): boolean {
  let found = false;
  const { tr } = editor.state;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "timestampHorizontalRule" && node.attrs.weather) {
      found = true;
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        weather: null,
      });
    }
  });

  if (found) {
    editor.view.dispatch(tr);
  }
  return found;
}

export interface PendingWeatherHr {
  pos: number;
  timestamp: string;
}

export function getPendingWeatherHrs(editor: Editor): PendingWeatherHr[] {
  const result: PendingWeatherHr[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === "timestampHorizontalRule" &&
      node.attrs.timestamp &&
      !node.attrs.weather
    ) {
      result.push({ pos, timestamp: node.attrs.timestamp });
    }
  });
  return result;
}

export function applyWeatherToHr(
  editor: Editor,
  pos: number,
  weather: WeatherData,
): void {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "timestampHorizontalRule") return;

  const { tr } = editor.state;
  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    weather: formatWeatherLabel(weather),
  });
  editor.view.dispatch(tr);
}
