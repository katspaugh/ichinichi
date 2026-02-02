import type { WeatherData } from "./WeatherRepository";

const WEATHER_ATTR = "data-weather";
const TIMESTAMP_ATTR = "data-timestamp";

export function formatWeatherLabel(weather: WeatherData): string {
  const temp = `${weather.temperature}°${weather.unit}`;
  if (weather.city) {
    return `${weather.city}, ${temp} ${weather.icon}`;
  }
  return `${temp} ${weather.icon}`;
}

export function hasWeather(hr: HTMLHRElement): boolean {
  return hr.hasAttribute(WEATHER_ATTR);
}

export function clearWeatherFromEditor(editor: HTMLElement): boolean {
  const hrs = editor.querySelectorAll<HTMLHRElement>(`hr[${WEATHER_ATTR}]`);
  if (hrs.length === 0) return false;
  hrs.forEach((hr) => {
    hr.removeAttribute(WEATHER_ATTR);
  });
  return true;
}

export function getPendingWeatherHrs(
  editor: HTMLElement,
): HTMLHRElement[] {
  return Array.from(
    editor.querySelectorAll<HTMLHRElement>(
      `hr[${TIMESTAMP_ATTR}]:not([${WEATHER_ATTR}])`,
    ),
  );
}

export function applyWeatherToHr(
  hr: HTMLHRElement,
  weather: WeatherData,
): void {
  hr.setAttribute(WEATHER_ATTR, formatWeatherLabel(weather));
}
