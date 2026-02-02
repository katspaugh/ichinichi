import { createContext, useContext } from "react";
import { useWeatherFeature } from "../features/weather/useWeatherFeature";

type WeatherContextValue = ReturnType<typeof useWeatherFeature>;

export const WeatherContext = createContext<WeatherContextValue | null>(null);

export function useWeatherContext(): WeatherContextValue {
  const context = useContext(WeatherContext);
  if (!context) {
    throw new Error("useWeatherContext must be used within WeatherProvider");
  }
  return context;
}
