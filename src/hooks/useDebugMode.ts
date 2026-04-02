import { useSyncExternalStore, useCallback } from "react";
import { DEBUG_MODE_KEY } from "../utils/constants";

function getSnapshot(): boolean {
  return localStorage.getItem(DEBUG_MODE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === DEBUG_MODE_KEY) onStoreChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener("debug-mode-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("debug-mode-change", onStoreChange);
  };
}

export function useDebugMode(): [boolean, (next: boolean) => void] {
  const isDebug = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDebug = useCallback((next: boolean) => {
    if (next) {
      localStorage.setItem(DEBUG_MODE_KEY, "true");
    } else {
      localStorage.removeItem(DEBUG_MODE_KEY);
    }
    window.dispatchEvent(new Event("debug-mode-change"));
  }, []);

  return [isDebug, setDebug];
}
