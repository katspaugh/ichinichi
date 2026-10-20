import { useSyncExternalStore } from "react";
import {
  getAutoTagsEnabled,
  setAutoTagsEnabled,
  subscribeAutoTagsEnabled,
} from "../services/autoTagPreferences";

export function useAutoTagsEnabled() {
  const enabled = useSyncExternalStore(
    subscribeAutoTagsEnabled,
    getAutoTagsEnabled,
    () => false,
  );
  return { enabled, setEnabled: setAutoTagsEnabled };
}
