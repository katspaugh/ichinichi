import { reportError } from "../utils/errorReporter";

const KEY = "ichinichi_auto_tags_model_v1";
const listeners = new Set<() => void>();

export function getAutoTagsEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" && localStorage.getItem(KEY) === "enabled"
    );
  } catch (error) {
    reportError("autoTags.preferences.read", error);
    return false;
  }
}

export function setAutoTagsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(KEY, "enabled");
    else localStorage.removeItem(KEY);
  } catch (error) {
    reportError("autoTags.preferences.write", error);
  }
  for (const listener of listeners) listener();
}

export function subscribeAutoTagsEnabled(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
