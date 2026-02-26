import { useCallback, useMemo, useReducer, useRef } from "react";
import { LocationProvider } from "./LocationProvider";
import { WeatherRepository } from "./WeatherRepository";
import {
  applyWeatherToHr,
  clearWeatherFromEditor,
  getPendingWeatherHrs,
  hasWeather,
} from "./WeatherDom";
import {
  getLocationCoords,
  getLocationKind,
  getLocationLabel,
  getShowWeatherPreference,
  getUnitPreference,
  setLocationCoords,
  setLocationKind,
  setLocationLabel,
  setShowWeatherPreference,
  setUnitPreference,
  type LocationKind,
  type UnitPreference,
} from "./WeatherPreferences";
import { resolveUnitPreference } from "./unit";

interface WeatherState {
  showWeather: boolean;
  unitPreference: UnitPreference;
  locationLabel: string | null;
  locationKind: LocationKind | null;
  isPromptOpen: boolean;
}

type WeatherAction =
  | { type: "SET_SHOW_WEATHER"; value: boolean }
  | { type: "SET_UNIT_PREFERENCE"; value: UnitPreference }
  | {
      type: "SET_LOCATION";
      label: string | null;
      kind: LocationKind | null;
    }
  | { type: "SET_PROMPT_OPEN"; value: boolean };

function weatherReducer(state: WeatherState, action: WeatherAction): WeatherState {
  switch (action.type) {
    case "SET_SHOW_WEATHER":
      return { ...state, showWeather: action.value };
    case "SET_UNIT_PREFERENCE":
      return { ...state, unitPreference: action.value };
    case "SET_LOCATION":
      return {
        ...state,
        locationLabel: action.label,
        locationKind: action.kind,
      };
    case "SET_PROMPT_OPEN":
      return { ...state, isPromptOpen: action.value };
    default:
      return state;
  }
}

function formatApproxLabel(city: string, country: string): string {
  if (!city && !country) return "";
  if (!country) return city;
  if (!city) return country;
  return `${city}, ${country}`;
}

export function useWeatherFeature() {
  const locationProvider = useMemo(() => new LocationProvider(), []);
  const weatherRepository = useMemo(() => new WeatherRepository(), []);
  const pendingHrRef = useRef<HTMLHRElement | null>(null);

  const [state, dispatch] = useReducer(weatherReducer, undefined, () => ({
    showWeather: getShowWeatherPreference(),
    unitPreference: getUnitPreference(),
    locationLabel: getLocationLabel(),
    locationKind: getLocationKind(),
    isPromptOpen: false,
  }));

  const commitLocation = useCallback(
    (label: string | null, kind: LocationKind | null, coords?: { lat: number; lon: number }) => {
      if (label !== state.locationLabel) {
        setLocationLabel(label);
      }
      if (kind !== state.locationKind) {
        setLocationKind(kind);
      }
      if (coords) {
        setLocationCoords(coords.lat, coords.lon);
      }
      if (label !== state.locationLabel || kind !== state.locationKind) {
        dispatch({ type: "SET_LOCATION", label, kind });
      }
    },
    [state.locationKind, state.locationLabel],
  );

  const setShowWeather = useCallback((value: boolean) => {
    setShowWeatherPreference(value);
    dispatch({ type: "SET_SHOW_WEATHER", value });
  }, []);

  const setUnitPreferenceValue = useCallback((value: UnitPreference) => {
    setUnitPreference(value);
    dispatch({ type: "SET_UNIT_PREFERENCE", value });
  }, []);

  const refreshLocation = useCallback(async () => {
    const precise = await locationProvider.getPreciseLocation();
    if (!precise) return;

    const coords = { lat: precise.lat, lon: precise.lon };
    const weather = await weatherRepository.getCurrentWeather(
      precise.lat,
      precise.lon,
      state.unitPreference,
    );

    if (weather?.city) {
      commitLocation(weather.city, "precise", coords);
      return;
    }

    commitLocation(state.locationLabel, "precise", coords);
  }, [commitLocation, locationProvider, state.locationLabel, state.unitPreference, weatherRepository]);

  const applyWeatherToEditor = useCallback(
    async (editor: HTMLElement): Promise<boolean> => {
      if (!state.showWeather) return false;
      if (!editor.isConnected) return false;

      const pending = getPendingWeatherHrs(editor);
      if (pending.length === 0) return false;

      let lat: number | null = null;
      let lon: number | null = null;
      let usedPrecise = false;

      // Try precise geolocation when user has opted in (skip permission check —
      // getCurrentPosition handles denied gracefully, and the Permissions API
      // is unreliable on mobile Safari)
      if (state.locationKind === "precise") {
        const precise = await locationProvider.getPreciseLocation();
        if (precise) {
          lat = precise.lat;
          lon = precise.lon;
          usedPrecise = true;
        }
      }

      // Fall back to stored coordinates from last successful location
      if (lat === null || lon === null) {
        const stored = getLocationCoords();
        if (stored) {
          lat = stored.lat;
          lon = stored.lon;
        }
      }

      // Last resort: approximate location from timezone heuristic (first-time only)
      if (lat === null || lon === null) {
        const approx = await locationProvider.getApproxLocation();
        if (!approx) return false;
        lat = approx.lat;
        lon = approx.lon;
        const label = formatApproxLabel(approx.city, approx.country);
        commitLocation(label || null, "approx", { lat, lon });
      }

      const weather = await weatherRepository.getCurrentWeather(
        lat,
        lon,
        state.unitPreference,
      );
      if (!weather || !editor.isConnected) return false;

      if (usedPrecise) {
        const nextLabel = weather.city || state.locationLabel || null;
        commitLocation(nextLabel, "precise", { lat, lon });
      }

      for (const hr of pending) {
        applyWeatherToHr(hr, weather);
      }
      return true;
    },
    [
      commitLocation,
      locationProvider,
      state.locationKind,
      state.locationLabel,
      state.showWeather,
      state.unitPreference,
      weatherRepository,
    ],
  );

  const applyPreciseToHr = useCallback(
    async (hr: HTMLHRElement): Promise<boolean> => {
      const precise = await locationProvider.getPreciseLocation();
      if (!precise) return false;

      const coords = { lat: precise.lat, lon: precise.lon };
      const weather = await weatherRepository.getCurrentWeather(
        precise.lat,
        precise.lon,
        state.unitPreference,
      );
      if (!weather) return false;
      if (!hr.isConnected) return false;

      applyWeatherToHr(hr, weather);
      const nextLabel = weather.city || state.locationLabel || null;
      commitLocation(nextLabel, "precise", coords);
      return true;
    },
    [
      commitLocation,
      locationProvider,
      state.locationLabel,
      state.unitPreference,
      weatherRepository,
    ],
  );

  const requestPreciseForHr = useCallback(
    (hr: HTMLHRElement) => {
      if (!state.showWeather) return;
      pendingHrRef.current = hr;

      void (async () => {
        const permission = await locationProvider.getPermissionState();
        if (permission === "granted") {
          await applyPreciseToHr(hr);
          pendingHrRef.current = null;
          return;
        }

        if (permission === "denied" || permission === "unavailable") {
          pendingHrRef.current = null;
          return;
        }

        const shouldPrompt = await locationProvider.shouldShowPrompt();
        if (!shouldPrompt) {
          pendingHrRef.current = null;
          return;
        }

        locationProvider.markPromptShown();
        dispatch({ type: "SET_PROMPT_OPEN", value: true });
      })();
    },
    [applyPreciseToHr, locationProvider, state.showWeather],
  );

  const dismissPrecisePrompt = useCallback(() => {
    pendingHrRef.current = null;
    dispatch({ type: "SET_PROMPT_OPEN", value: false });
  }, []);

  const confirmPreciseForHr = useCallback(async (): Promise<boolean> => {
    dispatch({ type: "SET_PROMPT_OPEN", value: false });
    const hr = pendingHrRef.current;
    pendingHrRef.current = null;
    if (!hr) return false;
    return applyPreciseToHr(hr);
  }, [applyPreciseToHr]);

  const resolvedUnit = resolveUnitPreference(state.unitPreference);

  return {
    state: {
      ...state,
      resolvedUnit,
    },
    setShowWeather,
    setUnitPreference: setUnitPreferenceValue,
    refreshLocation,
    applyWeatherToEditor,
    clearWeatherFromEditor,
    hasWeather,
    requestPreciseForHr,
    confirmPreciseForHr,
    dismissPrecisePrompt,
  };
}
