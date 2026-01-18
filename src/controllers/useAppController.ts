import { useUrlState } from "../hooks/useUrlState";
import { useAuth } from "../hooks/useAuth";
import { useAppMode } from "../hooks/useAppMode";
import { useActiveVault } from "../hooks/useActiveVault";
import { useNoteRepository } from "../hooks/useNoteRepository";

export function useAppController() {
  const auth = useAuth();
  const appMode = useAppMode({ authState: auth.authState });
  const urlState = useUrlState({
    authState: auth.authState,
    mode: appMode.mode,
  });
  const { date, year, monthDate } = urlState;

  // The active date for note loading is:
  // - date (when viewing a note modal via ?date=)
  // - monthDate (when in month view with a selected date via ?month=...&date=)
  const activeNoteDate = date ?? monthDate;

  const activeVault = useActiveVault({
    auth,
    mode: appMode.mode,
    setMode: appMode.setMode,
  });
  const notes = useNoteRepository({
    mode: appMode.mode,
    authUser: auth.user,
    vaultKey: activeVault.vaultKey,
    keyring: activeVault.keyring,
    activeKeyId: activeVault.activeKeyId,
    date: activeNoteDate,
    year,
  });

  return {
    urlState,
    auth,
    appMode,
    activeVault,
    notes,
  };
}
