import { useWeatherFeature } from "../features/weather/useWeatherFeature";
import { WeatherContext } from "./weatherContext";

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const value = useWeatherFeature();
  return (
    <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
  );
}
